// [SCOPE] CHASSIS Init — project setup callbacks and auto-init after reload

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { ChatPanel } from '../ui/chat/chatPanel.js';

export function registerOnNewProject(context: vscode.ExtensionContext): void {
  ChatPanel.onNewProject = async (name: string, answers: Record<string, string>, folderPath?: string) => {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const suggestedParent = currentRoot ? path.dirname(currentRoot) : (process.env.HOME ? path.join(process.env.HOME, 'projects') : '');
    const targetFolder = folderPath || path.join(suggestedParent, name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase());
    const pendingTask = (answers['_originalTask'] || '').trim() || ChatPanel.currentPanel?.getPendingTask?.() || (answers['what'] || '').trim();
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] name=${name} folder=${targetFolder} task=${pendingTask.slice(0,60)}\n`);
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
    require('fs').appendFileSync(require('os').homedir()+'/chassis_debug.log', `[onNewProject] init complete, resuming build in-place\n`);
    if (pendingTask && ChatPanel.currentPanel) {
      ChatPanel.currentPanel.resumeBuildTask(pendingTask, targetFolder);
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
                if (val.length > 20) confirmed++;
                else if (val.length > 0) assumed++;
                else unknown++;
              }
              let confidence: 'high' | 'medium' | 'low' = 'low';
              if (unknown === 0 && assumed <= 1) confidence = 'high';
              else if (unknown <= 1) confidence = 'medium';
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
