// [SCOPE] Redivivus entry point — thin orchestrator

import * as vscode from 'vscode';
import { RedivivusSidebarProvider } from './ui/sidebar/redivivusSidebar.js';
import { ProjectFilesProvider } from './ui/sidebar/projectFilesProvider.js';
import { ChatPanel } from './ui/panels/chat/chatPanel';
import { runDiagnostic } from './core/diagnostics/selfDiagnostic';
import { initExtensionServices } from './extensionServices';
import { registerWorkspaceFolderListener } from './extensionWorkspaceListener';
import { registerPanelSerializer, scheduleAutoOpenPanel } from './extensionPanelSetup';

import { runAutoInit, registerOnNewProject } from './commands/init.js';
import { registerAllCommands } from './extensionCommands.js';
import { initApiClient } from './services/api/apiClient.js';
import { logSessionStart } from './services/api/apiClientTelemetry.js';
import { initSecretKeyStore, onSecretKeyStoreReady } from './services/ai/secretKeyStore.js';
import { resumePendingState } from './extensionResumeState.js';
import { initRedivivusLogger, redivivusLog, finalizeRedivivusLogger } from './services/logging/redivivusLogger.js';
import { initProjectContextLogger, resetProjectContext } from './services/logging/projectContextLogger.js';
import { wasProjectClosedRecently } from './services/project/closeMarker.js';
import { ensureProjectsWorkspace } from './core/project/ensureProjectsWorkspace.js';
import { registerActiveProjectWatcher } from './core/project/activeProjectWatcher.js';
import { registerProjectFolderDecorations } from './core/project/projectFolderDecorations.js';
import { invalidateRosterCache } from './services/ai/routingServiceRoster.js';
import { initMasterLogger } from './core/logging/masterLogger.js';

// [WARN] Synchronous suppress flag — set BEFORE updateWorkspaceFolders fires onDidChangeWorkspaceFolders.
// globalState.update() is async and loses the race against the folder-change event, causing a duplicate panel.
let _suppressNextFolderAdd = false;

export function activate(context: vscode.ExtensionContext) {
  console.log('[Redivivus] Activating...');
  // Auto-focus Redivivus view on first launch
  if (!context.globalState.get('redivivus.hasLaunched')) {
    vscode.commands.executeCommand('workbench.view.extension.redivivusView');
    context.globalState.update('redivivus.hasLaunched', true);
  }
  ChatPanel.extensionContext = context;
  // [Model A] Establish ~/projects as the workspace root on first run (projects are subfolders; no
  // mid-build host reload). One-time + idle; no-op after the first establish. See ensureProjectsWorkspace.
  ensureProjectsWorkspace(context);
  initApiClient(context);
  // [FIX] After init resolves, invalidate the roster cache and re-render the panel — the panel
  // auto-opens at 500ms and reads the roster BEFORE SecretStorage finishes, so the badge shows
  // a stale pre-init value (Gemini +2). Refreshing here gives it the real key set (Claude +5).
  initSecretKeyStore(context)
    .catch(err => console.error('[Redivivus] Init failed:', err));
  onSecretKeyStoreReady(() => {
    invalidateRosterCache();
    // [FIX] Session heartbeat — records IDE version + configured providers now that keys are loaded, so the
    // admin dashboard reliably shows each user's IDE Version (was "—" because normal usage never sent it).
    logSessionStart();
    // [FIX] currentPanel may be the deserializer sentinel (no .refresh) or not yet constructed.
    // Poll until a real panel with refresh() is available, then update the badge.
    const tryRefresh = () => {
      const p = ChatPanel.currentPanel as any;
      if (p && typeof p.refresh === 'function') { p.refresh(); }
      else if (!p) { /* panel not open — nothing to refresh */ }
      else { setTimeout(tryRefresh, 150); }
    };
    tryRefresh();
  });

  // [FIX] Suppress "Do you want to save workspace configuration?" dialog for untitled workspaces.
  // window.confirmSaveUntitledWorkspace=false is the exact setting the "Always discard" checkbox sets.
  // Set once on activation so it is always in place before any close attempt, avoiding the IPC race.
  vscode.workspace.getConfiguration().update('window.confirmSaveUntitledWorkspace', false, vscode.ConfigurationTarget.Global).then(() => {}, () => {});

  // ── init services ──
  const { redivivusService, blueprintService, sessionService, annotationService, analyzerService, guideService, routingService, measureTwice, changeTracker, rulesService, vaultService, buildFromVaultService, retrofitService, wizardService, usageTracker, guardianService, statusBar, githubBackupService } = initExtensionServices(context);

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

  // ── update check — 1-hour cooldown + snooze, 10s after startup, non-blocking ──
  setTimeout(async () => {
    const { runStartupUpdateCheck } = await import('./commands/checkForUpdates.js');
    await runStartupUpdateCheck(context, statusBar);
  }, 10_000);

  // ── dispose stale chat panel when workspace closes ──
  registerWorkspaceFolderListener(context, redivivusService, statusBar);

  // ── resume state after folder close/reload (build task, vault build, new project) ──
  resumePendingState(context, [redivivusService, routingService, usageTracker, vaultService]);

  // ── chat panel command ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.openChatPanel', () => ChatPanel.show(redivivusService, routingService, usageTracker, vaultService)));
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.refreshChat', () => ChatPanel.currentPanel?.refresh()));

  // ── Add to Phone (installable PWA) ──
  context.subscriptions.push(vscode.commands.registerCommand('redivivus.addToPhone', async () => {
    const { handleAddToPhone } = await import('./core/commands/addToPhoneCommand.js');
    await handleAddToPhone();
  }));

  registerPanelSerializer(context, redivivusService, routingService, usageTracker, vaultService);

  // ── sidebar view with Redivivus functions ──
  const sidebarProvider = new (RedivivusSidebarProvider as any)(redivivusService, sessionService);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(RedivivusSidebarProvider.viewType, sidebarProvider));

  // ── Project Files tree — shows the active build's folder from disk (no workspace folder, no reload) ──
  const projectFilesProvider = new ProjectFilesProvider();
  ProjectFilesProvider.instance = projectFilesProvider;
  context.subscriptions.push(vscode.window.registerTreeDataProvider('redivivusProjectFiles', projectFilesProvider));
  // If a workspace folder is already open, seed the tree with it so the view is never empty.
  { const _r = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (_r) { projectFilesProvider.setRoot(_r); } }

  // ── Active-project detection — opening a file in a projects-home subfolder makes it the active project
  //    (chat follows it). Redivivus's own source repos are PROTECTED (skipped) so it never targets itself.
  registerActiveProjectWatcher(context);
  // ── Explorer emphasis — dim the other project folders, badge the active one.
  registerProjectFolderDecorations(context);

  // ── auto-open chat panel on startup ──
  scheduleAutoOpenPanel(context, redivivusService, routingService, usageTracker, vaultService);

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
  registerAllCommands(context, redivivusService, routingService, usageTracker, vaultService, measureTwice, changeTracker, analyzerService, rulesService, retrofitService, sessionService, guideService, blueprintService, statusBar, sidebarProvider, refreshAll, githubBackupService, guardianService, { value: _suppressNextFolderAdd });
}

export function deactivate() {
  console.log('[Redivivus] Deactivated');
}
