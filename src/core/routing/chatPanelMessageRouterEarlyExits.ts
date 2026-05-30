// [SCOPE] Chat Panel Message Router early-exit handlers — clarify, bi, fix, build, folder, mode, gates
// Extracted from chatPanelMessageRouter.ts. Returns true if message was handled, false to fall through.

import { resolvePendingClarify } from '../../ui/panels/chat/chatPanelClarifyBridge';
import * as vscode from 'vscode';
import { ChatPanel } from '../../ui/panels/chat/chatPanel';
import { handleEditRequest } from '../ai/chatPanelIntent';
import { handleInterviewMessage } from '../../ui/views/blueprintInterviewPanel';
import { panelVaultOnlyBuild } from '../build/chatPanelBuildUtils';
import { handlePreviewMessages } from './chatPanelMessageRouterPreview';

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
    const { handleFixRequest } = await import('./chatPanelMsgFix.js');
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

  if (msg.type === 'build-simple') {
    const task = _pendingTask || msg.task;
    (panel as any)._pendingTask = undefined;
    if (!task) { return true; }
    state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
    panel.refresh();
    await (panel as any)._handleBuildRequest(task, true, false);
    return true;
  }

  if (msg.type === 'create-folder') {
    const os = require('os');
    const p = require('path');
    const fs = require('fs');
    const parent = (msg.parentPath || '~/projects').replace(/^~/, os.homedir());
    const newPath = p.join(parent, (msg.name || 'my-project').trim());
    try {
      fs.mkdirSync(newPath, { recursive: true });
      if (ChatPanel.onNewProject) {
        const answers = msg.blueprint || {};
        if (msg.pendingTask) { answers['_originalTask'] = msg.pendingTask; }
        await ChatPanel.onNewProject(msg.name || p.basename(newPath), answers, newPath);
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Could not create project: ${e instanceof Error ? e.message : String(e)}`);
    }
    return true;
  }

  if (msg.type === 'new-project-cancel') {
    (panel as any)._pendingTask = undefined;
    state.planInterview = undefined;
    state.conversation = [];
    (panel as any)._initialized = false;
    panel.refresh();
    return true;
  }


  if (msg.type === 'open-workspace-btn' && msg.path) {
    const { ChatPanel } = require('../../ui/panels/chat/chatPanel.js');
    if (ChatPanel.extensionContext) {
      ChatPanel.extensionContext.globalState.update('redivivus.suppressAutoOpen', msg.path);
      ChatPanel.extensionContext.globalState.update('redivivus.suppressConversationClear', true);
    }
    if (!vscode.workspace.workspaceFolders?.some(wf => wf.uri.fsPath === msg.path)) { vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.file(msg.path) }); }
    else { (panel as any)._initialized = false; panel.refresh(); }
    return true;
  }

  if (msg.type === 'build-task') {
    const task = msg.task || _pendingTask;
    (panel as any)._pendingTask = undefined;
    if (!task) { return true; }
    const _lastBt = state.conversation[state.conversation.length - 1];
    if (!_lastBt || _lastBt.role !== 'user' || _lastBt.content !== task) {
      state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
    }
    if (msg.vaultOnly) {
      state.conversation.push({ role: 'assistant', content: '📦 Building snippet and saving to Vault...', timestamp: Date.now() });
      panel.refresh();
      await panelVaultOnlyBuild(panel, task);
      return true;
    }
    state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
    panel.refresh();
    await (panel as any)._handleBuildRequest(task, true, false);
    return true;
  }

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

  if (msg.type === 'set-mode') {
    state.buildMode = msg.mode === 'plan' || msg.mode === 'direct' ? msg.mode : undefined;
    if (msg.mode === 'plan') {
      const { startPlanInterview } = require('./chatPanelPlanInterview.js');
      startPlanInterview(state);
    } else if (msg.mode === 'direct') {
      state.planInterview = undefined;
    }
    panel.refresh();
    return true;
  }

  if (msg.type === 'switch-mode') {
    const nextMode = state.buildMode === 'plan' ? 'direct' : 'plan';
    state.buildMode = nextMode;
    if (nextMode === 'plan') {
      const { startPlanInterview } = require('./chatPanelPlanInterview.js');
      startPlanInterview(state);
    } else {
      state.planInterview = undefined;
    }
    panel.refresh();
    return true;
  }


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

  if (msg.type === 'scaffold-quickstart') {
    const label = ({ react: 'React', flask: 'Python Flask', go: 'Go API', express: 'Node Express' } as any)[msg.template] || msg.template;
    state.buildMode = 'direct';
    state.conversation.push({ role: 'user', content: `Scaffold a new ${label} project`, timestamp: Date.now() });
    state.conversation.push({ role: 'assistant', content: `🚀 Scaffolding ${label} project...`, timestamp: Date.now() });
    panel.refresh(); await (panel as any)._handleBuildRequest(`scaffold a new ${label} project`, true, false);
    return true;
  }
  if (msg.type === 'start-preview' || msg.type === 'popout-preview' || msg.type === 'open-in-browser' || msg.type === 've-open-request' || msg.type === 'visual-apply-all' || msg.type === 'rearrange-start' || msg.type === 'redivivus-drag-drop' || msg.type === 'rearrange-finish' || msg.type === 'rearrange-undo') {
    return handlePreviewMessages(panel, msg);
  }

  return false;
}
