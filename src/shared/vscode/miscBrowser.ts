// [SCOPE] Redivivus Misc commands — browser, project list

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function registerBrowserCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openInBrowser', async (filePath?: string) => {
      const targetPath = filePath || vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!targetPath) { vscode.window.showErrorMessage('No file specified and no active editor.'); return; }
      if (!fs.existsSync(targetPath)) { vscode.window.showErrorMessage(`File not found: ${targetPath}`); return; }
      const uri = vscode.Uri.file(targetPath);
      try { await vscode.commands.executeCommand('simpleBrowser.show', uri.toString()); }
      catch { await vscode.env.openExternal(uri); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.listProjects', async () => {
      const os = require('os');
      const homeDir = os.homedir();
      const projectsDir = path.join(homeDir, 'projects');
      const projects: { name: string; path: string }[] = [];
      const dirsToCheck = [projectsDir, path.join(homeDir, 'Projects'), path.join(homeDir, 'dev'), path.join(homeDir, 'workspace'), path.join(homeDir, 'code'), path.join(homeDir, 'src')];

      for (const dir of dirsToCheck) {
        if (fs.existsSync(dir)) {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                const projectPath = path.join(dir, entry.name);
                if (fs.existsSync(path.join(projectPath, '.redivivus'))) { projects.push({ name: entry.name, path: projectPath }); }
              }
            }
          } catch { /* ignore permission errors */ }
        }
      }

      if (projects.length === 0) { vscode.window.showInformationMessage('No Redivivus projects found. Create one with "Start New Project Setup"'); return; }
      const items = projects.map(p => ({ label: p.name, description: p.path, detail: p.path }));
      const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a Redivivus project to open' });
      if (selected) { const uri = vscode.Uri.file(selected.detail!); vscode.commands.executeCommand('vscode.openFolder', uri); }
    })
  );
}
