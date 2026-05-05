// [SCOPE] CHASSIS Init commands — project setup + auto-init after folder-picker reload + wizard retrofit

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { ChatPanel } from '../ui/chatPanel.js';

/** Opens the chat panel new-project form. The form posts 'new-project' back; onNewProject callback finishes setup. */
async function runNewProjectWizard(context: vscode.ExtensionContext): Promise<void> {
  // Suggest a parent folder based on the current project's parent directory
  const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const suggestedParent = currentRoot ? path.dirname(currentRoot) : (process.env.HOME ? path.join(process.env.HOME, 'projects') : '');

  // Register the callback that receives completed form data (folderPath already resolved in the form)
  ChatPanel.onNewProject = async (name: string, answers: Record<string, string>, folderPath?: string) => {
    // folderPath is the full path as edited by the user (parent/slug); fall back to computing it
    const targetFolder = folderPath || path.join(suggestedParent, name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase());
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    await context.globalState.update('pendingChassisInit', { folder: targetFolder, name, blueprint: answers });
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetFolder), false);
  };

  // Open chat panel and show the new-project form, passing the suggested parent path
  const open = () => ChatPanel.currentPanel?.showNewProject(suggestedParent);
  if (!ChatPanel.currentPanel) {
    await vscode.commands.executeCommand('chassis.openChatPanel');
    setTimeout(open, 300);
  } else {
    open();
  }
}

export async function runAutoInit(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  refreshAll: () => void
): Promise<void> {
  const pending = context.globalState.get<{folder: string; name: string; blueprint?: any}>('pendingChassisInit');
  if (pending && !chassis.isInitialized()) {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (currentRoot === pending.folder) {
      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'CHASSIS: Setting up project...',
          cancellable: false,
        }, async (progress) => {
          progress.report({ message: 'Creating folders and config...' });
          await chassis.initProject(pending.name);
          // Restore blueprint answers from wizard if present
          if (pending.blueprint) {
            progress.report({ message: 'Saving blueprint...' });
            const config = chassis.loadConfig();
            if (config) {
              let confirmed = 0, assumed = 0, unknown = 0;
              for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
                const val = (pending.blueprint[key] || '').trim();
                if (val.length > 20) confirmed++;
                else if (val.length > 0) assumed++;
                else unknown++;
              }
              let confidence: 'high' | 'medium' | 'low' = 'low';
              if (unknown === 0 && assumed <= 1) confidence = 'high';
              else if (unknown <= 1) confidence = 'medium';
              config.blueprint = {
                who: pending.blueprint.who || '',
                what: pending.blueprint.what || '',
                where: pending.blueprint.where || '',
                when: pending.blueprint.when || '',
                why: pending.blueprint.why || '',
                health: { confirmed, assumed, unknown, confidence },
                locked: false,
                version: '1.0',
              };
              chassis.saveConfig(config);
              const md = '# Blueprint\n\n## WHO\n' + config.blueprint.who + '\n\n## WHAT\n' + config.blueprint.what + '\n\n## WHERE\n' + config.blueprint.where + '\n\n## WHEN\n' + config.blueprint.when + '\n\n## WHY\n' + config.blueprint.why + '\n';
              // [WARN] Inconsistent usage: 'fs' is imported at the top, but `require('fs')` is used here. Prefer imported 'fs'.
              require('fs').writeFileSync(chassis.blueprintPath, md);
              progress.report({ message: 'Generating editor rules...' });
              chassis.generateRules(pending.name, config.blueprint);
            }
          }
          await vscode.commands.executeCommand('setContext', 'chassis.initialized', true);
          await context.globalState.update('pendingChassisInit', undefined);
          refreshAll();
        });
        vscode.window.showInformationMessage(`CHASSIS initialized for "${pending.name}". Your blueprint is saved.`);
      } catch (err) {
        vscode.window.showErrorMessage('CHASSIS auto-init failed: ' + (err as Error).message);
      }
    }
  }
}

// [NEXT] Split auto-init logic from command registration.
export function registerInitCommands(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  refreshAll: () => void
): void {
  // Init Project
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.init', async () => {
      try {
        // Step 1: pick a project folder
        const folders = await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFolders: true,
          canSelectFiles: false,
          openLabel: 'Select Project Folder',
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        });
        if (!folders || folders.length === 0) { return; }
        const selectedFolder = folders[0].fsPath;

        // Step 2: ask whether to use this folder or create a new subfolder
        const folderChoice = await vscode.window.showQuickPick(
          ['Use this folder', 'Create a new subfolder'],
          { placeHolder: 'Initialize in this folder, or create a new subfolder?' }
        );
        if (!folderChoice) { return; }

        let targetFolder = selectedFolder;
        if (folderChoice === 'Create a new subfolder') {
          const subfolderName = await vscode.window.showInputBox({
            prompt: 'Name for the new project folder?',
            placeHolder: 'e.g., my-new-project',
            ignoreFocusOut: true,
          });
          if (!subfolderName) { return; }
          targetFolder = path.join(selectedFolder, subfolderName);
          if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
          }
        }

        // Step 3: if it's a different folder, save pending init and open it (reloads)
        const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (targetFolder !== currentRoot) {
          const name = await vscode.window.showInputBox({
            prompt: 'Project name?',
            placeHolder: 'e.g., Do AI Dream, Ryppel, TorqGrid',
            ignoreFocusOut: true,
          });
          if (!name) { return; }

          await context.globalState.update('pendingChassisInit', { folder: targetFolder, name });
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetFolder), false);
          return;
        }

        // Step 4: same workspace — proceed with normal init
        if (chassis.isInitialized()) {
          const overwrite = await vscode.window.showWarningMessage(
            'CHASSIS is already initialized in this project. Re-initialize?',
            'Yes', 'No'
          );
          if (overwrite !== 'Yes') { return; }
        }

        const name = await vscode.window.showInputBox({
          prompt: 'Project name?',
          placeHolder: 'e.g., Do AI Dream, Ryppel, TorqGrid',
          ignoreFocusOut: true,
        });
        if (!name) { return; }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'CHASSIS: Setting up project...',
          cancellable: false,
        }, async (progress) => {
          progress.report({ message: 'Creating folders and config...' });
          await chassis.initProject(name);
          progress.report({ message: 'Generating editor rules...' });
          await vscode.commands.executeCommand('setContext', 'chassis.initialized', true);
          refreshAll();
        });

        const runBp = await vscode.window.showInformationMessage(
          `CHASSIS initialized for "${name}". Run the Blueprint Interview now?`,
          'Yes', 'Later'
        );
        if (runBp === 'Yes') {
          await vscode.commands.executeCommand('chassis.blueprint');
        }
      } catch (err) {
        vscode.window.showErrorMessage('CHASSIS init failed: ' + (err as Error).message);
      }
    })
  );

  // Open Project — shows folder picker and opens in VS Code
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.openProject', async () => {
      const folder = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Open Project Folder',
      });
      if (folder && folder.length > 0) {
        await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
      }
    })
  );

  // Wizard Retrofit shortcut (init + analyze + retrofit in sequence)
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.wizardRetrofit', async () => {
      // Step 1: If a project is already open, ask what to do
      if (chassis.isInitialized()) {
        const config = chassis.loadConfig();
        const currentName = config?.projectName || vscode.workspace.workspaceFolders?.[0]?.name || 'current project';
        const choice = await vscode.window.showInformationMessage(
          `You already have "${currentName}" open. What would you like to do?`,
          { modal: true },
          'Start a Brand New Project',
          'Continue With This Project'
        );
        if (!choice) { return; }
        if (choice === 'Start a Brand New Project') {
          // Run the full 5W wizard — collects blueprint before opening new folder
          await runNewProjectWizard(context);
          return; // openFolder causes reload; pendingChassisInit picks up after reload
        }
        // Continue with current project — skip straight to analyze/retrofit
        const analyze = await vscode.window.showInformationMessage(
          `Continuing with "${currentName}". Run a full project analysis first?`,
          { modal: true }, 'Analyze', 'Skip'
        );
        if (analyze === 'Analyze') {
          await vscode.commands.executeCommand('chassis.analyze');
        }
        const retrofit = await vscode.window.showInformationMessage(
          'Ready to retrofit. This will back up your files and add CHASSIS annotations with AI.',
          { modal: true }, 'Start Retrofit', 'Later'
        );
        if (retrofit === 'Start Retrofit') {
          await vscode.commands.executeCommand('chassis.retrofit');
        }
        return;
      }

      // No project open yet — run full 5W wizard; openFolder reloads, pendingChassisInit handles the rest
      await runNewProjectWizard(context);
    })
  );
}