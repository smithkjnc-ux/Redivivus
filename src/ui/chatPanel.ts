// [SCOPE] CHASSIS Chat Panel — standalone editor-area WebviewPanel (singleton), Gemini integration

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vaultService.js';
import { buildChatHtml, ChatMessage } from './chatPanelHtml.js';
import { runSingleFileBuild, runChunkedBuild, isChunkedBuildRequest, BuildContext } from './chatPanelBuild.js';
import { handleChatMessage } from './chatPanelMessages.js';
import { buildHeaderInfo } from './chatPanelHeader.js';

interface ChatPanelState {
  conversation: ChatMessage[];
  blueprintContext: string;
}

export class ChatPanel {
  // [WARN] Singleton: only one chat panel exists at a time. Use show() — never call constructor directly.
  private static _instance: ChatPanel | undefined;
  public static get currentPanel(): ChatPanel | undefined { return ChatPanel._instance; }
  // [WARN] Callback registered by session.ts to handle start-session messages without circular imports.
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
  };
  private usageTracker?: UsageTracker;
  // [WARN] Active build context — held so clarify-submit can resolve the pending promise
  private _activeBuildCtx: BuildContext | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    private chassis: ChassisService,
    private routing: RoutingService,
    usageTracker?: UsageTracker,
    private vault?: VaultService,
  ) {
    this.usageTracker = usageTracker;
    this._panel = panel;
    this.loadBlueprintContext();
    this._panel.webview.options = { enableScripts: true };
    this._panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg), null, this._disposables);
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this.refresh();
  }

  public static show(chassis: ChassisService, routing: RoutingService, usageTracker?: UsageTracker, vault?: VaultService): void {
    if (ChatPanel._instance) {
      ChatPanel._instance._panel.reveal(vscode.ViewColumn.Beside, false);
      // Update vault reference if passed on re-show
      if (vault) { ChatPanel._instance.vault = vault; }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'chassisChat', 'CHASSIS Chat',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    ChatPanel._instance = new ChatPanel(panel, chassis, routing, usageTracker, vault);
  }

  public static setUsageTracker(usageTracker: UsageTracker): void {
    if (ChatPanel._instance) {
      ChatPanel._instance.usageTracker = usageTracker;
    }
  }

  private _dispose(): void {
    ChatPanel._instance = undefined;
    this._panel.dispose();
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }

  private loadBlueprintContext(): void {
    if (!this.chassis.isInitialized()) { this.state.blueprintContext = ''; return; }
    const config = this.chassis.loadConfig();
    if (!config?.blueprint) { this.state.blueprintContext = ''; return; }
    const bp = config.blueprint;
    this.state.blueprintContext = [
      `Project: ${config.projectName || 'Untitled'}`,
      `Who: ${bp.who || '?'}`, `What: ${bp.what || '?'}`,
      `Where: ${bp.where || '?'}`, `When: ${bp.when || '?'}`, `Why: ${bp.why || '?'}`,
    ].join('\n');
  }

  private _logBuildError(task: string, prompt: string, error: string, promptTokens = 0): void {
    try {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const chassisDir = root ? path.join(root, '.chassis') : null;
      if (!chassisDir) { return; }
      if (!fs.existsSync(chassisDir)) { fs.mkdirSync(chassisDir, { recursive: true }); }
      const div = '─'.repeat(60);
      const entry = [div, `[${new Date().toISOString()}] BUILD FAILED`,
        `Message       : ${task}`, `Error         : ${error}`,
        `Prompt length : ~${promptTokens} tokens`, `Prompt (first 800 chars):`,
        prompt.slice(0, 800), div, ''].join('\n');
      fs.appendFileSync(path.join(chassisDir, 'build_errors.log'), entry, 'utf8');
    } catch { /* never crash the build flow */ }
  }

  /** Returns true if the message is a direct build/create request */
  private _isBuildRequest(text: string): boolean {
    const t = text.toLowerCase();
    const buildVerbs = /^\s*(build|create|make|write|add|generate|implement|scaffold|code|develop|produce)/;
    return buildVerbs.test(t);
  }

  /** Fix 1/2/3: Delegates to chatPanelBuild — single-file or chunked depending on request complexity */
  private async _handleBuildRequest(task: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      this.state.conversation.push({ role: 'assistant', content: '⚠️ No workspace open — please open a project folder first.', timestamp: Date.now() });
      this.refresh(); return;
    }
    const ctx: BuildContext = {
      task,
      root,
      blueprintContext: this.state.blueprintContext,
      vault: this.vault,
      routing: this.routing,
      conversation: this.state.conversation,
      refresh: () => this.refresh(),
      logError: (t, p, e, len) => this._logBuildError(t, p, e, len),
      postToWebview: (msg) => this._panel.webview.postMessage(msg),
      onClarifySubmit: undefined, // set dynamically by runChunkedBuild via Promise constructor
    };
    this._activeBuildCtx = ctx;
    if (isChunkedBuildRequest(task)) {
      await runChunkedBuild(ctx);
    } else {
      await runSingleFileBuild(ctx);
    }
    this._activeBuildCtx = undefined;
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg.type === 'clarify-submit') { this._activeBuildCtx?.onClarifySubmit?.(msg.answers || {}); return; }
    await handleChatMessage(msg, {
      chassis: this.chassis,
      routing: this.routing,
      usageTracker: this.usageTracker,
      conversation: this.state.conversation,
      panel: this._panel,
      isBuildRequest: (t) => this._isBuildRequest(t),
      handleBuildRequest: (t) => this._handleBuildRequest(t),
      buildFromVaultPrefill: () => this._buildFromVaultPrefill(),
      refresh: () => this.refresh(),
      onStartSession: ChatPanel.onStartSession,
      onSwitchAI: ChatPanel.onSwitchAI,
      onNewProject: ChatPanel.onNewProject,
    });
  }

  public showGettingStarted(): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'getting-started' });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public showStartSession(): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'start-session' });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public showNewProject(suggestedParent?: string): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'new-project', suggestedParent: suggestedParent || '' });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public showPanel(panelType: string, title: string, content: string): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType, title, content });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public refresh(): void {
    this._panel.webview.html = buildChatHtml(this.state.conversation, buildHeaderInfo(this.chassis, this.routing, this.usageTracker));
  }

  private _buildFromVaultPrefill(): { task?: string; targetFile?: string } {
    const msgs = this.state.conversation.filter(m => m.role === 'user');
    const config = this.chassis.isInitialized() ? this.chassis.loadConfig() : null;
    const task = (msgs.length > 0 ? msgs[msgs.length - 1].content.trim() : '') || config?.blueprint?.what || undefined;
    const where = (config?.blueprint?.where || '').toLowerCase();
    const ext = where.includes('python') ? '.py' : where.includes('react') || where.includes('tsx') ? '.tsx' : where.includes('javascript') || where.includes('node') ? '.js' : '.ts';
    const targetFile = config?.projectName ? `src/${config.projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}${ext}` : undefined;
    return { task, targetFile };
  }
}
