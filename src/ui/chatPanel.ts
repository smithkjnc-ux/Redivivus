// [SCOPE] CHASSIS Chat Panel — singleton WebviewPanel shell. Intent + build logic in chatPanelIntent.ts.
// Split complete: classifyIntent/isBuildRequest/handleBuildRequest → chatPanelIntent.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vaultService.js';
import { buildChatHtml, ChatMessage } from './chatPanelHtml.js';
import { handleInterviewMessage } from './blueprintInterviewPanel.js';
import { BuildContext } from './chatPanelBuild.js';
import { classifyIntent, isBuildRequest, handleBuildRequest, handleEditRequest, BuildRequestDeps } from './chatPanelIntent.js';
import { handleChatMessage } from './chatPanelMessages.js';
import { buildHeaderInfo } from './chatPanelHeader.js';
import { SetupProgressService, SetupProgress } from '../services/setupProgressService.js';
import { BuildHistoryService } from '../services/buildHistoryService.js';

interface ChatPanelState {
  conversation: ChatMessage[];
  blueprintContext: string;
  lastModel?: string; // Track exact model from last AI response
}

export class ChatPanel {
  // [WARN] Singleton: only one chat panel exists at a time. Use show() — never call constructor directly.
  private static _instance: ChatPanel | undefined;
  public static get currentPanel(): ChatPanel | undefined { return ChatPanel._instance; }
  // [WARN] Set true when a new project init is in flight — prevents auto-open timer from racing the poll
  public static suppressAutoOpen = false;
  // [WARN] Callback registered by session.ts to handle start-session messages without circular imports.
  public static extensionContext: vscode.ExtensionContext | undefined;
  public static onBuildFinished: ((task: string, files: string[]) => Promise<void>) | undefined;
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
  // [CHASSIS] Stores the user's task when they're shown the "simple vs full project" choice
  private _pendingTask: string | undefined;
  // [WARN] Once true, refresh() uses postMessage instead of replacing webview.html
  // Replacing html after first load causes VS Code to open a duplicate tab
  private _initialized = false;

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
    // [CHASSIS] Hot-reload roster when API key settings change
    this._disposables.push(vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('chassis.geminiApiKey') ||
          e.affectsConfiguration('chassis.claudeApiKey') ||
          e.affectsConfiguration('chassis.openaiApiKey') ||
          e.affectsConfiguration('chassis.groqApiKey') ||
          e.affectsConfiguration('chassis.xaiApiKey') ||
          e.affectsConfiguration('chassis.kimiApiKey')) {
        this.refresh();
      }
    }));
    // [CHASSIS] Build history restoration disabled for clean testing — re-enable after v1.0
    // Restore last 3 result cards from build history so undo buttons survive restarts
    // try {
    //   const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    //   if (root) {
    //     const hist = new BuildHistoryService(root);
    //     const cards = hist.getLastResultCards(3).reverse();
    //     for (const card of cards) {
    //       this.state.conversation.push({ role: 'assistant', content: card.resultCardToken, timestamp: Date.now() });
    //     }
    //   }
    // } catch { /* never block startup */ }
    this.refresh();
  }

  public static show(chassis: ChassisService, routing: RoutingService, usageTracker?: UsageTracker, vault?: VaultService): void {
    if (ChatPanel._instance) {
      // Reveal in its existing column — never open Beside (causes duplicate panel)
      ChatPanel._instance._panel.reveal(ChatPanel._instance._panel.viewColumn ?? vscode.ViewColumn.One, false);
      // Update vault reference if passed on re-show
      if (vault) { ChatPanel._instance.vault = vault; }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'chassisChat', 'CHASSIS Chat',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    );
    // [WARN] Always open in Column.One — never Beside. Beside caused duplicate side-by-side panels.
    const instance = new ChatPanel(panel, chassis, routing, usageTracker, vault);
    // [STARTUP BEHAVIOR] Check setting and auto-open last project if configured
    const ctx = ChatPanel.extensionContext;
    const startupBehavior = vscode.workspace.getConfiguration('chassis').get<string>('startupBehavior') || 'launcher';
    if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'lastProject') {
      const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
      const valid = recent.filter((p: any) => fs.existsSync(p.path));
      if (valid.length > 0) {
        // Auto-open the most recent project
        const mostRecent = valid.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        const folderPath = mostRecent.path;
        const folderName = path.basename(folderPath);
        const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
        if (!fs.existsSync(wsFile)) {
          try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
        }
        // Update the recent projects order
        const existing = recent.findIndex((p: any) => p.path === folderPath);
        if (existing >= 0) {
          const item = recent.splice(existing, 1)[0];
          item.timestamp = Date.now();
          recent.unshift(item);
          ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
        }
        // Open the workspace
        vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
      }
    }
    // Legacy: Restore last active project if workspace is untitled and a previous project exists
    // [NOTE] This runs after startup behavior check, so it only applies if startupBehavior is 'launcher'
    if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'launcher') {
      const lastRoot = ctx.globalState.get<string>('chassis.lastActiveProject');
      const fsCheck = require('fs');
      const pathCheck = require('path');
      // [FIX] Clear stale reference if folder no longer exists
      if (lastRoot && !fsCheck.existsSync(lastRoot)) {
        ctx.globalState.update('chassis.lastActiveProject', undefined);
      } else if (lastRoot && fsCheck.existsSync(pathCheck.join(lastRoot, '.chassis'))) {
        instance.chassis = new (instance.chassis.constructor as any)(lastRoot);
        instance.loadBlueprintContext();
      }
    }
    ChatPanel._instance = instance;
  }

  public static setUsageTracker(usageTracker: UsageTracker): void {
    if (ChatPanel._instance) {
      ChatPanel._instance.usageTracker = usageTracker;
    }
  }

  // [CHASSIS] Called by chassis.showMap to close the chat and give Map the full editor width
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

  /** Classifies user intent into one of three buckets: 'build' | 'command' | 'question' */
  private _buildRequestDeps(): BuildRequestDeps {
    return {
      chassis: this.chassis,
      routing: this.routing,
      vault: this.vault,
      conversation: this.state.conversation,
      blueprintContext: this.state.blueprintContext,
      refresh: () => this.refresh(),
      logError: (t, p, e, len) => this._logBuildError(t, p, e, len),
      postToWebview: (msg) => this._panel.webview.postMessage(msg),
      pendingTask: this._pendingTask,
      setPendingTask: (t) => { this._pendingTask = t; },
      setActiveBuildCtx: (ctx) => { this._activeBuildCtx = ctx; },
    };
  }

  private async _classifyIntent(text: string) { 
    const workspaceRoot = this.chassis.getWorkspaceRoot();
    const projectName = workspaceRoot ? require('path').basename(workspaceRoot) : 'No Project';
    const context = {
      projectName,
      workspacePath: workspaceRoot || 'None',
      blueprintStatus: this.chassis.isInitialized() ? 'Initialized' : 'Not Initialized'
    };
    return classifyIntent(text, this.routing, context); 
  }
  private async _isBuildRequest(text: string) { return isBuildRequest(text, this.routing); }
  private async _handleBuildRequest(task: string, skipComplex = false, isFixRequest = false) { return handleBuildRequest(task, this._buildRequestDeps(), skipComplex, isFixRequest); }

  /** Vault-only build: generates code to a temp file, captures to vault, no project folder created */
  private async _handleVaultOnlyBuild(task: string): Promise<void> {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const { routing } = this._buildRequestDeps();
    const { autoCaptureFile } = await import('../services/vaultAutoCapture.js');

    const slug = task.replace(/^(build|create|make|write|generate)\s+(a\s+)?/i, '').replace(/[^a-zA-Z0-9\s]/g,'').trim().split(/\s+/).slice(0,5).join('_').toLowerCase() || 'snippet';
    const ext = /typescript|ts\b/i.test(task) ? '.ts' : /python|py\b/i.test(task) ? '.py' : /java\b/i.test(task) ? '.java' : '.ts';
    const tmpFile = path.join(os.tmpdir(), `chassis_vault_${slug}${ext}`);

    const buildPrompt = `You are CHASSIS, a code generation assistant. Generate complete, working, production-ready code.\n\nTASK: "${task}"\n\nRULES:\n- Write code that works immediately without configuration or placeholder values.\n- Always handle edge cases: null/undefined inputs, empty strings, empty arrays, zero values — guard at the top of every function before any logic runs.\n- Add a [SCOPE] comment at the top describing what this module does.\n- On the FIRST line, add a // NARRATOR: comment describing in plain English what this file does.\n- Return ONLY the code — no markdown fences, no explanation, no preamble.`;

    try {
      const res = await (routing as any).routeByComplexity(task, buildPrompt);
      if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
      const code = res.text.replace(/^```[a-zA-Z]*\n?/m,'').replace(/\n?```$/m,'').trim();
      fs.writeFileSync(tmpFile, code, 'utf8');

      // Auto-capture to vault
      const capture = this.vault ? autoCaptureFile(tmpFile, 'vault-snippets', this.vault) : { newItems: 0 };

      const lastMsg = this.state.conversation[this.state.conversation.length - 1];
      if (lastMsg?.role === 'assistant') {
        lastMsg.content = `📦 Snippet built and saved to Vault!\n\n**Captured:** ${capture.newItems} new item${capture.newItems !== 1 ? 's' : ''}\n\n\`\`\`\n${code.slice(0, 400)}${code.length > 400 ? '\n...' : ''}\n\`\`\`\n\n__BUILD_RESULT__${slug}${ext}|||${tmpFile}|||END__\n__VAULT_SAVED__END__`;
      }
      this.refresh();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const lastMsg = this.state.conversation[this.state.conversation.length - 1];
      if (lastMsg?.role === 'assistant') { lastMsg.content = `❌ Vault build failed: ${errMsg}`; }
      this.refresh();
    }
  }

  public async handleMessage(msg: any): Promise<void> {
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[handleMessage] type=${msg.type} name=${msg.name||''}\n`);
    if (msg.type === 'clarify-submit') { this._activeBuildCtx?.onClarifySubmit?.(msg.answers || {}); return; }
    // Blueprint interview messages — reveal in main editor column for full width
    if (msg.type?.startsWith('bi-')) {
      if (msg.type === 'bi-start') {
        this._panel.reveal(vscode.ViewColumn.One, false);
      }
      await handleInterviewMessage(msg, this._panel.webview, this.chassis, this.routing);
      return;
    }
    // [CHASSIS] fix-request: always goes directly to build pipeline — skipComplex prevents scope prompts triggering the "full project" dialog
    // [WARN] Guard: analysis-type prompts (architect review, explain, trace, test, improve) must NEVER enter the
    //        build pipeline. They must go directly to AI. Pattern: starts with "You are a senior software architect"
    //        or "You are a code analyst" or "You are explaining code" or "You are a code reviewer" or "You are a test engineer".
    //        Root cause of vault modal bug: architectReview was routed here via chassis.postToChat.
    //        Primary fix is in mapPanel.ts (now uses chassis.mapContextChat). This is defence-in-depth.
    if (msg.type === 'fix-request') {
      const ANALYSIS_PROMPT = /^You are (a senior software architect|a code analyst|explaining code|a code reviewer|a test engineer)\b/;
      if (ANALYSIS_PROMPT.test(msg.text?.trim() || '')) {
        // Route directly to AI — no vault, no placement, no cost modal
        await this.handleMessage({ type: 'map-context', nodeId: '', label: '', lines: 0, health: 'neutral', todos: 0, _explainPrompt: msg.text, _displayLabel: 'Analysis' });
        return;
      }
      const _lastMsg = this.state.conversation[this.state.conversation.length - 1];
      if (!_lastMsg || _lastMsg.role !== 'user' || _lastMsg.content !== msg.text) {
        this.state.conversation.push({ role: 'user', content: msg.text, timestamp: Date.now() });
      }
      this.refresh();
      await this._handleBuildRequest(msg.text, true, true); // skipComplex=true, isFixRequest=true
      return;
    }
    // [CHASSIS] build-simple: user chose "Just build it" after the complex project dialog
    if (msg.type === 'build-simple') {
      const task = this._pendingTask || msg.task;
      this._pendingTask = undefined;
      if (!task) { return; }
      this.state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
      this.refresh();
      await this._handleBuildRequest(task, true, false); // skipComplex=true to avoid re-triggering the dialog, isFixRequest=false
      return;
    }
    // [CHASSIS] create-folder: user confirmed folder name/path in the centered create-folder modal
    // [WARN] NEVER call updateWorkspaceFolders or vscode.openFolder here — any workspace switch
    // reloads the extension host and creates a duplicate panel. Init in-place and resume build directly.
    if (msg.type === 'create-folder') {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const parent = (msg.parentPath || '~/projects').replace(/^~/, os.homedir());
      const newPath = path.join(parent, (msg.name || 'my-project').trim());
      try {
        fs.mkdirSync(newPath, { recursive: true });
        // Route through onNewProject callback so init + build resume happen in one place
        if (ChatPanel.onNewProject) {
          const answers = msg.blueprint || {};
          if (msg.pendingTask) { answers['_originalTask'] = msg.pendingTask; }
          await ChatPanel.onNewProject(msg.name || path.basename(newPath), answers, newPath);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`Could not create project: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    // [CHASSIS] build-task: user confirmed (and optionally edited) task in the compact confirm dialog
    if (msg.type === 'build-task') {
      const task = msg.task || this._pendingTask;
      this._pendingTask = undefined;
      if (!task) { return; }
      const _lastBt = this.state.conversation[this.state.conversation.length - 1];
      if (!_lastBt || _lastBt.role !== 'user' || _lastBt.content !== task) {
        this.state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
      }

      // vaultOnly=true means no workspace — build to a temp file and auto-capture to vault
      if (msg.vaultOnly) {
        this.state.conversation.push({ role: 'assistant', content: '📦 Building snippet and saving to Vault...', timestamp: Date.now() });
        this.refresh();
        await this._handleVaultOnlyBuild(task);
        return;
      }

      this.state.conversation.push({ role: 'assistant', content: '⚡ Building now...', timestamp: Date.now() });
      this.refresh();
      await this._handleBuildRequest(task, true, false); // skipComplex=true, isFixRequest=false
      return;
    }
    // [CHASSIS] edit-request: edit an existing file in-place (TODO fixes, scope tag fixes)
    if (msg.type === 'edit-request' && msg.filePath) {
      await handleEditRequest(msg, this._buildRequestDeps());
      return;
    }
    // [CHASSIS] assistant-message: inject a completion summary bubble without triggering AI
    if (msg.type === 'assistant-message') {
      this.state.conversation.push({ role: 'assistant', content: msg.text, timestamp: Date.now() });
      this.refresh();
      return;
    }
    await handleChatMessage(msg, {
      chassis: this.chassis,
      routing: this.routing,
      usageTracker: this.usageTracker,
      conversation: this.state.conversation,
      panel: this._panel,
      isBuildRequest: async (t) => this._isBuildRequest(t),
      classifyIntent: async (t: string) => this._classifyIntent(t),
      handleBuildRequest: (t, skipComplex, isFixRequest) => this._handleBuildRequest(t, skipComplex, isFixRequest),
      buildFromVaultPrefill: () => this._buildFromVaultPrefill(),
      refresh: () => this.refresh(),
      onStartSession: ChatPanel.onStartSession,
      onSwitchAI: ChatPanel.onSwitchAI,
      onNewProject: ChatPanel.onNewProject,
      setLastModel: (model: string) => { this.state.lastModel = model; },
    });
  }

  public getConversation() { return this.state.conversation; }
  public getRouting() { return this.routing; }

  public showGettingStarted(): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'getting-started' });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public showStartSession(): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'start-session' });
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  public getPendingTask(): string { return this._pendingTask || ''; }
  public getChassisRoot(): string | undefined { return this.chassis.getWorkspaceRoot(); }

  /** Resume a build task — optionally targeting a specific project folder (new project created in-place). */
  public async resumeBuildTask(task: string, projectRoot?: string): Promise<void> {
    if (!task) { return; }
    // Only push to conversation if not already the last user message (avoids duplicate on new-project flow)
    const last = this.state.conversation[this.state.conversation.length - 1];
    if (!last || last.role !== 'user' || last.content !== task) {
      this.state.conversation.push({ role: 'user', content: task, timestamp: Date.now() });
    }
    this.refresh();
    if (projectRoot) {
      // Permanently switch chassis to the new project root — all future builds use this path
      this.chassis = new (this.chassis.constructor as any)(projectRoot);
      this.loadBlueprintContext();
      // Persist so next session auto-reconnects without placement modal
      ChatPanel.extensionContext?.globalState.update('chassis.lastActiveProject', projectRoot);
    }
    await this._handleBuildRequest(task, true, false);
  }

  public showNewProject(suggestedParent?: string, prefillTask?: string, compact?: boolean): void {
    const task = prefillTask || this._pendingTask || '';
    const isSimple = compact !== undefined ? compact : /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(task);
    this._panel.webview.postMessage({ type: 'show-panel', panelType: 'new-project', suggestedParent: suggestedParent || '', prefillTask: task, compact: isSimple });
    this._panel.reveal(this._panel.viewColumn ?? vscode.ViewColumn.One);
  }

  public showPanel(panelType: string, title: string, content: string): void {
    this._panel.webview.postMessage({ type: 'show-panel', panelType, title, content });
    this._panel.reveal(this._panel.viewColumn ?? vscode.ViewColumn.One);
  }

  public setLastModel(model: string): void {
    this.state.lastModel = model;
    this.refresh();
  }

  public async refresh(): Promise<void> {
    const headerInfo = buildHeaderInfo(this.chassis, this.routing, this.usageTracker, this.state.lastModel, ChatPanel.extensionContext);

    // [WARN] Never replace webview.html after initial load — VS Code interprets it as a new panel
    // and opens a duplicate tab. Use postMessage to push incremental updates instead.
    if (!this._initialized) {
      // First load: set full HTML once
      let progress: SetupProgress | undefined;
      if (headerInfo.isInitialized) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root && this.state.conversation.length === 0) {
          try {
            const progressService = new SetupProgressService(this.chassis, root);
            progress = await progressService.getProgress();
          } catch (e) { /* never block startup */ }
        }
      }
      this._panel.webview.html = buildChatHtml(this.state.conversation, headerInfo, progress);
      this._initialized = true;
      return;
    }

    // Subsequent refreshes: push conversation update via postMessage — no HTML replacement
    const { renderMessages } = await import('./chatPanelRenderer.js');
    const messagesHtml = renderMessages(this.state.conversation);
    this._panel.webview.postMessage({ type: 'update-conversation', html: messagesHtml });
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
