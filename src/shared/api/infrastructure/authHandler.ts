// [SCOPE] VS Code Deep Link Auth Handler — catches vscode://papajoe.redivivus/auth?token=XYZ
import * as vscode from 'vscode';
import { setAccountToken } from './apiClient.js';
import type { StatusBar } from '../../vscode/ui/statusBar.js';

export class AuthUriHandler implements vscode.UriHandler {
  constructor(private statusBar?: StatusBar) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path === '/auth') {
      const query = new URLSearchParams(uri.query);
      const token = query.get('token');
      
      if (token) {
        await setAccountToken(token);
        vscode.window.showInformationMessage('Redivivus: Successfully authenticated via deep link!');
        
        if (this.statusBar) {
          this.statusBar.setConnected(true);
        }
        
        try {
          const { ChatPanel } = await import('../../../features/chat/ui/chatPanel.js');
          (ChatPanel as any).currentPanel?.refresh();
        } catch {}
      } else {
        vscode.window.showErrorMessage('Redivivus: Auth deep link missing token parameter.');
      }
    }
  }
}

export function registerAuthHandler(context: vscode.ExtensionContext, statusBar?: StatusBar): void {
  const handler = new AuthUriHandler(statusBar);
  context.subscriptions.push(vscode.window.registerUriHandler(handler));
}
