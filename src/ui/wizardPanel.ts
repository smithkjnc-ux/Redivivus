// [SCOPE] CHASSIS Dashboard — WebView panel orchestrator
// // BUILD_TIMESTAMP: 2026-05-03T05:06:16.083Z
// CHASSIS DESIGN RULE: Every user-facing message MUST be plain English.
// No raw tag names, no jargon, no code terms. If a non-developer can't
// understand it in 3 seconds, rewrite it.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { VaultService, VaultItem, VaultCategory } from '../services/vaultService.js';
import { RoutingService } from '../services/routingService.js';
import { getStyles } from './styles.js';
import { getScripts } from './scripts.js';
import { renderWelcomeView, renderRetrofitPendingView } from './views/welcomeView.js';
import { renderWorkTab } from './views/workTab.js';
import { renderFilesTab, renderSwitchForm } from './views/filesTab.js';
import { renderHistoryTab, getSessionHistory, getReviews } from './views/historyTab.js';
import { renderVaultTab, renderVaultScanSummary, getVaultItems } from './views/vaultTab.js';
import { renderWizardStep } from './views/wizardSteps.js';
import { attachMessageRouter, WizardPanelState } from './messageRouter.js';

export class WizardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private state: WizardPanelState = {
    wizardStep: 'welcome', wizardData: {}, welcomeDismissed: false,
    vaultView: 'categories', vaultCategory: null, vaultSubcategory: null, vaultItems: [], vaultGlobal: true,
    activeTab: 'work',
    vaultScanMode: false, vaultScanItems: [], vaultScanDuplicates: [], vaultScanFileCount: 0, vaultScanFilteredCount: 0, vaultScanTotalFound: 0,
  };
  private disposables: vscode.Disposable[] = [];
  public static activePanel: WizardPanel | undefined;
  private vaultService: VaultService;
  private routingService: RoutingService;

  constructor(
    private chassis: ChassisService,
    private sessions: SessionService,
    private context: vscode.ExtensionContext
  ) {
    this.vaultService = new VaultService(context);
    this.routingService = new RoutingService();
    WizardPanel.activePanel = this;
  }

  show(): void {
    if (this.panel) { this.panel.reveal(); this.updateContent(); return; }
    this.panel = vscode.window.createWebviewPanel('chassisWizard', 'CHASSIS', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    attachMessageRouter(this.panel.webview, this.chassis, this.sessions, this.vaultService, this.context, this.state, () => this.updateContent(), this.routingService);
    this.updateContent();
  }

  private sendState(): void {
    if (!this.panel) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const initialized = this.chassis.isInitialized();
    const config = initialized ? this.chassis.loadConfig() : null;
    const bp = config?.blueprint;
    const currentAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';
    this.panel.webview.postMessage({
      type: 'state',
      data: {
        initialized, projectName: config?.projectName || path.basename(root),
        hasBlueprint: bp?.who ? true : false, blueprintLocked: bp?.locked || false, blueprint: bp || null,
        sessionActive: this.sessions.isActive,
        session: this.sessions.session ? { goal: this.sessions.session.goal, ai: this.sessions.session.ai } : null,
        backupExists: initialized && fs.existsSync(path.join(this.chassis.chassisDir, 'backup')),
        currentAI, sessions: getSessionHistory(this.chassis), reviews: this.getReviewList(),
      }
    });
  }

  private getReviewList(): string[] {
    if (!this.chassis.isInitialized()) return [];
    const dir = path.join(this.chassis.chassisDir, 'reviews');
    if (!fs.existsSync(dir)) return [];
    // [WARN] Silently returns empty array on any file system or parsing error.
    try {
      return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 10)
        .map(f => f.replace('_review.md', '').replace(/_/g, '.'));
    } catch { return []; }
  }

  setVaultScanResults(items: VaultItem[], fileCount: number, filteredCount: number): void {
    this.state.vaultScanMode = true;
    this.state.vaultScanItems = items;
    this.state.vaultScanDuplicates = [];
    this.state.vaultScanFileCount = fileCount;
    this.state.vaultScanFilteredCount = filteredCount;
    this.state.vaultScanTotalFound = items.length;
    this.state.activeTab = 'vault';
    this.updateContent();
  }

  private updateContent(): void {
    if (!this.panel) return;
    const initialized = this.chassis.isInitialized();
    const config = initialized ? this.chassis.loadConfig() : null;
    const hasBlueprint = config?.blueprint?.who ? true : false;
    const blueprintLocked = config?.blueprint?.locked || false;
    const sessionActive = this.sessions.isActive;
    const session = this.sessions.session;
    const backupExists = initialized && fs.existsSync(path.join(this.chassis.chassisDir, 'backup'));
    const projectName = config?.projectName || path.basename(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'Project');
    const currentAI = vscode.workspace.getConfiguration('chassis').get<string>('defaultAI') || 'gemini';

    const sessions = getSessionHistory(this.chassis);
    const reviews = getReviews(this.chassis);
    const vaultItems = getVaultItems(this.vaultService);

    // Read build timestamp for visual verification
    let buildTimestamp = '';
    const buildInfoPath = path.join(this.chassis.chassisDir, 'build-info.json');
    console.log('[CHASSIS] Looking for build info at:', buildInfoPath);
    console.log('[CHASSIS] chassisDir:', this.chassis.chassisDir);
    console.log('[CHASSIS] File exists:', fs.existsSync(buildInfoPath));
    // [WARN] Error reading or parsing build-info.json will be caught and logged, but UI will proceed without timestamp.
    if (fs.existsSync(buildInfoPath)) {
      try {
        const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf-8'));
        console.log('[CHASSIS] Build info loaded:', buildInfo);
        const date = new Date(buildInfo.timestamp);
        const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        buildTimestamp = `<div style="font-size: 11px; color: #4ec959; font-weight: 600; margin-top: 4px;">Built: ${timeStr}</div>`;
      } catch (e) {
        console.error('[CHASSIS] Error reading build info:', e);
      }
    }

    // Check actual available AI vs configured AI
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
      if (blueprintLocked) parts.push('<span class="badge green">Blueprint Locked</span>');
      else if (hasBlueprint) parts.push('<span class="badge yellow">Blueprint Draft</span>');
      if (sessionActive) parts.push('<span class="badge green">Session Active</span>');
      parts.push(`<span class="badge ${aiBadgeColor}">${aiBadgeLabel}</span>`);
      badges = '<div class="badges">' + parts.join('') + '</div>';
    }

    let content = '';
    if (this.state.wizardStep !== 'welcome') {
      content = renderWizardStep(this.state.wizardStep, this.state.wizardData);
    } else if (!initialized) {
      content = renderWelcomeView();
    } else if (backupExists) {
      content = renderRetrofitPendingView();
    } else {
      if (!hasBlueprint) {
        content += `<div class="card primary" data-cmd="chassis.blueprint"><div class="card-icon">📋</div><div class="card-body"><div class="card-title">Tell CHASSIS About Your Project</div><div class="card-desc">5 quick questions so I understand what you're building. Takes about 2 minutes.</div></div></div>`;
      }
      content += `<div class="tabs">
        <button class="tab ${this.state.activeTab === 'work' ? 'active' : ''}" onclick="showTab('work')">Work</button>
        <button class="tab ${this.state.activeTab === 'files' ? 'active' : ''}" onclick="showTab('files')">Files & AI</button>
        <button class="tab ${this.state.activeTab === 'history' ? 'active' : ''}" onclick="showTab('history')">History</button>
        <button class="tab ${this.state.activeTab === 'vault' ? 'active' : ''}" onclick="showTab('vault')">Vault</button>
      </div>`;
      content += renderWorkTab(sessionActive, session, hasBlueprint, this.state.activeTab === 'work');
      content += renderSwitchForm(currentAI);
      const chassisCfg = vscode.workspace.getConfiguration('chassis');
      const aiKeys = {
        gemini: !!(chassisCfg.get<string>('geminiApiKey') || process.env.GEMINI_API_KEY),
        claude: !!(chassisCfg.get<string>('claudeApiKey') || process.env.ANTHROPIC_API_KEY),
        openai: !!(chassisCfg.get<string>('openaiApiKey') || process.env.OPENAI_API_KEY),
        groq:   !!(chassisCfg.get<string>('groqApiKey')   || process.env.GROQ_API_KEY),
        xai:    !!(chassisCfg.get<string>('xaiApiKey')    || process.env.XAI_API_KEY),
        kimi:   !!(chassisCfg.get<string>('kimiApiKey')   || process.env.MOONSHOT_API_KEY),
      };
      content += renderFilesTab(projectName, blueprintLocked, hasBlueprint, config?.blueprint, this.state.activeTab === 'files', aiKeys);
      content += renderHistoryTab(sessions, reviews, this.state.activeTab === 'history');
      content += this.state.vaultScanMode
        ? renderVaultScanSummary(this.state.vaultScanItems, this.state.vaultScanDuplicates, this.state.vaultScanFileCount, this.state.vaultScanFilteredCount, this.state.activeTab === 'vault')
        : renderVaultTab(vaultItems, this.state.vaultView, this.state.vaultCategory as VaultCategory | null, this.state.vaultGlobal, this.vaultService, this.state.activeTab === 'vault', this.state.vaultSubcategory);
    }

    this.panel.webview.html = `<!DOCTYPE html><html><head><style>${getStyles()}</style></head><body>
      <div class="header"><h1>C H A S S I S ✅</h1><div class="sub">The frame everything bolts to</div><div class="project">${projectName}</div>${buildTimestamp}</div>
      ${badges}${content}<div class="footer">CHASSIS v0.2.0 &mdash; Built by PapaJoe — ${new Date().toLocaleTimeString()}</div>
      <script>${getScripts()}</script></body></html>`;
  }
}