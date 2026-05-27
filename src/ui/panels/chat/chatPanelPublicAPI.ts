// [SCOPE] Chat Panel Public API — public methods exposed on ChatPanel class
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import type { ChatMessage } from './chatPanelHtml';
import { ChatPanel } from './chatPanel';
import { buildHeaderInfo } from './chatPanelHeader';
import { SetupProgressService } from '../../../services/project/setupProgressService';
import { buildChatHtml } from './chatPanelHtml';
import { readDashboardData } from './chatPanelDashboard';
import { logProjectContextSwitch } from '../../../services/logging/projectContextLogger';

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

export function chatHistoryKey(root?: string): string {
  return `redivivus.chatHistory.${process.pid}.${root || 'global'}`;
}

/** Restore saved conversation from globalState. Call in ChatPanel constructor before refresh(). */
export function restoreConversation(panel: any): void {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const ctx = ChatPanel.extensionContext;
    if (!ctx || !root) { return; }
    const saved = ctx.globalState.get<string>(chatHistoryKey(root));
    if (saved) {
      const msgs: ChatMessage[] = JSON.parse(saved);
      if (Array.isArray(msgs) && msgs.length > 0) { panel.state.conversation = msgs; }
    }
  } catch { /* never block panel creation */ }
}

/** Clear persisted conversation for current workspace. Call when user clears chat. */
export function clearPersistedConversation(): void {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const ctx = ChatPanel.extensionContext;
    if (ctx && root) { ctx.globalState.update(chatHistoryKey(root), undefined); }
  } catch {}
}

export async function panelRefresh(panel: any): Promise<void> {
  const state = panel.state;
  const usageTracker = panel.usageTracker;
  const headerInfo = buildHeaderInfo(panel.redivivus, panel.routing, usageTracker, state.lastModel, ChatPanel.extensionContext, state.buildMode, state.assistMode);
  try { const { getAccountToken } = await import('../../../services/api/apiClient.js'); headerInfo.isSignedIn = !!(await getAccountToken()); } catch {}
  const _panel = panel._panel;
  const _initialized = panel._initialized;
  if (!_initialized) {
    let progress;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (headerInfo.isInitialized && root && state.conversation.length === 0) {
      try { progress = await new SetupProgressService(panel.redivivus, root).getProgress(); } catch {}
    }
    if (root && (headerInfo as any).workspaceHasRedivivus && !(headerInfo as any).workspaceIsAssistMode && state.conversation.length === 0) {
      try { const config = panel.redivivus.isInitialized() ? panel.redivivus.loadConfig() : null; headerInfo.dashData = readDashboardData(root, config); } catch {}
    }
    _panel.webview.html = buildChatHtml(state.conversation, headerInfo, progress);
    panel._initialized = true;
    // Persist conversation after first load so existing messages survive a panel reopen
    saveConversation(state, root);
    return;
  }
  const { renderMessages } = await import('./chatPanelRenderer.js');
  const messagesHtml = renderMessages(state.conversation);
  let htmlToInject = messagesHtml;
  if (!htmlToInject) {
    let progress;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (headerInfo.isInitialized && root) {
      try { progress = await new SetupProgressService(panel.redivivus, root).getProgress(); } catch {}
    }
    if (root && (headerInfo as any).workspaceHasRedivivus && !(headerInfo as any).workspaceIsAssistMode) {
      try { const config = panel.redivivus.isInitialized() ? panel.redivivus.loadConfig() : null; headerInfo.dashData = readDashboardData(root, config); } catch {}
    }
    const { buildEmptyStateHtml } = await import('./chatPanelEmptyState.js');
    htmlToInject = buildEmptyStateHtml(headerInfo, progress);
  }
  _panel.webview.postMessage({ type: 'update-conversation', html: htmlToInject });
  // Persist conversation on every update
  const root2 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  saveConversation(state, root2);
}

const _writtenMessages = new Set<string>();

function saveConversation(state: any, root?: string): void {
  try {
    const ctx = ChatPanel.extensionContext;
    if (!ctx || !root || !state.conversation.length) { return; }
    ctx.globalState.update(chatHistoryKey(root), JSON.stringify(state.conversation.slice(-100)));
    
    // Append new messages to project folder log
    const fs = require('fs');
    const path = require('path');
    const redDir = path.join(root, '.redivivus');
    if (fs.existsSync(redDir)) {
      const logPath = path.join(redDir, 'chat_history.md');
      let toAppend = '';
      for (const m of state.conversation) {
        const key = `${m.timestamp}_${m.role}`;
        if (!_writtenMessages.has(key)) {
          toAppend += `### ${m.role === 'user' ? 'User' : 'Redivivus'} (${new Date(m.timestamp || Date.now()).toLocaleString()})\n\n${m.content}\n\n---\n\n`;
          _writtenMessages.add(key);
        }
      }
      if (toAppend) {
        if (!fs.existsSync(logPath)) { fs.writeFileSync(logPath, '# Project Chat History\n\n', 'utf8'); }
        fs.appendFileSync(logPath, toAppend, 'utf8');
      }
    }
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
