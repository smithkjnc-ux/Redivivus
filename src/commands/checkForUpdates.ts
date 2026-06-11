// [SCOPE] Redivivus auto-updater — downloads VSIX from GitHub Releases, installs, reloads
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const STABLE_LINK = path.join(os.homedir(), '.local', 'opt', 'redivivus');

// [SCOPE] Resolve the IDE CLI binary, platform-aware. Prefers the running IDE's own bin dir
// (via appRoot) so this works on any OS/install location, then falls back to the Linux
// stable symlink. Tries 'redivivus' first (rebranded installs), then 'codium' (legacy).
function resolveCliPath(): string | null {
  const names = process.platform === 'win32'
    ? ['redivivus.cmd', 'codium.cmd']
    : ['redivivus', 'codium'];
  const candidates: string[] = [];
  // appRoot = <install>/resources/app → bin dir is <install>/bin
  const appRootBin = path.resolve(vscode.env.appRoot, '..', '..', 'bin');
  for (const n of names) { candidates.push(path.join(appRootBin, n)); }
  for (const n of names) { candidates.push(path.join(STABLE_LINK, 'bin', n)); }
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { return c; } } catch { /* keep trying */ }
  }
  return null;
}

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
    request(url);
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
      const cli = resolveCliPath();
      if (!cli) { throw new Error('Could not locate the IDE CLI binary (redivivus/codium) to install the update.'); }
      await new Promise<void>((resolve, reject) => {
        const proc = cp.spawn(cli, ['--install-extension', dest, '--force'], { stdio: 'ignore' });
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
        const res = await fetch(`${webBase}/api/version`, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) { vscode.window.showErrorMessage('Could not check for updates — try again later.'); return; }
        const { version: latestVersion } = await res.json() as { version: string };
        if (!latestVersion || latestVersion === currentVersion) {
          vscode.window.showInformationMessage(`Redivivus v${currentVersion} is up to date.`); return;
        }
        if (isDevBuild()) {
          vscode.window.showInformationMessage(`v${latestVersion} available (dev build — use rigops to release).`); return;
        }
        const choice = await vscode.window.showWarningMessage(
          `⚠️ Redivivus Beta v${latestVersion} available (you have v${currentVersion}).\nBeta updates may include critical fixes — strongly recommended.`,
          'Update Now', "What's New", 'Remind Me Later'
        );
        if (choice === 'Update Now') {
          await runUpdate(latestVersion);
        } else if (choice === "What's New") {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/smithkjnc-ux/Redivivus/releases/tag/v' + latestVersion));
        } else if (choice === 'Remind Me Later') {
          context.globalState.update('redivivus.updateRemindAfter', Date.now() + 4 * 60 * 60 * 1000);
          vscode.window.showWarningMessage('⚠️ Reminder set for 4 hours. Beta updates are strongly recommended — please update soon.');
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}

// Startup update check: 1-hour cooldown + snooze support. Swallows all errors — never blocks startup.
export async function runStartupUpdateCheck(
  context: vscode.ExtensionContext,
  statusBar: { showUpdateAvailable(version: string): void }
): Promise<void> {
  try {
    const lastCheck = context.globalState.get<number>('redivivus.lastUpdateCheck', 0);
    if (Date.now() - lastCheck < 60 * 60 * 1000) { return; }
    const remindAfter = context.globalState.get<number>('redivivus.updateRemindAfter', 0);
    if (Date.now() < remindAfter) { return; }
    const pkg = require('../../package.json') as { version: string };
    const currentVersion = pkg.version;
    const cfg = vscode.workspace.getConfiguration('redivivus');
    const apiBase = cfg.get<string>('apiBase') || 'https://redivivus-backend.fly.dev';
    const webBase = apiBase.replace('/api/v1', '');
    const res = await fetch(`${webBase}/api/version`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { return; }
    await context.globalState.update('redivivus.lastUpdateCheck', Date.now());
    const { version: latestVersion } = await res.json() as { version: string };
    if (!latestVersion || latestVersion === currentVersion) { return; }
    statusBar.showUpdateAvailable(latestVersion);
  } catch { /* swallow all errors on startup */ }
}
