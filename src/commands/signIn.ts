// [SCOPE] Redivivus Sign In — opens browser auth, receives token via localhost callback
import * as vscode from 'vscode';
import * as http from 'http';
import { setAccountToken, getAccountToken, clearAccountToken } from '../services/api/apiClient.js';
import type { StatusBar } from '../ui/views/statusBar.js';

function getFreePort(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') { resolve(addr.port); }
      else { reject(new Error('Could not bind port')); }
    });
  });
}

export function registerSignInCommand(context: vscode.ExtensionContext, statusBar?: StatusBar): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.signIn', async () => {
      const current = await getAccountToken();

      if (current) {
        const choice = await vscode.window.showQuickPick(
          ['Re-authenticate', 'Sign out', 'Cancel'],
          { placeHolder: 'Redivivus account already connected' }
        );
        if (!choice || choice === 'Cancel') { return; }
        if (choice === 'Sign out') {
          await clearAccountToken();
          vscode.window.showInformationMessage('Redivivus: Signed out.');
          statusBar?.setConnected(false);
          try { const { ChatPanel } = await import('../ui/panels/chat/chatPanel.js'); (ChatPanel as any).currentPanel?.refresh(); } catch {}
          return;
        }
      }

      // Start a one-shot localhost server to receive the token callback
      const server = http.createServer();
      let port: number;
      try {
        port = await getFreePort(server);
      } catch {
        vscode.window.showErrorMessage('Redivivus: Could not start auth server. Try again.');
        return;
      }

      const tokenPromise = new Promise<string | null>(resolve => {
        server.on('request', (req, res) => {
          const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
          const token = url.searchParams.get('token');
          const html = `<html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a10;color:#e2e2f0;}</style></head>
            <body><div style="text-align:center"><div style="font-size:32px;margin-bottom:12px;">✓</div><div style="font-size:18px;font-weight:600;color:#14B8A6;">Account connected</div><div style="margin-top:8px;color:#8888aa;font-size:14px;">You can close this tab and return to Redivivus.</div></div><script>window.close();</script></body></html>`;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          server.close();
          resolve(token);
        });
        server.on('error', () => resolve(null));
      });

      // Open browser to the IDE auth page.
      // Always use redivivus.dev for auth — GitHub OAuth is registered there.
      // API calls use apiBase (redivivus-backend-1017737301468.us-east4.run.app) separately.
      const scheme = vscode.env.uriScheme;
      const authUrl = `https://redivivus.dev/auth/ide?port=${port}&scheme=${scheme}`;
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      vscode.window.showInformationMessage('Redivivus: Complete sign in in your browser…', { modal: false });

      // Wait up to 5 minutes for the callback
      const token = await Promise.race([
        tokenPromise,
        new Promise<null>(r => setTimeout(() => { server.close(); r(null); }, 300_000)),
      ]);

      if (!token) {
        vscode.window.showWarningMessage('Redivivus: Sign in timed out or was cancelled.');
        return;
      }

      await setAccountToken(token);
      vscode.window.showInformationMessage('Redivivus: Account connected.');
      statusBar?.setConnected(true);
      try { const { ChatPanel } = await import('../ui/panels/chat/chatPanel.js'); (ChatPanel as any).currentPanel?.refresh(); } catch {}
    })
  );
}
