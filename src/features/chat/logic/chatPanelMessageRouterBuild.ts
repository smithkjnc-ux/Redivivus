// [SCOPE] Build message handlers for the early-exit router — extracted from chatPanelMessageRouterEarlyExits.ts (Rule 9 split).
// Covers: build-simple, build-task, create-folder, new-project-cancel, open-workspace-btn, set-mode, switch-mode.

import * as vscode from 'vscode';
import { ChatPanel } from '../ui/chatPanel.js';
import { panelVaultOnlyBuild } from '../build/chatPanelBuildUtils.js';

export async function handleBuildSimple(panel: ChatPanel, msg: any): Promise<boolean> {
  const state = (panel as any).state;
  const _pendingTask = (panel as any)._pendingTask;
  const task = _pendingTask || msg.task;
  (panel as any)._pendingTask = undefined;
  if (!task) { return true; }
  state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
  panel.refresh();
  await (panel as any)._handleBuildRequest(task, true, false);
  return true;
}

export async function handleBuildTask(panel: ChatPanel, msg: any): Promise<boolean> {
  const state = (panel as any).state;
  const _pendingTask = (panel as any)._pendingTask;
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

export async function handleCreateFolder(panel: ChatPanel, msg: any): Promise<boolean> {
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

export function handleNewProjectCancel(panel: ChatPanel): boolean {
  const state = (panel as any).state;
  (panel as any)._pendingTask = undefined;
  state.planInterview = undefined;
  state.conversation = [];
  (panel as any)._initialized = false;
  panel.refresh();
  return true;
}

export function handleOpenWorkspaceBtn(panel: ChatPanel, msg: any): boolean {
  const { ChatPanel: CP } = require('../../ui/panels/chat/chatPanel.js');
  if (CP.extensionContext) {
    CP.extensionContext.globalState.update('redivivus.suppressAutoOpen', msg.path);
    CP.extensionContext.globalState.update('redivivus.suppressConversationClear', true);
    const _conv = (panel as any).state?.conversation;
    if (_conv?.length > 0) {
      CP.extensionContext.globalState.update('redivivus.pendingRescueConversation', _conv);
      CP.extensionContext.globalState.update('redivivus.pendingBuildComplete', true);
    }
  }
  if (!vscode.workspace.workspaceFolders?.some((wf: any) => wf.uri.fsPath === msg.path)) {
    vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.file(msg.path) });
  } else {
    (panel as any)._initialized = false;
    panel.refresh();
  }
  return true;
}

export function handleSetMode(panel: ChatPanel, msg: any): boolean {
  const state = (panel as any).state;
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

export function handleSwitchMode(panel: ChatPanel): boolean {
  const state = (panel as any).state;
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
