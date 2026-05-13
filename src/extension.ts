// [SCOPE] CHASSIS entry point — thin orchestrator

import * as vscode from 'vscode';
import { ChassisService } from './services/chassisService.js';
import { BlueprintService } from './services/blueprintService.js';
import { SessionService } from './services/sessionService.js';
import { RulesService } from './services/rulesService.js';
import { ChangeTracker } from './services/changeTracker.js';
import { MeasureTwiceService } from './services/measureTwiceService.js';
import { ChatPanel } from './ui/chatPanel.js';
import { openBlueprintPanel } from './ui/blueprintInterviewPanel.js';
import { ChassisSidebarProvider } from './ui/chassisSidebar.js';
import { WizardService } from './services/wizardService.js';
import { RetrofitService } from './services/retrofitService.js';
import { RoutingService } from './services/routingService.js';
import { GuideService } from './services/guideService.js';
import { AnalyzerService } from './services/analyzerService.js';
import { AnnotationService } from './services/annotationService.js';
import { VaultService } from './services/vaultService.js';
import { RecommendationsPanel } from './services/analyzerPanel.js';
import { VaultContextService } from './services/vaultContextService.js';
import { BuildFromVaultService } from './services/buildFromVaultService.js';
import { StatusBar } from './ui/statusBar.js';
import { UsageTracker } from './services/usageTracker.js';
import { GuardianService } from './services/guardianService.js';
import { seedVault } from './services/vaultSeeder.js';

import { registerInitCommands, runAutoInit, registerOnNewProject } from './commands/init.js';
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
import { GitHubBackupService } from './services/githubBackupService.js';
import { registerGitHubBackupCommands } from './commands/githubBackup.js';
import { registerSetupHubCommand } from './commands/setupHub.js';
import { registerProfileRuntimeCommand } from './commands/profileRuntime.js';
import { registerStartRuntimeAnalysisCommand } from './commands/startRuntimeAnalysis.js';
import { MapPanel } from './ui/mapPanel.js';
import { debugLog } from './services/diagnosticLogger.js';

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

  // ── resume pending task after folder reload ──
  const pendingBuildTask = context.globalState.get<string>('chassis.pendingBuildTask');
  if (pendingBuildTask) {
    context.globalState.update('chassis.pendingBuildTask', undefined);
    setTimeout(async () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 400));
      if (ChatPanel.currentPanel) {
        ChatPanel.currentPanel.showNewProject('', pendingBuildTask, /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingBuildTask));
      }
    }, 800);
  }

  // ── chat panel command ──
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openChatPanel', () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    })
  );

  // ── sidebar view with CHASSIS functions ──
  const sidebarProvider = new ChassisSidebarProvider();
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
  }

  // ── auto-init after folder-picker reload ──
  // [WARN] This function handles critical auto-initialization logic, especially important after VS Code reloads or workspace changes.
  runAutoInit(context, chassisService, refreshAll);

  // ── always-live onNewProject handler — covers wizard opened via placement modal or any other path ──
  registerOnNewProject(context);

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
  try {   registerBuildFromVaultCommand(context, buildFromVaultService); } catch (e) { console.error('Failed to register ' + 'registerBuildFromVaultCommand(context, buildFromVaultService);', e); require('fs').appendFileSync('/tmp/chassis_activation_errors.log', 'registerBuildFromVaultCommand(context, buildFromVaultService); failed: ' + e + '\n'); }
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

  // ── CHASSIS: Refresh Knowledge Base — pull GitHub patterns into vault ──
  context.subscriptions.push(vscode.commands.registerCommand('chassis.refreshKnowledgeBase', async () => {
    const token = vscode.workspace.getConfiguration('chassis').get<string>('githubToken') || undefined;
    const useGitHub = true;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'CHASSIS: Refreshing Knowledge Base...', cancellable: false },
      async (progress) => {
        try {
          const result = await seedVault(vaultService, {
            useGitHub,
            githubToken: token,
            onProgress: (msg) => progress.report({ message: msg }),
          });
          vscode.window.showInformationMessage(
            `CHASSIS: Knowledge Base refreshed — ${result.added} new patterns added (${result.fromGitHub} from GitHub, ${result.fromStarter} starter), ${result.skipped} already present.`
          );
          context.globalState.update('chassis.vaultSeeded.v1', true);
        } catch (e) {
          vscode.window.showErrorMessage(`CHASSIS: Knowledge Base refresh failed — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    );
  }));

  // ── GitHub auto-backup ──
  const githubBackupService = new GitHubBackupService(context);
  try { registerGitHubBackupCommands(context, githubBackupService); } catch (e) { console.error('[CHASSIS] GitHub backup registration failed', e); }
  githubBackupService.startTimer();

  // ── Setup hub — aggregates all global setup, shows on first install ──
  try { registerSetupHubCommand(context, githubBackupService); } catch (e) { console.error('[CHASSIS] Setup hub registration failed', e); }
  // Hook auto-backup to build finish — fires after every successful build if enabled
  ChatPanel.onBuildFinished = async (_task: string, _files: string[]) => {
    const cfg = githubBackupService.getConfig();
    if (cfg.enabled && cfg.autoBackupOnBuild) {
      await githubBackupService.backup();
    }
    // If the built project isn't in the workspace Explorer yet, add it automatically
    const builtRoot = ChatPanel.currentPanel ? (ChatPanel.currentPanel.getChassisRoot?.() || '') : '';
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const alreadyInWs = vscode.workspace.workspaceFolders?.some(f => f.uri.fsPath === builtRoot);
    if (builtRoot && !alreadyInWs) {
      // Build is done — safe to add to workspace now. Set synchronous flag BEFORE updateWorkspaceFolders
      // fires onDidChangeWorkspaceFolders (globalState.update is async and loses the race).
      _suppressNextFolderAdd = true;
      await context.globalState.update('chassis.suppressAutoOpen', builtRoot);
      vscode.workspace.updateWorkspaceFolders(
        vscode.workspace.workspaceFolders?.length ?? 0, 0,
        { uri: vscode.Uri.file(builtRoot) }
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.helpMeRefine', async () => {
      vscode.commands.executeCommand('chassis.postToChat', "I need help refining my idea. Can you ask me some clarifying questions?");
    })
  );

  // [CHASSIS] Global command for Recommendations panel Fix buttons — always goes directly to build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.postToChat', async (text: string) => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      // Small delay to allow panel creation before posting
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text });
      }
    })
  );

  // [CHASSIS] Map "Chat About This" — sends structured node context to chat as Q&A, never triggers build
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.mapContextChat', async (nodeInfo: any) => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'map-context', ...nodeInfo });
      }
    })
  );

  // [CHASSIS] Edit-in-place fix: reads existing file, patches it, saves new vault blocks.
  // Used for TODO and scope (uncommented) fixes — avoids vault search and new file creation.
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.runEditFix', async (task: string, filePath: string | null, issueType: string) => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      // If filePath not passed (Fix All batch), parse from the task prompt
      let resolved = filePath;
      // [WARN] Strip "# CHASSIS Review — " or similar heading prefixes from file paths
      if (resolved) { resolved = resolved.replace(/^#[^:]+[—\-]\s*/, '').trim(); }
      if (!resolved || resolved.startsWith('#')) {
        // Try to extract from the first line of the prompt — handles both direct and batch cases
        // Look for the first occurrence of a filename with extension on the very first line
        const firstLine = task.split('\n')[0];
        const m = firstLine.match(/([a-zA-Z0-9_\-./]+\.(?:ts|js|py|md|json|sh|go|rs|rb|html|css|tsx|jsx|yaml|yml|vue|cfg|txt|svelte|c|cpp|h))\b/i);
        resolved = m ? m[1] : null;
      }
      if (!resolved) {
        // Cannot determine target file — fall back to new-file pipeline
        ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
        await new Promise(r => setTimeout(r, 300));
        if (ChatPanel.currentPanel) { await ChatPanel.currentPanel.handleMessage({ type: 'fix-request', text: task }); }
        return;
      }
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'edit-request', filePath: resolved, task, issueType });
      }
    })
  );

  // [CHASSIS] Open the inline 5W new-project form inside the Chat panel (triggered by "Set it up properly" card)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.newProjectChat', async () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
      await new Promise(r => setTimeout(r, 300));
      if (ChatPanel.currentPanel) {
        const pendingTask = ChatPanel.currentPanel.getPendingTask();
        const isSimple = /function|script|snippet|utility|helper|class|method|component|hook|module/i.test(pendingTask);
        ChatPanel.currentPanel.showNewProject('', pendingTask, isSimple);
      }
    })
  );

  // [CHASSIS] "Just build it" — resumes the task stored in _pendingTask without re-asking
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildSimple', async () => {
      if (ChatPanel.currentPanel) {
        await ChatPanel.currentPanel.handleMessage({ type: 'build-simple' });
      }
    })
  );

  // [CHASSIS] Global command to notify the recommendations panel that a fix is complete
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.resolveFix', (task: string, builtFiles?: string[]) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFinished', task, builtFiles });
      }
      // [CHASSIS] Post a plain English completion message to the chat panel
      if (ChatPanel.currentPanel) {
        const fileList = builtFiles && builtFiles.length > 0
          ? '\n\nFiles updated: ' + builtFiles.map(f => `\`${f}\``).join(', ')
          : '';
        const summary = `✅ **Fix complete!** The task is done and your project has been updated.${fileList}\n\nYou can re-run **Scan Project** from the Recommendations panel to see your updated progress.`;
        ChatPanel.currentPanel.handleMessage({ type: 'assistant-message', text: summary });
      }
      // Trigger a project-wide refresh to re-scan files and update the list
      vscode.commands.executeCommand('chassis.refreshAll');
    })
  );

  // [CHASSIS] Notify recommendations panel when a build fails/times out — lets Fix All advance past stuck items
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.buildFailed', (task: string, reason: string) => {
      if (RecommendationsPanel.currentPanel) {
        RecommendationsPanel.currentPanel.postMessage({ type: 'buildFailed', task, reason });
      }
    })
  );

  // [CHASSIS] Phase 4 — Architecture Map: close Chat first so Map gets the full editor width
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.showMap', () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      const projectName = chassisService.loadConfig()?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'Project';
      debugLog(root, 'showMap', `fired — root: ${root}, project: ${projectName}`);
      // [WARN] Defer close+open to next tick — disposing panel mid-handler can swallow MapPanel.show()
      setTimeout(() => {
        debugLog(root, 'showMap', 'setTimeout fired — closing chat, opening MapPanel');
        ChatPanel.close();
        MapPanel.show(root, guardianService, projectName);
        debugLog(root, 'showMap', 'MapPanel.show() returned');
      }, 0);
    })
  );

  // [CHASSIS] Opens or reveals the chat panel — used by MapPanel back-to-chat button
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openChat', () => {
      ChatPanel.show(chassisService, routingService, usageTracker, vaultService);
    })
  );

  // [CHASSIS] Blueprint Interview — opens as a dedicated full-width panel in ViewColumn.One
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.blueprintInterview', () => {
      openBlueprintPanel(context, chassisService, routingService);
    })
  );

  // [CHASSIS] Register the refreshAll command formally
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.refreshAll', () => {
      refreshAll();
    })
  );

  // [CHASSIS] Register chassis.profileRuntime — Project Runtime Profiler
  try {
    registerProfileRuntimeCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[CHASSIS] Failed to register chassis.profileRuntime', e); }

  // [CHASSIS] Register chassis.startRuntimeAnalysis — Runtime Analysis Engine
  try {
    registerStartRuntimeAnalysisCommand(context, chassisService, routingService, usageTracker, vaultService);
  } catch (e) { console.error('[CHASSIS] Failed to register chassis.startRuntimeAnalysis', e); }

  // [TODO] chassis.startExpandedInterview — full expanded interview not yet built.
  //        Wired to chassis.wizardRetrofit as a temporary fallback so the action
  //        card in handleDeepBuild doesn't silently fail.
  //        Replace with the real expanded interview flow when implemented.
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startExpandedInterview', async () => {
      await vscode.commands.executeCommand('chassis.wizardRetrofit');
    })
  );

  require('fs').writeFileSync('/tmp/chassis_activated.log', 'Activated successfully at ' + new Date().toISOString() + '\n');
  console.log('[CHASSIS] Activated — Phase 1 + Phase 2 + commands split');
}

export function deactivate() {
  console.log('[CHASSIS] Deactivated.');
}