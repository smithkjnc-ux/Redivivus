// [SCOPE] Chat Panel Message Router — routes webview messages to handlers
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import { ChatPanel } from './chatPanel.js';
import { handleEditRequest } from './chatPanelIntent.js';
import { handleChatMessage } from './chatPanelMessages.js';
import { handleInterviewMessage } from '../views/blueprintInterviewPanel.js';
import { panelVaultOnlyBuild } from './chatPanelBuildUtils.js';

export async function handlePanelMessage(panel: ChatPanel, msg: any): Promise<void> {
  const state = (panel as any).state;
  const _panel = (panel as any)._panel;
  const _activeBuildCtx = (panel as any)._activeBuildCtx;
  const _pendingTask = (panel as any)._pendingTask;
  const chassis = (panel as any).chassis;
  const routing = (panel as any).routing;

  require('fs').appendFileSync(require('os').homedir() + '/chassis_debug.log', `[handleMessage] type=${msg.type} name=${msg.name || ''}\n`);

  if (msg.type === 'clarify-submit') {
    _activeBuildCtx?.onClarifySubmit?.(msg.answers || {});
    return;
  }

  if (msg.type?.startsWith('bi-')) {
    if (msg.type === 'bi-start') {
      _panel.reveal(vscode.ViewColumn.One, false);
    }
    await handleInterviewMessage(msg, _panel.webview, chassis, routing);
    return;
  }

  if (msg.type === 'fix-request') {
    const ANALYSIS_PROMPT = /^You are (a senior software architect|a code analyst|explaining code|a code reviewer|a test engineer)\b/;
    if (ANALYSIS_PROMPT.test(msg.text?.trim() || '')) {
      await handlePanelMessage(panel, { type: 'map-context', nodeId: '', label: '', lines: 0, health: 'neutral', todos: 0, _explainPrompt: msg.text, _displayLabel: 'Analysis' });
      return;
    }
    const _lastMsg = state.conversation[state.conversation.length - 1];
    if (!_lastMsg || _lastMsg.role !== 'user' || _lastMsg.content !== msg.text) {
      state.conversation.push({ role: 'user', content: msg.text, timestamp: Date.now() });
    }
    panel.refresh();
    await (panel as any)._handleBuildRequest(msg.text, true, true);
    return;
  }

  if (msg.type === 'build-simple') {
    const task = _pendingTask || msg.task;
    (panel as any)._pendingTask = undefined;
    if (!task) { return; }
    state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
    panel.refresh();
    await (panel as any)._handleBuildRequest(task, true, false);
    return;
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
    return;
  }

  if (msg.type === 'new-project-cancel') {
    (panel as any)._pendingTask = undefined;
    state.planInterview = undefined;
    // Return to launcher: clear conversation and force full HTML rebuild so the welcome screen shows
    state.conversation = [];
    (panel as any)._initialized = false;
    panel.refresh();
    return;
  }

  if (msg.type === 'build-task') {
    const task = msg.task || _pendingTask;
    (panel as any)._pendingTask = undefined;
    if (!task) { return; }
    const _lastBt = state.conversation[state.conversation.length - 1];
    if (!_lastBt || _lastBt.role !== 'user' || _lastBt.content !== task) {
      state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
    }
    if (msg.vaultOnly) {
      state.conversation.push({ role: 'assistant', content: '📦 Building snippet and saving to Vault...', timestamp: Date.now() });
      panel.refresh();
      await panelVaultOnlyBuild(panel, task);
      return;
    }
    state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
    panel.refresh();
    await (panel as any)._handleBuildRequest(task, true, false);
    return;
  }

  if (msg.type === 'edit-request' && msg.filePath) {
    await handleEditRequest(msg, {
      chassis: (panel as any).chassis,
      routing: (panel as any).routing,
      vault: (panel as any).vault,
      blueprintContext: state.blueprintContext,
      conversation: state.conversation,
      refresh: () => panel.refresh(),
      logError: (t: string, p: string, e: string, len?: number) => (panel as any)._logBuildError(t, p, e, len),
      postToWebview: (m: any) => _panel.webview.postMessage(m),
    });
    return;
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
    return;
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
    return;
  }

  if (msg.type === 'assistant-message') {
    state.conversation.push({ role: 'assistant', content: msg.text, timestamp: Date.now() });
    panel.refresh();
    return;
  }

  // [FIX] vault-hit gate: webview posts { type:'vault-hit-{resolverId}', choice:'build-fresh'|'cancel'|'use-vault' }
  // Old handlers (use-vault/build-anyway + hitId field) never fired — type and field both mismatched.
  if (msg.type?.startsWith('vault-hit-') && msg.choice) {
    const resolverId = msg.type.slice('vault-hit-'.length);
    const { resolveVaultHit } = require('./chatPanelBuild.js');
    resolveVaultHit(resolverId, msg.choice);
    return;
  }

  // [FIX] placement gate: webview posts { type:'placement-{placementId}', choice:'here'|'new-project'|'cancel' }
  // Old handlers (placement-add-here etc. + placementId field) never fired — same mismatch pattern.
  if (msg.type?.startsWith('placement-') && msg.choice) {
    const placementId = msg.type.slice('placement-'.length);
    const { resolvePlacement } = require('./chatPanelIntent.js');
    resolvePlacement(placementId, msg.choice);
    return;
  }

  // [FIX] start-new-project sets deps.buildMode locally inside handleChatMessage but never writes back to state.
  // On the NEXT message state.buildMode is still undefined → orchestrator runs in "just build" mode.
  // Sync state here before constructing deps so the correct mode is visible on all future messages.
  if (msg.type === 'start-new-project') {
    state.buildMode = msg.mode === 'plan' ? 'plan' : (msg.mode === 'direct' ? 'direct' : undefined);
    if (msg.mode !== 'plan') { state.planInterview = undefined; }
  }

  await handleChatMessage(msg, {
    chassis: (panel as any).chassis,
    routing: (panel as any).routing,
    usageTracker: (panel as any).usageTracker,
    conversation: state.conversation,
    panel: _panel,
    isBuildRequest: async (t: string) => (panel as any)._isBuildRequest(t),
    classifyIntent: async (t: string) => (panel as any)._classifyIntent(t),
    handleBuildRequest: (t: string, skipComplex?: boolean, isFixRequest?: boolean) => (panel as any)._handleBuildRequest(t, skipComplex, isFixRequest),
    buildFromVaultPrefill: () => (panel as any)._buildFromVaultPrefill(),
    refresh: () => panel.refresh(),
    onStartSession: ChatPanel.onStartSession,
    onSwitchAI: ChatPanel.onSwitchAI,
    onNewProject: ChatPanel.onNewProject,
    setLastModel: (model: string) => { (panel as any).state.lastModel = model; },
    setBlueprintContext: (ctx: string) => { state.blueprintContext = ctx; },
    buildMode: state.buildMode,
    planInterview: state.planInterview,
  });
}
