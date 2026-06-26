// [SCOPE] Redivivus Chat Panel — singleton WebviewPanel shell. Intent + build logic in chatPanelIntent.ts.
// Split complete: classifyIntent/isBuildRequest/handleBuildRequest → chatPanelIntent.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { RedivivusService } from '../../../services/redivivusService.js';
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import type { UsageTracker } from '../../../services/usageTracker.js';
import type { VaultService } from '../../vault/infrastructure/vaultService.js';
import type { ChatMessage } from './chatPanelHtml.js';
import { buildChatHtml } from './chatPanelHtml.js';
import { handleInterviewMessage } from '../../../ui/views/blueprintInterviewPanel.js';
import type { BuildContext } from '../build/chatPanelBuild.js';
import { classifyIntent, isBuildRequest, handleBuildRequest, handleEditRequest, BuildRequestDeps } from '../../../shared/ai/domain/chatPanelIntent.js';
import { handleChatMessage } from '../routing/chatPanelMessages.js';
import { buildHeaderInfo } from './chatPanelHeader.js';
import { SetupProgressService, SetupProgress } from '../../project/application/setupProgressService.js';
import { BuildHistoryService } from '../build/services/buildHistoryService.js';
import { handlePanelMessage } from '../routing/chatPanelMessageRouter.js';
import { loadLastSessionContext } from './chatPanelSessionResume.js';
import { restoreConversation } from './chatPanelPublicAPI.js';
import { registerChatPanelListeners } from './chatPanelListeners.js';

interface ChatPanelState {
  conversation: ChatMessage[];
  blueprintContext: string;
  lastModel?: string; // Track exact model from last AI response
  buildMode?: 'plan' | 'direct';
  assistMode?: boolean; // When true: no Redivivus tags, roadmap, or auto-commit injected
  planInterview?: import('./chatPanelPlanInterview').PlanInterviewState;
}

export class ChatPanel {
  // [WARN] Singleton: only one chat panel exists at a time. Use show() — never call constructor directly.
  private static _instance: ChatPanel | undefined;
  public static get currentPanel(): ChatPanel | undefined { return ChatPanel._instance; }
  public static _isDeserializing = false;
  // [WARN] Set true when a new project init is in flight — prevents auto-open timer from racing the poll
  public static suppressAutoOpen = false;
  // [WARN] Callback registered by session.ts to handle start-session messages without circular imports.
  public static extensionContext: vscode.ExtensionContext | undefined;
  // [DEAD] onBuildFinished removed — use buildEvents.on('build:finished', fn) from buildEvents.ts instead.
  // Static callbacks are a global-write anti-pattern: one file overwrites another's listener silently.
  public static onStartSession: ((goal: string, ai: string) => Promise<void>) | undefined;
  // [WARN] Callback registered by misc.ts to handle switch-ai messages without circular imports.
  public static onSwitchAI: ((ai: string) => Promise<void>) | undefined;
  // [WARN] Callback registered by init.ts to handle new-project form submission without circular imports.
  public static onNewProject: ((name: string, answers: Record<string, string>, folderPath?: string) => Promise<void>) | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private state: ChatPanelState = {
    conversation: [],
    blueprintContext: '',
    lastModel: undefined,
  };
  private usageTracker?: UsageTracker;
  // [WARN] Active build context — held so clarify-submit can resolve the pending promise
  private _activeBuildCtx: BuildContext | undefined;
  // [Redivivus] Stores the user's task when they're shown the "simple vs full project" choice
  private _pendingTask: string | undefined;
  // [WARN] Once true, refresh() uses postMessage instead of replacing webview.html
  // Replacing html after first load causes VS Code to open a duplicate tab
  private _initialized = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private redivivus: RedivivusService,
    private routing: RoutingService,
    usageTracker?: UsageTracker,
    private vault?: VaultService,
  ) {
    this.usageTracker = usageTracker;
    this._panel = panel;
    this.loadBlueprintContext();
    // restoreConversation handles, in priority order: (1) a build's rescued conversation stashed across
    // an openFolder reload (restored synchronously so the panel opens already populated — no launcher
    // flash), (2) skipConversationRestore for a fresh project, (3) the saved per-project history.
    restoreConversation(this);
    if (this.state.conversation.length === 0) { loadLastSessionContext(this.redivivus, this.state.conversation); }
    this._panel.webview.options = { enableScripts: true };
    this._panel.webview.onDidReceiveMessage((msg) => { const { handlePanelMessage } = require('../routing/chatPanelMessageRouter.js'); handlePanelMessage(this, msg); }, null, this._disposables);
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    registerChatPanelListeners(this, this._disposables);
    // [DEAD] Build history restoration via BuildHistoryService.getLastResultCards() — disabled, causes chat tab duplication. Re-enable post-v1.0.
    this.refresh();
  }

  public static show(redivivus: RedivivusService, routing: RoutingService, usageTracker?: UsageTracker, vault?: VaultService): void {
    const { doShowChatPanel } = require('./chatPanelShow.js');
    doShowChatPanel(redivivus, routing, usageTracker, vault);
  }

  public static setUsageTracker(usageTracker: UsageTracker): void {
    if (ChatPanel._instance) {
      ChatPanel._instance.usageTracker = usageTracker;
    }
  }

  // [Redivivus] Called by redivivus.showMap to close the chat and give Map the full editor width
  public static close(): void {
    ChatPanel._instance?._panel.dispose();
  }

  private _dispose(): void {
    ChatPanel._instance = undefined;
    this._initialized = false;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }

  private loadBlueprintContext(): void {
    if (!this.redivivus.isInitialized()) { this.state.blueprintContext = ''; return; }
    const config = this.redivivus.loadConfig();
    if (!config?.blueprint) { this.state.blueprintContext = ''; return; }
    const bp = config.blueprint;
    this.state.blueprintContext = [
      `Project: ${config.projectName || 'Untitled'}`,
      `Who: ${bp.who || '?'}`, `What: ${bp.what || '?'}`,
      `Where: ${bp.where || '?'}`, `When: ${bp.when || '?'}`, `Why: ${bp.why || '?'}`,
    ].join('\n');
  }

  private _logBuildError(task: string, prompt: string, error: string, promptTokens = 0): void {
    const { panelLogBuildError } = require('../build/chatPanelBuildUtils.js');
    return panelLogBuildError(this, task, prompt, error, promptTokens);
  }

  private _buildRequestDeps(): import('../../../shared/ai/domain/chatPanelIntent').BuildRequestDeps {
    const { panelBuildRequestDeps } = require('../build/chatPanelBuildUtils.js');
    return panelBuildRequestDeps(this);
  }

  private async _classifyIntent(text: string) {
    const { panelClassifyIntent } = require('../build/chatPanelBuildUtils.js');
    return panelClassifyIntent(this, text);
  }

  private async _isBuildRequest(text: string) {
    const { panelIsBuildRequest } = require('../build/chatPanelBuildUtils.js');
    return panelIsBuildRequest(this, text);
  }

  private async _handleBuildRequest(task: string, skipComplex = false, isFixRequest = false) {
    const { panelHandleBuildRequest } = require('../build/chatPanelBuildUtils.js');
    return panelHandleBuildRequest(this, task, skipComplex, isFixRequest);
  }

  private async _handleVaultOnlyBuild(task: string): Promise<void> {
    const { panelVaultOnlyBuild } = require('../build/chatPanelBuildUtils.js');
    return panelVaultOnlyBuild(this, task);
  }

  public async handleMessage(msg: any): Promise<void> {
    const { handlePanelMessage } = require('../routing/chatPanelMessageRouter.js');
    return handlePanelMessage(this, msg);
  }

  public getConversation() { return this.state.conversation; }
  public getRouting() { return this.routing; }
  public getRedivivusRoot(): string | undefined { return this.redivivus.getWorkspaceRoot(); }
  public getPendingTask(): string { return this._pendingTask || ''; }

  public showGettingStarted(): void { const { panelShowGettingStarted } = require('./chatPanelPublicAPI.js'); return panelShowGettingStarted(this); }
  public showStartSession(): void { const { panelShowStartSession } = require('./chatPanelPublicAPI.js'); return panelShowStartSession(this); }

  public async resumeBuildTask(task: string, projectRoot?: string): Promise<void> {
    const { panelResumeBuildTask } = require('./chatPanelPublicAPI.js');
    return panelResumeBuildTask(this, task, projectRoot);
  }

  public showNewProject(suggestedParent?: string, prefillTask?: string, compact?: boolean): void {
    const { panelShowNewProject } = require('./chatPanelPublicAPI.js');
    return panelShowNewProject(this, suggestedParent, prefillTask, compact);
  }

  public showPanel(panelType: string, title: string, content: string): void { const { panelShowPanel } = require('./chatPanelPublicAPI.js'); return panelShowPanel(this, panelType, title, content); }

  public setLastModel(model: string): void {
    this.state.lastModel = model;
    this.refresh();
  }

  public async refresh(): Promise<void> {
    const { panelRefresh } = require('./chatPanelPublicAPI.js');
    return panelRefresh(this);
  }

  private _buildFromVaultPrefill(): { task?: string; targetFile?: string } {
    const { panelBuildFromVaultPrefill } = require('./chatPanelPublicAPI.js');
    return panelBuildFromVaultPrefill(this);
  }
}
