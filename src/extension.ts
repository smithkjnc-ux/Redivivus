// [SCOPE] CHASSIS extension entry — thin orchestrator

import * as vscode from 'vscode';
import { ChassisService } from './services/chassisService.js';
import { BlueprintService } from './services/blueprintService.js';
import { SessionService } from './services/sessionService.js';
import { RulesService } from './services/rulesService.js';
import { ChangeTracker } from './services/changeTracker.js';
import { MeasureTwiceService } from './services/measureTwiceService.js';
import { ChassisWebviewProvider } from './ui/chassisWebviewProvider.js';
import { WizardService } from './services/wizardService.js';
import { RetrofitService } from './services/retrofitService.js';
import { RoutingService } from './services/routingService.js';
import { GuideService } from './services/guideService.js';
import { AnalyzerService } from './services/analyzerService.js';
import { AnnotationService } from './services/annotationService.js';
import { VaultService } from './services/vaultService.js';
import { VaultContextService } from './services/vaultContextService.js';
import { BuildFromVaultService } from './services/buildFromVaultService.js';
import { StatusBar } from './ui/statusBar.js';

import { registerInitCommands, runAutoInit } from './commands/init.js';
import { registerSessionCommands } from './commands/session.js';
import { registerBlueprintCommands } from './commands/blueprint.js';
import { registerAnalysisCommands } from './commands/analysis.js';
import { registerReviewCommands } from './commands/review.js';
import { registerRestructureCommands } from './commands/restructure.js';
import { registerRetrofitCommands } from './commands/retrofit.js';
import { registerVaultCommands } from './commands/vault.js';
import { registerBuildFromVaultCommand } from './commands/buildFromVault.js';
import { registerMiscCommands } from './commands/misc.js';

export function activate(context: vscode.ExtensionContext) {
  console.log('[CHASSIS] Activating...');

  // ── init services ──
  // [WARN] This block initializes all core services. The order and dependencies are critical for the extension's functionality.
  const chassisService = new ChassisService();
  const blueprintService = new BlueprintService(chassisService);
  const sessionService = new SessionService(chassisService);
  const annotationService = new AnnotationService();
  const analyzerService = new AnalyzerService(chassisService);
  const guideService = new GuideService(chassisService, sessionService);
  const routingService = new RoutingService();
  const measureTwice = new MeasureTwiceService();
  const changeTracker = new ChangeTracker(chassisService);
  const rulesService = new RulesService(chassisService);
  const vaultService = new VaultService(context);
  const vaultContextService = new VaultContextService(vaultService);
  routingService.setVaultContextService(vaultContextService);
  const buildFromVaultService = new BuildFromVaultService(vaultService, routingService);
  const retrofitService = new RetrofitService(chassisService, routingService, measureTwice, changeTracker, analyzerService);
  const wizardService = new WizardService(chassisService, sessionService);
  const chassisProvider = new ChassisWebviewProvider(chassisService, sessionService, context);
  const statusBar = new StatusBar(chassisService, sessionService);

  // ── set initial context ──
  vscode.commands.executeCommand('setContext', 'chassis.initialized', chassisService.isInitialized());
  vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);

  // ── activate subsystems ──
  annotationService.activate(context);
  statusBar.activate(context);

  // ── sidebar webview ──
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChassisWebviewProvider.viewType, chassisProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // ── shared refresh helper ──
  function refreshAll() {
    statusBar.update();
    chassisProvider.refresh();
  }

  // ── auto-init after folder-picker reload ──
  // [WARN] This function handles critical auto-initialization logic, especially important after VS Code reloads or workspace changes.
  runAutoInit(context, chassisService, refreshAll);

  // ── register commands ──
  registerInitCommands(context, chassisService, refreshAll);
  registerSessionCommands(context, chassisService, sessionService, refreshAll);
  registerBlueprintCommands(context, chassisService, blueprintService, refreshAll);
  registerAnalysisCommands(context, chassisService, analyzerService, refreshAll);
  registerReviewCommands(context, chassisService, routingService, changeTracker);
  registerRestructureCommands(context, chassisService, routingService, measureTwice, changeTracker, refreshAll);
  registerRetrofitCommands(context, chassisService, retrofitService, refreshAll);
  registerVaultCommands(context, chassisService, vaultService, refreshAll);
  registerBuildFromVaultCommand(context, buildFromVaultService);
  registerMiscCommands(context, chassisService, sessionService, guideService, rulesService, chassisProvider, refreshAll);

  console.log('[CHASSIS] Activated — Phase 1 + Phase 2 + commands split');
}

export function deactivate() {
  console.log('[CHASSIS] Deactivated.');
}