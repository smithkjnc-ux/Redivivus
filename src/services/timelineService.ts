// [SCOPE] Redivivus Project Timeline — aggregates work_log, sessions, and git history into a visual timeline

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface TimelineEntry {
  timestamp: string;
  type: 'session' | 'build' | 'scan' | 'commit' | 'error';
  title: string;
  details: string;
}

export class TimelineService {
  constructor(private root: string) {}

  /** Generate a markdown timeline from all available project data */
  generateTimeline(): string {
    const entries: TimelineEntry[] = [];

    // Add session entries from work_log
    this.addWorkLogEntries(entries);

    // Add git commits
    this.addGitCommits(entries);

    // Add build errors
    this.addBuildErrors(entries);

    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Format as markdown
    return this.formatTimeline(entries);
  }

  private addWorkLogEntries(entries: TimelineEntry[]): void {
    const worklogPath = path.join(this.root, '.redivivus', 'work_log.md');
    if (!fs.existsSync(worklogPath)) { return; }

    const content = fs.readFileSync(worklogPath, 'utf-8');
    const sessionRegex = /## \[([^\]]+)\] ([^\n]+)/g;
    let match;
    while ((match = sessionRegex.exec(content)) !== null) {
      const [, timestamp, title] = match;
      entries.push({
        timestamp,
        type: 'session',
        title,
        details: 'Session logged in work log',
      });
    }
  }

  private addGitCommits(entries: TimelineEntry[]): void {
    try {
      const { execSync } = require('child_process');
      const gitLog = execSync('git log --pretty=format:"%H|%ci|%s" -20', { cwd: this.root, encoding: 'utf-8' });
      const lines = gitLog.trim().split('\n');
      for (const line of lines) {
        const [, timestamp, message] = line.split('|');
        entries.push({
          timestamp,
          type: 'commit',
          title: message,
          details: 'Git commit',
        });
      }
    } catch {
      // Not a git repo or git not available
    }
  }

  private addBuildErrors(entries: TimelineEntry[]): void {
    const errorPath = path.join(this.root, '.redivivus', 'build_errors.log');
    if (!fs.existsSync(errorPath)) { return; }

    const content = fs.readFileSync(errorPath, 'utf-8');
    const errorRegex = /\[([^\]]+)\] BUILD FAILED/g;
    let match;
    while ((match = errorRegex.exec(content)) !== null) {
      const [, timestamp] = match;
      entries.push({
        timestamp,
        type: 'error',
        title: 'Build failed',
        details: 'See build_errors.log for details',
      });
    }
  }

  private formatTimeline(entries: TimelineEntry[]): string {
    if (entries.length === 0) {
      return '# Project Timeline\n\nNo activity recorded yet.';
    }

    const iconMap: Record<TimelineEntry['type'], string> = {
      session: '📝',
      build: '🔨',
      scan: '🔍',
      commit: '📦',
      error: '❌',
    };

    let md = '# Project Timeline\n\n';
    md += `Showing ${entries.length} entries (newest first)\n\n---\n\n`;

    for (const entry of entries) {
      const icon = iconMap[entry.type] || '📌';
      const date = new Date(entry.timestamp).toLocaleString();
      md += `### ${icon} ${entry.title}\n`;
      md += `**${date}** — ${entry.details}\n\n`;
    }

    return md;
  }

  /** Show timeline in the chat panel by injecting markdown */
  static showInChat(conversation: any[], refresh: () => void): void {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      conversation.push({ role: 'assistant', content: '⚠️ No project folder is open.', timestamp: Date.now() });
      refresh();
      return;
    }

    const service = new TimelineService(root);
    const timeline = service.generateTimeline();
    conversation.push({ role: 'assistant', content: timeline, timestamp: Date.now() });
    refresh();
  }
}
