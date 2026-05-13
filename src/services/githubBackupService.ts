// [SCOPE] GitHub auto-backup service — initializes git, creates/links a GitHub repo, and auto-commits + pushes on a configurable schedule or on every build.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';

export interface GitHubBackupConfig {
  enabled: boolean;
  token: string;          // GitHub personal access token
  username: string;       // GitHub username
  repoName: string;       // repo name (auto-derived from project folder if empty)
  autoBackupOnBuild: boolean;
  autoBackupInterval: number; // minutes, 0 = off
  private: boolean;
}

const CONFIG_KEY = 'chassis.githubBackup';

export class GitHubBackupService {
  private _timer: NodeJS.Timeout | undefined;
  private _root: string;
  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /** Returns current backup config from global state */
  getConfig(): GitHubBackupConfig {
    return this._context.globalState.get<GitHubBackupConfig>(CONFIG_KEY, {
      enabled: false,
      token: '',
      username: '',
      repoName: '',
      autoBackupOnBuild: true,
      autoBackupInterval: 0,
      private: true,
    });
  }

  /** Saves config to global state */
  async saveConfig(config: GitHubBackupConfig): Promise<void> {
    await this._context.globalState.update(CONFIG_KEY, config);
  }

  /** One-time setup: init git, create GitHub repo, add remote, push */
  async setupRepo(): Promise<{ success: boolean; message: string }> {
    if (!this._root) { return { success: false, message: 'No workspace folder open.' }; }
    const cfg = this.getConfig();
    if (!cfg.token || !cfg.username) {
      return { success: false, message: 'GitHub token and username required. Run "chassis: Configure GitHub Backup".' };
    }

    const repoName = cfg.repoName || path.basename(this._root);

    try {
      // Init git if not already
      if (!fs.existsSync(path.join(this._root, '.git'))) {
        execSync('git init', { cwd: this._root });
        execSync('git checkout -b main', { cwd: this._root });
      }

      // Create .gitignore if missing
      const giPath = path.join(this._root, '.gitignore');
      if (!fs.existsSync(giPath)) {
        fs.writeFileSync(giPath, 'node_modules/\n.env\n*.log\n');
      }

      // Create GitHub repo via API
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `token ${cfg.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'CHASSIS-Extension',
        },
        body: JSON.stringify({ name: repoName, private: cfg.private, auto_init: false }),
      });

      if (!createRes.ok && createRes.status !== 422) {
        // 422 = repo already exists, that's fine
        const err = await createRes.json() as { message?: string };
        return { success: false, message: `GitHub API error: ${err.message || createRes.status}` };
      }

      const remoteUrl = `https://${cfg.token}@github.com/${cfg.username}/${repoName}.git`;

      // Add or update remote
      try { execSync('git remote remove origin', { cwd: this._root }); } catch { /* no remote yet */ }
      execSync(`git remote add origin ${remoteUrl}`, { cwd: this._root });

      // Initial commit + push
      await this.backup('Initial CHASSIS backup');

      await this.saveConfig({ ...cfg, repoName });
      return { success: true, message: `✅ Repo "${repoName}" created and pushed to GitHub.` };

    } catch (e) {
      return { success: false, message: `Setup failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /** Commits and pushes all changes with a timestamped message */
  async backup(message?: string): Promise<{ success: boolean; message: string }> {
    if (!this._root) { return { success: false, message: 'No workspace open.' }; }
    const cfg = this.getConfig();
    if (!cfg.enabled) { return { success: false, message: 'GitHub backup is disabled.' }; }

    const commitMsg = message || `CHASSIS backup — ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`;

    return new Promise(resolve => {
      exec(
        `git add -A && git diff --cached --quiet || git commit -m "${commitMsg}" && git push origin main --force-with-lease`,
        { cwd: this._root },
        (err, _stdout, stderr) => {
          if (err && !stderr.includes('nothing to commit')) {
            resolve({ success: false, message: `Backup failed: ${stderr || err.message}` });
          } else {
            resolve({ success: true, message: `✅ Backed up to GitHub: "${commitMsg}"` });
          }
        }
      );
    });
  }

  /** Start interval-based auto-backup timer */
  startTimer(): void {
    const cfg = this.getConfig();
    if (this._timer) { clearInterval(this._timer); this._timer = undefined; }
    if (cfg.enabled && cfg.autoBackupInterval > 0) {
      this._timer = setInterval(() => { this.backup(); }, cfg.autoBackupInterval * 60 * 1000);
    }
  }

  stopTimer(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = undefined; }
  }
}
