// [SCOPE] CHASSIS Save Points — git-based checkpoints with plain-English messages

import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SavePoint {
  hash: string;
  message: string;
  timestamp: string;
}

export class SavePointService {
  constructor(private root: string) {}

  /** Check if the root directory is a git repository */
  private isGitRepo(): boolean {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.root, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /** Create a save point with a description */
  async create(description: string): Promise<{ success: boolean; message: string; hash?: string }> {
    if (!this.isGitRepo()) {
      const choice = await vscode.window.showWarningMessage(
        'This folder is not a git repository. Initialize one to use Save Points?',
        { modal: true },
        'Initialize Git',
        'Cancel'
      );
      if (choice !== 'Initialize Git') {
        return { success: false, message: 'Save point cancelled — no git repository.' };
      }
      try {
        execSync('git init', { cwd: this.root, stdio: 'ignore' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Failed to initialize git: ${msg}` };
      }
    }
    try {
      // Stage all changes
      execSync('git add -A', { cwd: this.root });

      // Check if there is anything staged to commit
      const status = execSync('git status --porcelain', { cwd: this.root, encoding: 'utf-8' }).trim();
      if (!status) {
        // Nothing changed — still create a commit with --allow-empty so save points always work
        const commitMessage = `\u{1F4BE} Save Point: ${description}`;
        execSync(`git commit --allow-empty -m "${commitMessage}"`, { cwd: this.root });
      } else {
        const commitMessage = `\u{1F4BE} Save Point: ${description}`;
        execSync(`git commit -m "${commitMessage}"`, { cwd: this.root });
      }

      // Get the commit hash
      const hash = execSync('git rev-parse HEAD', { cwd: this.root, encoding: 'utf-8' }).trim();

      return { success: true, message: `Save point created: ${description}`, hash };
    } catch (err) {
      // [WARN] Capture full stderr so the real git error is surfaced to the user
      const raw = err instanceof Error ? err.message : String(err);
      const stderr = (err as any).stderr?.toString?.() || '';
      const detail = stderr.trim() || raw;
      return { success: false, message: `Failed to create save point: ${detail}` };
    }
  }

  /** List all save points (commits starting with "💾 Save Point:") */
  list(): SavePoint[] {
    try {
      const output = execSync('git log --pretty=format:"%H|%ci|%s" --grep="💾 Save Point:" -20', { cwd: this.root, encoding: 'utf-8' });
      const lines = output.trim().split('\n');
      return lines.map(line => {
        const [hash, timestamp, message] = line.split('|');
        return { hash, timestamp, message };
      });
    } catch {
      return [];
    }
  }

  /** Restore to a specific save point (git reset --hard) */
  async restore(hash: string): Promise<{ success: boolean; message: string }> {
    try {
      execSync(`git reset --hard ${hash}`, { cwd: this.root, stdio: 'ignore' });
      return { success: true, message: `Restored to save point` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to restore: ${msg}` };
    }
  }

  /** Show quick pick to restore a save point */
  async showRestoreQuickPick(): Promise<void> {
    const savePoints = this.list();
    if (savePoints.length === 0) {
      vscode.window.showInformationMessage('No save points found.');
      return;
    }

    const items = savePoints.map(sp => ({
      label: sp.message.replace('💾 Save Point: ', ''),
      description: new Date(sp.timestamp).toLocaleString(),
      hash: sp.hash,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a save point to restore',
    });

    if (!selected) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Restore to "${selected.label}"? This will discard uncommitted changes.`,
      { modal: true },
      'Restore'
    );

    if (confirm === 'Restore') {
      const result = await this.restore(selected.hash);
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }
  }
}
