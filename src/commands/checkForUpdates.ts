// [SCOPE] Redivivus auto-updater — downloads VSIX from GitHub Releases, installs, reloads
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const STABLE_LINK = path.join(os.homedir(), '.local', 'opt', 'redivivus');

function isDevBuild(): boolean {
  try {
    const dir = fs.realpathSync(STABLE_LINK);
    return dir.includes('/projects/redivivus-build') || dir.includes('/projects/redivivus/');
  } catch { return false; }
}

async function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (u: string) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); request(res.headers.location!); return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total > 0) { onProgress(Math.round((received / total) * 100)); }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      res.on('error', reject);
    }).on('error', reject);
    request(u);
  });
}

export async function runUpdate(newVersion: string, _downloadUrl?: string): Promise<void> {
  const vsixUrl = `https://github.com/smithkjnc-ux/Redivivus/releases/download/v${newVersion}/redivivus-${newVersion}.vsix`;
  const dest = path.join(os.tmpdir(), `redivivus-${newVersion}.vsix`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Updating Redivivus to v${newVersion}`, cancellable: false },
    async (progress) => {
      progress.report({ message: 'Downloading…', increment: 0 });
      await downloadFile(vsixUrl, dest, (pct) => {
        progress.report({ message: `Downloading… ${pct}%`, increment: pct });
      });
      progress.report({ message: 'Installing…', increment: 100 });
      const codium = path.join(STABLE_LINK, 'bin', 'codium');
      await new Promise<void>((resolve, reject) => {
        const proc = cp.spawn(codium, ['--install-extension', dest, '--force'], { stdio: 'ignore' });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`install exited ${code}`)));
        proc.on('error', reject);
      });
      try { fs.unlinkSync(dest); } catch { /* best-effort */ }
    }
  );

  const choice = await vscode.window.showInformationMessage(
    `Redivivus v${newVersion} installed! Reload to apply.`,
    'Reload Now', 'Later'
  );
  if (choice === 'Reload Now') {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

export function registerCheckForUpdatesCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.checkForUpdates', async () => {
      const pkg = require('../../package.json');
      const currentVersion: string = pkg.version;
      const cfg = vscode.workspace.getConfiguration('redivivus');
      const apiBase = cfg.get<string>('apiBase') || 'https://redivivus-backend.fly.dev';
      const webBase = apiBase.replace('/api/v1', '');
      try {
        const res = await fetch(`${webBase}/api/version`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) { vscode.window.showErrorMessage('Could not check for updates — try again later.'); return; }
        const { version: latestVersion } = await res.json() as { version: string };
        if (!latestVersion || latestVersion === currentVersion) {
          vscode.window.showInformationMessage(`Redivivus v${currentVersion} is up to date.`); return;
        }
        if (isDevBuild()) {
          vscode.window.showInformationMessage(`v${latestVersion} available (dev build — use rigops to release).`); return;
        }
        const choice = await vscode.window.showInformationMessage(
          `Redivivus v${latestVersion} is available (you have v${currentVersion}).`,
          'Update Now', 'Dismiss'
        );
        if (choice === 'Update Now') { await runUpdate(latestVersion); }
      } catch (err) {
        vscode.window.showErrorMessage(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}
