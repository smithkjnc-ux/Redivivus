// [SCOPE] Core message handlers — VS Code operations, file pickers, project initialization, blueprint save
// Called by messageRouter orchestrator. No session, wizard, or vault logic here.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ChassisService } from '../services/chassisService.js';
import { WizardPanelState } from './messageRouterTypes.js';

export async function handleCoreMessage(
  msg: any,
  chassis: ChassisService,
  state: WizardPanelState,
  refresh: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'setTab':
      state.activeTab = msg.tab;
      refresh();
      return true;
    case 'command':
      await vscode.commands.executeCommand(msg.command);
      refresh();
      return true;
    case 'openFile': {
      const doc = await vscode.workspace.openTextDocument(msg.path);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      refresh();
      return true;
    }
    case 'pickAndRun': {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false, openLabel: 'Select File',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        filters: { 'Code Files': ['py','js','ts','jsx','tsx','html','css','sh','java','c','cpp'] }
      });
      if (files && files.length > 0) {
        const picked = await vscode.workspace.openTextDocument(files[0]);
        await vscode.window.showTextDocument(picked, vscode.ViewColumn.Beside);
        const relPath = vscode.workspace.asRelativePath(files[0]);
        await vscode.commands.executeCommand(msg.command, relPath);
      }
      refresh();
      return true;
    }
    case 'pickProject': {
      const folder = await vscode.window.showOpenDialog({
        canSelectMany: false, canSelectFolders: true, canSelectFiles: false, openLabel: 'Open Project',
      });
      if (folder && folder.length > 0) {
        await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
      }
      return true;
    }
    case 'initProject':
      await chassis.initProject(msg.name);
      vscode.commands.executeCommand('setContext', 'chassis.initialized', true);
      if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) {
        try { await vscode.commands.executeCommand('chassis.generateRules'); } catch {}
      }
      refresh();
      return true;
    case 'saveBlueprint': {
      const cfg = chassis.loadConfig();
      if (cfg) {
        let confirmed = 0, assumed = 0, unknown = 0;
        for (const key of ['who','what','where','when','why'] as const) {
          const val = (msg.data[key] || '').trim();
          if (val.length > 20) confirmed++;
          else if (val.length > 0) assumed++;
          else unknown++;
        }
        let confidence: 'high'|'medium'|'low' = 'low';
        if (unknown === 0 && assumed <= 1) confidence = 'high';
        else if (unknown <= 1) confidence = 'medium';
        cfg.blueprint = {
          who: msg.data.who||'', what: msg.data.what||'', where: msg.data.where||'',
          when: msg.data.when||'', why: msg.data.why||'',
          health: { confirmed, assumed, unknown, confidence },
          locked: msg.data.lock || false,
          lockedAt: msg.data.lock ? new Date().toISOString() : undefined,
          version: '1.0',
        };
        chassis.saveConfig(cfg);
        const md = '# Blueprint\n\n## WHO\n' + cfg.blueprint.who + '\n\n## WHAT\n' + cfg.blueprint.what + '\n\n## WHERE\n' + cfg.blueprint.where + '\n\n## WHEN\n' + cfg.blueprint.when + '\n\n## WHY\n' + cfg.blueprint.why + '\n';
        fs.writeFileSync(chassis.blueprintPath, md);
        chassis.generateRules(cfg.projectName, cfg.blueprint);
      }
      refresh();
      return true;
    }
    default:
      return false;
  }
}
