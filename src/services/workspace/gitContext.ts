// [SCOPE] CHASSIS Git Context — reads git status/diff/log via child process.
// Injected into build and fix prompts so the AI knows what changed recently.
// This is what Claude Code does natively; CHASSIS was blind to git history before this.

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function git(root: string, args: string[], timeout = 8_000): string {
  try {
    const r = cp.spawnSync('git', args, {
      cwd: root, encoding: 'utf8', timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
    });
    return r.status === 0 ? (r.stdout || '').trim() : '';
  } catch { return ''; }
}

export function isGitRepo(root: string): boolean {
  return fs.existsSync(path.join(root, '.git'));
}

/** Last N commit one-liners. */
export function getGitLog(root: string, n = 5): string {
  return git(root, ['log', '--oneline', `--max-count=${n}`, '--no-decorate']);
}

/** Short file-status listing (M/A/D/? per file). */
export function getGitStatus(root: string): string {
  return git(root, ['status', '--short']);
}

/** All uncommitted changes (staged + unstaged), capped at 4 KB. */
export function getGitDiff(root: string): string {
  const staged   = git(root, ['diff', '--cached', '--stat']);
  const unstaged = git(root, ['diff', '--stat']);
  const fullDiff = git(root, ['diff', 'HEAD']).slice(0, 3500);
  return [staged, unstaged, fullDiff].filter(Boolean).join('\n').trim().slice(0, 4000);
}

/**
 * Returns a formatted context block for AI prompt injection.
 * Empty string when the folder is not a git repo (so non-git projects are unaffected).
 */
export function buildGitContextBlock(root: string): string {
  if (!isGitRepo(root)) { return ''; }
  const log    = getGitLog(root);
  const status = getGitStatus(root);
  const diff   = getGitDiff(root);
  const parts: string[] = ['GIT CONTEXT (use this to understand what changed recently):'];
  if (log)    { parts.push(`Recent commits:\n${log}`); }
  if (status) { parts.push(`Uncommitted changes:\n${status}`); }
  if (diff)   { parts.push(`Diff:\n${diff}`); }
  return parts.length > 1 ? parts.join('\n\n') : '';
}
