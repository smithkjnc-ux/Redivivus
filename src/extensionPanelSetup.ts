// [SCOPE] Chat panel serializer and auto-open timer — extracted from extension.ts (Rule 9 split).

import * as vscode from 'vscode';
import { ChatPanel } from './features/chat/ui/chatPanel.js';
import { consolidatePanelLayout } from './features/chat/ui/chatPanelShow.js';
import { wasProjectClosedRecently } from './features/project/logic/closeMarker.js';

export function registerPanelSerializer(
  context: vscode.ExtensionContext,
  redivivusService: any,
  routingService: any,
  usageTracker: any,
  vaultService: any,
): void {
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('redivivusChat', {
      async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel) {
        (ChatPanel as any)._isDeserializing = true;
        if ((ChatPanel as any)._instance) { try { webviewPanel.dispose(); } catch {} (ChatPanel as any)._isDeserializing = false; return; }
        const SENTINEL = { __sentinel: true };
        (ChatPanel as any)._instance = SENTINEL;
        webviewPanel.webview.options = { enableScripts: true };
        const { ChatPanel: _CP2 } = await import('./features/chat/ui/chatPanel.js');
        if ((ChatPanel as any)._instance !== SENTINEL) { try { webviewPanel.dispose(); } catch {} (ChatPanel as any)._isDeserializing = false; return; }
        const panel = new (_CP2 as any)(webviewPanel, redivivusService, routingService, usageTracker, vaultService);
        (ChatPanel as any)._instance = panel;
        consolidatePanelLayout(); // prevent "split screen on restart" — close other editor groups
        const closedByUser = wasProjectClosedRecently() || context.globalState.get<boolean>('redivivus.userClosedProject');
        if (closedByUser) {
          context.globalState.update('redivivus.userClosedProject', undefined);
          if (panel?.state) { panel.state.conversation = []; }
          try {
            const keys: readonly string[] = (context.globalState as any).keys?.() ?? [];
            for (const k of keys) { if (k.startsWith('redivivus.chatHistory.')) { context.globalState.update(k, undefined); } }
          } catch {}
          (panel as any)._initialized = false;
          panel?.refresh?.();
        }
        (ChatPanel as any)._isDeserializing = false;
      }
    })
  );
}

export function scheduleAutoOpenPanel(
  context: vscode.ExtensionContext,
  redivivusService: any,
  routingService: any,
  usageTracker: any,
  vaultService: any,
): void {
  setTimeout(() => {
    const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const suppressPath = context.globalState.get<string>('redivivus.suppressAutoOpen');
    const suppressed = !!(suppressPath && currentRoot && suppressPath === currentRoot);
    if (suppressed) { context.globalState.update('redivivus.suppressAutoOpen', undefined); }

    const checkAndShow = () => {
      if ((ChatPanel as any)._isDeserializing) { setTimeout(checkAndShow, 200); return; }
      if (!ChatPanel.currentPanel) { ChatPanel.show(redivivusService, routingService, usageTracker, vaultService); }
    };

    const _closedByUser = wasProjectClosedRecently() || context.globalState.get<boolean>('redivivus.userClosedProject');
    if (_closedByUser) {
      context.globalState.update('redivivus.userClosedProject', undefined);
      setTimeout(checkAndShow, 1200);
    } else {
      checkAndShow();
    }
  }, 500);
}
