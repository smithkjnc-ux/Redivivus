// [SCOPE] Architect Deep Fix — routes each architect fix through the full Supervisor→Worker→Guardian pipeline.
// Extracted from chatPanelMsgArchitectFix.ts (Rule 9 split — was 220 lines).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatMessage } from './chatPanelHtml.js';
import { _architectReviews, _architectActions } from './chatPanelMsgArchitect.js';
import { getActiveProjectRoot } from '../../project/logic/activeProjectRoot.js';

function _projectRoot(): string {
  return getActiveProjectRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
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

  const { handleFixRequest } = await import('../../fix/chatPanelMsgFix.js');

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
