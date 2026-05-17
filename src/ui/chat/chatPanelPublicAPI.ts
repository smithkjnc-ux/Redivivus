// [SCOPE] Chat Panel Public API — public methods exposed on ChatPanel class
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel.js';
import { buildHeaderInfo } from './chatPanelHeader.js';
import { SetupProgressService, SetupProgress } from '../../services/project/setupProgressService.js';
import { buildChatHtml } from './chatPanelHtml.js';

export function panelShowGettingStarted(panel: ChatPanel): void {
  const _panel = (panel as any)._panel;
  _panel.webview.postMessage({ type: 'show-panel', panelType: 'getting-started' });
  _panel.reveal(vscode.ViewColumn.Beside);
}

export function panelShowStartSession(panel: ChatPanel): void {
  const _panel = (panel as any)._panel;
  _panel.webview.postMessage({ type: 'show-panel', panelType: 'start-session' });
  _panel.reveal(vscode.ViewColumn.Beside);
}

export async function panelResumeBuildTask(panel: ChatPanel, task: string, projectRoot?: string): Promise<void> {
  if (!task) { return; }
  const state = (panel as any).state;
  const last = state.conversation[state.conversation.length - 1];
  if (!last || last.role !== 'user' || last.content !== task) {
    state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
  }
  panel.refresh();
  if (projectRoot) {
    (panel as any).chassis = new ((panel as any).chassis.constructor as any)(projectRoot);
    (panel as any).loadBlueprintContext();
    ChatPanel.extensionContext?.globalState.update('chassis.lastActiveProject', projectRoot);
  }
  await (panel as any)._handleBuildRequest(task, true, false);
}

export function panelShowNewProject(panel: ChatPanel, suggestedParent?: string, prefillTask?: string, compact?: boolean): void {
  const _pendingTask = (panel as any)._pendingTask;
  const task = prefillTask || _pendingTask || '';
  const isSimple = compact !== undefined ? compact : /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(task);
  const _panel = (panel as any)._panel;
  _panel.webview.postMessage({ type: 'show-panel', panelType: 'new-project', suggestedParent: suggestedParent || '', prefillTask: task, compact: isSimple });
  _panel.reveal(_panel.viewColumn ?? vscode.ViewColumn.One);
}

export function panelShowPanel(panel: ChatPanel, panelType: string, title: string, content: string): void {
  const _panel = (panel as any)._panel;
  _panel.webview.postMessage({ type: 'show-panel', panelType, title, content });
  _panel.reveal(_panel.viewColumn ?? vscode.ViewColumn.One);
}

export function panelSetLastModel(panel: ChatPanel, model: string): void {
  (panel as any).state.lastModel = model;
  panel.refresh();
}

export async function panelRefresh(panel: ChatPanel): Promise<void> {
  const state = (panel as any).state;
  const usageTracker = (panel as any).usageTracker;
  const headerInfo = buildHeaderInfo((panel as any).chassis, (panel as any).routing, usageTracker, state.lastModel, ChatPanel.extensionContext, state.buildMode);
  const _panel = (panel as any)._panel;
  const _initialized = (panel as any)._initialized;
  if (!_initialized) {
    let progress: SetupProgress | undefined;
    if (headerInfo.isInitialized) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root && state.conversation.length === 0) {
        try { progress = await new SetupProgressService((panel as any).chassis, root).getProgress(); } catch { }
      }
    }
    _panel.webview.html = buildChatHtml(state.conversation, headerInfo, progress);
    (panel as any)._initialized = true;
    return;
  }
  const { renderMessages } = await import('./chatPanelRenderer.js');
  const messagesHtml = renderMessages(state.conversation);
  _panel.webview.postMessage({ type: 'update-conversation', html: messagesHtml });
}

export function panelBuildFromVaultPrefill(panel: ChatPanel): { task?: string; targetFile?: string } {
  const state = (panel as any).state;
  const msgs = state.conversation.filter((m: any) => m.role === 'user');
  const config = (panel as any).chassis.isInitialized() ? (panel as any).chassis.loadConfig() : null;
  const task = (msgs.length > 0 ? msgs[msgs.length - 1].content.trim() : '') || config?.blueprint?.what || undefined;
  const where = (config?.blueprint?.where || '').toLowerCase();
  const ext = where.includes('python') ? '.py' : where.includes('react') || where.includes('tsx') ? '.tsx' : where.includes('javascript') || where.includes('node') ? '.js' : '.ts';
  const targetFile = config?.projectName ? `src/${config.projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}${ext}` : undefined;
  return { task, targetFile };
}
