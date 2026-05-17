// [SCOPE] CHASSIS Git Auto-Commit Service — optional local commits after every AI build or fix
// Asks once per project on first build. Stores answer in .chassis/config.json.
// Silent on all errors — never interrupts the build pipeline.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
    const safeMsg = message.replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 150);
    execSync(`git commit -m "${safeMsg}"`, { cwd: root, stdio: 'ignore' });
  } catch { /* silent */ }
}

function readPref(root: string): 'auto' | 'off' | undefined {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.chassis', 'config.json'), 'utf-8'));
    return cfg.autoCommit as 'auto' | 'off' | undefined;
  } catch { return undefined; }
}

function savePref(root: string, value: 'auto' | 'off'): void {
  try {
    const cfgPath = path.join(root, '.chassis', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    cfg.autoCommit = value;
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch { /* never block */ }
}

export async function autoCommitIfEnabled(root: string, message: string, files?: string[]): Promise<void> {
  try {
    // Only applies to CHASSIS projects — if no config.json, skip silently
    if (!fs.existsSync(path.join(root, '.chassis', 'config.json'))) { return; }
    const pref = readPref(root);
    if (pref === 'off') { return; }
    if (pref === 'auto') { doCommit(root, message, files); return; }
    // Never asked — prompt once, plain English
    const choice = await vscode.window.showInformationMessage(
      'Want CHASSIS to automatically save your change history? You\'ll be able to undo any change at any time.',
      'Yes, save history',
      'No thanks'
    );
    if (choice === 'Yes, save history') { savePref(root, 'auto'); doCommit(root, message, files); }
    else if (choice === 'No thanks') { savePref(root, 'off'); }
    // Dismissed = ask again next build
  } catch { /* silent */ }
}
