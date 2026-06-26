// [SCOPE] Chat Panel Message Router early-exit handlers — clarify, bi, fix, build, folder, mode, gates
// Extracted from chatPanelMessageRouter.ts. Returns true if message was handled, false to fall through.

import { resolvePendingClarify } from '../ui/chatPanelClarifyBridge.js';
import * as vscode from 'vscode';
import { ChatPanel } from '../ui/chatPanel.js';
import { handleEditRequest } from '../../../features/ai/logic/chatPanelIntent.js';
import { handleInterviewMessage } from '../../blueprint/ui/blueprintInterviewPanel.js';
import { handlePreviewMessages } from './chatPanelMessageRouterPreview.js';
import { handleScaffoldQuickstart } from './chatPanelMessageRouterScaffold.js';
import { handleBuildSimple, handleBuildTask, handleCreateFolder, handleNewProjectCancel, handleOpenWorkspaceBtn, handleSetMode, handleSwitchMode } from './chatPanelMessageRouterBuild.js';

export async function handleEarlyExits(panel: ChatPanel, msg: any): Promise<boolean> {
  const state = (panel as any).state;
  const _panel = (panel as any)._panel;
  const _activeBuildCtx = (panel as any)._activeBuildCtx;
  const _pendingTask = (panel as any)._pendingTask;
  const redivivus = (panel as any).redivivus;
  const routing = (panel as any).routing;

  if (msg.type === 'clarify-submit') {
    // [FIX] Support both build-context clarify (chunked builds) and orchestrator-level clarify (design triage)
    _activeBuildCtx?.onClarifySubmit?.(msg.answers || {});
    resolvePendingClarify(msg.answers || {});
    return true;
  }

  if (msg.type?.startsWith('bi-')) {
    if (msg.type === 'bi-start') { _panel.reveal(vscode.ViewColumn.One, false); }
    await handleInterviewMessage(msg, _panel.webview, redivivus, routing);
    return true;
  }

  if (msg.type === 'fix-request') {
    const _lastMsg = state.conversation[state.conversation.length - 1];
    if (!_lastMsg || _lastMsg.role !== 'user' || _lastMsg.content !== msg.text) {
      state.conversation.push({ role: 'user', content: msg.text, timestamp: Date.now() });
    }
    panel.refresh();
    // [FIX] Use the local fix pipeline (handleFixRequest) which modifies existing files in-place.
    // The cloud build pipeline (_handleBuildRequest) creates new projects and returns full files,
    // which is wrong for fix requests on existing code.
    const { handleFixRequest } = await import('../../fix/chatPanelMsgFix.js');
    await handleFixRequest(msg.text, {
      redivivus,
      routing,
      conversation: state.conversation,
      refresh: () => panel.refresh(),
      panel: _panel,
      vault: (panel as any).vault,
      isBuildRequest: async (t: string) => (panel as any)._isBuildRequest(t),
      handleBuildRequest: (t: string, s?: boolean, f?: boolean) => (panel as any)._handleBuildRequest(t, s, f),
      buildFromVaultPrefill: () => (panel as any)._buildFromVaultPrefill(),
    } as any);
    return true;
  }

  if (msg.type === 'build-simple') { return handleBuildSimple(panel, msg); }
  if (msg.type === 'create-folder') { return handleCreateFolder(panel, msg); }
  if (msg.type === 'new-project-cancel') { return handleNewProjectCancel(panel); }

  if (msg.type === 'run-project' && msg.path) { vscode.commands.executeCommand('redivivus.runProject', msg.path); return true; }
  if (msg.type === 'open-workspace-btn' && msg.path) { return handleOpenWorkspaceBtn(panel, msg); }
  if (msg.type === 'build-task') { return handleBuildTask(panel, msg); }

  if (msg.type === 'edit-request' && msg.filePath) {
    await handleEditRequest(msg, {
      redivivus, routing, vault: (panel as any).vault,
      blueprintContext: state.blueprintContext,
      conversation: state.conversation,
      refresh: () => panel.refresh(),
      logError: (t: string, pr: string, e: string, len?: number) => (panel as any)._logBuildError(t, pr, e, len),
      postToWebview: (m: any) => _panel.webview.postMessage(m),
    });
    return true;
  }

  if (msg.type === 'set-mode') { return handleSetMode(panel, msg); }
  if (msg.type === 'switch-mode') { return handleSwitchMode(panel); }


  if (msg.type === 'assistant-message') {
    state.conversation.push({ role: 'assistant', content: msg.text, timestamp: Date.now() });
    panel.refresh();
    return true;
  }

  if (msg.type?.startsWith('vault-hit-') && msg.choice) {
    const resolverId = msg.type.slice('vault-hit-'.length);
    const { resolveVaultHit } = require('./chatPanelBuild.js');
    resolveVaultHit(resolverId, msg.choice);
    return true;
  }

  if (msg.type?.startsWith('placement-') && msg.choice) {
    const placementId = msg.type.slice('placement-'.length);
    const { resolvePlacement } = require('../ai/chatPanelResolvers.js');
    resolvePlacement(placementId, msg.choice);
    return true;
  }

  if (msg.type === 'retrofit-project') {
    vscode.commands.executeCommand('redivivus.retrofitBlueprint');
    return true;
  }

  if (msg.type === 'scaffold-quickstart') { return handleScaffoldQuickstart(panel, msg); }
  if (msg.type === 'start-preview' || msg.type === 'popout-preview' || msg.type === 'open-in-browser' || msg.type === 've-open-request' || msg.type === 'visual-apply-all' || msg.type === 'rearrange-start' || msg.type === 'redivivus-drag-drop' || msg.type === 'rearrange-finish' || msg.type === 'rearrange-undo') {
    return handlePreviewMessages(panel, msg);
  }

  if (msg.type === 'toggle-provider') {
    const config = vscode.workspace.getConfiguration('redivivus');
    const disabled = config.get<string[]>('disabledProviders') || [];
    const index = disabled.indexOf(msg.providerId);
    const newDisabled = [...disabled];
    if (index > -1) {
      newDisabled.splice(index, 1);
    } else {
      newDisabled.push(msg.providerId);
    }
    await config.update('disabledProviders', newDisabled, true);
    
    // Refresh the API Status view in the chat panel
    const { ChatPanel } = require('../../ui/panels/chat/chatPanel.js');
    if (ChatPanel.currentPanel) {
      // Re-trigger the api status render
      vscode.commands.executeCommand('redivivus.openSettingsInChat');
    }
    vscode.window.showInformationMessage(`Redivivus: ${msg.providerId.toUpperCase()} has been ${index > -1 ? 'enabled' : 'disabled'}!`);
    return true;
  }

  return false;
}
