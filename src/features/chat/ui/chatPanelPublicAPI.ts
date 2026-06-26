// [SCOPE] Chat Panel Public API — public methods exposed on ChatPanel class
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import type { ChatMessage } from './chatPanelHtml.js';
import { ChatPanel } from './chatPanel.js';
import { buildHeaderInfo } from './chatPanelHeader.js';
import { SetupProgressService } from '../../project/application/setupProgressService.js';
import { buildChatHtml } from './chatPanelHtml.js';
import { readActiveProjectDashboard } from './chatPanelDashboard.js';
import { logProjectContextSwitch } from '../../../shared/logging/infrastructure/projectContextLogger.js';
export { panelRefresh, saveConversation } from './chatPanelPublicAPIRefresh.js';

export function panelShowGettingStarted(panel: any): void {
  panel._panel.webview.postMessage({ type: 'show-panel', panelType: 'getting-started' });
  panel._panel.reveal(vscode.ViewColumn.Beside);
}

export function panelShowStartSession(panel: any): void {
  panel._panel.webview.postMessage({ type: 'show-panel', panelType: 'start-session' });
  panel._panel.reveal(vscode.ViewColumn.Beside);
}

export async function panelResumeBuildTask(panel: any, task: string, projectRoot?: string): Promise<void> {
  if (!task) { return; }
  const state = panel.state;
  const last = state.conversation[state.conversation.length - 1];
  if (!last || last.role !== 'user' || last.content !== task) {
    state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
  }
  panel.refresh();
  if (projectRoot) {
    const currentRedivivusRoot = panel.redivivus?.getWorkspaceRoot?.();
    const validation = logProjectContextSwitch(projectRoot, 'resumeBuildTask', task);
    if (!validation.allowed) {
      vscode.window.showErrorMessage(`Redivivus Bug Detected: Attempted to switch from "${currentRedivivusRoot}" to "${projectRoot}" during build. This should not happen.`, 'OK');
      console.error('[Redivivus] Blocked project switch in resumeBuildTask:', validation.reason);
      return;
    }
    panel.redivivus = new panel.redivivus.constructor(projectRoot);
    panel.loadBlueprintContext();
    ChatPanel.extensionContext?.globalState.update('redivivus.lastActiveProject', projectRoot);
  }
  await panel._handleBuildRequest(task, true, false);
}

export function panelShowNewProject(panel: any, suggestedParent?: string, prefillTask?: string, compact?: boolean): void {
  const task = prefillTask || panel._pendingTask || '';
  const isSimple = compact !== undefined ? compact : /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(task);
  panel._panel.webview.postMessage({ type: 'show-panel', panelType: 'new-project', suggestedParent: suggestedParent || '', prefillTask: task, compact: isSimple });
  panel._panel.reveal(panel._panel.viewColumn ?? vscode.ViewColumn.One);
}

export function panelShowPanel(panel: any, panelType: string, title: string, content: string): void {
  panel._panel.webview.postMessage({ type: 'show-panel', panelType, title, content });
  panel._panel.reveal(panel._panel.viewColumn ?? vscode.ViewColumn.One);
}

export function panelSetLastModel(panel: any, model: string): void {
  panel.state.lastModel = model;
  panel.refresh();
}

// [WARN] This key is PERSISTED in globalState (survives restarts). It must NOT include process.pid —
// the pid changes every launch, so a pid-keyed entry can never be restored OR cleared after a restart, and
// stale entries pile up forever (one per pid per root). That was the real "trash button does nothing" bug:
// clear targeted the CURRENT pid's key while the visible conversation was saved under a DIFFERENT pid. Key on
// the project root only, so save/restore/clear are always consistent. [DEAD] was `...${process.pid}.${root}`.
export function chatHistoryKey(root?: string): string {
  return `redivivus.chatHistory.${root || 'global'}`;
}

/** Restore saved conversation from globalState. Call in ChatPanel constructor before refresh(). */
export function restoreConversation(panel: any): void {
  try {
    const ctx = ChatPanel.extensionContext;
    if (!ctx) { return; }
    // [FIX] Priority 1: a build that opened the project folder (openFolder reload) stashes the live
    // conversation in pendingRescueConversation. Restore it synchronously so the panel opens already
    // populated — otherwise it shows the empty launcher and the conversation is injected ~300ms later,
    // which reads as the chat "closing and reopening". Consuming it here means resumePendingState
    // won't re-inject; it only resumes the build task.
    const rescue = ctx.globalState.get<any[]>('redivivus.pendingRescueConversation');
    if (rescue && Array.isArray(rescue) && rescue.length > 0) {
      ctx.globalState.update('redivivus.pendingRescueConversation', undefined);
      ctx.globalState.update('redivivus.skipConversationRestore', undefined);
      panel.state.conversation = rescue as ChatMessage[];
      return;
    }
    // [FIX] Priority 2: skip restoring old history when a new project was just opened.
    if (ctx.globalState.get<boolean>('redivivus.skipConversationRestore')) {
      ctx.globalState.update('redivivus.skipConversationRestore', undefined);
      return;
    }
    // [FIX] Priority 3 (saved per-project history) is DELIBERATELY not restored on a normal reload — a reload
    // should give a CLEAN screen. This restore was silently dead for ages (the old pid-keyed chatHistoryKey
    // never matched after a restart); fixing the key "un-broke" it and surfaced the unwanted behavior: reload
    // re-loaded the old conversation while the project context resets, leaving an orphaned chat with no project.
    // An in-progress build still survives via the pendingRescueConversation rescue (Priority 1) above.
    // [DEAD] was: const saved = ctx.globalState.get(chatHistoryKey(root)); if (saved) panel.state.conversation =
    // JSON.parse(saved); — re-enable only behind an explicit "restore last conversation" user action.
    return;
  } catch { /* never block panel creation */ }
}

/** Clear persisted conversation for current workspace. Call when user clears chat. */
export function clearPersistedConversation(): void {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const ctx = ChatPanel.extensionContext;
    if (!ctx) { return; }
    if (root) { ctx.globalState.update(chatHistoryKey(root), undefined); }
    // [FIX] Also sweep any LEGACY pid-keyed entries (from the old buggy key format) so a Clear actually
    // empties the chat instead of leaving a stale pid-keyed copy that gets restored next launch.
    try {
      const keys: readonly string[] = (ctx.globalState as any).keys ? (ctx.globalState as any).keys() : [];
      for (const k of keys) { if (k.startsWith('redivivus.chatHistory.')) { ctx.globalState.update(k, undefined); } }
    } catch { /* keys() may be unavailable on older API — current-key clear above still applies */ }
  } catch {}
}


export function postToChatWebview(msg: unknown): void {
  const inst = ChatPanel.currentPanel;
  if (inst) { (inst as any)._panel.webview.postMessage(msg); }
}

export function panelBuildFromVaultPrefill(panel: any): { task?: string; targetFile?: string } {
  const state = panel.state;
  const msgs = state.conversation.filter((m: ChatMessage) => m.role === 'user');
  const config = panel.redivivus.isInitialized() ? panel.redivivus.loadConfig() : null;
  const task = (msgs.length > 0 ? msgs[msgs.length - 1].content.trim() : '') || config?.blueprint?.what || undefined;
  const where = (config?.blueprint?.where || '').toLowerCase();
  const ext = where.includes('python') ? '.py' : where.includes('react') || where.includes('tsx') ? '.tsx' : where.includes('javascript') || where.includes('node') ? '.js' : '.ts';
  const targetFile = config?.projectName ? `src/${config.projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}${ext}` : undefined;
  return { task, targetFile };
}
