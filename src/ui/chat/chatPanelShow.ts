// [SCOPE] Chat Panel Show — static show() logic with startup behavior
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatPanel } from './chatPanel.js';
import { ChassisService } from '../../services/chassisService.js';
import { RoutingService } from '../../services/ai/routingService.js';
import { UsageTracker } from '../../services/usageTracker.js';
import { VaultService } from '../../services/vault/vaultService.js';

export function doShowChatPanel(
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  vault?: VaultService,
): void {
  if ((ChatPanel as any)._instance) {
    const existing = (ChatPanel as any)._instance;
    existing._panel.reveal(existing._panel.viewColumn ?? vscode.ViewColumn.One, false);
    if (vault) { existing.vault = vault; }

    // Sync in-memory assistMode with file system — catches Assist → Full CHASSIS conversion
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (existing.state.assistMode && wsRoot && !fs.existsSync(path.join(wsRoot, '.chassis-assist'))) {
      existing.state.assistMode = false;
      existing._initialized = false;
      existing.refresh();
      return;
    }

    existing._panel.webview.postMessage({
      type: 'update-title',
      html: '<span style="color:#a78bfa;-webkit-text-fill-color:#a78bfa;">C</span><span style="color:#4d9eff;-webkit-text-fill-color:#4d9eff;"> H A S S I S</span>',
    });
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    'chassisChat', 'CHASSIS Chat',
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  const instance = new (ChatPanel as any)(panel, chassis, routing, usageTracker, vault);
  const ctx = ChatPanel.extensionContext;
  const startupBehavior = vscode.workspace.getConfiguration('chassis').get<string>('startupBehavior') || 'launcher';
  if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'lastProject') {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('chassis.recentProjects', []);
    const valid = recent.filter((p: any) => fs.existsSync(p.path));
    if (valid.length > 0) {
      const mostRecent = valid.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))[0];
      const folderPath = mostRecent.path;
      const folderName = path.basename(folderPath);
      const wsFile = path.join(folderPath, `${folderName}.code-workspace`);
      if (!fs.existsSync(wsFile)) {
        try { fs.writeFileSync(wsFile, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2)); } catch { }
      }
      const existing = recent.findIndex((p: any) => p.path === folderPath);
      if (existing >= 0) {
        const item = recent.splice(existing, 1)[0];
        item.timestamp = Date.now();
        recent.unshift(item);
        ctx.globalState.update('chassis.recentProjects', recent.slice(0, 10));
      }
      vscode.commands.executeCommand('vscode.openWorkspace', vscode.Uri.file(wsFile), false);
    }
  }
  if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'launcher') {
    const lastRoot = ctx.globalState.get<string>('chassis.lastActiveProject');
    if (lastRoot && !fs.existsSync(lastRoot)) {
      ctx.globalState.update('chassis.lastActiveProject', undefined);
    } else if (lastRoot && fs.existsSync(path.join(lastRoot, '.chassis'))) {
      instance.chassis = new (instance.chassis.constructor as any)(lastRoot);
      instance.loadBlueprintContext();
    }
  }
  (ChatPanel as any)._instance = instance;
}
