// [SCOPE] CHASSIS logging operations — gitignore update, work log append, roadmap append, dead end append
// Called by chassisInit and chassisService. No config, rules, or path logic here.

import * as fs from 'fs';
import * as path from 'path';
import { ChassisPaths } from './chassisPaths.js';

export async function updateGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, '.gitignore');
  const entry = '\n# CHASSIS session data (blueprints and logs are tracked)\n.chassis/sessions/\n';

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.chassis/sessions/')) {
      fs.appendFileSync(gitignorePath, entry);
    }
  } else {
    fs.writeFileSync(gitignorePath, entry);
  }
}

export function appendWorkLog(paths: ChassisPaths, text: string): void {
  if (!fs.existsSync(paths.worklogPath)) { return; }
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  const entry = `## [${timestamp}]\n${text}\n\n`;
  fs.appendFileSync(paths.worklogPath, entry);
}

export function appendRoadmap(paths: ChassisPaths, sessionGoal: string, completed: string[], inProgress: string[], nextStart: string): void {
  const roadmap = paths.roadmapPath;
  if (!fs.existsSync(roadmap)) { return; }
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  const lines: string[] = [
    `## [${timestamp}] — Session End`,
    `- **Goal:** ${sessionGoal}`,
  ];
  if (completed.length > 0) lines.push(`- **Completed:** ${completed.join(', ')}`);
  if (inProgress.length > 0) lines.push(`- **In Progress:** ${inProgress.join(', ')}`);
  if (nextStart) lines.push(`- **Next session starts with:** ${nextStart}`);
  lines.push('');

  // Update the "Last updated" line
  let content = fs.readFileSync(roadmap, 'utf-8');
  const entry = lines.join('\n');
  // Insert before the last --- separator
  const lastSep = content.lastIndexOf('\n---\n');
  if (lastSep !== -1) {
    content = content.slice(0, lastSep) + '\n' + entry + '\n---\n' + content.slice(lastSep + 5);
  } else {
    content += '\n' + entry;
  }
  // Refresh last updated line
  content = content.replace(/\*Last updated:.*?\*$/m, `*Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} — Session: ${sessionGoal}*`);
  fs.writeFileSync(roadmap, content);
}

export function appendDeadEnd(paths: ChassisPaths, attempted: string, failedBecause: string, lesson: string): void {
  if (!fs.existsSync(paths.deadendsPath)) { return; }
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  const entry = `## [${timestamp}] — Dead End\n- **Attempted:** ${attempted}\n- **Failed because:** ${failedBecause}\n- **Lesson:** ${lesson}\n\n`;
  fs.appendFileSync(paths.deadendsPath, entry);
}
