// [SCOPE] Extension Command Registrar — registers all CHASSIS VS Code commands
// Extracted from extension.ts

import * as vscode from 'vscode';
import type { ChassisService } from './services/chassisService.js';
import type { RoutingService } from './services/ai/routingService.js';
import type { UsageTracker } from './services/usageTracker.js';
import type { VaultService } from './services/vault/vaultService.js';
import type { MeasureTwiceService } from './services/build/measureTwiceService.js';
import type { ChangeTracker } from './services/build/changeTracker.js';
import type { AnalyzerService } from './ui/panels/analyzer/analyzerService';
import type { RulesService } from './services/rulesService.js';
import type { RetrofitService } from './core/retrofit/retrofitService';
import type { SessionService } from './services/sessionService.js';
import type { GuideService } from './services/guideService.js';
import type { BlueprintService } from './services/blueprint/blueprintService.js';
import type { StatusBar } from './ui/views/statusBar.js';
import type { GuardianService } from './services/ai/guardianService.js';
import { RecommendationsPanel } from './ui/panels/analyzer/analyzerPanel';
import { MapPanel } from './ui/map/mapPanel.js';
import { debugLog } from './services/workspace/diagnosticLogger.js';
import { seedVault } from './services/vault/vaultSeeder.js';
import type { GitHubBackupService } from './services/githubBackupService.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';
import { openBlueprintPanel } from './ui/views/blueprintInterviewPanel.js';
import type { ChassisSidebarProvider } from './ui/sidebar/chassisSidebar.js';
import { registerOnNewProject } from './commands/init.js';
import { registerInitCommands } from './commands/initCommands.js';
import { DelegationCodeLensProvider } from './services/delegationCodeLens.js';
import { registerSessionCommands } from './commands/session.js';
import { registerBlueprintCommands } from './commands/blueprint.js';
import { registerAnalysisCommands } from './commands/analysis.js';
import { registerReviewCommands } from './commands/review.js';
import { registerRestructureCommands } from './commands/restructure.js';
import { registerRetrofitCommands } from './commands/retrofit.js';
import { registerVaultCommands } from './commands/vault.js';
import { registerVaultBrowseCommand } from './commands/vaultBrowse.js';
import { registerBuildFromVaultCommand } from './commands/buildFromVault.js';
import { registerMiscCommands } from './commands/misc.js';
import { registerApiSetupCommand } from './commands/apiSetup.js';
import { registerUsageCommands } from './commands/usageCommands.js';
import { registerSetupProgressCommand } from './commands/setupProgressCommand.js';
import { registerSelectionCommands } from './commands/selection.js';
import { registerTimelineCommand } from './commands/timeline.js';
import { registerLoggingCommands } from './commands/logging.js';
import { registerSavePointCommand } from './commands/savePoint.js';
import { registerFileSplitCommand } from './commands/fileSplit.js';
import { registerRetrofitBlueprintCommand } from './commands/retrofitBlueprint.js';
import { registerScopeCreepCommand } from './commands/scopeCreep.js';
import { registerDuplicateCodeCommand } from './commands/duplicateCode.js';
import { registerGitHubBackupCommands } from './commands/githubBackup.js';
import { registerSetupHubCommand } from './commands/setupHub.js';
import { registerProfileRuntimeCommand } from './commands/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './commands/startRuntimeAnalysis.js';
import { registerInlineCommands } from './extensionInlineCommands.js';

export function registerAllCommands(
  context: vscode.ExtensionContext,
  chassisService: ChassisService,
  routingService: RoutingService,
  usageTracker: UsageTracker,
  vaultService: VaultService,
  measureTwice: MeasureTwiceService,
  changeTracker: ChangeTracker,
  analyzerService: AnalyzerService,
  rulesService: RulesService,
  retrofitService: RetrofitService,
  sessionService: SessionService,
  guideService: GuideService,
  blueprintService: BlueprintService,
  statusBar: StatusBar,
  sidebarProvider: ChassisSidebarProvider,
  refreshAll: () => void,
  githubBackupService: GitHubBackupService,
  guardianService: GuardianService,
  _suppressNextFolderAdd: { value: boolean },
): void {
  // ── register commands ──
  try {   registerInitCommands(context, chassisService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerInitCommands(context, chassisService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerInitCommands(context, chassisService, refreshAll); failed: ' + e + '\n'); }
  try {   registerSessionCommands(context, chassisService, sessionService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerSessionCommands(context, chassisService, sessionService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerSessionCommands(context, chassisService, sessionService, refreshAll); failed: ' + e + '\n'); }
  try {   registerBlueprintCommands(context, chassisService, blueprintService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerBlueprintCommands(context, chassisService, blueprintService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerBlueprintCommands(context, chassisService, blueprintService, refreshAll); failed: ' + e + '\n'); }
  try {   registerAnalysisCommands(context, chassisService, analyzerService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerAnalysisCommands(context, chassisService, analyzerService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerAnalysisCommands(context, chassisService, analyzerService, refreshAll); failed: ' + e + '\n'); }
  try {   registerReviewCommands(context, chassisService, routingService, changeTracker); } catch (e) { console.error('Failed to register ' + 'registerReviewCommands(context, chassisService, routingService, changeTracker);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerReviewCommands(context, chassisService, routingService, changeTracker); failed: ' + e + '\n'); }
  try {   registerRestructureCommands(context, chassisService, routingService, measureTwice, changeTracker, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerRestructureCommands(context, chassisService, routingService, measureTwice, changeTracker, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerRestructureCommands(context, chassisService, routingService, measureTwice, changeTracker, refreshAll); failed: ' + e + '\n'); }
  try {   registerRetrofitCommands(context, chassisService, retrofitService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerRetrofitCommands(context, chassisService, retrofitService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerRetrofitCommands(context, chassisService, retrofitService, refreshAll); failed: ' + e + '\n'); }
  try {   registerVaultCommands(context, chassisService, vaultService, routingService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerVaultCommands(context, chassisService, vaultService, routingService, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerVaultCommands(context, chassisService, vaultService, routingService, refreshAll); failed: ' + e + '\n'); }
  try {   registerVaultBrowseCommand(context, vaultService); } catch (e) { console.error('Failed to register ' + 'registerVaultBrowseCommand(context, vaultService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerVaultBrowseCommand(context, vaultService); failed: ' + e + '\n'); }
  try { const { BuildFromVaultService } = require('./services/vault/buildFromVaultService.js'); registerBuildFromVaultCommand(context, new BuildFromVaultService(vaultService, routingService)); } catch (e) { console.error('Failed to register buildFromVault', e); }
  
  // [CHASSIS] Vault Deduplication command — scan + confirm merge via Quick Pick
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.vaultDedup', async () => {
      const clusters: any[] = [];
      if (clusters.length === 0) {
        vscode.window.showInformationMessage('CHASSIS Vault: No near-duplicates found. Vault is clean.');
        return;
      }
      const total = clusters.reduce((n: number, c: any) => n + c.duplicates.length, 0);
      const choice = await vscode.window.showInformationMessage(
        `CHASSIS Vault: Found ${clusters.length} duplicate cluster${clusters.length !== 1 ? 's' : ''} (${total} redundant item${total !== 1 ? 's' : ''}). Merge now?`,
        'Merge (remove duplicates)',
        'Preview in Chat',
        'Cancel'
      );
      if (choice === 'Merge (remove duplicates)') {
        const result: any = { totalMerged: 0 };
        vscode.window.showInformationMessage(`CHASSIS Vault: Removed ${result.totalMerged} duplicate${result.totalMerged !== 1 ? 's' : ''}.`);
      } else if (choice === 'Preview in Chat') {
        if (!ChatPanel.currentPanel) {
          ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        }
        setTimeout(() => {
          ChatPanel.currentPanel?.handleMessage({ type: 'vault-dedup-preview', clusters });
        }, ChatPanel.currentPanel ? 0 : 600);
      }
    })
  );
  try {   registerApiSetupCommand(context); } catch (e) { console.error('Failed to register ' + 'registerApiSetupCommand(context);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerApiSetupCommand(context); failed: ' + e + '\n'); }
  try {   registerUsageCommands(context, usageTracker, routingService); } catch (e) { console.error('Failed to register ' + 'registerUsageCommands(context, usageTracker, routingService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerUsageCommands(context, usageTracker, routingService); failed: ' + e + '\n'); }
  try {   registerSetupProgressCommand(context, chassisService); } catch (e) { console.error('Failed to register ' + 'registerSetupProgressCommand(context, chassisService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerSetupProgressCommand(context, chassisService); failed: ' + e + '\n'); }
  try {   registerSelectionCommands(context, chassisService, routingService, usageTracker, vaultService); } catch (e) { console.error('Failed to register ' + 'registerSelectionCommands(context, chassisService, routingService, usageTracker, vaultService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerSelectionCommands(context, chassisService, routingService, usageTracker, vaultService); failed: ' + e + '\n'); }
  try {   registerTimelineCommand(context, chassisService); } catch (e) { console.error('Failed to register ' + 'registerTimelineCommand(context, chassisService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerTimelineCommand(context, chassisService); failed: ' + e + '\n'); }
  try {   registerLoggingCommands(context, chassisService); } catch (e) { console.error('Failed to register ' + 'registerLoggingCommands(context, chassisService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerLoggingCommands(context, chassisService); failed: ' + e + '\n'); }
  try {   registerSavePointCommand(context); } catch (e) { console.error('Failed to register ' + 'registerSavePointCommand(context);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerSavePointCommand(context); failed: ' + e + '\n'); }
  try {   registerFileSplitCommand(context, routingService); } catch (e) { console.error('Failed to register ' + 'registerFileSplitCommand(context, routingService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerFileSplitCommand(context, routingService); failed: ' + e + '\n'); }
  try {   registerRetrofitBlueprintCommand(context, chassisService, routingService); } catch (e) { console.error('Failed to register ' + 'registerRetrofitBlueprintCommand(context, chassisService, routingService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerRetrofitBlueprintCommand(context, chassisService, routingService); failed: ' + e + '\n'); }
  try {   registerScopeCreepCommand(context, chassisService, routingService); } catch (e) { console.error('Failed to register ' + 'registerScopeCreepCommand(context, chassisService, routingService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerScopeCreepCommand(context, chassisService, routingService); failed: ' + e + '\n'); }
  try {   registerDuplicateCodeCommand(context, routingService); } catch (e) { console.error('Failed to register ' + 'registerDuplicateCodeCommand(context, routingService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerDuplicateCodeCommand(context, routingService); failed: ' + e + '\n'); }
  try {   registerMiscCommands(context, chassisService, sessionService, guideService, rulesService, null as any, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerMiscCommands(context, chassisService, sessionService, guideService, rulesService, null as any, refreshAll);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerMiscCommands(context, chassisService, sessionService, guideService, rulesService, null as any, refreshAll); failed: ' + e + '\n'); }
  registerInlineCommands(context, chassisService, routingService, usageTracker, vaultService, statusBar, refreshAll, githubBackupService, guardianService, _suppressNextFolderAdd);
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new DelegationCodeLensProvider()));

  // chassis.compileProject — triggered by "Package as Executable" action card button
  context.subscriptions.push(vscode.commands.registerCommand('chassis.compileProject', async () => {
    const { _lastCompileTarget, runCompilePipeline, getCompilePipeline } = require('./ui/chat/chatPanelBuildPipeline.js');
    let target = _lastCompileTarget;
    if (!target) {
      // Fallback: scan workspace for a compilable file
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showWarningMessage('No project open — open a project folder first.'); return; }
      const fs = require('fs'), path = require('path');
      const exts = ['.py', '.rs', '.go', '.c', '.cpp'];
      const srcDir = path.join(root, 'src');
      const searchDirs = [srcDir, root].filter((d: string) => fs.existsSync(d));
      let found: string | null = null;
      for (const dir of searchDirs) {
        const files: string[] = fs.readdirSync(dir).filter((f: string) => exts.some((e: string) => f.endsWith(e)));
        if (files.length) { found = path.join(dir, files[0]); break; }
      }
      if (!found) { vscode.window.showWarningMessage('No compilable file found (.py, .rs, .go, .c, .cpp).'); return; }
      const relPath = require('path').relative(root, found);
      const pipeline = getCompilePipeline(relPath, root);
      if (!pipeline) { vscode.window.showWarningMessage('No compile pipeline for this file type.'); return; }
      target = { root, relPath, pipeline };
    }
    runCompilePipeline(target.pipeline, target.root);
  }));
}
