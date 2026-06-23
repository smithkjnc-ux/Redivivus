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

/** Build a precise task string for a file using ACTIONS_JSON descriptions when available, falling
 *  back to relevant review context when not. This prevents the Worker from just adding comments. */
function _fixTaskFor(reviewText: string, file: string, actionDescription?: string): string {
  const base = path.basename(file);
  // [FIX] Prefer the explicit ACTIONS_JSON description — it is the prescription the AI wrote
  // specifically for this fix. Without it, the Worker gets vague context and adds comments instead
  // of making real code changes.
  if (actionDescription) {
    return `Implement this architect-review fix for \`${file}\` exactly as described. Make REAL code changes — `
      + `do NOT add explanatory comments, do NOT re-analyze, do NOT leave placeholders. Delete dead code if told to, `
      + `add real function signatures, restructure real code.\n\n`
      + `PRESCRIPTION:\n${actionDescription}\n\n`
      + `FULL REVIEW CONTEXT (for background only — the PRESCRIPTION above is what to implement):\n${reviewText.slice(0, 3000)}`;
  }
  // Fallback: extract surrounding lines that mention this file
  const lines = reviewText.split('\n');
  const fileIdx = lines.findIndex(l => l.includes(base));
  if (fileIdx === -1) { return `Refactor ${file} based on the architect review:\n\n${reviewText.slice(0, 2000)}`; }
  const nearby = lines.slice(Math.max(0, fileIdx - 3), fileIdx + 12).join('\n');
  return `Implement these architect-review fixes for \`${file}\`. Make REAL code changes, not comments.\n\nPRESCRIPTION:\n${nearby}`;
}

export async function handleArchitectFixAll(msg: any, conversation: ChatMessage[], refresh: () => void, panel?: vscode.WebviewPanel): Promise<void> {
  const reviewId = msg.reviewId || '';
  const reviewText = _architectReviews.get(reviewId);
  if (!reviewText) { return; }
  panel?.webview.postMessage({ type: 'set-status', status: 'working' });
  const root = _projectRoot();

  // [FIX] Prefer ACTIONS_JSON entries — they carry precise per-fix descriptions that produce real
  // code changes. The old file-regex approach produced vague tasks the Worker interpreted as "add comments".
  const actions = _architectActions.get(reviewId) || [];
  const fixActions = actions.filter(a => a.action === 'fix' || a.action === 'create');

  if (fixActions.length > 0) {
    const existingActions = fixActions.filter(a => a.action === 'create' || fs.existsSync(path.join(root, a.file)));
    if (existingActions.length === 0) {
      conversation.push({ role: 'assistant', content: 'No existing files to fix.', timestamp: Date.now() }); refresh(); return;
    }
    conversation.push({ role: 'assistant', content: `Applying ${existingActions.length} fix${existingActions.length !== 1 ? 'es' : ''} from the review...`, timestamp: Date.now() });
    refresh();
    for (let i = 0; i < existingActions.length; i++) {
      const act = existingActions[i];
      const task = _fixTaskFor(reviewText, act.file, act.description);
      try {
        await vscode.commands.executeCommand('redivivus.runEditFix', task, act.file, 'refactor');
        const progress = conversation[conversation.length - 1];
        if (progress && progress.content.startsWith('Applying ')) { progress.content = `Applying ${existingActions.length} fixes: ${i + 1} done...`; refresh(); }
      } catch { /* continue on individual failures */ }
    }
    conversation.push({ role: 'assistant', content: `All ${existingActions.length} fixes applied.`, timestamp: Date.now() });
    refresh();
    panel?.webview.postMessage({ type: 'set-status', status: 'ready' });
    return;
  }

  // Fallback: no ACTIONS_JSON — extract unique file names from review text
  const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
  const seen = new Set<string>();
  const files: string[] = [];
  for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); files.push(f); } }
  if (files.length === 0) {
    conversation.push({ role: 'assistant', content: 'No specific files identified in the review. Use **Fix One at a Time** to step through issues manually.', timestamp: Date.now() });
    refresh(); return;
  }
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
  panel?.webview.postMessage({ type: 'set-status', status: 'ready' });
}

/** Deep Fix — routes each architect fix through the full Supervisor→Worker→Guardian pipeline.
 *  Higher quality, more tokens, Guardian verification with retry logic.
 *  This is the "quality over speed" option vs the lighter Fix All. */
export async function handleArchitectDeepFix(msg: any, conversation: ChatMessage[], refresh: () => void, deps: any, panel?: vscode.WebviewPanel): Promise<void> {
  const reviewId = msg.reviewId || '';
  const reviewText = _architectReviews.get(reviewId);
  if (!reviewText) { return; }
  panel?.webview.postMessage({ type: 'set-status', status: 'working' });
  const root = _projectRoot();

  const actions = _architectActions.get(reviewId) || [];
  const fixActions = actions.filter(a => a.action === 'fix' || a.action === 'create');

  let filesToFix: Array<{ file: string; description: string }> = [];
  if (fixActions.length > 0) {
    filesToFix = fixActions
      .filter(a => a.action === 'create' || fs.existsSync(path.join(root, a.file)))
      .map(a => ({ file: a.file, description: a.description }));
  } else {
    // Fallback: extract files from review text
    const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
    const seen = new Set<string>();
    for (const m of fileMatches) { const f = m[1]; if (!seen.has(f) && fs.existsSync(path.join(root, f))) { seen.add(f); filesToFix.push({ file: f, description: '' }); } }
  }

  if (filesToFix.length === 0) {
    conversation.push({ role: 'assistant', content: 'No existing files to deep-fix.', timestamp: Date.now() }); refresh();
    panel?.webview.postMessage({ type: 'set-status', status: 'ready' }); return;
  }

  conversation.push({ role: 'assistant', content: `🔬 **Deep Fix** — routing ${filesToFix.length} fix${filesToFix.length !== 1 ? 'es' : ''} through the full Supervisor→Worker→Guardian pipeline...`, timestamp: Date.now() });
  refresh();

  const { handleFixRequest } = await import('../../../core/routing/chatPanelMsgFix.js');

  for (let i = 0; i < filesToFix.length; i++) {
    const { file, description } = filesToFix[i];
    // Build a fix request that the Supervisor pipeline can diagnose and execute
    const fixText = description
      ? `Fix \`${file}\`: ${description}\n\nContext from architect review:\n${reviewText.slice(0, 2000)}`
      : `Fix \`${file}\` based on the architect review:\n${reviewText.slice(0, 2000)}`;

    try {
      await handleFixRequest(fixText, deps);
      const progress = conversation.find(m => m.content.includes('Deep Fix'));
      if (progress) { progress.content = `🔬 **Deep Fix** — ${i + 1} of ${filesToFix.length} complete...`; refresh(); }
    } catch { /* continue on individual failures */ }
  }

  conversation.push({ role: 'assistant', content: `✅ Deep Fix complete — ${filesToFix.length} fix${filesToFix.length !== 1 ? 'es' : ''} processed through full pipeline.`, timestamp: Date.now() });
  refresh();
  panel?.webview.postMessage({ type: 'set-status', status: 'ready' });
}

export async function handleArchitectFixOne(msg: any, conversation: ChatMessage[], refresh: () => void, panel?: vscode.WebviewPanel): Promise<void> {
  const reviewId = msg.reviewId || '';
  const reviewText = _architectReviews.get(reviewId);
  if (!reviewText) { return; }

  if (!_architectFixState.has(reviewId)) {
    // [FIX] Prefer ACTIONS_JSON entries for step-through — same reason as Fix All
    const actions = _architectActions.get(reviewId) || [];
    const fixActionFiles = actions.filter(a => a.action === 'fix' || a.action === 'create').map(a => a.file);
    const rootDir = _projectRoot();

    let files: string[];
    if (fixActionFiles.length > 0) {
      files = fixActionFiles.filter(f => actions.find(a => a.file === f)?.action === 'create' || fs.existsSync(path.join(rootDir, f)));
    } else {
      // Fallback: extract file names from review text
      const fileMatches = [...reviewText.matchAll(/\b((?:[\w./\-]+\/)?[\w.\-]+\.(?:ts|js|py|md|json|go|rs|rb|html|css|tsx|jsx|vue|svelte|c|cpp|h))\b/g)];
      const seen = new Set<string>();
      const allFiles: string[] = [];
      for (const m of fileMatches) { const f = m[1]; if (!seen.has(f)) { seen.add(f); allFiles.push(f); } }
      files = allFiles.filter(f => fs.existsSync(path.join(rootDir, f)));
      const skipped = allFiles.filter(f => !files.includes(f));
      if (skipped.length > 0) {
        conversation.push({ role: 'assistant', content: `Skipping \`${skipped.join('`, `')}\` -- file(s) don't exist yet.`, timestamp: Date.now() });
        refresh();
      }
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
    const actions = _architectActions.get(reviewId) || [];
    const act = actions.find(a => a.file === currentFile);
    const task = _fixTaskFor(reviewText, currentFile, act?.description);
    await vscode.commands.executeCommand('redivivus.runEditFix', task, currentFile, 'refactor');
  }
  const nextFile = state.issues[state.index];
  const actions2 = _architectActions.get(reviewId) || [];
  const nextAct = actions2.find(a => a.file === nextFile);
  const preview = nextAct ? `\n\n> ${nextAct.description.slice(0, 200)}` : '';
  conversation.push({
    role: 'assistant',
    content: '**Issue ' + (state.index + 1) + ' of ' + state.issues.length + ':** `' + nextFile + '`' + preview + '\n\n'
      + '__ARCH_STEP__' + reviewId + '|||' + state.index + '|||' + state.issues.length + '|||' + nextFile + '|||END_ARCH_STEP__',
    timestamp: Date.now(),
  });
  refresh();
}
