// [SCOPE] CHASSIS Chat Panel — standalone editor-area WebviewPanel (singleton), Gemini integration

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vaultService.js';
import { findRelevantByTask } from '../services/buildFromVaultSearch.js';
import { buildChatHtml, ChatMessage, ChatHeaderInfo } from './chatPanelHtml.js';

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

  private buildHeaderInfo(): ChatHeaderInfo {
    const available = this.routing.getAvailableAI();
    const config = this.chassis.isInitialized() ? this.chassis.loadConfig() : null;
    const hasBlueprint = !!config?.blueprint?.who;
    const blueprintLocked = config?.blueprint?.locked || false;
    const isInitialized = this.chassis.isInitialized();
    const projectName = config?.projectName || (vscode.workspace.workspaceFolders?.[0] ? path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath) : 'No Project');

    // Get current time formatted
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Get selected AI from settings
    const selectedAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    const aiLabels: Record<string, string> = {
      gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o',
      groq: 'Groq', xai: 'Grok', kimi: 'Kimi'
    };

    // If no key configured, show selected AI with warning
    const hasKey = available.ai !== 'none';
    const aiName = hasKey ? available.ai : selectedAI;
    const aiLabel = hasKey ? available.label : aiLabels[selectedAI] + ' (no key)';

    return {
      projectName,
      aiName,
      aiLabel,
      isFallback: hasKey && available.ai !== selectedAI,
      hasKey,
      blueprintLocked,
      hasBlueprint,
      sessionActive: false,
      currentTime: timeStr,
      isInitialized,
      usageReport: this.usageTracker?.getReport(),
    };
  }

  /** Returns true if the message is a direct build/create request */
  private _isBuildRequest(text: string): boolean {
    const t = text.toLowerCase();
    const buildVerbs = /^\s*(build|create|make|write|add|generate|implement|scaffold|code|develop|produce)/;
    return buildVerbs.test(t);
  }

  /** Direct build: vault search + AI assemble + write file — no forms, no modals */
  private async _handleBuildRequest(task: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      this.state.conversation.push({ role: 'assistant', content: '⚠️ No workspace open — please open a project folder first.', timestamp: Date.now() });
      this.refresh(); return;
    }

    // Show thinking indicator
    this.state.conversation.push({ role: 'assistant', content: '⚙️ Building…', timestamp: Date.now() });
    this.refresh();

    const config = this.chassis.isInitialized() ? this.chassis.loadConfig() : null;
    const blueprintContext = this.state.blueprintContext;

    // Vault search
    const vaultItems = this.vault ? this.vault.listItems() : [];
    const relevant = vaultItems.length > 0 ? findRelevantByTask(task, vaultItems) : [];
    const vaultSummary = relevant.slice(0, 8).map(i =>
      `// FROM VAULT [${i.category}]: ${i.name}\n${i.code}`
    ).join('\n\n');

    // Infer file path from task + blueprint
    const where = (config?.blueprint?.where || '').toLowerCase();
    const ext = where.includes('python') ? '.py'
      : where.includes('react') || where.includes('tsx') ? '.tsx'
      : where.includes('javascript') || where.includes('node') ? '.js'
      : '.ts';
    // Derive a filename from the task (first 4 meaningful words, snake_case)
    const stopSet = new Set(['build','create','make','write','add','generate','implement','me','a','an','the','that','for','with','using','simple','basic','just']);
    const words = task.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 1 && !stopSet.has(w));
    const fileBase = words.slice(0, 4).join('_') || 'output';
    const relPath = `src/${fileBase}${ext}`;
    const absPath = path.join(root, relPath);

    const buildPrompt = `You are CHASSIS, a code generation assistant. Generate complete, working, production-ready code.

TASK: "${task}"
TARGET FILE: ${relPath}\n${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}` : ''}
${vaultSummary ? `VAULT CODE (reuse where relevant):\n${vaultSummary}` : ''}

RULES:
- Write code that works immediately without configuration or placeholder values.
- Use real libraries, real APIs, and real implementations. No placeholder URLs, no example.com, no TODO stubs.
- Add a [SCOPE] comment at the top describing what this module does.
- Return ONLY the code — no markdown fences, no explanation, no preamble.`;

    let code: string;
    try {
      const res = await this.routing.prompt(buildPrompt);
      if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
      // Strip markdown fences if AI added them anyway
      code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
      const tokens = Math.ceil(res.text.length / 4);
      await this.usageTracker?.recordUsage(tokens, (tokens / 1_000_000) * 0.30, res.model || 'unknown');
    } catch (err) {
      // Replace the thinking message
      this.state.conversation.pop();
      this.state.conversation.push({ role: 'assistant', content: `❌ Build failed: ${err instanceof Error ? err.message : 'unknown error'}`, timestamp: Date.now() });
      this.refresh(); return;
    }

    // Write the file
    try {
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, code, 'utf8');
    } catch (err) {
      this.state.conversation.pop();
      this.state.conversation.push({ role: 'assistant', content: `❌ Could not write file: ${err instanceof Error ? err.message : 'unknown'}`, timestamp: Date.now() });
      this.refresh(); return;
    }

    // Replace thinking message with success result + action buttons
    this.state.conversation.pop();
    const vaultNote = relevant.length > 0 ? `, ${relevant.length} vault item(s) used` : ', 0 vault items used';
    const resultMsg = `✅ Created \`${relPath}\`${vaultNote}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__`;
    this.state.conversation.push({ role: 'assistant', content: resultMsg, timestamp: Date.now() });
    this.refresh();
  }

  private async handleMessage(msg: any): Promise<void> {
    if (msg.type === 'send-message') {
      const userText = msg.text?.trim();
      if (!userText) { return; }
      this.state.conversation.push({ role: 'user', content: userText, timestamp: Date.now() });
      this.refresh();

      // Build intent: skip AI routing, go directly to build
      if (this._isBuildRequest(userText)) {
        await this._handleBuildRequest(userText);
        return;
      }

      try {
        const prefix = this.buildAIPrefix();
        const aiResponse = await this.routing.prompt(prefix + userText);
        const estimatedTokens = Math.ceil(aiResponse.text.length / 4);
        const estimatedCost = (estimatedTokens / 1_000_000) * 0.30;

        // Record usage via tracker
        await this.usageTracker?.recordUsage(estimatedTokens, estimatedCost, aiResponse.model || 'unknown');

        // Check for command execution requests in AI response
        const { text: processedResponse, executedCommand } = await this.processAIResponse(aiResponse.text || '');

        this.state.conversation.push({
          role: 'assistant', content: processedResponse,
          timestamp: Date.now(), tokens: estimatedTokens, cost: estimatedCost,
        });

        // If AI executed a panel command, don't refresh (panel stays open)
        if (!executedCommand) {
          this.refresh();
        }
      } catch (err) {
        this.state.conversation.push({
          role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: Date.now(),
        });
        this.refresh();
      }
    } else if (msg.type === 'open-file') {
      const filePath = msg.filePath;
      if (filePath && fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    } else if (msg.type === 'create-file') {
      const { code, filename } = msg;
      if (!code || !filename) { return; }
      try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!rootPath) { vscode.window.showErrorMessage('No workspace open'); return; }
        const filePath = vscode.Uri.file(`${rootPath}/${filename}`);
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(code));
        await vscode.window.showTextDocument(filePath);
        vscode.window.showInformationMessage(`Created ${filename}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create file: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    } else if (msg.type === 'clear-chat') {
      this.state.conversation = [];
      this.refresh();
    } else if (msg.type === 'run-command') {
      const command = msg.command;
      if (command) {
        try {
          if (command === 'chassis.buildFromVault') {
            const prefill = this._buildFromVaultPrefill();
            await vscode.commands.executeCommand(command, prefill);
          } else {
            await vscode.commands.executeCommand(command);
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Command failed: ${err instanceof Error ? err.message : 'unknown'}`);
        }
      }
    } else if (msg.type === 'start-session') {
      if (ChatPanel.onStartSession) {
        await ChatPanel.onStartSession(msg.goal || '', msg.ai || 'Unknown');
      }
    } else if (msg.type === 'switch-ai') {
      if (ChatPanel.onSwitchAI) {
        await ChatPanel.onSwitchAI(msg.ai || 'gemini');
      }
    } else if (msg.type === 'new-project') {
      if (ChatPanel.onNewProject) {
        await ChatPanel.onNewProject(msg.name || '', msg.answers || {}, msg.folderPath || undefined);
      }
    } else if (msg.type === 'browse-folder') {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Project Parent Folder',
        defaultUri: msg.currentPath ? vscode.Uri.file(msg.currentPath) : undefined,
      });
      if (picked && picked.length > 0) {
        this._panel.webview.postMessage({ type: 'browse-result', folderPath: picked[0].fsPath });
      }
    }
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
    const header = this.buildHeaderInfo();
    this._panel.webview.html = buildChatHtml(this.state.conversation, header);
  }

  /** Build prefill for Build from Vault: task from last user message, target from blueprint/project */
  private _buildFromVaultPrefill(): { task?: string; targetFile?: string } {
    // Use the last user message as the task, falling back to blueprint WHAT
    const userMessages = this.state.conversation.filter(m => m.role === 'user');
    const lastUserMsg = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.trim() : '';

    const config = this.chassis.isInitialized() ? this.chassis.loadConfig() : null;
    const blueprintWhat = config?.blueprint?.what || '';
    const task = lastUserMsg || blueprintWhat || undefined;

    // Suggest a target file from project name + blueprint WHERE (language clue)
    let targetFile: string | undefined;
    if (config?.projectName) {
      const where = (config.blueprint?.where || '').toLowerCase();
      const ext = where.includes('python') ? '.py'
        : where.includes('react') || where.includes('tsx') ? '.tsx'
        : where.includes('javascript') || where.includes('node') ? '.js'
        : '.ts';
      const slug = config.projectName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      // Only suggest if target file not already existing (best effort from src/)
      targetFile = `src/${slug}${ext}`;
    }

    return { task, targetFile };
  }

  private buildAIPrefix(): string {
    const config = this.chassis.isInitialized() ? this.chassis.loadConfig() : null;
    const projectName = config?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'No project open';
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'none';
    const bp = config?.blueprint;
    const bpContext = bp ? `\nBlueprint — Who: ${bp.who || '?'}, What: ${bp.what || '?'}, Where: ${bp.where || '?'}` : '';

    return `You are CHASSIS, an AI coding assistant embedded in VS Code. Answer questions directly and helpfully. Keep responses concise.

Project: ${projectName}
Workspace: ${workspaceRoot}
CHASSIS initialized: ${this.chassis.isInitialized()}${bpContext}

--- YOUR ROLE ---
You answer questions about this project, explain code, discuss architecture, and help the user understand what to do next.
Build/create/write requests are handled automatically by a separate system — you will NOT see them here.

--- WHEN TO SUGGEST A COMMAND ---
Only suggest a command when the user explicitly asks for an action that maps to one below.
Format: one sentence explaining what you'll do, then EXACTLY ONE token on its own line: [[COMMAND:chassis.commandName]]

start session / begin session → [[COMMAND:chassis.startSession]]
end session → [[COMMAND:chassis.endSession]]
start new project / create project → [[COMMAND:chassis.wizardRetrofit]]
open project / switch project → [[COMMAND:chassis.openProject]]
initialize chassis / add chassis here → [[COMMAND:chassis.init]]
analyze project / scan project → [[COMMAND:chassis.analyze]]
review code / code review → [[COMMAND:chassis.reviewFile]]
blueprint / update blueprint → [[COMMAND:chassis.blueprint]]
open blueprint → [[COMMAND:chassis.openBlueprint]]
generate rules → [[COMMAND:chassis.generateRules]]
open vault / browse vault → [[COMMAND:chassis.openVault]]
scan codebase to vault → [[COMMAND:chassis.scanVaultCodebase]]
work log / show log → [[COMMAND:chassis.log]]
switch AI / change AI → [[COMMAND:chassis.switchAI]]
usage / tokens spent → [[COMMAND:chassis.viewUsageInChat]]
settings / api key → [[COMMAND:chassis.openSettings]]

--- DO NOT ---
- Do NOT suggest chassis.buildFromVault \u2014 builds are handled directly.
- Do NOT suggest commands for questions that are just asking for information.
- Do NOT use [[COMMAND:chassis.init]] when user says "new project".

User question: `;
  }

  private async processAIResponse(text: string): Promise<{ text: string; executedCommand: boolean }> {
    // Check for command execution syntax [[COMMAND:commandId]]
    const commandMatch = text.match(/\[\[COMMAND:(\w+(?:\.\w+)*)\]\]/);
    if (commandMatch) {
      const command = commandMatch[1];
      // Replace with a user-friendly action card instead of auto-executing
      const label = ChatPanel.commandLabel(command);
      const card = `__ACTION_CARD__${command}|||${label}|||END__`;
      return {
        text: text.replace(commandMatch[0], card).trim(),
        executedCommand: false
      };
    }
    return { text, executedCommand: false };
  }

  /** Human-readable label for each known command */
  private static commandLabel(command: string): string {
    const labels: Record<string, string> = {
      'chassis.startSession':      '🚀 Start Session',
      'chassis.endSession':        '🏁 End Session',
      'chassis.openProject':       '📂 Open Project Folder',
      'chassis.wizardRetrofit':    '🆕 Start New Project Setup',
      'chassis.init':              '🆕 Initialize CHASSIS Here',
      'chassis.blueprint':         '📋 Run Blueprint Interview',
      'chassis.openBlueprint':     '📄 Open Blueprint File',
      'chassis.generateRules':     '📜 Generate AI Rules',
      'chassis.analyze':           '🔍 Analyze Project',
      'chassis.analyzeFile':       '🔍 Analyze Current File',
      'chassis.reviewFile':        '🤖 AI Code Review',
      'chassis.retrofit':          '🔧 Retrofit Project',
      'chassis.restructureFile':   '✂️ Clean Up File',
      'chassis.openVault':         '💾 Open Vault',
      'chassis.saveToVault':       '💾 Save to Vault',
      'chassis.scanVaultCodebase': '🔎 Scan Project to Vault',
      'chassis.buildFromVault':    '🏗️ Build from Vault',
      'chassis.validateVault':     '✅ Validate Vault',
      'chassis.log':               '📋 Show Work Log',
      'chassis.deadends':          '💀 Show Dead Ends',
      'chassis.switchAI':          '🤖 Switch AI',
      'chassis.viewUsageInChat':   '📊 View Usage Stats',
      'chassis.openSettings':      '⚙️ Open Settings',
    };
    return labels[command] || `▶ Run: ${command}`;
  }
}
