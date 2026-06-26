// [SCOPE] panelRefresh implementation — extracted from chatPanelPublicAPI.ts (Rule 9 split).

import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel.js';
import { buildHeaderInfo } from './chatPanelHeader.js';
import { SetupProgressService } from '../../project/logic/setupProgressService.js';
import { buildChatHtml } from './chatPanelHtml.js';
import { readActiveProjectDashboard } from './chatPanelDashboard.js';

const _writtenMessages = new Set<string>();

export function saveConversation(state: any, root?: string): void {
  try {
    const ctx = ChatPanel.extensionContext;
    if (!ctx || !root || !state.conversation.length) { return; }
    const { chatHistoryKey } = require('./chatPanelPublicAPI.js');
    // [VISION] Strip imageBase64 before persisting — a 500KB screenshot serializes to ~670KB of base64.
    // Keeping it would rapidly bloat globalState and chat_history.md. The AI already processed it.
    const toSave = state.conversation
      .filter((m: any) => !m.content?.includes('__BUILD_WORKING__'))
      .slice(-100)
      .map(({ imageBase64: _img, imageType: _imgT, ...rest }: any) => rest);
    ctx.globalState.update(chatHistoryKey(root), JSON.stringify(toSave));
    const fs = require('fs');
    const path = require('path');
    const redDir = path.join(root, '.redivivus');
    if (fs.existsSync(redDir)) {
      const logPath = path.join(redDir, 'chat_history.md');
      let toAppend = '';
      for (const m of state.conversation) {
        const key = `${m.timestamp}_${m.role}`;
        if (!_writtenMessages.has(key)) {
          const imageNote = m.imageBase64 ? '\n\n*[Image attached — not stored in history]*' : '';
          toAppend += `### ${m.role === 'user' ? 'User' : 'Redivivus'} (${new Date(m.timestamp || Date.now()).toLocaleString()})\n\n${m.content}${imageNote}\n\n---\n\n`;
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

export async function panelRefresh(panel: any): Promise<void> {
  const state = panel.state;
  const usageTracker = panel.usageTracker;
  const headerInfo = buildHeaderInfo(panel.redivivus, panel.routing, usageTracker, state.lastModel, ChatPanel.extensionContext, state.buildMode, state.assistMode);
  // [PANEL-CONTEXT] Detect current conversation mode and filter pills accordingly.
  // Only check the last few messages (O(1)) instead of scanning the full conversation (O(n)).
  const recentMsgs = state.conversation?.slice(-3) || [];
  if (recentMsgs.some((m: any) => m.content?.includes('__ARCHITECT_ACTIONS__'))) {
    headerInfo.panelContext = 'architect';
  }
  try { const { getAccountToken } = await import('../../../features/api/data/apiClient.js'); headerInfo.isSignedIn = !!(await getAccountToken()); } catch {}
  const _panel = panel._panel;
  const _initialized = panel._initialized;
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  const desiredTitle = wsFolder ? require('path').basename(wsFolder.uri.fsPath) : 'Redivivus Chat';
  if (_panel.title !== desiredTitle) { _panel.title = desiredTitle; }
  require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
    `[panelRefresh] _initialized=${_initialized} hasProject=${headerInfo.hasProjectOpen} conv=${panel.state?.conversation?.length}\n`);
  if (!_initialized) {
    let progress;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (headerInfo.isInitialized && root && state.conversation.length === 0) {
      try { progress = await new SetupProgressService(panel.redivivus, root).getProgress(); } catch {}
    }
    if (root && (headerInfo as any).workspaceHasRedivivus && !(headerInfo as any).workspaceIsAssistMode && state.conversation.length === 0) {
      try { headerInfo.dashData = readActiveProjectDashboard(panel, root); } catch {}
    }
    _panel.webview.html = buildChatHtml(state.conversation, headerInfo, progress);
    panel._initialized = true;
    saveConversation(state, root);
    (async () => {
      try {
        const { collectHealthData, getHealthStatus } = await import('./chatPanelHealthCheck.js');
        const colorMap: Record<string, string> = { green: '#4caf50', yellow: '#ff9800', red: '#f44336' };
        const probe = async () => {
          try {
            const data = await collectHealthData();
            const status = getHealthStatus(data);
            _panel.webview.postMessage({ type: 'update-health-btn', status, color: colorMap[status] });
            ChatPanel.extensionContext?.globalState.update('redivivus.healthStatus', status);
          } catch {}
        };
        await probe();
        setTimeout(probe, 2500);
        setTimeout(probe, 6000);
        setInterval(probe, 5 * 60 * 1000);
      } catch {}
    })();
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
      try { headerInfo.dashData = readActiveProjectDashboard(panel, root); } catch {}
    }
    const { buildEmptyStateHtml } = await import('./chatPanelEmptyState.js');
    htmlToInject = buildEmptyStateHtml(headerInfo, progress);
  }
  _panel.webview.postMessage({ type: 'update-conversation', html: htmlToInject });
  try {
    const { renderHeaderRightInner, renderInputLeftInner } = require('./chatPanelHeaderRender.js');
    const contextLabels: Record<string, string> = { architect: 'Architect Review', map: 'Architecture Map', history: 'Project History' };
    const panelContextLabel = headerInfo.panelContext && headerInfo.panelContext !== 'chat' ? contextLabels[headerInfo.panelContext] || '' : '';
    _panel.webview.postMessage({ type: 'update-header', headerRight: renderHeaderRightInner(headerInfo), inputLeft: renderInputLeftInner(headerInfo), panelContextLabel });
  } catch {}
  const root2 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  saveConversation(state, root2);
}
