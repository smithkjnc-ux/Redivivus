// [SCOPE] Confirmed build handler — runs the local supervisor->worker->guardian pipeline
// when the user confirms a prior build request ("that sounds perfect, build it").
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split).

import * as vscode from 'vscode';
import { ChatMessage } from '../../ui/panels/chat/chatPanelHtml';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { runSingleFileBuild } from '../build/chatPanelBuild';
import { autoCreateProject } from '../build/chatPanelBuildAutoCreate';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';

export async function runConfirmedLocalBuild(
  task: string,
  _userText: string,
  deps: MessageHandlerDeps,
  conversation: ChatMessage[],
  refresh: () => void,
): Promise<void> {
  const { getAccountToken } = await import('../../services/api/apiClient.js');
  const token = await getAccountToken();
  if (!token) {
    conversation.push({ role: 'assistant', content: '🔒 **Sign in to use Redivivus**\n\nRun **Redivivus: Sign In** from the command palette.', timestamp: Date.now() });
    refresh(); return;
  }

  deps.panel.webview.postMessage({ type: 'set-status', status: 'working' });

  // Step 1: Extract blueprint from the task using Redivivus AI
  let extracted: any = { suggestedName: '', who: '', what: '', where: '', when: '', why: '' };
  try {
    const { extractBlueprintFromPrompt } = await import('../../services/blueprint/blueprintExtractor.js');
    extracted = await extractBlueprintFromPrompt(task, deps.routing);
  } catch {
    // [WARN] AI extraction failed — use heuristic fallback
    const slug = task.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
    extracted = { suggestedName: slug, who: '', what: task.slice(0, 120), where: '', when: 'now', why: '' };
  }

  // Step 2: Resolve project root
  let root: string;
  let blueprintContext: string;
  let autoCreated = false;
  const existingRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const isValidRoot = (r: string | undefined): boolean => {
    if (!r) { return false; }
    const lower = r.toLowerCase();
    if (lower.includes('/extensions/redivivus') || lower.includes('\\extensions\\redivivus')) { return false; }
    if (lower.includes('/resources/app/extensions/') || lower.includes('\\resources\\app\\extensions\\')) { return false; }
    return true;
  };

  if (isValidRoot(existingRoot)) {
    root = existingRoot!;
    blueprintContext = [
      `Project: ${extracted.suggestedName}`,
      `Who: ${extracted.who || '?'}`,
      `What: ${extracted.what || task.slice(0, 120)}`,
      `Where: ${extracted.where || '?'}`,
      `When: ${extracted.when || 'now'}`,
      `Why: ${extracted.why || '?'}`,
    ].join('\n');
  } else {
    try {
      const created = await autoCreateProject(task, deps as any);
      root = created.dir;
      blueprintContext = created.blueprintContext;
      autoCreated = true;
    } catch (e) {
      deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
      conversation.push({ role: 'assistant', content: `Could not create project folder: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
      refresh(); return;
    }
  }

  // Step 3: Build with full Redivivus context (supervisor->worker->guardian)
  const { readProjectDeadEnds } = await import('../routing/chatPanelMsgFixDeadEnds.js');
  const { readProjectRules, getRecentBuildsContext } = await import('../routing/chatPanelMsgFixUtils.js');
  const { buildGitContextBlock } = await import('../../services/workspace/gitContext.js');
  const deadEnds = readProjectDeadEnds(root);
  const projectRules = readProjectRules(root);
  const gitCtx = buildGitContextBlock(root);
  const fullBlueprintContext = [
    blueprintContext,
    deadEnds ? `PREVIOUSLY FAILED APPROACHES (do not repeat):\n${deadEnds}` : '',
    projectRules ? `PROJECT RULES (must not violate):\n${projectRules}` : '',
    gitCtx,
    getRecentBuildsContext(root),
  ].filter(Boolean).join('\n\n');

  const ctx = {
    task, root, blueprintContext: fullBlueprintContext,
    routing: deps.routing, conversation, refresh,
    logError: (_t: string, _p: string, _e: string, _l: number) => {},
    postToWebview: (m: any) => deps.panel.webview.postMessage(m),
    redivivus: deps.redivivus, usageTracker: deps.usageTracker,
    onBuildFinished: (_t: string, _f?: string[]) => {
      if (autoCreated && root) {
        const CP = require('../../ui/panels/chat/chatPanel.js').ChatPanel;
        if (CP?.extensionContext) { CP.extensionContext.globalState.update('redivivus.skipConversationRestore', true); }
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: false });
      }
    },
  };

  try {
    await runSingleFileBuild(ctx as any);
  } catch (e: any) {
    const raw = e?.message || String(e) || 'Build failed';
    // Parse JSON API error responses (Anthropic, OpenAI, etc.) to extract human-readable message
    let errMsg = raw;
    try {
      const jsonStart = raw.indexOf('{');
      if (jsonStart !== -1) {
        const parsed = JSON.parse(raw.slice(jsonStart));
        errMsg = parsed?.error?.message || parsed?.message || parsed?.error?.error || raw;
      }
    } catch { /* keep raw */ }
    // Truncate to avoid wall-of-text
    errMsg = errMsg.slice(0, 300);
    conversation.push({ role: 'assistant', content: `❌ **Build failed:** ${errMsg}\n\n_Try rephrasing your request or check your AI keys._`, timestamp: Date.now() });
    refresh();
  } finally {
    deps.panel.webview.postMessage({ type: 'set-status', status: 'ready' });
  }
}
