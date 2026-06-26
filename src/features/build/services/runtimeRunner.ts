// [SCOPE] Runtime Runner — detect the right start command and run the project to verify it works.
// Script mode: captures full output + exit code. Server mode: times out after 8s (means it's running).
// Returns null command for HTML-only projects — those use the browser preview instead.
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface RuntimeResult {
  success: boolean;
  output: string;
  command: string;
  isServer: boolean; // true = process timed out = server stayed alive = good
}

/** Returns null for HTML-only builds (preview browser is already shown). */
export function detectRunCommand(root: string): string | null {
  let files: string[];
  try { files = fs.readdirSync(root); } catch { return null; }

  const hasHtml = files.includes('index.html');
  const hasPkg  = files.includes('package.json');
  const hasPy   = files.some(f => f.endsWith('.py'));

  // Pure HTML game/page — browser preview already handles it, no terminal needed
  if (hasHtml && !hasPkg && !hasPy) return null;

  if (hasPkg) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.scripts?.start)     return 'npm start';
      if (pkg.scripts?.dev)       return 'npm run dev';
      if (pkg.main)               return `node ${pkg.main}`;
    } catch { /* no-op */ }
    if (files.includes('index.js'))  return 'node index.js';
    if (files.includes('server.js')) return 'node server.js';
    if (files.includes('app.js'))    return 'node app.js';
  }

  // Python — prefer conventional entry names, then any .py file that is actually runnable.
  // [FIX] Previously only matched main/app/server/run.py, so a build like `calculator.py`
  // produced no Run button even though the post-build guidance told the user to click Run.
  for (const f of ['main.py', 'app.py', 'server.py', 'run.py', '__main__.py']) {
    if (files.includes(f)) return `python ${f}`;
  }
  if (hasPy) {
    const pyFiles = files.filter(f => f.endsWith('.py'));
    // A file with a __main__ guard is the real entry point — prefer it.
    const withMain = pyFiles.find(f => {
      try { return /if\s+__name__\s*==\s*['"]__main__['"]/.test(fs.readFileSync(path.join(root, f), 'utf8')); }
      catch { return false; }
    });
    if (withMain) return `python ${withMain}`;
    // Otherwise, if there's exactly one .py file, it's unambiguously the program to run.
    if (pyFiles.length === 1) return `python ${pyFiles[0]}`;
  }
  if (files.includes('main.go'))    return 'go run .';
  if (files.includes('Cargo.toml')) return 'cargo run';
  if (files.includes('main.sh'))    return 'bash main.sh';
  return null;
}

/** True when an npm project has not had its dependencies installed yet. */
export function needsNodeInstall(root: string): boolean {
  return fs.existsSync(path.join(root, 'package.json')) && !fs.existsSync(path.join(root, 'node_modules'));
}

// [WARN] Async on purpose — npm install can take >100s; a synchronous spawnSync would freeze the
// extension host. Returns null on success, or an error string on failure/timeout. Never throws.
/** Run `npm install` in the project so a freshly-scaffolded build can actually run. */
export function installNodeDeps(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    let stderr = '';
    const child = cp.spawn('npm install', { cwd: root, shell: true });
    const timer = setTimeout(() => { try { child.kill(); } catch { /* already exited */ } resolve('npm install timed out after 120s'); }, 120_000);
    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.on('error', e => { clearTimeout(timer); resolve(`npm install error: ${e.message}`); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? null : `npm install failed: ${stderr.trim().slice(-300) || `exit ${code}`}`); });
  });
}

// [WARN] detached: true puts the shell + everything it spawns (npm -> node server) in one process
// group, so killGroup() can SIGKILL the whole tree on timeout. spawnSync only killed the direct shell,
// leaving the real server orphaned on the port. Async so it can kill the group without blocking.
/** Run the project with an 8-second timeout. Never throws. Resolves with the run result. */
export function runProject(root: string): Promise<RuntimeResult> {
  const command = detectRunCommand(root);
  if (!command) return Promise.resolve({ success: true, output: '', command: '', isServer: false });

  return new Promise<RuntimeResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (r: RuntimeResult): void => { if (!settled) { settled = true; resolve(r); } };
    const clean = (): string => [stdout, stderr].join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

    let child: cp.ChildProcess;
    try {
      child = cp.spawn(command, {
        cwd: root, shell: true, detached: true,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', PORT: '3000' },
      });
    } catch (e) {
      return finish({ success: false, output: String(e), command, isServer: false });
    }

    // Kill the entire process group (negative pid) so orphaned children (the actual server) die too.
    const killGroup = (): void => { try { if (child.pid) { process.kill(-child.pid, 'SIGKILL'); } } catch { /* group already gone */ } };

    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });

    // Still alive after 8s = server that stayed up = good. Reap the group and report success.
    const timer = setTimeout(() => { killGroup(); finish({ success: true, output: clean(), command, isServer: true }); }, 8_000);
    child.on('error', (e) => { clearTimeout(timer); killGroup(); finish({ success: false, output: String(e), command, isServer: false }); });
    child.on('close', (code) => { clearTimeout(timer); finish({ success: code === 0, output: clean(), command, isServer: false }); });
  });
}
