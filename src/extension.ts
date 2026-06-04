// [SCOPE] Redivivus entry point — thin orchestrator

import * as vscode from 'vscode';
import { RedivivusSidebarProvider } from './ui/sidebar/redivivusSidebar.js';
import { seedVault } from './services/vault/vaultSeeder.js';
import { RedivivusService } from './services/redivivusService.js';
import { BlueprintService } from './services/blueprint/blueprintService.js';
import { SessionService } from './services/sessionService.js';
import { RulesService } from './services/rulesService.js';
import { ChangeTracker } from './services/build/changeTracker.js';
import { MeasureTwiceService } from './services/build/measureTwiceService.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';
import { WizardService } from './ui/panels/wizard/wizardService';
import { RetrofitService } from './core/retrofit/retrofitService';
import { RoutingService } from './services/ai/routingService.js';
import { GuideService } from './services/guideService.js';
import { AnalyzerService } from './ui/panels/analyzer/analyzerService';
import { AnnotationService } from './services/annotationService.js';
import { VaultService } from './services/vault/vaultService.js';
import { VaultContextService } from './services/vault/vaultContextService.js';
import { BuildFromVaultService } from './services/vault/buildFromVaultService.js';
import { StatusBar } from './ui/views/statusBar.js';
import { UsageTracker } from './services/usageTracker.js';
import { GuardianService } from './services/ai/guardianService.js';
import { GitHubBackupService } from './services/githubBackupService.js';
import { runDiagnostic } from './core/diagnostics/selfDiagnostic';

import { runAutoInit, registerOnNewProject } from './commands/init.js';
import { registerAllCommands } from './extensionCommands.js';
import { initApiClient } from './services/api/apiClient.js';
import { resumePendingState } from './extensionResumeState.js';
import { initRedivivusLogger, redivivusLog, finalizeRedivivusLogger } from './services/logging/redivivusLogger.js';
import { initProjectContextLogger, resetProjectContext } from './services/logging/projectContextLogger.js';
import { wasProjectClosedRecently } from './services/project/closeMarker.js';
import { initMasterLogger } from './core/logging/masterLogger.js';

// [WARN] Synchronous suppress flag — set BEFORE updateWorkspaceFolders fires onDidChangeWorkspaceFolders.
// globalState.update() is async and loses the race against the folder-change event, causing a duplicate panel.
let _suppressNextFolderAdd = false;

export function activate(context: vscode.ExtensionContext) {
  console.log('[Redivivus] Activating...');
  ChatPanel.extensionContext = context;
  initApiClient(context);

  // [FIX] Suppress "Do you want to save workspace configuration?" dialog for untitled workspaces.
  // window.confirmSaveUntitledWorkspace=false is the exact setting the "Always discard" checkbox sets.
  // Set once on activation so it is always in place before any close attempt, avoiding the IPC race.
  vscode.workspace.getConfiguration().update('window.confirmSaveUntitledWorkspace', false, vscode.ConfigurationTarget.Global).then(() => {}, () => {});

  // ── init services ──
  // [WARN] This block initializes all core services. The order and dependencies are critical for the extension's functionality.
  const redivivusService = new RedivivusService();
  const blueprintService = new BlueprintService(redivivusService);
  const sessionService = new SessionService(redivivusService);
  const annotationService = new AnnotationService();
  const analyzerService = new AnalyzerService(redivivusService);
  const guideService = new GuideService(redivivusService, sessionService);
  const routingService = new RoutingService();
  const measureTwice = new MeasureTwiceService();
  const changeTracker = new ChangeTracker(redivivusService);
  const rulesService = new RulesService(redivivusService);
  const vaultService = new VaultService(context);
  const vaultContextService = new VaultContextService(vaultService);
  routingService.setVaultContextService(vaultContextService);
  const buildFromVaultService = new BuildFromVaultService(vaultService, routingService);
  const retrofitService = new RetrofitService(redivivusService, routingService, measureTwice, changeTracker, analyzerService);
  const wizardService = new WizardService(redivivusService, sessionService);
  const usageTracker = new UsageTracker(context);
  const guardianService = new GuardianService(redivivusService);
  const statusBar = new StatusBar(redivivusService, sessionService, usageTracker);

  // ── Vault seeding — runs on first install, seeds starter patterns ──
  const seededKey = 'redivivus.vaultSeeded.v1';
  if (!context.globalState.get(seededKey)) {
    setTimeout(async () => {
      try {
        const result = await seedVault(vaultService, { useGitHub: false });
        if (result.added > 0) {
          vscode.window.showInformationMessage(`Redivivus: Loaded ${result.added} starter patterns into your vault.`);
        }
        context.globalState.update(seededKey, true);
      } catch { /* never block extension over seeding failure */ }
    }, 3000);
  }

  // [Redivivus] Initialize comprehensive logging and project context tracking
  const initialRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (initialRoot) {
    try {
      const sessionId = initRedivivusLogger(initialRoot);
      redivivusLog({ operation: 'system', message: 'Redivivus extension activated', data: { root: initialRoot, sessionId } });
      initMasterLogger(initialRoot);
    } catch (e) {
      console.error('[Redivivus] Logger init failed:', e);
    }
    try {
      initProjectContextLogger(initialRoot);
    } catch (e) {
      console.error('[Redivivus] Project context logger init failed:', e);
    }
  }

  // ── set initial context ──
  vscode.commands.executeCommand('setContext', 'redivivus.initialized', redivivusService.isInitialized());
  vscode.commands.executeCommand('setContext', 'redivivus.sessionActive', false);

  // ── suppress VSCodium welcome page and multi-window restore — set once if uncustomized ──
  const wbCfg = vscode.workspace.getConfiguration('workbench');
  const winCfg = vscode.workspace.getConfiguration('window');
  const startupEditorInspect = wbCfg.inspect('startupEditor');
  const restoreWindowsInspect = winCfg.inspect('restoreWindows');
  if (!startupEditorInspect?.globalValue && !startupEditorInspect?.workspaceValue) {
    wbCfg.update('startupEditor', 'none', vscode.ConfigurationTarget.Global);
  }
  if (!restoreWindowsInspect?.globalValue && !restoreWindowsInspect?.workspaceValue) {
    winCfg.update('restoreWindows', 'one', vscode.ConfigurationTarget.Global);
  }

  // ── activate subsystems ──
  annotationService.activate(context);
  statusBar.activate(context);

  // ── sign-in nudge — shown once if no account token found ──
  const nudgeKey = 'redivivus.signInNudged.v1';
  setTimeout(async () => {
    try {
      const { getAccountToken } = await import('./services/api/apiClient.js');
      const token = await getAccountToken();
      if (!token && !context.globalState.get(nudgeKey)) {
        context.globalState.update(nudgeKey, true);
        const choice = await vscode.window.showInformationMessage(
          'Connect your Redivivus account to enable cloud features and usage analytics.',
          'Sign In', 'Dismiss'
        );
        if (choice === 'Sign In') { vscode.commands.executeCommand('redivivus.signIn'); }
      }
    } catch { /* never block over nudge failure */ }
  }, 5_000);

  // ── update check — runs once per day, 10s after startup, non-blocking ──
  const UPDATE_CHECK_KEY = 'redivivus.lastUpdateCheck';
  setTimeout(async () => {
    try {
      const last = context.globalState.get<number>(UPDATE_CHECK_KEY, 0);
      if (Date.now() - last < 24 * 60 * 60 * 1000) { return; }
      context.globalState.update(UPDATE_CHECK_KEY, Date.now());

      const pkg = require('../package.json');
      const currentVersion: string = pkg.version;
      const cfg = vscode.workspace.getConfiguration('redivivus');
      const apiBase = cfg.get<string>('apiBase') || 'https://redivivus-backend.fly.dev';
      const webBase = apiBase.replace('/api/v1', '');
      const res = await fetch(`${webBase}/api/version`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) { return; }
      const { version: latestVersion, downloadUrl } = await res.json() as { version: string; downloadUrl?: string };
      if (!latestVersion || latestVersion === currentVersion) { return; }

      statusBar.showUpdateAvailable(latestVersion);

      const choice = await vscode.window.showInformationMessage(
        `Redivivus v${latestVersion} is available (you have v${currentVersion}).`,
        'Update Now', 'Later'
      );
      if (choice === 'Update Now') {
        const { runUpdate } = await import('./commands/checkForUpdates.js');
        await runUpdate(latestVersion, downloadUrl ?? `https://github.com/smithkjnc-ux/Redivivus/releases/latest/download/redivivus-${latestVersion}.tar.gz`);
      }
    } catch { /* never block extension over update check failure */ }
  }, 10_000);

  // ── dispose stale chat panel when workspace closes ──
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      if (e.removed.length > 0 && e.added.length === 0) {
        // [FIX] Don't close+reopen — that creates a duplicate tab. Instead, refresh the existing
        // panel in-place so it transitions to the launcher view. Close only if no panel exists.
        if (ChatPanel.currentPanel) {
          (ChatPanel.currentPanel as any).state.conversation = [];
          (ChatPanel.currentPanel as any)._initialized = false;
          ChatPanel.currentPanel.refresh();
        }
        // [LOG] Finalize logging when workspace closes
        finalizeRedivivusLogger(true);
        // [FIX] Clear project-context latch so a later project isn't blocked as an illegal switch.
        resetProjectContext();
      } else if (e.added.length > 0) {
        // New folder added externally (not by onNewProject) — trigger init
        // onNewProject handles its own init inline; this only fires for external folder additions
        // [WARN] Check synchronous flag FIRST — globalState.update is async and loses the race
        if (_suppressNextFolderAdd) {
          _suppressNextFolderAdd = false;
          context.globalState.update('redivivus.suppressAutoOpen', undefined);
        } else {
          const suppressPath = context.globalState.get<string>('redivivus.suppressAutoOpen');
          if (!suppressPath) {
            setTimeout(() => runAutoInit(context, redivivusService, () => statusBar.update()), 300);
          } else {
            context.globalState.update('redivivus.suppressAutoOpen', undefined);
          }
        }
        // [LOG] Initialize logging for new workspace
        const addedRoot = e.added[0]?.uri.fsPath;
        if (addedRoot) {
          const sessionId = initRedivivusLogger(addedRoot);
          redivivusLog({ operation: 'system', message: 'Workspace opened', data: { root: addedRoot, sessionId } });
          // [FIX] Re-point the project-context latch to the newly opened workspace so the panel/build
          // follows it instead of staying stuck on the previous project.
          resetProjectContext();
          initProjectContextLogger(addedRoot);
        }
      }
    })
  );

  // ── resume state after folder close/reload (build task, vault build, new project) ──
  resumePendingState(context, [redivivusService, routingService, usageTracker, vaultService]);

  // ── chat panel command ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.openChatPanel', () => ChatPanel.show(redivivusService, routingService, usageTracker, vaultService)));
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.refreshChat', () => ChatPanel.currentPanel?.refresh()));

  // ── WebviewPanelSerializer — lets VS Code hand back orphaned 'redivivusChat' tabs on re-activation ──
  // Without this, re-activation (triggered by updateWorkspaceFolders removing all folders) leaves the
  // old tab visible but _instance=undefined → auto-open timer sees currentPanel=false → opens a 2nd tab.
  // With this, VS Code calls deserializeWebviewPanel before auto-open fires, so _instance is restored
  // and the auto-open timer sees currentPanel=true → skips creating a duplicate.
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('redivivusChat', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        // [FIX] Idempotent — never create a SECOND instance. Guard at entry AND again after the async
        // import: the auto-open timer fires on a 500ms timer and, if it sees currentPanel=false while
        // we're awaiting the import, it creates a panel — that race produced a duplicate chat tab on
        // EVERY window reload. Re-checking after the await (and not nulling _instance, which only widened
        // the window) means whoever wins the race keeps its panel and the other disposes its orphan.
        if ((ChatPanel as any)._instance) { try { webviewPanel.dispose(); } catch {} return; }
        webviewPanel.webview.options = { enableScripts: true };
        const { ChatPanel: _CP2 } = await import('./ui/panels/chat/chatPanel.js');
        if ((ChatPanel as any)._instance) { try { webviewPanel.dispose(); } catch {} return; }
        const panel = new (_CP2 as any)(webviewPanel, redivivusService, routingService, usageTracker, vaultService);
        // If user closed the project, clear conversation and force launcher view
        // [FIX] Prefer the synchronous marker (survives the reload) over the async globalState flag,
        // which is unreliable here — without it the restored panel keeps the stale project dashboard.
        const closedByUser = wasProjectClosedRecently() || context.globalState.get<boolean>('redivivus.userClosedProject');
        if (closedByUser) {
          context.globalState.update('redivivus.userClosedProject', undefined);
          if (panel?.state) { panel.state.conversation = []; }
          (panel as any)._initialized = false;
          panel?.refresh?.();
        }
      }
    })
  );

  // ── sidebar view with Redivivus functions ──
  const sidebarProvider = new (RedivivusSidebarProvider as any)(redivivusService, sessionService);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(RedivivusSidebarProvider.viewType, sidebarProvider));

  // ── auto-open chat panel on startup (first activation only) ──
  // Open panel at startup if none is running. suppressAutoOpen only prevents DUPLICATES (currentPanel exists).
  // After a window reload (workspace conversion), currentPanel is null — must open a fresh panel.
  // [WARN] Do NOT skip open when currentPanel=false even if suppressed — that's the post-reload scenario.
  setTimeout(() => {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const suppressPath = context.globalState.get<string>('redivivus.suppressAutoOpen');
    // [FIX] suppress only blocks DUPLICATE panels (currentPanel exists). After a window reload
    // (single→multi-root workspace conversion), currentPanel is null — always open then,
    // otherwise the orphaned pre-reload webview stays visible with stale generic-button header.
    const suppressed = !!(suppressPath && currentRoot && suppressPath === currentRoot);
    if (suppressed) { context.globalState.update('redivivus.suppressAutoOpen', undefined); }
    require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[auto-open-timer] currentPanel=${!!ChatPanel.currentPanel} suppressed=${suppressed} currentRoot=${currentRoot}\n`);
    // [FIX] Prefer the synchronous marker (survives the reload) over the async globalState flag. The
    // async flag lost the race against the reload, so this branch failed to skip and auto-open created
    // a DUPLICATE panel while the serializer restored the orphaned one. Do NOT delete the marker here —
    // it self-expires by recency; deleting would re-open the deserialize/auto-open race.
    const _closedByUser = wasProjectClosedRecently() || context.globalState.get<boolean>('redivivus.userClosedProject');
    if (_closedByUser) {
      context.globalState.update('redivivus.userClosedProject', undefined);
      // Fallback: the serializer (deserializeWebviewPanel) normally restores the one orphaned tab as
      // the launcher. If it didn't fire, open one so a close never leaves ZERO panels. The idempotent
      // guard in deserialize prevents this from racing into a duplicate.
      setTimeout(() => { if (!ChatPanel.currentPanel) { ChatPanel.show(redivivusService, routingService, usageTracker, vaultService); } }, 1200);
    }
    else if (!ChatPanel.currentPanel) { ChatPanel.show(redivivusService, routingService, usageTracker, vaultService); }
  }, 500);

  // ── shared refresh helper ──
  function refreshAll() {
    statusBar.update();
    sidebarProvider.refresh();
  }

  // ── auto-init after folder-picker reload ──
  // [WARN] This function handles critical auto-initialization logic, especially important after VS Code reloads or workspace changes.
  runAutoInit(context, redivivusService, refreshAll);

  // ── always-live onNewProject handler — covers wizard opened via placement modal or any other path ──
  registerOnNewProject(context);

  // ── self-diagnostic command ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.selfDiagnostic', () => runDiagnostic(context, redivivusService)));

  // ── pipeline trace viewer ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.showPipelineTrace', async () => {
    const { tracer } = await import('./services/pipelineTracer.js');
    tracer.show();
  }));

  // ── register all commands ──
  const githubBackupService = new GitHubBackupService(context);
  registerAllCommands(context, redivivusService, routingService, usageTracker, vaultService, measureTwice, changeTracker, analyzerService, rulesService, retrofitService, sessionService, guideService, blueprintService, statusBar, sidebarProvider, refreshAll, githubBackupService, guardianService, { value: _suppressNextFolderAdd });
}

export function deactivate() {
  console.log('[Redivivus] Deactivated');
}
