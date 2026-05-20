// [SCOPE] Chat Panel Message Router early-exit handlers — clarify, bi, fix, build, folder, mode, gates
// Extracted from chatPanelMessageRouter.ts. Returns true if message was handled, false to fall through.

import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel.js';
import { handleEditRequest } from './chatPanelIntent.js';
import { handleInterviewMessage } from '../views/blueprintInterviewPanel.js';
import { panelVaultOnlyBuild } from './chatPanelBuildUtils.js';

export async function handleEarlyExits(panel: ChatPanel, msg: any): Promise<boolean> {
  const state = (panel as any).state;
  const _panel = (panel as any)._panel;
  const _activeBuildCtx = (panel as any)._activeBuildCtx;
  const _pendingTask = (panel as any)._pendingTask;
  const chassis = (panel as any).chassis;
  const routing = (panel as any).routing;

  if (msg.type === 'clarify-submit') {
    _activeBuildCtx?.onClarifySubmit?.(msg.answers || {});
    return true;
  }

  if (msg.type?.startsWith('bi-')) {
    if (msg.type === 'bi-start') { _panel.reveal(vscode.ViewColumn.One, false); }
    await handleInterviewMessage(msg, _panel.webview, chassis, routing);
    return true;
  }

  if (msg.type === 'fix-request') {
    const _lastMsg = state.conversation[state.conversation.length - 1];
    if (!_lastMsg || _lastMsg.role !== 'user' || _lastMsg.content !== msg.text) {
      state.conversation.push({ role: 'user', content: msg.text, timestamp: Date.now() });
    }
    panel.refresh();
    await (panel as any)._handleBuildRequest(msg.text, true, true);
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
      chassis, routing, vault: (panel as any).vault,
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

  if (msg.type === 'toggle-agent-mode') {
    state.agentMode = !state.agentMode;
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
    const { resolvePlacement } = require('./chatPanelIntent.js');
    resolvePlacement(placementId, msg.choice);
    return true;
  }

  if (msg.type === 'retrofit-project') {
    vscode.commands.executeCommand('chassis.retrofitBlueprint');
    return true;
  }

  // [CHASSIS] Quick Start Template — scaffold from launcher pill
  if (msg.type === 'scaffold-quickstart') {
    const tplNames: Record<string, string> = { react: 'React', flask: 'Python Flask', go: 'Go API', express: 'Node Express' };
    const label = tplNames[msg.template] || msg.template;
    state.buildMode = 'direct';
    state.conversation.push({ role: 'user', content: `Scaffold a new ${label} project`, timestamp: Date.now() });
    state.conversation.push({ role: 'assistant', content: `🚀 Scaffolding ${label} project...`, timestamp: Date.now() });
    panel.refresh();
    await (panel as any)._handleBuildRequest(`scaffold a new ${label} project`, true, false);
    return true;
  }

  return false;
}
