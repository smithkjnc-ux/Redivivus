// [SCOPE] CHASSIS Dashboard — WebView panel orchestrator
// // BUILD_TIMESTAMP: 2026-05-03T05:06:16.083Z
// CHASSIS DESIGN RULE: Every user-facing message MUST be plain English.
// No raw tag names, no jargon, no code terms. If a non-developer can't
// understand it in 3 seconds, rewrite it.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChassisService } from '../../services/chassisService.js';
import { SessionService } from '../../services/sessionService.js';
import { VaultService, VaultItem, VaultCategory } from '../../services/vault/vaultService.js';
import { RoutingService } from '../../services/ai/routingService.js';
import { getStyles } from '../styles.js';
import { getScripts } from './scripts.js';
import { renderWelcomeView, renderRetrofitPendingView } from './welcomeView.js';
import { renderMapTab } from './mapTab.js';
import { renderWorkTab } from './workTab.js';
import { renderFilesTab, renderSwitchForm } from './filesTab.js';
import { renderHistoryTab, getSessionHistory, getReviews } from './historyTab.js';
import { renderVaultTab, renderVaultScanSummary, getVaultItems } from './vaultTab.js';
import { renderWizardStep } from './wizardSteps.js';
import { attachMessageRouter, WizardPanelState } from '../messageRouter.js';
import { buildProjectMap } from '../../services/mapBuilderService.js';
import { GuardianService } from '../../services/ai/guardianService.js';
import { IntentService } from '../../services/intentService.js';

export class WizardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private state: WizardPanelState = {
    wizardStep: 'welcome', wizardData: {}, welcomeDismissed: false,
    vaultView: 'categories', vaultCategory: null, vaultSubcategory: null, vaultItems: [], vaultGlobal: true,
    activeTab: 'work',
    vaultScanMode: false, vaultScanItems: [], vaultScanDuplicates: [], vaultScanFileCount: 0, vaultScanFilteredCount: 0, vaultScanTotalFound: 0,
    browseAnywayBanner: false,
  };
  private disposables: vscode.Disposable[] = [];
  public static activePanel: WizardPanel | undefined;
  private vaultService: VaultService;
  private routingService: RoutingService;
  private guardianService: GuardianService;
  private intentService: IntentService;

  constructor(
    private chassis: ChassisService,
    private sessions: SessionService,
    private context: vscode.ExtensionContext
  ) {
    this.vaultService = new VaultService(context);
    this.routingService = new RoutingService();
    this.guardianService = new GuardianService(chassis);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    this.intentService = new IntentService(root);
    WizardPanel.activePanel = this;
  }

  show(): void {
    if (this.panel) { this.panel.reveal(); this.updateContent(); return; }
    this.panel = vscode.window.createWebviewPanel('chassisWizard', 'CHASSIS', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    attachMessageRouter(this.panel.webview, this.chassis, this.sessions, this.vaultService, this.context, this.state, () => this.updateContent(), this.routingService, this.guardianService, this.intentService);
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
  public updateContent(html?: string): void {
    if (this.panel) {
      if (html) { this.panel.webview.html = html; }
      else { this.panel.webview.html = this.panel.webview.html || ""; }
    }
  }
}