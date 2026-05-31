// [SCOPE] Chat Panel Show — static show() logic with startup behavior
// Extracted from chatPanel.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatPanel } from './chatPanel';
import type { RedivivusService } from '../../../services/redivivusService';
import type { RoutingService } from '../../../services/ai/routingService';
import type { UsageTracker } from '../../../services/usageTracker';
import type { VaultService } from '../../../services/vault/vaultService';

export function doShowChatPanel(
  redivivus: RedivivusService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  vault?: VaultService,
): void {
  if ((ChatPanel as any)._instance) {
    const existing = (ChatPanel as any)._instance;
    existing._panel.reveal(existing._panel.viewColumn ?? vscode.ViewColumn.One, false);
    if (vault) { existing.vault = vault; }

    // Sync in-memory assistMode with file system — catches Assist → Full Redivivus conversion
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (existing.state.assistMode && wsRoot && !fs.existsSync(path.join(wsRoot, '.redivivus-assist'))) {
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
  const wsFolder = vscode.workspace.workspaceFolders?.[0];
  const panelTitle = wsFolder ? path.basename(wsFolder.uri.fsPath) : 'Redivivus Chat';
  const panel = vscode.window.createWebviewPanel(
    'redivivusChat', panelTitle,
    { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
    { enableScripts: true, retainContextWhenHidden: true }
  );
  const extCtx = ChatPanel.extensionContext;
  if (extCtx) {
    panel.iconPath = vscode.Uri.joinPath(extCtx.extensionUri, 'resources', 'redivivus-icon-v2.svg');
  }
  const instance = new (ChatPanel as any)(panel, redivivus, routing, usageTracker, vault);
  const ctx = ChatPanel.extensionContext;
  const startupBehavior = vscode.workspace.getConfiguration('redivivus').get<string>('startupBehavior') || 'launcher';
  if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'lastProject') {
    const recent = ctx.globalState.get<Array<{ path: string; name: string; timestamp: number }>>('redivivus.recentProjects', []);
    const valid = recent.filter((p: any) => fs.existsSync(p.path));
    if (valid.length > 0) {
      const mostRecent = valid.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))[0];
      const folderPath = mostRecent.path;
      const folderName = path.basename(folderPath);
      const existing = recent.findIndex((p: any) => p.path === folderPath);
      if (existing >= 0) {
        const item = recent.splice(existing, 1)[0];
        item.timestamp = Date.now();
        recent.unshift(item);
        ctx.globalState.update('redivivus.recentProjects', recent.slice(0, 10));
      }
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), { forceNewWindow: false });
    }
  }
  if (ctx && !vscode.workspace.workspaceFolders?.length && startupBehavior === 'launcher') {
    const lastRoot = ctx.globalState.get<string>('redivivus.lastActiveProject');
    if (lastRoot && !fs.existsSync(lastRoot)) {
      ctx.globalState.update('redivivus.lastActiveProject', undefined);
    } else if (lastRoot && fs.existsSync(path.join(lastRoot, '.redivivus'))) {
      instance.redivivus = new (instance.redivivus.constructor as any)(lastRoot);
      instance.loadBlueprintContext();
    }
  }
  (ChatPanel as any)._instance = instance;

  // Fetch unread announcements
  import('../../../services/api/apiClient.js').then(async ({ fetchAnnouncements }) => {
    const announcements = await fetchAnnouncements();
    if (announcements.length > 0 && ctx) {
      const seen = ctx.globalState.get<string[]>('redivivus.seenAnnouncements', []);
      let newAnnouncements = false;
      // Reverse to add oldest first, so the absolute newest is at the bottom of the chat
      for (const a of [...announcements].reverse()) {
        if (!seen.includes(a.id)) {
          instance.getConversation().push({ role: 'system', text: `📢 **Announcement: ${a.title}**\n\n${a.body}` });
          seen.push(a.id);
          newAnnouncements = true;
        }
      }
      if (newAnnouncements) {
        await ctx.globalState.update('redivivus.seenAnnouncements', seen);
        instance.refresh();
      }
    }
  }).catch(() => {});
}
