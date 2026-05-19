// [SCOPE] CHASSIS entry point — thin orchestrator

import * as vscode from 'vscode';
import { ChassisSidebarProvider } from './ui/sidebar/chassisSidebar.js';
import { seedVault } from './services/vault/vaultSeeder.js';
import { ChassisService } from './services/chassisService.js';
import { BlueprintService } from './services/blueprint/blueprintService.js';
import { SessionService } from './services/sessionService.js';
import { RulesService } from './services/rulesService.js';
import { ChangeTracker } from './services/build/changeTracker.js';
import { MeasureTwiceService } from './services/build/measureTwiceService.js';
import { ChatPanel } from './ui/chat/chatPanel.js';
import { WizardService } from './services/wizardService.js';
import { RetrofitService } from './services/retrofitService.js';
import { RoutingService } from './services/ai/routingService.js';
import { GuideService } from './services/guideService.js';
import { AnalyzerService } from './services/analyzerService.js';
import { AnnotationService } from './services/annotationService.js';
import { VaultService } from './services/vault/vaultService.js';
import { VaultContextService } from './services/vault/vaultContextService.js';
import { BuildFromVaultService } from './services/vault/buildFromVaultService.js';
import { StatusBar } from './ui/views/statusBar.js';
import { UsageTracker } from './services/usageTracker.js';
import { GuardianService } from './services/ai/guardianService.js';
import { GitHubBackupService } from './services/githubBackupService.js';
import { runDiagnostic } from './services/selfDiagnostic.js';

import { runAutoInit, registerOnNewProject } from './commands/init.js';
import { registerAllCommands } from './extensionCommands.js';
import { resumePendingState } from './extensionResumeState.js';

// [WARN] Synchronous suppress flag — set BEFORE updateWorkspaceFolders fires onDidChangeWorkspaceFolders.
// globalState.update() is async and loses the race against the folder-change event, causing a duplicate panel.
let _suppressNextFolderAdd = false;

export function activate(context: vscode.ExtensionContext) {
  console.log('[CHASSIS] Activating...');
  ChatPanel.extensionContext = context;

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
  const usageTracker = new UsageTracker(context);
  const guardianService = new GuardianService(chassisService);
  const statusBar = new StatusBar(chassisService, sessionService, usageTracker);

  // ── Vault seeding — runs on first install, seeds starter patterns ──
  const seededKey = 'chassis.vaultSeeded.v1';
  if (!context.globalState.get(seededKey)) {
    setTimeout(async () => {
      try {
        const result = await seedVault(vaultService, { useGitHub: false });
        if (result.added > 0) {
          vscode.window.showInformationMessage(`CHASSIS: Loaded ${result.added} starter patterns into your vault.`);
        }
        context.globalState.update(seededKey, true);
      } catch { /* never block extension over seeding failure */ }
    }, 3000);
  }

  // ── set initial context ──
  vscode.commands.executeCommand('setContext', 'chassis.initialized', chassisService.isInitialized());
  vscode.commands.executeCommand('setContext', 'chassis.sessionActive', false);

  // ── activate subsystems ──
  annotationService.activate(context);
  statusBar.activate(context);

  // ── dispose stale chat panel when workspace closes ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      if (e.removed.length > 0 && e.added.length === 0) {
        // Only close if the removed folder was the panel's active project (not stale startup cleanup)
        const removedPath = e.removed[0]?.uri.fsPath;
        const panelRoot = ChatPanel.currentPanel?.getChassisRoot?.();
        if (removedPath && panelRoot && removedPath === panelRoot) {
          ChatPanel.close();
        }
      } else if (e.added.length > 0) {
        // New folder added externally (not by onNewProject) — trigger init
        // onNewProject handles its own init inline; this only fires for external folder additions
        // [WARN] Check synchronous flag FIRST — globalState.update is async and loses the race
        if (_suppressNextFolderAdd) {
          _suppressNextFolderAdd = false;
          context.globalState.update('chassis.suppressAutoOpen', undefined);
        } else {
          const suppressPath = context.globalState.get<string>('chassis.suppressAutoOpen');
          if (!suppressPath) {
            setTimeout(() => runAutoInit(context, chassisService, () => statusBar.update()), 300);
          } else {
            context.globalState.update('chassis.suppressAutoOpen', undefined);
          }
        }
      }
    })
  );

  // ── resume state after folder close/reload (build task, vault build, new project) ──
  resumePendingState(context, [chassisService, routingService, usageTracker, vaultService]);

  // ── chat panel command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openChatPanel', () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    })
  );

  // ── sidebar view with CHASSIS functions ──
  const sidebarProvider = new (ChassisSidebarProvider as any)(chassisService, sessionService);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChassisSidebarProvider.viewType, sidebarProvider)
  );

  // ── auto-open chat panel on startup (first activation only) ──
  // Guard: skip if pendingChassisInit is queued — runAutoInit poll will create the panel at the right time
  // Guard: skip if a panel is already open — prevents re-spawn after close-project or folder-swap
  // [WARN] suppressAutoOpen set to currentRoot means this folder was JUST added by a build — don't re-open.
  //        Do NOT require pendingInit to also match — that's a new-project-only condition.
  setTimeout(() => {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const suppressPath = context.globalState.get<string>('chassis.suppressAutoOpen');
    // Suppress if suppressPath matches current root (covers both new-project AND post-build folder add)
    const suppressed = !!(suppressPath && currentRoot && suppressPath === currentRoot);
    if (suppressed) {
      context.globalState.update('chassis.suppressAutoOpen', undefined);
    }
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[auto-open-timer] currentPanel=${!!ChatPanel.currentPanel} suppressed=${suppressed} currentRoot=${currentRoot}\n`);
    if (!ChatPanel.currentPanel && !suppressed) {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    }
  }, 500);

  // ── shared refresh helper ──
  function refreshAll() {
    statusBar.update();
    sidebarProvider.refresh();
  }

  // ── auto-init after folder-picker reload ──
  // [WARN] This function handles critical auto-initialization logic, especially important after VS Code reloads or workspace changes.
  runAutoInit(context, chassisService, refreshAll);

  // ── always-live onNewProject handler — covers wizard opened via placement modal or any other path ──
  registerOnNewProject(context);

  // ── self-diagnostic command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.selfDiagnostic', () => {
      runDiagnostic(context, chassisService);
    })
  );

  // ── pipeline trace viewer ──
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showPipelineTrace', async () => {
      const { tracer } = await import('./services/pipelineTracer.js');
      tracer.show();
    })
  );

  // ── register all commands ──
  const githubBackupService = new GitHubBackupService(context);
  registerAllCommands(context, chassisService, routingService, usageTracker, vaultService, measureTwice, changeTracker, analyzerService, rulesService, retrofitService, sessionService, guideService, blueprintService, statusBar, sidebarProvider, refreshAll, githubBackupService, guardianService, { value: _suppressNextFolderAdd });
}

export function deactivate() {
  console.log('[CHASSIS] Deactivated');
}
