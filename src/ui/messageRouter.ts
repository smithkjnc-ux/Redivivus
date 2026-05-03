// [SCOPE] CHASSIS Dashboard message router — all WebView → extension message handlers

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChassisService } from '../services/chassisService.js';
import { SessionService } from '../services/sessionService.js';
import { VaultService, VaultCategory } from '../services/vaultService.js';

export interface WizardPanelState {
  wizardStep: 'welcome' | 'blueprint' | 'nameLocation' | 'creating';
  wizardData: { blueprint?: any, projectName?: string, folder?: string, parentFolder?: string };
  vaultView: 'categories' | 'items' | 'detail';
  vaultCategory: string | null;
  vaultItems: any[];
  vaultGlobal: boolean;
  activeTab: string;
  vaultScanMode: boolean;
  vaultScanItems: any[];
  vaultScanDuplicates: any[];
  vaultScanFileCount: number;
  vaultScanFilteredCount: number;
  vaultScanTotalFound: number;
}

export function attachMessageRouter(
  webview: vscode.Webview,
  chassis: ChassisService,
  sessions: SessionService,
  vaultService: VaultService,
  context: vscode.ExtensionContext | undefined,
  state: WizardPanelState,
  refresh: () => void
): void {
  webview.onDidReceiveMessage(async (msg) => {
    if (!msg.type && msg.command) { msg.type = 'command'; }
    switch (msg.type) {
      case 'command':
        await vscode.commands.executeCommand(msg.command);
        refresh();
        break;
      case 'openFile': {
        const doc = await vscode.workspace.openTextDocument(msg.path);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
        break;
      }
      case 'pickAndRun': {
        const files = await vscode.window.showOpenDialog({
          canSelectMany: false, openLabel: 'Select File',
          defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
          filters: { 'Code Files': ['py','js','ts','jsx','tsx','html','css','sh','java','c','cpp'] }
        });
        if (files && files.length > 0) {
          const picked = await vscode.workspace.openTextDocument(files[0]);
          await vscode.window.showTextDocument(picked, vscode.ViewColumn.Two);
          const relPath = vscode.workspace.asRelativePath(files[0]);
          await vscode.commands.executeCommand(msg.command, relPath);
        }
        refresh();
        break;
      }
      case 'pickProject': {
        const folder = await vscode.window.showOpenDialog({
          canSelectMany: false, canSelectFolders: true, canSelectFiles: false, openLabel: 'Open Project',
        });
        if (folder && folder.length > 0) {
          await vscode.commands.executeCommand('vscode.openFolder', folder[0]);
        }
        break;
      }
      case 'initProject':
        await chassis.initProject(msg.name);
        vscode.commands.executeCommand('setContext', 'chassis.initialized', true);
        if (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) {
          try { await vscode.commands.executeCommand('chassis.generateRules'); } catch {}
        }
        refresh();
        break;
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
        break;
      }
      case 'startSession':
        await sessions.startSession(msg.goal, msg.ai);
        refresh();
        break;
      case 'endSession':
        await sessions.endSessionWithData(msg.data);
        refresh();
        break;
      case 'switchAI': {
        const aiCfg = vscode.workspace.getConfiguration('chassis');
        await aiCfg.update('defaultAI', msg.ai, true);
        vscode.window.showInformationMessage('CHASSIS now using ' + msg.ai.toUpperCase());
        refresh();
        break;
      }
      case 'getState':
        refresh();
        break;
      case 'wizardStep':
        state.wizardStep = msg.step === 'welcome' ? 'welcome' : msg.step;
        if (msg.step === 'welcome') state.wizardData = {};
        refresh();
        break;
      case 'wizardBlueprint':
        state.wizardData.blueprint = msg.data;
        state.wizardStep = 'nameLocation';
        refresh();
        break;
      case 'wizardPickFolder': {
        const fp = await vscode.window.showOpenDialog({
          canSelectMany: false, canSelectFolders: true, canSelectFiles: false, openLabel: 'Choose Parent Folder',
        });
        if (fp && fp.length > 0) {
          state.wizardData.parentFolder = fp[0].fsPath;
          if (msg.name) state.wizardData.projectName = msg.name;
          refresh();
        }
        break;
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
            if (!fs.existsSync(state.wizardData.folder)) fs.mkdirSync(state.wizardData.folder, { recursive: true });
            await chassis.scaffoldAt(state.wizardData.folder, state.wizardData.projectName, state.wizardData.blueprint);
            if (context) await context.globalState.update('pendingChassisInit', undefined);
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(state.wizardData.folder), false);
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to create project: ' + (err as Error).message);
        }
        break;
      }
      case 'vaultSetView':
        state.vaultView = msg.view || 'categories';
        state.vaultCategory = msg.category || null;
        state.vaultGlobal = msg.global !== undefined ? msg.global : state.vaultGlobal;
        if (state.vaultCategory && state.vaultView === 'items') {
          state.vaultItems = vaultService.listByCategory(state.vaultCategory as VaultCategory, state.vaultGlobal);
          state.activeTab = 'vault';
        }
        refresh();
        break;
      case 'vaultScanCodebase':
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'CHASSIS Vault: Scanning codebase...',
          cancellable: true,
        }, async (progress, token) => {
          const scanRoot = msg.root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!scanRoot) { vscode.window.showErrorMessage('No workspace to scan.'); return; }
          const result = await vaultService.scanCodebase(scanRoot, (m: string) => {
            if (!token.isCancellationRequested) progress.report({ message: m });
          });
          if (token.isCancellationRequested) return;

          const newItems: any[] = [];
          const duplicates: any[] = [];
          for (const item of result.items) {
            if (vaultService.isDuplicate(item, true)) { duplicates.push(item); }
            else { newItems.push(item); }
          }

          state.vaultScanMode = true;
          state.vaultScanItems = newItems;
          state.vaultScanDuplicates = duplicates;
          state.vaultScanFileCount = result.fileCount;
          state.vaultScanFilteredCount = result.filteredCount;
          state.vaultScanTotalFound = result.totalFound;
          state.activeTab = 'vault';
          refresh();
        });
        break;
      case 'vaultScanSaveAll': {
        const ids: string[] = msg.itemIds || [];
        let saved = 0;
        for (const id of ids) {
          const item = state.vaultScanItems.find((i: any) => i.id === id);
          if (item) { vaultService.saveItem(item, true); saved++; }
        }
        const dupCount = state.vaultScanDuplicates.length;
        const totalNew = state.vaultScanItems.length;
        const unchecked = totalNew - saved;
        const report = `Vault Scan Report
─────────────────
Files scanned:        ${state.vaultScanFileCount}
Blocks found:         ${state.vaultScanTotalFound || totalNew + dupCount}
Filtered (trivial):   ${state.vaultScanFilteredCount || 0}
Duplicates:           ${dupCount}
New blocks saved:     ${saved}` +
          (unchecked > 0 ? `\nUnchecked:          ${unchecked}` : '');
        const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        vscode.window.showInformationMessage(`Saved ${saved} new blocks. Skipped ${dupCount} duplicates.`);
        state.vaultScanMode = false;
        state.vaultScanItems = [];
        state.vaultScanDuplicates = [];
        state.vaultScanFileCount = 0;
        state.vaultScanFilteredCount = 0;
        state.vaultScanTotalFound = 0;
        state.vaultView = 'categories';
        refresh();
        break;
      }
      case 'vaultScanCancel':
        state.vaultScanMode = false;
        state.vaultScanItems = [];
        state.vaultScanDuplicates = [];
        state.vaultScanFileCount = 0;
        state.vaultScanFilteredCount = 0;
        state.vaultScanTotalFound = 0;
        refresh();
        break;
      case 'vaultOpenItem': {
        try {
          const openItem = vaultService.loadItem(msg.itemId, msg.global);
          if (openItem) {
            const d = await vscode.workspace.openTextDocument({ content: openItem.code, language: openItem.language });
            await vscode.window.showTextDocument(d, vscode.ViewColumn.Two);
          } else {
            vscode.window.showErrorMessage(`Vault item not found: ${msg.itemId}`);
          }
        } catch (err) {
          vscode.window.showErrorMessage('Failed to open vault item: ' + (err as Error).message);
        }
        break;
      }
      case 'vaultImportItem': {
        const vItem = vaultService.loadItem(msg.itemId, msg.global);
        if (vItem) {
          const result = await vaultService.importItem(vItem, msg.targetDir);
          vscode.window.showInformationMessage(
            `Imported ${result.importedItems.length} item(s) to ${result.targetPath}` +
            (result.failedItems.length ? ` — ${result.failedItems.length} failed.` : '')
          );
        }
        break;
      }
      case 'vaultDeleteItem':
        vaultService.deleteItem(msg.itemId, msg.global);
        if (state.vaultCategory) {
          state.vaultItems = vaultService.listByCategory(state.vaultCategory as VaultCategory, state.vaultGlobal);
        }
        refresh();
        break;
      case 'vaultSaveFromProject':
        await vscode.commands.executeCommand('chassis.saveToVault');
        refresh();
        break;
    }
  });
}
