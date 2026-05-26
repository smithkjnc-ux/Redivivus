// [SCOPE] Collects local project context for the cloud build API.
// Reads blueprint, vault, git, project rules, and existing files — sends as plain data, never logic.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { VaultService } from '../vault/vaultService';

export interface CloudBuildContext {
  blueprint?: { projectName?: string; what?: string; who?: string; where?: string; when?: string; why?: string }
  existingFiles?: Record<string, string>
  vaultItems?: Array<{ name: string; code: string; language?: string; tags?: string[] }>
  deadEnds?: string
  projectRules?: string
  recentBuilds?: string[]
  gitContext?: string
  projectMap?: string
  targetFile?: string
  isFix?: boolean
}

function readFileSafe(p: string, maxBytes = 8000): string {
  try {
    const content = fs.readFileSync(p, 'utf8');
    return content.length > maxBytes ? content.slice(0, maxBytes) + '\n[truncated]' : content;
  } catch { return ''; }
}

function buildProjectMap(root: string): string {
  const lines: string[] = [];
  const walk = (dir: string, depth = 0) => {
    if (depth > 3) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (/^(node_modules|\.git|\.redivivus|out|dist|build|__pycache__)$/.test(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full);
        if (entry.isDirectory()) { lines.push(rel + '/'); walk(full, depth + 1); }
        else { lines.push(rel); }
      }
    } catch {}
  };
  walk(root);
  return lines.slice(0, 80).join('\n');
}

function buildGitContext(root: string): string {
  try {
    const { execSync } = require('child_process');
    const opts = { cwd: root, encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] as const };
    const log = execSync('git log --oneline -5 2>/dev/null', opts) as string || '';
    const status = execSync('git status --short 2>/dev/null', opts) as string || '';
    const diff = execSync('git diff --stat HEAD 2>/dev/null', opts) as string || '';
    return [log && `RECENT COMMITS:\n${log}`, status && `STATUS:\n${status}`, diff && `CHANGES:\n${diff}`]
      .filter(Boolean).join('\n').slice(0, 3000);
  } catch { return ''; }
}

function getRecentBuilds(root: string): string[] {
  try {
    const p = path.join(root, '.redivivus', 'build_history.json');
    const history = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{ task?: string }>;
    return history.slice(-3).map(h => h.task || '').filter(Boolean);
  } catch { return []; }
}

export async function collectBuildContext(
  root: string,
  task: string,
  vault: VaultService | undefined,
  targetFileHint?: string,
  isFix?: boolean,
): Promise<CloudBuildContext> {
  // Blueprint
  let blueprint: CloudBuildContext['blueprint'] | undefined;
  try {
    const cfg = JSON.parse(readFileSafe(path.join(root, '.redivivus', 'config.json')));
    if (cfg.blueprint || cfg.projectName) {
      blueprint = {
        projectName: cfg.projectName,
        what: cfg.blueprint?.what,
        who:  cfg.blueprint?.who,
        where: cfg.blueprint?.where,
        when: cfg.blueprint?.when,
        why:  cfg.blueprint?.why,
      };
    }
  } catch {}

  // Vault items (top 20 most relevant by simple text match)
  let vaultItems: CloudBuildContext['vaultItems'] | undefined;
  if (vault) {
    try {
      const all = vault.listItems() as Array<{ name: string; code: string; language?: string; tags?: string[] }>;
      const taskLow = task.toLowerCase();
      const scored = all.map(item => {
        const words = (item.name + ' ' + (item.tags ?? []).join(' ')).toLowerCase();
        const score = task.toLowerCase().split(/\W+/).filter(w => w.length > 3).filter(w => words.includes(w)).length;
        return { item, score };
      });
      vaultItems = scored.sort((a, b) => b.score - a.score).slice(0, 20).map(s => s.item);
    } catch {}
  }

  // Existing target file content (for modifications)
  let existingFiles: Record<string, string> | undefined;
  const candidates = targetFileHint ? [targetFileHint] : findLikelyTargets(root, task);
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      existingFiles ??= {};
      existingFiles[rel] = readFileSafe(abs, 12000);
    }
  }

  return {
    blueprint,
    existingFiles,
    vaultItems,
    deadEnds: readFileSafe(path.join(root, '.redivivus', 'dead_ends.md'), 4000) || undefined,
    projectRules: readFileSafe(path.join(root, '.redivivus', 'rules.md'), 4000) || undefined,
    recentBuilds: getRecentBuilds(root),
    gitContext: buildGitContext(root) || undefined,
    projectMap: buildProjectMap(root) || undefined,
    targetFile: targetFileHint,
    isFix,
  };
}

function findLikelyTargets(root: string, task: string): string[] {
  const taskLow = task.toLowerCase();
  const isModVerb = /^(fix|update|change|add|remove|modify|extend|improve)\b/i.test(taskLow);
  if (!isModVerb) return [];
  const common = ['index.html', 'index.ts', 'src/index.ts', 'src/App.tsx', 'main.py', 'app.py'];
  return common.filter(f => fs.existsSync(path.join(root, f)));
}
