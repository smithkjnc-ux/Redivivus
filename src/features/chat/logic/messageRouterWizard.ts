// [SCOPE] Wizard message handlers — New Project Wizard step navigation and project creation
// Called by messageRouter orchestrator. No session or vault logic here.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import type { WizardPanelState } from './messageRouterTypes.js';

export async function handleWizardMessage(
  msg: any,
  redivivus: RedivivusService,
  state: WizardPanelState,
  context: vscode.ExtensionContext | undefined,
  refresh: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'dismissWelcome':
      state.welcomeDismissed = true;
      refresh();
      return true;
    case 'wizardStep':
      state.wizardStep = msg.step === 'welcome' ? 'welcome' : msg.step;
      if (msg.step === 'welcome') { state.wizardData = {}; state.welcomeDismissed = false; }
      refresh();
      return true;
    case 'wizardBlueprint':
      state.wizardData.blueprint = msg.data;
      state.wizardStep = 'nameLocation';
      refresh();
      return true;
    case 'wizardPickFolder': {
      const fp = await vscode.window.showOpenDialog({
        canSelectMany: false, canSelectFolders: true, canSelectFiles: false, openLabel: 'Choose Parent Folder',
      });
      if (fp && fp.length > 0) {
        state.wizardData.parentFolder = fp[0].fsPath;
        if (msg.name) {state.wizardData.projectName = msg.name;}
        refresh();
      }
      return true;
    }
    case 'wizardNameLocation': {
      const nameRaw = msg.name || '';
      const sanitized = nameRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
      const homeDir = os.homedir();
      const defaultParent = fs.existsSync(path.join(homeDir, 'projects')) ? path.join(homeDir, 'projects') : homeDir;
      const parent = state.wizardData.parentFolder || defaultParent;
      state.wizardData.projectName = nameRaw;
      state.wizardData.folder = sanitized ? path.join(parent, sanitized) : '';
      state.wizardStep = 'creating';
      refresh();
      try {
        if (state.wizardData.folder && state.wizardData.projectName) {
          if (!fs.existsSync(state.wizardData.folder)) {fs.mkdirSync(state.wizardData.folder, { recursive: true });}
          await redivivus.scaffoldAt(state.wizardData.folder, state.wizardData.projectName, state.wizardData.blueprint);
          if (context) {await context.globalState.update('pendingRedivivusInit', undefined);}
          const _wsUri = vscode.Uri.file(state.wizardData.folder);
          await vscode.commands.executeCommand('vscode.openFolder', _wsUri, { forceNewWindow: false });
        }
      } catch (err) {
        vscode.window.showErrorMessage('Failed to create project: ' + (err as Error).message);
      }
      return true;
    }
    default:
      return false;
  }
}
