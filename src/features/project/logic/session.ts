// [SCOPE] Redivivus Session commands — start/end workflow with exit interview

import * as vscode from 'vscode';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { SessionService } from './sessionService.js';
import { ChatPanel } from '../../chat/ui/chatPanel.js';
import { buildEvents } from '../../build/services/buildEvents.js';

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  sessions: SessionService,
  refreshAll: () => void
): void {
  // Register callbacks so ChatPanel can call startSession without circular imports
  ChatPanel.onStartSession = async (goal: string, ai: string) => {
    await sessions.startSession(goal, ai);
    refreshAll();
  };
  // [Redivivus] Auto-session: silently start on first message without user prompts
  (ChatPanel as any).startSessionSilent = (goal: string, ai?: string) => {
    sessions.startSessionSilent(goal, ai || 'Redivivus');
    refreshAll();
  };

  // Start Session \u2014 show form inside chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.startSession', async () => {
      if (!redivivus.isInitialized()) {
        vscode.window.showErrorMessage('Run "Redivivus: Initialize Project" first.');
        return;
      }
      if (!ChatPanel.currentPanel) {
        vscode.commands.executeCommand('redivivus.openChatPanel');
        setTimeout(() => ChatPanel.currentPanel?.showStartSession(), 300);
      } else {
        ChatPanel.currentPanel.showStartSession();
      }
    })
  );

  // End Session
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.endSession', async () => {
      // [WARN] This command directly calls endSession without checking if a session is currently active.
      // If endSession expects an active session, this could lead to unexpected behavior or errors.
      await sessions.endSession();
      refreshAll();
    })
  );

  // [FIX] Migrated from ChatPanel.onBuildFinished = fn (overwrite pattern) to buildEvents.on()
  // Each listener registers independently — no more manual chaining or overwrite risk.
  buildEvents.on('build:finished', async (task: string, files: string[], buildRoot?: string) => {
    const root = buildRoot || redivivus.getWorkspaceRoot();
    if (!root) { return; }
    const { SavePointService } = await import('./savePointService.js');
    const svc = new SavePointService(root);
    const description = `Redivivus build: ${task.slice(0, 60)} (${files.length} file${files.length !== 1 ? 's' : ''})`;
    try {
      const result = await svc.create(description);
      if (result.success) { vscode.window.showInformationMessage(`Save point created: ${description}`); }
    } catch { /* non-blocking */ }
    if (sessions.isActive) { sessions.recordChange(files.join(', '), task.slice(0, 80), 'worked', ''); }

    // [AUTO-SETUP] Run a real lightweight scan on first build so setup steps 5+8 complete honestly
    try {
      const cfg = redivivus.loadConfig();
      if (cfg && !cfg.lastScan) {
        const { scanDirectory, buildAnalysis } = await import('../../workspace/logic/analyzerScanner.js');
        const scanFiles: any[] = [];
        scanDirectory(root, root, scanFiles);
        const result = buildAnalysis(scanFiles);
        cfg.lastScan = new Date().toISOString();
        cfg.scanResults = {
          largeFiles: result.largeFiles.map((f: any) => ({ relativePath: f.relativePath, lines: f.lines })),
          todos: result.todoItems.map((t: any) => ({ file: t.file, line: t.line })),
          uncommented: result.uncommentedFiles.map((f: any) => ({ relativePath: f.relativePath, lines: f.lines })),
        };
        redivivus.saveConfig(cfg);
      }
    } catch { /* non-blocking */ }
  });
}