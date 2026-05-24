// [SCOPE] CHASSIS Init — project setup callbacks and auto-init after reload

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { ChassisService } from '../services/chassisService.js';
import { ChatPanel } from '../ui/panels/chat/chatPanel';
import { logProjectContextSwitch, validateProjectContext } from '../services/logging/projectContextLogger.js';

export function registerOnNewProject(context: vscode.ExtensionContext): void {
  ChatPanel.onNewProject = async (name: string, answers: Record<string, string>, folderPath?: string) => {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const suggestedParent = currentRoot ? path.dirname(currentRoot) : (process.env.HOME ? path.join(process.env.HOME, 'projects') : '');
    const slug = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    // [FIX] When folderPath is a browsed parent directory, append the project slug.
    // If folderPath already ends with the slug (default full path or manual entry), use it directly.
    let targetFolder = folderPath || path.join(suggestedParent, slug);
    if (folderPath) {
      const base = path.basename(folderPath);
      if (base !== slug && !base.startsWith(slug)) {
        targetFolder = path.join(folderPath, slug);
      }
    }
    const pendingTask = (answers['_originalTask'] || '').trim() || ChatPanel.currentPanel?.getPendingTask?.() || (answers['what'] || '').trim();
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] name=${name} folder=${targetFolder} task=${pendingTask.slice(0,60)}\n`);
    
    // [LOG] Track project context change
    const validation = logProjectContextSwitch(targetFolder, 'onNewProject', pendingTask);
    if (!validation.allowed) {
      // This is a critical error - we're trying to switch projects unexpectedly
      vscode.window.showErrorMessage(`CHASSIS Error: ${validation.reason}. Current: ${currentRoot}, Attempted: ${targetFolder}`);
      return;
    }
    
    if (!fs.existsSync(targetFolder)) { fs.mkdirSync(targetFolder, { recursive: true }); }
    const { ChassisService } = await import('../services/chassisService.js');
    const chassis = new ChassisService(targetFolder);
    await chassis.initProject(name);
    if (answers && Object.keys(answers).length > 0) {
      const config = chassis.loadConfig();
      if (config) {
        config.blueprint = {
          who: answers['who'] || '', what: answers['what'] || '',
          where: answers['where'] || '', when: answers['when'] || '', why: answers['why'] || '',
          health: { confirmed: 3, assumed: 1, unknown: 1, confidence: 'medium' },
          locked: false, version: '1.0',
        };
        chassis.saveConfig(config);
      }
    }
    await context.globalState.update('pendingChassisInit', undefined);
    
    // [LOG] Initialize logging in the standalone extension host explicitly before build starts
    const { initChassisLogger, chassisLog } = await import('../services/logging/chassisLogger.js');
    const { initMasterLogger } = await import('../core/logging/masterLogger.js');
    const { initProjectContextLogger } = await import('../services/logging/projectContextLogger.js');
    const sessionId = initChassisLogger(targetFolder);
    chassisLog({ operation: 'system', message: 'New project initialized', data: { root: targetFolder, sessionId } });
    initMasterLogger(targetFolder);
    initProjectContextLogger(targetFolder);

    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] init complete, resuming build in-place\n`);

    // [FIX] Save pending task BEFORE updateWorkspaceFolders — going from 0→1 folder causes extension host restart,
    // which kills any in-flight build. resumePendingState on the new host will pick this up and resume correctly.
    if (pendingTask) {
      await context.globalState.update('chassis.pendingResumeTask', JSON.stringify({ task: pendingTask, projectRoot: targetFolder }));
    }

    // [CHASSIS] Disabled automatic workspace folder addition here.
    // Adding a folder to an existing workspace forces VS Code into an "Untitled (Workspace)"
    // multi-root mode, which is highly disruptive and causes duplicate chat tabs to spawn.
    // We now rely on the __OPEN_WORKSPACE__ manual button at the end of the build to
    // explicitly switch (openFolder) to the new project instead of polluting the current workspace.
    // try {
    //   const currentFolders = vscode.workspace.workspaceFolders || [];
    //   const alreadyOpen = currentFolders.some(f => f.uri.fsPath === targetFolder);
    //   if (!alreadyOpen) {
    //     await context.globalState.update('chassis.suppressAutoOpen', targetFolder);
    //     const added = vscode.workspace.updateWorkspaceFolders(currentFolders.length, 0, { uri: vscode.Uri.file(targetFolder), name });
    //     require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] workspace folder added=${added} path=${targetFolder}\n`);
    //   }
    // } catch (e) {
    //   require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] workspace folder add failed: ${e}\n`);
    // }

    if (pendingTask && ChatPanel.currentPanel) {
      ChatPanel.currentPanel.resumeBuildTask(pendingTask, targetFolder);
      // [FIX] Clear pending task — build started successfully, reload recovery not needed
      context.globalState.update('chassis.pendingResumeTask', undefined);
    }
  };
}

export async function runNewProjectWizard(context: vscode.ExtensionContext): Promise<void> {
  const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const suggestedParent = currentRoot ? path.dirname(currentRoot) : (process.env.HOME ? path.join(process.env.HOME, 'projects') : '');
  registerOnNewProject(context);
  const open = () => ChatPanel.currentPanel?.showNewProject(suggestedParent);
  if (!ChatPanel.currentPanel) {
    await vscode.commands.executeCommand('chassis.openChatPanel');
    setTimeout(open, 300);
  } else { open(); }
}

export async function runAutoInit(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  refreshAll: () => void
): Promise<void> {
  const pending = context.globalState.get<{folder: string; name: string; blueprint?: any}>('pendingChassisInit');
  require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[runAutoInit] pending=${JSON.stringify(pending)} currentRoot=${vscode.workspace.workspaceFolders?.[0]?.uri.fsPath} isInit=${chassis.isInitialized()}\n`);
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
          if (pending.blueprint) {
            progress.report({ message: 'Saving blueprint...' });
            const config = chassis.loadConfig();
            if (config) {
              let confirmed = 0, assumed = 0, unknown = 0;
              for (const key of ['who', 'what', 'where', 'when', 'why'] as const) {
                const val = (pending.blueprint[key] || '').trim();
                if (val.length > 20) {confirmed++;}
                else if (val.length > 0) {assumed++;}
                else {unknown++;}
              }
              let confidence: 'high' | 'medium' | 'low' = 'low';
              if (unknown === 0 && assumed <= 1) {confidence = 'high';}
              else if (unknown <= 1) {confidence = 'medium';}
              config.blueprint = {
                who: pending.blueprint.who || '', what: pending.blueprint.what || '',
                where: pending.blueprint.where || '', when: pending.blueprint.when || '', why: pending.blueprint.why || '',
                health: { confirmed, assumed, unknown, confidence },
                locked: false, version: '1.0',
              };
              chassis.saveConfig(config);
              const md = '# Blueprint\n\n## WHO\n' + config.blueprint.who + '\n\n## WHAT\n' + config.blueprint.what + '\n\n## WHERE\n' + config.blueprint.where + '\n\n## WHEN\n' + config.blueprint.when + '\n\n## WHY\n' + config.blueprint.why + '\n';
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
        const buildTask = (pending as any).pendingBuildTask as string | undefined;
        if (buildTask) {
          const deadline = Date.now() + 8_000;
          const poll = () => {
            require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[poll] currentPanel=${!!ChatPanel.currentPanel} deadline-remaining=${deadline-Date.now()}\n`);
            if (ChatPanel.currentPanel) {
              context.globalState.update('chassis.suppressAutoOpen', undefined);
              ChatPanel.currentPanel.resumeBuildTask(buildTask);
            } else if (Date.now() < deadline) { setTimeout(poll, 300); }
            else {
              vscode.commands.executeCommand('chassis.openChatPanel').then(() => {
                setTimeout(() => { ChatPanel.currentPanel?.resumeBuildTask(buildTask); }, 600);
              });
            }
          };
          setTimeout(poll, 700);
          return;
        }
        if (!ChatPanel.currentPanel) { await vscode.commands.executeCommand('chassis.openChatPanel'); }
        await vscode.commands.executeCommand('chassis.showSetupProgress');
      } catch (err) {
        vscode.window.showErrorMessage('CHASSIS auto-init failed: ' + (err as Error).message);
      }
    }
  }
}
