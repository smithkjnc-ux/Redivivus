// [SCOPE] Redivivus sidebar WebviewViewProvider — renders the full dashboard inside the activity bar sidebar panel

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../services/redivivusService.js';
import type { SessionService } from '../../services/sessionService.js';
import type { VaultItem, VaultCategory } from '../../services/vault/vaultService.js';
import { VaultService } from '../../services/vault/vaultService.js';
import { RoutingService } from '../../services/ai/routingService.js';
import { getStyles } from '../styles.js';
import { getScripts } from './scripts.js';
import { renderWelcomeView, renderRetrofitPendingView } from './welcomeView.js';
import { renderWorkTab } from './workTab.js';
import { renderFilesTab, renderSwitchForm } from './filesTab.js';
import { renderHistoryTab, getSessionHistory, getReviews } from './historyTab.js';
import { renderVaultTab, renderVaultScanSummary, getVaultItems } from './vaultTab.js';
import { renderWizardStep } from './wizardSteps.js';
import type { WizardPanelState } from '../messageRouter.js';
import { attachMessageRouter } from '../messageRouter.js';

export class RedivivusWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'redivivusPanel';
  private _view?: vscode.WebviewView;
  private vaultService: VaultService;
  private routingService: RoutingService;
  private state: WizardPanelState = {
    wizardStep: 'welcome', wizardData: {}, welcomeDismissed: false,
    vaultView: 'categories', vaultCategory: null, vaultSubcategory: null, vaultItems: [], vaultGlobal: true,
    activeTab: 'work',
    vaultScanMode: false, vaultScanItems: [], vaultScanDuplicates: [], vaultScanFileCount: 0, vaultScanFilteredCount: 0, vaultScanTotalFound: 0,
    browseAnywayBanner: false,
  };

  constructor(
    private redivivus: RedivivusService,
    private sessions: SessionService,
    private context: vscode.ExtensionContext
  ) {
    this.vaultService = new VaultService(context);
    this.routingService = new RoutingService();
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    attachMessageRouter(
      webviewView.webview, this.redivivus, this.sessions,
      this.vaultService, this.context, this.state,
      () => this.refresh(), this.routingService
    );
    this.refresh();
  }

  // [SCOPE] Public refresh — called by commands and message router after state changes
  refresh(): void {
    if (!this._view) { return; }
    this._view.webview.html = this._buildHtml();
  }

  focus(): void {
    this._view?.show(true);
  }

  setVaultScanResults(items: VaultItem[], fileCount: number, filteredCount: number): void {
    this.state.vaultScanMode = true;
    this.state.vaultScanItems = items;
    this.state.vaultScanDuplicates = [];
    this.state.vaultScanFileCount = fileCount;
    this.state.vaultScanFilteredCount = filteredCount;
    this.state.vaultScanTotalFound = items.length;
    this.state.activeTab = 'vault';
    this.refresh();
  }

  private _buildHtml(): string {
    const initialized = this.redivivus.isInitialized();
    const config = initialized ? this.redivivus.loadConfig() : null;
    const hasBlueprint = config?.blueprint?.who ? true : false;
    const blueprintLocked = config?.blueprint?.locked || false;
    const sessionActive = this.sessions.isActive;
    const session = this.sessions.session;
    const backupExists = initialized && fs.existsSync(path.join(this.redivivus.redivivusDir, 'backup'));
    const projectName = config?.projectName || path.basename(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'Project');
    const currentAI = vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || 'gemini';

    const sessions = getSessionHistory(this.redivivus);
    const reviews = getReviews(this.redivivus);
    const vaultItems = getVaultItems(this.vaultService);

    let buildTimestamp = '';
    const buildInfoPath = path.join(this.redivivus.redivivusDir, 'build-info.json');
    if (fs.existsSync(buildInfoPath)) {
      try {
        const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
        const date = new Date(buildInfo.timestamp);
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        buildTimestamp = `<div style="font-size: 11px; color: #4ec959; font-weight: 600; margin-top: 4px;">Built: ${timeStr}</div>`;
      } catch { /* ignore */ } // [WARN] Silently ignoring errors during build-info.json parsing. Could hide issues.
    }

    const availableAI = this.routingService.getAvailableAI();
    const aiBadgeLabel = availableAI.ai === 'none'
      ? 'No AI Key Set'
      : availableAI.ai !== currentAI
        ? `AI: ${currentAI.toUpperCase()} → using ${availableAI.label}`
        : `AI: ${currentAI.toUpperCase()}`;
    const aiBadgeColor = availableAI.ai === 'none' ? 'red' : availableAI.ai !== currentAI ? 'yellow' : 'blue';

    let badges = '';
    if (initialized) {
      const parts: string[] = [];
      if (blueprintLocked) {parts.push('<span class="badge green">Blueprint Locked</span>');}
      else if (hasBlueprint) {parts.push('<span class="badge yellow">Blueprint Draft</span>');}
      if (sessionActive) {parts.push('<span class="badge green">Session Active</span>');}
      parts.push(`<span class="badge ${aiBadgeColor}">${aiBadgeLabel}</span>`);
      badges = '<div class="badges">' + parts.join('') + '</div>';
    }

    let content = '';
    if (this.state.wizardStep !== 'welcome') {
      content = renderWizardStep(this.state.wizardStep, this.state.wizardData);
    } else if (!initialized && !this.state.welcomeDismissed) {
      content = renderWelcomeView();
    } else if (backupExists) {
      content = renderRetrofitPendingView();
    } else {
      if (!hasBlueprint) {
        content += `<div class="card primary" data-cmd="redivivus.blueprint"><div class="card-icon">📋</div><div class="card-body"><div class="card-title">👋 First: Tell Redivivus What You're Building</div><div class="card-sub">5 quick questions about your project. Takes about 2 minutes. Do this first.</div></div></div>`;
      }
      content += `<div class="card" data-cmd="redivivus.showSetupProgress"><div class="card-icon">📊</div><div class="card-body"><div class="card-title">Setup Progress</div><div class="card-sub">Track your Redivivus setup completion</div></div></div>`;
      content += `<div class="tabs">
        <button class="tab ${this.state.activeTab === 'work' ? 'active' : ''}" onclick="showTab('work')">Today</button>
        <button class="tab ${this.state.activeTab === 'files' ? 'active' : ''}" onclick="showTab('files')">Project</button>
        <button class="tab ${this.state.activeTab === 'history' ? 'active' : ''}" onclick="showTab('history')">History</button>
        <button class="tab ${this.state.activeTab === 'vault' ? 'active' : ''}" onclick="showTab('vault')">Snippets</button>
      </div>`;
      content += renderWorkTab(sessionActive, session, hasBlueprint, this.state.activeTab === 'work');
      content += renderSwitchForm(currentAI);
      const redivivusCfg = vscode.workspace.getConfiguration('redivivus');
      const aiKeys = {
        gemini: !!(redivivusCfg.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY),
        claude: !!(redivivusCfg.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY),
        openai: !!(redivivusCfg.get<string>('openaiApiKey') || process.env.OPENAI_API_KEY),
        groq:   !!(redivivusCfg.get<string>('groqApiKey')   || process.env.GROQ_API_KEY),
        xai:    !!(redivivusCfg.get<string>('xaiApiKey')    || process.env.XAI_API_KEY),
        kimi:   !!(redivivusCfg.get<string>('kimiApiKey')   || process.env.MOONSHOT_API_KEY),
      };
      content += renderFilesTab(projectName, blueprintLocked, hasBlueprint, config?.blueprint, this.state.activeTab === 'files', aiKeys);
      content += renderHistoryTab(sessions, reviews, this.state.activeTab === 'history');
      content += this.state.vaultScanMode
        ? renderVaultScanSummary(this.state.vaultScanItems, this.state.vaultScanDuplicates, this.state.vaultScanFileCount, this.state.vaultScanFilteredCount, this.state.activeTab === 'vault')
        : renderVaultTab(vaultItems, this.state.vaultView, this.state.vaultCategory as VaultCategory | null, this.state.vaultGlobal, this.vaultService, this.state.activeTab === 'vault', this.state.vaultSubcategory);
    }

    return `<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body>
      <div class="header"><div class="header-left"><h1>C H A S S I S</h1><div class="sub">Your AI coding organizer</div></div><div class="header-right" style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;"><button class="chat-button" data-cmd="redivivus.openChatPanel">Open Chat</button><button style="padding:3px 10px;font-size:10px;background:#3a3a3a;color:#ccc;border:none;border-radius:4px;cursor:pointer;" data-cmd="redivivus.openSetupHub">⚙️ Setup</button>${buildTimestamp}</div><div class="project">${projectName}</div></div>
      ${badges}${content}<div class="footer">Redivivus v0.2.0 &mdash; Built by PapaJoe — ${new Date().toLocaleTimeString()}</div>
      <script>${getScripts()}</script></body></html>`;
  }
}