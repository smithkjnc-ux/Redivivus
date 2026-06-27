// [SCOPE] Extension Command Registrar — registers all Redivivus VS Code commands
// Extracted from extension.ts

import * as vscode from 'vscode';
import type { RedivivusService } from './features/vscode/logic/redivivusService.js';
import type { RoutingService } from './features/ai/data/routingService.js';
import type { UsageTracker } from './features/telemetry/data/usageTracker.js';
import type { VaultService } from './features/vault/data/vaultService.js';
import type { MeasureTwiceService } from './features/build/services/measureTwiceService.js';
import type { ChangeTracker } from './features/build/services/changeTracker.js';
import type { AnalyzerService } from './features/workspace/logic/analyzerService.js';
import type { RulesService } from './features/vscode/logic/rules/rulesService.js';
import type { RetrofitService } from './features/project/logic/retrofit/retrofitService.js';
import type { SessionService } from './features/project/logic/sessionService.js';
import type { GuideService } from './features/vscode/logic/guideService.js';
import type { BlueprintService } from './features/blueprint/logic/blueprintService.js';
import type { StatusBar } from './features/vscode/ui/statusBar.js';
import type { GuardianService } from './features/ai/data/guardianService.js';
import type { GitHubBackupService } from './features/workspace/data/githubBackupService.js';
import { openBlueprintPanel } from './features/blueprint/ui/blueprintInterviewPanel.js';
import { registerVaultDedupCommand } from './features/vault/logic/vaultDedup.js';
import { registerCloseProjectCommand } from './features/project/logic/closeProject.js';
import { registerCompileProjectCommand } from './features/project/logic/compileProject.js';
import type { RedivivusSidebarProvider } from './features/vscode/ui/sidebar/redivivusSidebar.js';
import { registerOnNewProject } from './features/project/logic/init.js';
import { registerInitCommands } from './features/project/logic/initCommands.js';
import { DelegationCodeLensProvider } from './features/workspace/logic/delegationCodeLens.js';
import { registerSessionCommands } from './features/project/logic/session.js';
import { registerBlueprintCommands } from './features/project/logic/blueprint.js';
import { registerAnalysisCommands } from './features/workspace/logic/analysis.js';
import { registerReviewCommands } from './features/workspace/logic/review.js';
import { registerRestructureCommands } from './features/project/logic/restructure.js';
import { registerRetrofitCommands } from './features/project/logic/retrofit.js';
import { registerVaultCommands } from './features/vault/logic/vault.js';
import { registerVaultBrowseCommand } from './features/vault/logic/vaultBrowse.js';
import { registerVaultTranslateCommand } from './features/vault/logic/vaultTranslate.js';
import { registerBuildFromVaultCommand } from './features/vault/logic/buildFromVault.js';
import { registerMiscCommands } from './features/vscode/logic/misc.js';
import { registerAuthHandler } from './features/api/logic/authHandler.js';
import { registerApiSetupCommand } from './features/onboarding/logic/apiSetup.js';
import { registerUsageCommands } from './features/telemetry/logic/usageCommands.js';
import { registerSetupProgressCommand } from './features/onboarding/logic/setupProgressCommand.js';
import { registerSelectionCommands } from './features/workspace/logic/selection.js';
import { registerTimelineCommand } from './features/project/logic/timeline.js';
import { registerLoggingCommands } from './features/logging/logic/logging.js';
import { registerSavePointCommand } from './features/project/logic/savePoint.js';
import { registerOrganizeProjects } from './features/project/logic/organizeProjects.js';
import { registerFileSplitCommand } from './features/project/logic/fileSplit.js';
import { registerRetrofitBlueprintCommand } from './features/project/logic/retrofitBlueprint.js';
import { registerScopeCreepCommand } from './features/workspace/logic/scopeCreep.js';
import { registerDuplicateCodeCommand } from './features/workspace/logic/duplicateCode.js';
import { registerGitHubBackupCommands } from './features/workspace/logic/githubBackup.js';
import { registerSetupHubCommand } from './features/onboarding/logic/setupHub.js';
import { registerProfileRuntimeCommand } from './features/runtime/logic/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './features/runtime/logic/startRuntimeAnalysis.js';
import { registerInlineCommands } from './extensionInlineCommands.js';
import { registerSignInCommand } from './features/onboarding/logic/signIn.js';
import { registerReportIssueCommand } from './features/workspace/logic/reportIssue.js';
import { registerCheckForUpdatesCommand } from './features/settings/logic/checkForUpdates.js';
import { initOutputChannels } from './features/logging/ui/outputChannelManager.js';

export function registerAllCommands(
  context: vscode.ExtensionContext,
  redivivusService: RedivivusService,
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
  sidebarProvider: RedivivusSidebarProvider,
  refreshAll: () => void,
  githubBackupService: GitHubBackupService,
  guardianService: GuardianService,
  _suppressNextFolderAdd: { value: boolean },
): void {
  // ── register commands ──
  try {   registerInitCommands(context, redivivusService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerInitCommands(context, redivivusService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerInitCommands(context, redivivusService, refreshAll); failed: ' + e + '\n'); }
  try {   registerSessionCommands(context, redivivusService, sessionService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerSessionCommands(context, redivivusService, sessionService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerSessionCommands(context, redivivusService, sessionService, refreshAll); failed: ' + e + '\n'); }
  try {   registerBlueprintCommands(context, redivivusService, blueprintService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerBlueprintCommands(context, redivivusService, blueprintService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerBlueprintCommands(context, redivivusService, blueprintService, refreshAll); failed: ' + e + '\n'); }
  try {   registerAnalysisCommands(context, redivivusService, analyzerService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerAnalysisCommands(context, redivivusService, analyzerService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerAnalysisCommands(context, redivivusService, analyzerService, refreshAll); failed: ' + e + '\n'); }
  try {   registerReviewCommands(context, redivivusService, routingService, changeTracker); } catch (e) { console.error('Failed to register ' + 'registerReviewCommands(context, redivivusService, routingService, changeTracker);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerReviewCommands(context, redivivusService, routingService, changeTracker); failed: ' + e + '\n'); }
  try {   registerRestructureCommands(context, redivivusService, routingService, measureTwice, changeTracker, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerRestructureCommands(context, redivivusService, routingService, measureTwice, changeTracker, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerRestructureCommands(context, redivivusService, routingService, measureTwice, changeTracker, refreshAll); failed: ' + e + '\n'); }
  try {   registerRetrofitCommands(context, redivivusService, retrofitService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerRetrofitCommands(context, redivivusService, retrofitService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerRetrofitCommands(context, redivivusService, retrofitService, refreshAll); failed: ' + e + '\n'); }
  try {   registerVaultCommands(context, redivivusService, vaultService, routingService, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerVaultCommands(context, redivivusService, vaultService, routingService, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerVaultCommands(context, redivivusService, vaultService, routingService, refreshAll); failed: ' + e + '\n'); }
  try {   registerVaultBrowseCommand(context, vaultService); } catch (e) { console.error('Failed to register ' + 'registerVaultBrowseCommand(context, vaultService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerVaultBrowseCommand(context, vaultService); failed: ' + e + '\n'); }
  try {   registerVaultTranslateCommand(context, vaultService, routingService); } catch (e) { console.error('Failed to register ' + 'registerVaultTranslateCommand(context, vaultService, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerVaultTranslateCommand(context, vaultService, routingService); failed: ' + e + '\n'); }
  try { const { BuildFromVaultService } = require('./features/vault/data/buildFromVaultService.js'); registerBuildFromVaultCommand(context, new BuildFromVaultService(vaultService, routingService)); } catch (e) { console.error('Failed to register buildFromVault', e); }
  
  // [DONE] vaultDedup inline handler moved to commands/vaultDedup.ts (Rule 9 split)
  try { registerVaultDedupCommand(context, redivivusService, routingService, usageTracker, vaultService); } catch (e) { console.error('Failed to register vaultDedup command', e); }
  try {   registerApiSetupCommand(context); } catch (e) { console.error('Failed to register ' + 'registerApiSetupCommand(context);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerApiSetupCommand(context); failed: ' + e + '\n'); }
  try {   registerUsageCommands(context, usageTracker, routingService); } catch (e) { console.error('Failed to register ' + 'registerUsageCommands(context, usageTracker, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerUsageCommands(context, usageTracker, routingService); failed: ' + e + '\n'); }
  try {   registerSetupProgressCommand(context, redivivusService); } catch (e) { console.error('Failed to register ' + 'registerSetupProgressCommand(context, redivivusService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerSetupProgressCommand(context, redivivusService); failed: ' + e + '\n'); }
  try {   registerSelectionCommands(context, redivivusService, routingService, usageTracker, vaultService); } catch (e) { console.error('Failed to register ' + 'registerSelectionCommands(context, redivivusService, routingService, usageTracker, vaultService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerSelectionCommands(context, redivivusService, routingService, usageTracker, vaultService); failed: ' + e + '\n'); }
  try {   registerTimelineCommand(context, redivivusService); } catch (e) { console.error('Failed to register ' + 'registerTimelineCommand(context, redivivusService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerTimelineCommand(context, redivivusService); failed: ' + e + '\n'); }
  try {   registerLoggingCommands(context, redivivusService); } catch (e) { console.error('Failed to register ' + 'registerLoggingCommands(context, redivivusService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerLoggingCommands(context, redivivusService); failed: ' + e + '\n'); }
  try {   registerSavePointCommand(context); } catch (e) { console.error('Failed to register ' + 'registerSavePointCommand(context);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerSavePointCommand(context); failed: ' + e + '\n'); }
  try {   registerOrganizeProjects(context); } catch (e) { console.error('Failed to register registerOrganizeProjects', e); }
  try {   registerFileSplitCommand(context, routingService); } catch (e) { console.error('Failed to register ' + 'registerFileSplitCommand(context, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerFileSplitCommand(context, routingService); failed: ' + e + '\n'); }
  try {   registerRetrofitBlueprintCommand(context, redivivusService, routingService); } catch (e) { console.error('Failed to register ' + 'registerRetrofitBlueprintCommand(context, redivivusService, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerRetrofitBlueprintCommand(context, redivivusService, routingService); failed: ' + e + '\n'); }
  try {   registerScopeCreepCommand(context, redivivusService, routingService); } catch (e) { console.error('Failed to register ' + 'registerScopeCreepCommand(context, redivivusService, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerScopeCreepCommand(context, redivivusService, routingService); failed: ' + e + '\n'); }
  try {   registerDuplicateCodeCommand(context, routingService); } catch (e) { console.error('Failed to register ' + 'registerDuplicateCodeCommand(context, routingService);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerDuplicateCodeCommand(context, routingService); failed: ' + e + '\n'); }
  try {   registerMiscCommands(context, redivivusService, sessionService, guideService, rulesService, null as any, refreshAll); } catch (e) { console.error('Failed to register ' + 'registerMiscCommands(context, redivivusService, sessionService, guideService, rulesService, null as any, refreshAll);', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerMiscCommands(context, redivivusService, sessionService, guideService, rulesService, null as any, refreshAll); failed: ' + e + '\n'); }

  // [DONE] closeProject inline handler moved to commands/closeProject.ts (Rule 9 split)
  try { registerCloseProjectCommand(context); } catch (e) { console.error('Failed to register closeProject command', e); }

  // [FIX] registerInlineCommands was the only registration NOT wrapped in try/catch.
  // If it throws (e.g. terminalErrorService setup, inline command init), signIn and reportIssue
  // were silently never registered. Now wrapped like every other registration.
  try { registerInlineCommands(context, redivivusService, routingService, usageTracker, vaultService, statusBar, refreshAll, githubBackupService, guardianService, _suppressNextFolderAdd); } catch (e) { console.error('Failed to register inline commands', e); require('fs').appendFileSync('/tmp/redivivus_activation_errors.log', 'registerInlineCommands failed: ' + e + '\n'); }
  try { registerSignInCommand(context, statusBar); } catch (e) { console.error('Failed to register signIn command', e); }
  try { registerReportIssueCommand(context, routingService); } catch (e) { console.error('Failed to register reportIssue command', e); }
  try {
    context.subscriptions.push(vscode.commands.registerCommand('redivivus.changePersonality', () =>
      import('./features/settings/logic/personalityPicker.js').then(m => m.pickPersonality())
    ));
  } catch (e) { console.error('Failed to register changePersonality command', e); }
  try { registerCheckForUpdatesCommand(context); } catch (e) { console.error('Failed to register checkForUpdates command', e); }
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new DelegationCodeLensProvider()));

  // Build Activity panel — reopen on demand (Command Palette / button). Reveals a running build's panel,
  // or replays the LAST build's timeline if the tab was closed. Lets the user review the pipeline anytime.
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.showBuildActivity', async () => {
    const { BuildActivityPanel } = await import('./features/chat/ui/buildActivity/buildActivityPanel.js');
    BuildActivityPanel.reveal();
  }));

  // Blueprint Interview
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.blueprintInterview', () => {
    openBlueprintPanel(context, redivivusService, routingService);
  }));

  // Clear provider quota blocks — lets users unblock a provider after topping up credits or after a rate-limit
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.clearProviderQuota', async () => {
    const { getAllQuotaStates, clearProviderQuota, formatUsageSummary } = await import('./features/ai/data/providerQuotaTracker.js');
    const states = getAllQuotaStates();
    const now = Date.now();
    const blocked = Object.entries(states).filter(([, st]) =>
      (st.skipUntilMs && now < st.skipUntilMs) || (st.unavailableUntilMs && now < st.unavailableUntilMs)
    );
    if (blocked.length === 0) {
      vscode.window.showInformationMessage('No AI providers are currently blocked.');
      return;
    }
    const items = [
      { label: 'Clear ALL provider blocks', provider: undefined },
      ...blocked.map(([p, st]) => {
        const reason = (st.skipUntilMs && now < st.skipUntilMs) ? st.skipReason : st.unavailableReason;
        const usage = formatUsageSummary(p);
        return { label: p, description: reason ?? 'blocked', detail: usage ?? undefined, provider: p };
      }),
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select provider to unblock' });
    if (!pick) { return; }
    clearProviderQuota(pick.provider);
    const msg = pick.provider ? `${pick.provider} quota block cleared.` : 'All provider quota blocks cleared.';
    vscode.window.showInformationMessage(msg);
  }));

  // [DONE] compileProject inline handler moved to commands/compileProject.ts (Rule 9 split)
  try { registerCompileProjectCommand(context); } catch (e) { console.error('Failed to register compileProject command', e); }

  // Register deep link handler
  registerAuthHandler(context, statusBar);
  // Initialize per-layer Output Channels — must be last so all services are set up first
  try { initOutputChannels(); } catch { /* non-blocking */ }
}
