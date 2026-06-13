// [SCOPE] Chat message handlers: architect review actions — explain, add-todos, fix-all, fix-one
// Extracted from chatPanelMessages.ts. Called by handleChatMessage router.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './chatPanelHtml';
import type { RoutingService } from '../../../services/ai/routingService';
import { getActiveProjectRoot } from '../../../services/project/activeProjectRoot.js';

// [FIX] Under Model A the workspace root is the projects CONTAINER (~/projects); the ACTIVE project is a
// subfolder (e.g. ~/projects/tic-tac-toe-game). Architect-review file paths (e.g. `src/ai.js`) are relative
// to that subfolder. Resolving them against the container made fs.existsSync fail for EVERY file ->
// "Skipping N file(s) that don't exist yet" -> "No existing files to fix", even though the files were right
// there and the diagnosis was correct. Always resolve against the active project root (same resolver Run/
// Preview/Map use), falling back to the raw workspace root only if no active project is resolvable.
function _projectRoot(): string {
  return getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
}

// [Redivivus] Architect review text store — keyed by reviewId, used by action handlers
export const _architectReviews = new Map<string, string>();
// [Redivivus] Fix-one-at-a-time state — keyed by reviewId
export const _architectFixState = new Map<string, { issues: string[]; index: number }>();

export interface ArchitectAction { file: string; action: 'fix' | 'delete' | 'create'; label: string; description: string; }
// [Redivivus] Per-action buttons — populated by chatPanelMsgMapContext when AI returns ACTIONS_JSON
export const _architectActions = new Map<string, ArchitectAction[]>();

export async function handleArchitectPerAction(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const actions = _architectActions.get(msg.reviewId || '');
  const act = actions?.[msg.actionIndex];
  if (!act) { return; }
  const verb = act.action === 'delete' ? 'Delete' : act.action === 'create' ? 'Create' : 'Fix';
  const warning = act.action === 'delete' ? '\n\n> A snapshot is saved automatically — use Save Point to restore if needed.' : '';
  const detail = `**${verb} \`${act.file}\`?**\n\n${act.description}${warning}\n\n__ARCH_CONFIRM__${msg.reviewId}|||${msg.actionIndex}|||END_ARCH_CONFIRM__`;
  conversation.push({ role: 'assistant', content: detail, timestamp: Date.now() });
  refresh();
}

export async function handleArchitectActionConfirm(msg: any, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const actions = _architectActions.get(msg.reviewId || '');
  const act = actions?.[msg.actionIndex];
  if (!act) { return; }
  const root = _projectRoot();
  if (act.action === 'delete') {
    const absPath = path.join(root, act.file);
    try {
      if (!fs.existsSync(absPath)) { conversation.push({ role: 'assistant', content: `\`${act.file}\` not found — nothing to delete.`, timestamp: Date.now() }); refresh(); return; }
      fs.unlinkSync(absPath);
      conversation.push({ role: 'assistant', content: `✅ Deleted \`${act.file}\`.`, timestamp: Date.now() });
    } catch (err) {
      conversation.push({ role: 'assistant', content: `❌ Delete failed: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() });
    }
  } else if (act.action === 'fix') {
    await vscode.commands.executeCommand('redivivus.runEditFix', act.description, act.file, 'refactor');
  } else {
    await vscode.commands.executeCommand('redivivus.postToChat', act.description);
  }
  refresh();
}

export async function handleArchitectExplain(msg: any, routing: RoutingService, conversation: ChatMessage[], refresh: () => void): Promise<void> {
  const reviewText = _architectReviews.get(msg.reviewId || '');
  if (!reviewText) { return; }
  const explainPrompt = 'You are explaining a code review to a non-technical person. Rewrite the following architect review in plain English.\n\n'
    + 'Rules:\n- Use real-world analogies.\n- No technical jargon.\n- Every point must be understandable by someone who has never coded.\n'
    + '- End with: "Ready to fix these? I can walk you through them one at a time."\n\nReview:\n' + reviewText;
  conversation.push({ role: 'user', content: 'Explain this review in plain English', timestamp: Date.now() });
  refresh();
  try {
    const aiRes = await routing.prompt(explainPrompt);
    conversation.push({ role: 'assistant', content: aiRes.text || 'Could not generate explanation.', timestamp: Date.now() });
  } catch (err) {
    conversation.push({ role: 'assistant', content: '❌ Could not generate explanation — please try again.', timestamp: Date.now() });
  }
  refresh();
}

export function handleArchitectAddTodos(msg: any, conversation: ChatMessage[], refresh: () => void): void {
  const reviewText = _architectReviews.get(msg.reviewId || '');
  if (!reviewText) { return; }
  const root = _projectRoot();
  if (!root) { conversation.push({ role: 'assistant', content: '⚠️ No project folder is open. Open a project first, then try again.', timestamp: Date.now() }); refresh(); return; }
  const bpPath = path.join(root, '.redivivus', 'blueprint.md');
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = reviewText.split('\n').filter(l => l.trim().startsWith('-') || /^\d+\./.test(l.trim()) || /^\*\*/.test(l.trim()));
  const todoLines = lines.slice(0, 20).map(l => '- [ ] ' + l.replace(/^[-*]+\s*/, '').replace(/^\d+\.\s*/, '').replace(/^\*\*([^*]+)\*\*:?/, '$1:').trim());
  const section = '\n\n## Architect Review TODOs -- ' + dateStr + '\n\n' + (todoLines.length > 0 ? todoLines.join('\n') : '- [ ] Review architect findings') + '\n';
  try {
    if (fs.existsSync(bpPath)) {
      fs.appendFileSync(bpPath, section, 'utf8');
    } else {
      fs.mkdirSync(path.join(root, '.redivivus'), { recursive: true });
      fs.writeFileSync(bpPath, '# Blueprint\n' + section, 'utf8');
    }
    conversation.push({ role: 'assistant', content: '✅ Added ' + todoLines.length + ' to-do items to your blueprint. Open `.redivivus/blueprint.md` to see them.', timestamp: Date.now() });
  } catch (err) {
    conversation.push({ role: 'assistant', content: '❌ Could not save to-do items — please try again.', timestamp: Date.now() });
  }
  refresh();
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
  // [FIX] A review often names the same file two ways (e.g. `src/ai.js` AND a bare `ai.js`). After resolving
  // against the real project root the prefixed path exists; the bare duplicate would otherwise show up as a
  // bogus "doesn't exist yet" skip and risk a double-fix. Drop any missing entry whose basename is already
  // covered by an existing file.
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
    const task = 'Fix issues identified in architect review for ' + f + ': address health problems, reduce complexity, and improve code quality.';
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
      conversation.push({ role: 'assistant', content: 'No existing files to step through.', timestamp: Date.now() });
      refresh(); return;
    }
    _architectFixState.set(reviewId, { issues: files, index: 0 });
  }
  const state = _architectFixState.get(reviewId)!;
  if (msg.action === 'skip') { state.index++; }
  if (msg.action === 'apply' && state.index > 0) { state.index++; }
  if (state.index >= state.issues.length) {
    _architectFixState.delete(reviewId);
    conversation.push({ role: 'assistant', content: 'All issues reviewed.', timestamp: Date.now() });
    refresh(); return;
  }
  const currentFile = state.issues[state.index];
  if (msg.action === 'apply') {
    const task = 'Fix issues identified in architect review for ' + currentFile + ': address health problems, reduce complexity, and improve code quality.';
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
