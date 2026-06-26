// [SCOPE] Core message handlers — VS Code operations, file pickers, project initialization, blueprint save
// Called by messageRouter orchestrator. No session, wizard, or vault logic here.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RedivivusService } from '../../../shared/vscode/application/redivivusService.js';
import type { WizardPanelState } from './messageRouterTypes.js';
import { syncBlueprintMd } from '../../project/infrastructure/blueprint/blueprintWriter.js';
import { handleKeyMessage } from './messageRouterKeys.js';

export async function handleCoreMessage(
  msg: any,
  redivivus: RedivivusService,
  state: WizardPanelState,
  refresh: () => void,
  postToWebview?: (msg: any) => void
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
      if (!folder || folder.length === 0) { return true; }
      const folderPath = folder[0].fsPath;
      const folderName = path.basename(folderPath);
      if (RedivivusService.hasRedivivusSetup(folderPath)) {
        // Already set up — open directly, load normally
        await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
      } else {
        // Not set up — show decision modal in the webview, do NOT switch workspace yet
        if (postToWebview) {
          postToWebview({ type: 'show-pick-project-modal', folderPath, folderName });
        } else {
          // Fallback: no webview — just open it
          await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
        }
      }
      return true;
    }
    case 'set-it-up': {
      // User chose to set up Redivivus for the folder — switch workspace and trigger wizard
      const fp = msg.folderPath;
      if (!fp) { return true; }
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(fp));
      // After reload, the pending init is handled by extension activation (existing flow)
      return true;
    }
    case 'browse-anyway': {
      // User chose to browse without Redivivus — switch workspace, set banner
      const fp = msg.folderPath;
      if (!fp) { return true; }
      state.browseAnywayBanner = true;
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(fp));
      return true;
    }
    case 'dismiss-browse-banner': {
      state.browseAnywayBanner = false;
      refresh();
      return true;
    }
    case 'initProject':
      await redivivus.initProject(msg.name);
      vscode.commands.executeCommand('setContext', 'redivivus.initialized', true);
      if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) {
        try { await vscode.commands.executeCommand('redivivus.generateRules'); } catch {}
      }
      refresh();
      return true;
    case 'saveBlueprint': {
      const cfg = redivivus.loadConfig();
      if (cfg) {
        let confirmed = 0, assumed = 0, unknown = 0;
        for (const key of ['who','what','where','when','why'] as const) {
          const val = (msg.data[key] || '').trim();
          if (val.length > 20) {confirmed++;}
          else if (val.length > 0) {assumed++;}
          else {unknown++;}
        }
        let confidence: 'high'|'medium'|'low' = 'low';
        if (unknown === 0 && assumed <= 1) {confidence = 'high';}
        else if (unknown <= 1) {confidence = 'medium';}
        let revision = 1;
        let revisions = undefined as any;
        if (cfg.blueprint && cfg.blueprint.who) {
          try {
            const { snapshotBeforeUpdate } = require('../services/blueprint/blueprintRevisions.js');
            const snap = snapshotBeforeUpdate(cfg.blueprint, 'Updated via wizard');
            revision = snap.revision;
            revisions = snap.revisions;
          } catch { revision = (cfg.blueprint.revision || 0) + 1; }
        }
        cfg.blueprint = {
          who: msg.data.who||'', what: msg.data.what||'', where: msg.data.where||'',
          when: msg.data.when||'', why: msg.data.why||'',
          health: { confirmed, assumed, unknown, confidence },
          locked: false,
          version: '1.0',
          revision,
          revisions,
        };
        redivivus.saveConfig(cfg);
        syncBlueprintMd(redivivus, cfg);
        redivivus.generateRules(cfg.projectName, cfg.blueprint);
      }
      refresh();
      return true;
    }
    // [DONE] getKeyPreviews, exportKey, exportAllKeys, importKeys moved to messageRouterKeys.ts (Rule 9 split)
    default:
      return await handleKeyMessage(msg, postToWebview, refresh);
  }
}
