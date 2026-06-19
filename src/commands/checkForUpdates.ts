// [SCOPE] Redivivus auto-updater — downloads VSIX from GitHub Releases, installs, reloads
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';

const STABLE_LINK = path.join(os.homedir(), '.local', 'opt', 'redivivus');

// [M6] AbortSignal.timeout() does not reliably abort Electron's fetch (see services/build/cloudBuildClient.ts),
// so race the request against a hard timer — a hung /api/version can never block the update check.
// Exported for the integration test (scripts/test-update-and-debrand.cjs).
export async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetch(url), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

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

// [C1] Exported for the integration test (scripts/test-update-and-debrand.cjs).
export async function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let settled = false;
    const fail = (err: Error) => {
      if (settled) { return; }
      settled = true;
      file.destroy();
      reject(err);
    };
    // [C1] A write-stream error must REJECT, not hang. Previously there was NO file error handler, so a
    // failed write (e.g. piping into a closed stream after a redirect) left the promise pending forever.
    file.on('error', fail);

    let redirects = 0;
    const request = (u: string) => {
      https.get(u, (res) => {
        const status = res.statusCode || 0;
        // [C1] Follow redirects to the FINAL 200 BEFORE piping. GitHub release-asset URLs ALWAYS
        // 301/302 to objects.githubusercontent.com; the old code called file.close() on the redirect
        // and then reused the now-dead stream for the 200 body, so the download hung forever. Keep the
        // single write stream open, drain the redirect response, and re-request the Location header.
        if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
          res.resume();
          if (++redirects > 10) { fail(new Error('Too many redirects')); return; }
          const loc = res.headers.location;
          if (!loc) { fail(new Error(`Redirect ${status} with no Location header`)); return; }
          request(loc);
          return;
        }
        if (status !== 200) { res.resume(); fail(new Error(`HTTP ${status}`)); return; }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) { onProgress(Math.round((received / total) * 100)); }
        });
        res.on('error', fail);
        file.on('finish', () => { if (!settled) { settled = true; file.close(); resolve(); } });
        res.pipe(file);
      }).on('error', fail);
    };
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
      const apiBase = cfg.get<string>('apiBase') || 'https://redivivus-backend-1017737301468.us-east4.run.app';
      const webBase = apiBase.replace('/api/v1', '');
      try {
        const res = await fetchWithTimeout(`${webBase}/api/version`, 20_000);
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
    const apiBase = cfg.get<string>('apiBase') || 'https://redivivus-backend-1017737301468.us-east4.run.app';
    const webBase = apiBase.replace('/api/v1', '');
    const res = await fetchWithTimeout(`${webBase}/api/version`, 20_000);
    if (!res.ok) { return; }
    await context.globalState.update('redivivus.lastUpdateCheck', Date.now());
    const { version: latestVersion } = await res.json() as { version: string };
    if (!latestVersion || latestVersion === currentVersion) { return; }
    statusBar.showUpdateAvailable(latestVersion);
  } catch { /* swallow all errors on startup */ }
}
