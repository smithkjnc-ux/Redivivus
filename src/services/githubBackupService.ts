// [SCOPE] GitHub integration — token in VS Code secret storage, manual-only commits (never auto).
// User connects once in Setup Hub. Redivivus never commits or pushes without explicit user action.
// validateToken(): verifies PAT against GitHub API before saving.
// commitFiles(): commits specific files only — never git add -A on user's full project.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';

export interface GitHubConfig {
  username: string;
  repoName: string;
  private: boolean;
}

const CFG_KEY = 'redivivus.githubConfig';
const SECRET_KEY = 'redivivus.github.token';
const DEFAULT_GITIGNORE = 'node_modules/\n.env\n*.log\n.redivivus/logs/\n';

export class GitHubBackupService {
  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  private get _root(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /** Token stored in VS Code SecretStorage — never in globalState or on disk */
  async getToken(): Promise<string> {
    return (await this._context.secrets.get(SECRET_KEY)) || '';
  }

  async storeToken(token: string): Promise<void> {
    if (token) { await this._context.secrets.store(SECRET_KEY, token); }
    else { await this._context.secrets.delete(SECRET_KEY); }
  }

  /** Non-sensitive config (username, repo name, visibility) in globalState */
  getConfig(): GitHubConfig {
    return this._context.globalState.get<GitHubConfig>(CFG_KEY, { username: '', repoName: '', private: true });
  }

  async saveConfig(cfg: GitHubConfig): Promise<void> {
    await this._context.globalState.update(CFG_KEY, cfg);
  }

  /** Validates PAT against GitHub API — returns login name on success */
  async validateToken(token: string): Promise<{ valid: boolean; login?: string; error?: string }> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `token ${token}`, 'User-Agent': 'Redivivus-Extension' },
      });
      if (res.ok) {
        const data = await res.json() as { login?: string };
        return { valid: true, login: data.login };
      }
      return { valid: false, error: res.status === 401 ? 'Token rejected by GitHub' : `GitHub error ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error — check your connection' };
    }
  }

  async isConnected(): Promise<boolean> {
    return !!(await this.getToken());
  }

  /** One-time per-project: git init, create GitHub repo, add remote, initial push */
  async setupRepo(): Promise<{ success: boolean; message: string }> {
    const token = await this.getToken();
    const cfg = this.getConfig();
    const root = this._root;
    if (!token || !cfg.username) { return { success: false, message: 'GitHub not connected. Open Setup Hub to connect.' }; }
    if (!root) { return { success: false, message: 'No workspace folder open.' }; }
    const repoName = cfg.repoName || path.basename(root);
    try {
      if (!fs.existsSync(path.join(root, '.git'))) {
        execSync('git init', { cwd: root, stdio: 'ignore' });
        try { execSync('git checkout -b main', { cwd: root, stdio: 'ignore' }); } catch { }
      }
      if (!fs.existsSync(path.join(root, '.gitignore'))) {
        fs.writeFileSync(path.join(root, '.gitignore'), DEFAULT_GITIGNORE, 'utf-8');
      }
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Redivivus-Extension' },
        body: JSON.stringify({ name: repoName, private: cfg.private, auto_init: false }),
      });
      if (!createRes.ok && createRes.status !== 422) {
        const err = await createRes.json() as { message?: string };
        return { success: false, message: `GitHub API error: ${err.message || createRes.status}` };
      }
      const remoteUrl = `https://${cfg.username}:${token}@github.com/${cfg.username}/${repoName}.git`;
      try { execSync('git remote remove origin', { cwd: root, stdio: 'ignore' }); } catch { }
      execSync(`git remote add origin ${remoteUrl}`, { cwd: root, stdio: 'ignore' });
      await this.commitFiles('Initial Redivivus commit', []);
      await this._context.globalState.update(CFG_KEY, { ...cfg, repoName });
      return { success: true, message: `Repo "${repoName}" created on GitHub.` };
    } catch (e) {
      return { success: false, message: `Setup failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /** Commits specific files and pushes. Called only when user explicitly clicks Commit in the result card. */
  async commitFiles(message: string, files: string[]): Promise<{ success: boolean; message: string }> {
    const token = await this.getToken();
    const root = this._root;
    if (!token) { return { success: false, message: 'GitHub not connected.' }; }
    if (!root) { return { success: false, message: 'No workspace folder open.' }; }
    return new Promise(resolve => {
      try {
        const addParts = files.length > 0
          ? files.map(f => `git add -- "${(path.isAbsolute(f) ? f : path.join(root, f)).replace(/"/g, '\\"')}"`).join(' && ')
          : 'git add -A';
        const safeMsg = message.replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 150);
        const cmd = `${addParts} && git diff --cached --quiet || (git commit -m "${safeMsg}" && git push origin main --force-with-lease)`;
        exec(cmd, { cwd: root }, (err, _stdout, stderr) => {
          if (err && !stderr?.includes('nothing to commit')) {
            resolve({ success: false, message: stderr || err.message });
          } else {
            resolve({ success: true, message: `Committed: "${safeMsg}"` });
          }
        });
      } catch (e) { resolve({ success: false, message: String(e) }); }
    });
  }
}
