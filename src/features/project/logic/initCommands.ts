// [SCOPE] Redivivus Init commands — command registration for init, open project, wizard retrofit

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { RedivivusService } from '../../../shared/vscode/application/redivivusService.js';
import { runNewProjectWizard } from './init.js';

export function registerInitCommands(
  context: vscode.ExtensionContext,
  redivivus: RedivivusService,
  refreshAll: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.init', async () => {
      try {
        const folders = await vscode.window.showOpenDialog({
          canSelectMany: false, canSelectFolders: true, canSelectFiles: false,
          openLabel: 'Select Project Folder',
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        });
        if (!folders || folders.length === 0) { return; }
        const selectedFolder = folders[0].fsPath;

        const folderChoice = await vscode.window.showQuickPick(
          ['Use this folder', 'Create a new subfolder'],
          { placeHolder: 'Initialize in this folder, or create a new subfolder?' }
        );
        if (!folderChoice) { return; }

        let targetFolder = selectedFolder;
        if (folderChoice === 'Create a new subfolder') {
          const subfolderName = await vscode.window.showInputBox({
            prompt: 'Name for the new project folder?', placeHolder: 'e.g., my-new-project', ignoreFocusOut: true,
          });
          if (!subfolderName) { return; }
          targetFolder = path.join(selectedFolder, subfolderName);
          if (!fs.existsSync(targetFolder)) { fs.mkdirSync(targetFolder, { recursive: true }); }
        }

        const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (targetFolder !== currentRoot) {
          const name = await vscode.window.showInputBox({
            prompt: 'Project name?', placeHolder: 'e.g., Do AI Dream, Ryppel, TorqGrid', ignoreFocusOut: true,
          });
          if (!name) { return; }
          await context.globalState.update('pendingRedivivusInit', { folder: targetFolder, name });
          const _ef = vscode.workspace.workspaceFolders || [];
          if (!vscode.workspace.updateWorkspaceFolders(0, _ef.length, { uri: vscode.Uri.file(targetFolder) })) {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetFolder), { forceNewWindow: false });
          }
          return;
        }

        if (redivivus.isInitialized()) {
          const overwrite = await vscode.window.showWarningMessage(
            'Redivivus is already initialized in this project. Re-initialize?', 'Yes', 'No'
          );
          if (overwrite !== 'Yes') { return; }
        }

        const name = await vscode.window.showInputBox({
          prompt: 'Project name?', placeHolder: 'e.g., Do AI Dream, Ryppel, TorqGrid', ignoreFocusOut: true,
        });
        if (!name) { return; }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Redivivus: Setting up project...',
          cancellable: false,
        }, async (progress) => {
          progress.report({ message: 'Creating folders and config...' });
          await redivivus.initProject(name);
          progress.report({ message: 'Generating editor rules...' });
          await vscode.commands.executeCommand('setContext', 'redivivus.initialized', true);
          refreshAll();
        });

        const runBp = await vscode.window.showInformationMessage(
          `Redivivus initialized for "${name}". Run the Blueprint Interview now?`, 'Yes', 'Later'
        );
        if (runBp === 'Yes') { await vscode.commands.executeCommand('redivivus.blueprint'); }
      } catch (err) {
        vscode.window.showErrorMessage('Redivivus init failed: ' + (err as Error).message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.openProject', async (projectName?: string) => {
      if (projectName) {
        const homeDir = require('os').homedir();
        const commonLocations = [`${homeDir}/projects/${projectName}`, `${homeDir}/${projectName}`, `${homeDir}/dev/${projectName}`, `${homeDir}/src/${projectName}`];
        for (const location of commonLocations) {
          if (fs.existsSync(location)) {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(location));
            return;
          }
        }
        vscode.window.showWarningMessage(`Project "${projectName}" not found in common locations. Please select it manually.`);
      }
      const folder = await vscode.window.showOpenDialog({
        canSelectMany: false, canSelectFolders: true, canSelectFiles: false, openLabel: 'Open Project Folder',
      });
      if (folder && folder.length > 0) { await vscode.commands.executeCommand('vscode.openFolder', folder[0]); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.wizardRetrofit', async () => {
      if (redivivus.isInitialized()) {
        const config = redivivus.loadConfig();
        const currentName = config?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'current project';
        const choice = await vscode.window.showInformationMessage(
          `You already have "${currentName}" open. What would you like to do?`,
          { modal: true }, 'Start a Brand New Project', 'Continue With This Project'
        );
        if (!choice) { return; }
        if (choice === 'Start a Brand New Project') {
          await runNewProjectWizard(context);
          return;
        }
        const analyze = await vscode.window.showInformationMessage(
          `Continuing with "${currentName}". Run a full project analysis first?`, { modal: true }, 'Analyze', 'Skip'
        );
        if (analyze === 'Analyze') { await vscode.commands.executeCommand('redivivus.analyze'); }
        const retrofit = await vscode.window.showInformationMessage(
          'Ready to retrofit. This will back up your files and add Redivivus annotations with AI.',
          { modal: true }, 'Start Retrofit', 'Later'
        );
        if (retrofit === 'Start Retrofit') { await vscode.commands.executeCommand('redivivus.retrofit'); }
        await vscode.commands.executeCommand('redivivus.showSetupProgress');
        return;
      }
      await runNewProjectWizard(context);
    })
  );

  // [DEAD] redivivus.runProject was registered here during Phase 1 — duplicate of extensionInlineCommandsC.ts.
  // Removed: extensionInlineCommandsC.ts version is canonical (has terminal error injection + rootOverride support).
}
