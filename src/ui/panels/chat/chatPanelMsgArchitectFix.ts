// [SCOPE] Architect fix handlers: fix-all and fix-one step-through.
// Extracted from chatPanelMsgArchitect.ts (Rule 9 split — was 209 lines).
// These iterate over files named in an architect review and apply AI-driven refactor fixes.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './chatPanelHtml';
import { _architectReviews, _architectFixState, _architectActions } from './chatPanelMsgArchitect.js';
import { getActiveProjectRoot } from '../../../services/project/activeProjectRoot.js';

function _projectRoot(): string {
  return getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

function _fixTaskFor(reviewText: string, file: string): string {
  const lines = reviewText.split('\n');
  const fileIdx = lines.findIndex(l => l.includes(file));
  if (fileIdx === -1) { return `Refactor ${file} based on the architect review`; }
  const nearby = lines.slice(Math.max(0, fileIdx - 2), fileIdx + 8).join('\n');
  return `Refactor ${file}:\n${nearby}\n\nApply the suggested changes.`;
}

export async function handleArchitectFixAll(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const reviewText = _architectReviews.get(msg.reviewId || '');
  if (!reviewText) { return; }
  const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); files.push(f); } }
  if (files.length === 0) {
    conversation.push({ role: 'assistant', content: 'No specific files identified in the review. Use **Fix One at a Time** to step through issues manually.', timestamp: Date.now() });
    refresh(); return;
  }
  const root = _projectRoot();
  const existingFiles = files.filter(f => fs.existsSync(path.join(root, f)));
  const existingBasenames = new Set(existingFiles.map(f => path.basename(f)));
  const missingFiles = files.filter(f => !fs.existsSync(path.join(root, f)) && !existingBasenames.has(path.basename(f)));
  if (missingFiles.length > 0) {
    conversation.push({ role: 'assistant', content: `Skipping ${missingFiles.length} file(s) that don't exist yet: \`${missingFiles.join('`, `')}\``, timestamp: Date.now() });
    refresh();
  }
  if (existingFiles.length === 0) {
    conversation.push({ role: 'assistant', content: 'No existing files to fix. The review only suggested new files to create.', timestamp: Date.now() });
    refresh(); return;
  }
  conversation.push({ role: 'assistant', content: 'Fixing ' + existingFiles.length + ' file' + (existingFiles.length !== 1 ? 's' : '') + ' identified in the review...', timestamp: Date.now() });
  refresh();
  for (let i = 0; i < existingFiles.length; i++) {
    const f = existingFiles[i];
    const task = _fixTaskFor(reviewText, f);
    try {
      await vscode.commands.executeCommand('redivivus.runEditFix', task, f, 'refactor');
      const progress = conversation[conversation.length - 1];
      if (progress && progress.content.startsWith('Fixing ')) { progress.content = 'Fixing ' + existingFiles.length + ' files: ' + (i + 1) + ' done...'; refresh(); }
    } catch { /* continue on individual failures */ }
  }
  conversation.push({ role: 'assistant', content: 'All ' + existingFiles.length + ' fixes applied.', timestamp: Date.now() });
  refresh();
}

export async function handleArchitectFixOne(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const reviewId = msg.reviewId || '';
  const reviewText = _architectReviews.get(reviewId);
  if (!reviewText) { return; }
  if (!_architectFixState.has(reviewId)) {
    const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
    const seen = new Set<string>();
    const allFiles: string[] = [];
    for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); allFiles.push(f); } }
    const rootDir = _projectRoot();
    const files = allFiles.filter(f => fs.existsSync(path.join(rootDir, f)));
    const existingBasenames = new Set(files.map(f => path.basename(f)));
    const skipped = allFiles.filter(f => !fs.existsSync(path.join(rootDir, f)) && !existingBasenames.has(path.basename(f)));
    if (skipped.length > 0) {
      conversation.push({ role: 'assistant', content: `Skipping \`${skipped.join('`, `')}\` -- file(s) don't exist yet.`, timestamp: Date.now() });
      refresh();
    }
    if (files.length === 0) {
      conversation.push({ role: 'assistant', content: 'No existing files to step through.', timestamp: Date.now() }); refresh(); return;
    }
    _architectFixState.set(reviewId, { issues: files, index: 0 });
  }
  const state = _architectFixState.get(reviewId)!;
  if (msg.action === 'skip') { state.index++; }
  if (msg.action === 'apply' && state.index > 0) { state.index++; }
  if (state.index >= state.issues.length) {
    _architectFixState.delete(reviewId);
    conversation.push({ role: 'assistant', content: 'All issues reviewed.', timestamp: Date.now() }); refresh(); return;
  }
  const currentFile = state.issues[state.index];
  if (msg.action === 'apply') {
    const task = _fixTaskFor(reviewText, currentFile);
    await vscode.commands.executeCommand('redivivus.runEditFix', task, currentFile, 'refactor');
  }
  const nextFile = state.issues[state.index];
  conversation.push({
    role: 'assistant',
    content: '**Issue ' + (state.index + 1) + ' of ' + state.issues.length + ':** `' + nextFile + '`\n\nApply a refactor fix to this file?\n\n'
      + '__ARCH_STEP__' + reviewId + '|||' + state.index + '|||' + state.issues.length + '|||' + nextFile + '|||END_ARCH_STEP__',
    timestamp: Date.now(),
  });
  refresh();
}
