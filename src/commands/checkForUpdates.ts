// [SCOPE] Redivivus auto-updater — downloads new tarball, extracts, updates stable symlink, restarts
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const STABLE_LINK = path.join(os.homedir(), '.local', 'opt', 'redivivus');

function getInstallDir(): string {
  // Resolve the stable symlink to find where the current binary lives
  try { return fs.realpathSync(STABLE_LINK); } catch { return ''; }
}

function isDevBuild(): boolean {
  const dir = getInstallDir();
  return dir.includes('/projects/redivivus-build') || dir.includes('/projects/redivivus/');
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

function extractTarball(tarPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const proc = cp.spawn('tar', ['-xzf', tarPath, '-C', destDir, '--strip-components=1'], { stdio: 'ignore' });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
    proc.on('error', reject);
  });
}

export async function runUpdate(newVersion: string, downloadUrl: string): Promise<void> {
  const installTarget = path.join(os.homedir(), '.local', 'opt', `redivivus-${newVersion}`);
  const tarPath = path.join(os.tmpdir(), `redivivus-${newVersion}.tar.gz`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Updating Redivivus to v${newVersion}`, cancellable: false },
    async (progress) => {
      progress.report({ message: 'Downloading…', increment: 0 });

      await downloadFile(downloadUrl, tarPath, (pct) => {
        progress.report({ message: `Downloading… ${pct}%`, increment: pct / 2 });
      });

      progress.report({ message: 'Extracting…', increment: 50 });
      await extractTarball(tarPath, installTarget);

      // Update stable symlink atomically
      try { fs.unlinkSync(STABLE_LINK); } catch { /* didn't exist */ }
      fs.symlinkSync(installTarget, STABLE_LINK);

      // Copy icon to stable path
      const iconSrc = path.join(installTarget, 'resources', 'app', 'resources', 'linux', 'redivivus.png');
      const iconDest = path.join(os.homedir(), '.local', 'share', 'icons', 'redivivus.png');
      if (fs.existsSync(iconSrc)) { fs.copyFileSync(iconSrc, iconDest); }

      // Clean up tarball
      try { fs.unlinkSync(tarPath); } catch { /* best-effort */ }

      progress.report({ message: 'Done!', increment: 100 });
    }
  );

  const choice = await vscode.window.showInformationMessage(
    `Redivivus v${newVersion} is ready. Restart to apply the update.`,
    'Restart Now', 'Later'
  );

  if (choice === 'Restart Now') {
    // Spawn the new binary detached, then quit the current process
    try {
      const newBin = path.join(STABLE_LINK, 'redivivus');
      cp.spawn(newBin, ['--reuse-window'], { detached: true, stdio: 'ignore' }).unref();
    } catch { /* best-effort spawn */ }
    setTimeout(() => vscode.commands.executeCommand('workbench.action.quit'), 500);
  }
}

export function registerCheckForUpdatesCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('redivivus.checkForUpdates', async () => {
      const pkg = require('../../package.json');
      const currentVersion: string = pkg.version;
      const cfg = vscode.workspace.getConfiguration('redivivus');
      const apiBase = cfg.get<string>('apiBase') || 'https://redivivus.dev';
      const webBase = apiBase.replace('/api/v1', '');

      try {
        const res = await fetch(`${webBase}/api/version`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) { vscode.window.showErrorMessage('Could not check for updates — try again later.'); return; }
        const { version: latestVersion, downloadUrl } = await res.json() as { version: string; downloadUrl: string };

        if (!latestVersion || latestVersion === currentVersion) {
          vscode.window.showInformationMessage(`Redivivus v${currentVersion} is up to date.`); return;
        }

        if (isDevBuild()) {
          vscode.window.showInformationMessage(`v${latestVersion} is available (dev build — run release.sh to update).`); return;
        }

        const choice = await vscode.window.showInformationMessage(
          `Redivivus v${latestVersion} is available (you have v${currentVersion}).`,
          'Update Now', 'Dismiss'
        );
        if (choice === 'Update Now') { await runUpdate(latestVersion, downloadUrl); }
      } catch (err) {
        vscode.window.showErrorMessage(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}
