// [SCOPE] Redivivus Git Auto-Commit Service — optional local commits after every AI build or fix
// Asks once per project on first build. Stores answer in .redivivus/config.json.
// Silent on all errors — never interrupts the build pipeline.

import * as fs from 'fs';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';

const DEFAULT_GITIGNORE = [
  'node_modules/',
  '.env',
  '*.log',
  '__pycache__/',
  '.DS_Store',
  'venv/',
  '.venv/',
].join('\n') + '\n';

let _gitAvailable: boolean | undefined;

function hasGit(): boolean {
  if (_gitAvailable === undefined) {
    try { execSync('git --version', { stdio: 'ignore' }); _gitAvailable = true; }
    catch { _gitAvailable = false; }
  }
  return _gitAvailable;
}

function ensureGitRepo(root: string): void {
  if (!fs.existsSync(path.join(root, '.git'))) {
    execSync('git init', { cwd: root, stdio: 'ignore' });
    try { execSync('git checkout -b main', { cwd: root, stdio: 'ignore' }); } catch { /* git < 2.28 stays on master */ }
  }
  const giPath = path.join(root, '.gitignore');
  if (!fs.existsSync(giPath)) {
    fs.writeFileSync(giPath, DEFAULT_GITIGNORE, 'utf-8');
  }
}

// [WARN] message is shell-injected — double-quotes are replaced with single-quotes before use
function doCommit(root: string, message: string, files?: string[]): void {
  try {
    if (!hasGit()) { return; }
    ensureGitRepo(root);
    if (files && files.length > 0) {
      for (const f of files) {
        const abs = path.isAbsolute(f) ? f : path.join(root, f);
        try { execSync(`git add -- "${abs.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'ignore' }); } catch { }
      }
    } else {
      execSync('git add -A', { cwd: root, stdio: 'ignore' });
    }
    const staged = execSync('git diff --cached --name-only', { cwd: root, encoding: 'utf-8' }).trim();
    if (!staged) { return; }
    const safeMsg = message.replace(/\n/g, ' ').slice(0, 150);
    // [FIX] Use execFileSync (array args) to prevent shell injection via backticks or $() in message
    execFileSync('git', ['commit', '-m', safeMsg], { cwd: root, stdio: 'ignore' });
  } catch { /* silent */ }
}

function readPref(root: string): 'auto' | 'off' | undefined {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.redivivus', 'config.json'), 'utf-8'));
    return cfg.autoCommit as 'auto' | 'off' | undefined;
  } catch { return undefined; }
}

function savePref(root: string, value: 'auto' | 'off'): void {
  try {
    const cfgPath = path.join(root, '.redivivus', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    cfg.autoCommit = value;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch { /* never block */ }
}

export async function autoCommitIfEnabled(root: string, message: string, files?: string[]): Promise<void> {
  try {
    // Only applies to Redivivus projects — if no config.json, skip silently
    if (!fs.existsSync(path.join(root, '.redivivus', 'config.json'))) { return; }
    const pref = readPref(root);
    if (pref === 'off') { return; }
    // [FIX] Change history / snapshots are AUTOMATIC — never a blocking question (PapaJoe: "snapshots should
    // be an automatic thing, not a question"). The old code awaited a showInformationMessage when the pref was
    // unset, which (a) interrupted the user and (b) BLOCKED the Architect "Fix All" batch: the first file's
    // edit awaited this prompt, so files 2..N never started (only 1 of 5 got fixed). Default to 'auto', persist
    // it so the prompt never appears, and commit. Opt out is still possible via autoCommit:"off" in config.json.
    if (pref === undefined) { savePref(root, 'auto'); }
    doCommit(root, message, files);
  } catch { /* silent */ }
}
