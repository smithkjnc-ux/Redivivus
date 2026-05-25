// [SCOPE] Redivivus Misc commands — git auto-commit

import * as vscode from 'vscode';
import type { RedivivusService } from '../services/redivivusService.js';
import { SessionService } from '../services/sessionService.js';

export function registerGitCommands(context: vscode.ExtensionContext, redivivus: RedivivusService): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.autoCommit', async () => {
      const config = redivivus.loadConfig();
      if (!config) { vscode.window.showErrorMessage('Redivivus not initialized'); return; }
      const mode = config.autoCommit || 'prompt';
      if (mode === 'off') { vscode.window.showInformationMessage('Auto-commit is off. Commit manually.'); return; }

      const { execSync } = require('child_process');
      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      try {
        const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd });
        if (!status.trim()) { vscode.window.showInformationMessage('No changes to commit.'); return; }
      } catch (e) {
        vscode.window.showErrorMessage('Git check failed: ' + (e as Error).message); return;
      }

      const timestamp = new Date().toISOString();
      const sessionService = new SessionService(redivivus);
      const sessionGoal = sessionService.isActive ? sessionService.session?.goal || 'no session' : 'no session';
      const commitMessage = `Redivivus checkpoint: ${timestamp} — ${sessionGoal}`;

      if (mode === 'auto') {
        try {
          execSync(`git add -A`, { cwd });
          execSync(`git commit -m "${commitMessage}"`, { cwd });
          vscode.window.showInformationMessage('Auto-committed successfully.');
        } catch (e) { vscode.window.showErrorMessage('Auto-commit failed: ' + (e as Error).message); }
      } else if (mode === 'prompt') {
        const result = await vscode.window.showInputBox({ prompt: 'Commit message (Redivivus checkpoint)', value: commitMessage, ignoreFocusOut: true });
        if (result) {
          try {
            execSync(`git add -A`, { cwd });
            execSync(`git commit -m "${result}"`, { cwd });
            vscode.window.showInformationMessage('Committed successfully.');
          } catch (e) { vscode.window.showErrorMessage('Commit failed: ' + (e as Error).message); }
        }
      }
    })
  );
}
