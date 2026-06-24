// [SCOPE] Collects local project context for the cloud build API.
// Reads blueprint, vault, git, project rules, existing files, and chat history.
// Sends complete data — no pre-emptive caps. budgetContext() is the last-resort trimmer only.

import * as fs from 'fs';
import * as path from 'path';
import type { VaultService } from '../vault/vaultService';
import { estimateTokens, getInputBudget } from '../ai/tokenBudget.js';
import { readFileSafe, buildProjectMap, buildGitContext, getRecentBuilds } from './buildContextHelpers.js';

export interface CloudBuildContext {
  blueprint?: { projectName?: string; what?: string; who?: string; where?: string; when?: string; why?: string; mechanics?: string }
  existingFiles?: Record<string, string>
  vaultItems?: Array<{ name: string; code: string; language?: string; tags?: string[] }>
  deadEnds?: string
  projectRules?: string
  recentBuilds?: string[]
  gitContext?: string
  projectMap?: string
  targetFile?: string
  isFix?: boolean
  recentChat?: string
  aiTemperature?: any
}

export async function collectBuildContext(
  root: string,
  task: string,
  vault: VaultService | undefined,
  targetFileHint?: string,
  isFix?: boolean,
  conversation?: Array<{ role: string; content: string; timestamp?: number }>,
  sessionAiTemperature?: any
): Promise<CloudBuildContext> {
  // Blueprint and settings
  let blueprint: CloudBuildContext['blueprint'] | undefined;
  let aiTemperature: CloudBuildContext['aiTemperature'] | undefined;
  try {
    const cfg = JSON.parse(readFileSafe(path.join(root, '.redivivus', 'config.json')));
    if (cfg.blueprint || cfg.projectName) {
      // [BUILD CONTRACT] Include MECHANICS (the behavioral/quality contract HEAD) — the collector used to drop it,
      // so the worker only ever saw the 5 W's. Now whatever mechanics exist reach the build worker too.
      blueprint = { projectName: cfg.projectName, what: cfg.blueprint?.what, who: cfg.blueprint?.who,
        where: cfg.blueprint?.where, when: cfg.blueprint?.when, why: cfg.blueprint?.why,
        mechanics: cfg.blueprint?.mechanics || undefined };
    }
    if (cfg.aiTemperature || sessionAiTemperature) {
      aiTemperature = { ...(cfg.aiTemperature || {}), ...(sessionAiTemperature || {}) };
    }
  } catch {}

  // Vault items — all relevant ones, no arbitrary cap
  let vaultItems: CloudBuildContext['vaultItems'] | undefined;
  if (vault) {
    try {
      const all = vault.listItems() as Array<{ name: string; code: string; language?: string; tags?: string[] }>;
      const scored = all.map(item => {
        const words = (item.name + ' ' + (item.tags ?? []).join(' ')).toLowerCase();
        const score = task.toLowerCase().split(/\W+/).filter(w => w.length > 3).filter(w => words.includes(w)).length;
        return { item, score };
      });
      const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
      vaultItems = matched.length > 0 ? matched.map(s => s.item) : undefined;
    } catch {}
  }

  // Existing target file — full content, no byte cap
  let existingFiles: Record<string, string> | undefined;
  const candidates = targetFileHint ? [targetFileHint] : findLikelyTargets(root, task);
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) { existingFiles ??= {}; existingFiles[rel] = readFileSafe(abs); }
  }

  // Recent chat — last 20 turns, full message content, no per-message truncation
  let recentChat: string | undefined;
  if (conversation && conversation.length > 0) {
    const UI_TOKEN_RE = /__BUILD_WORKING__|__RESULT_CARD__|__END_RESULT_CARD__|TOK_|__AI_BREAKDOWN__/;
    const turns = conversation
      .filter(m => !UI_TOKEN_RE.test(m.content) && (m.role === 'user' || m.role === 'assistant'))
      .slice(-20)
      .map(m => `${m.role === 'user' ? 'User' : 'Redivivus'}: ${m.content}`)
      .join('\n');
    if (turns.length > 0) { recentChat = turns; }
  }

  const deadEnds = readFileSafe(path.join(root, '.redivivus', 'dead_ends.md'))  || undefined;
  const projectRules = getRecentBuilds(root).length > 0
      ? (readFileSafe(path.join(root, '.redivivus', 'rules.md')) || undefined) : undefined;
  const recentBuilds = getRecentBuilds(root);
  const gitContext = buildGitContext(root) || undefined;
  const projectMap = buildProjectMap(root) || undefined;

  const assembled: CloudBuildContext = {
    blueprint,
    existingFiles,
    vaultItems,
    deadEnds,
    projectRules,
    recentBuilds,
    gitContext,
    projectMap,
    targetFile: targetFileHint,
    isFix,
    recentChat: recentChat || undefined,
    aiTemperature,
  };
  return assembled;
}

function findLikelyTargets(root: string, task: string): string[] {
  const taskLow = task.toLowerCase();
  // Explicit file mention wins
  const fileMatch = task.match(/\b([\w/.-]+\.(html|ts|tsx|js|jsx|py|css|scss|json))\b/i);
  if (fileMatch) {
    const rel = fileMatch[1];
    if (fs.existsSync(path.join(root, rel))) return [rel];
    const inSrc = path.join('src', rel);
    if (fs.existsSync(path.join(root, inSrc))) return [inSrc];
  }
  const isModVerb = /^(fix|update|change|add|remove|modify|extend|improve|rebuild|rewrite|upgrade|enhance|refactor|replace|redo|rework|revamp)\b/i.test(taskLow);
  if (!isModVerb) return [];
  const common = ['index.html', 'index.ts', 'src/index.ts', 'src/App.tsx', 'main.py', 'app.py'];
  return common.filter(f => fs.existsSync(path.join(root, f)));
}

/**
 * Last-resort context trimmer — only fires when the assembled context actually exceeds the
 * model's window. Not a pre-emptive cut. Drops lowest-value fields first; existing files shrink last.
 */
export function budgetContext(ctx: CloudBuildContext, model: string): { dropped: string[]; trimmed: string[]; usedTokens: number } {
  const dropped: string[] = [];
  const trimmed: string[] = [];
  const budget = getInputBudget(model);
  const tokens = () => estimateTokens(JSON.stringify(ctx));
  const over = () => tokens() > budget;
  const markTrim = (n: string) => { if (!trimmed.includes(n)) trimmed.push(n); };

  if (over() && ctx.vaultItems?.length) {
    while (over() && ctx.vaultItems.length > 0) { ctx.vaultItems.pop(); markTrim('vault'); }
    if (ctx.vaultItems.length === 0) ctx.vaultItems = undefined;
  }
  if (over() && ctx.gitContext)          { ctx.gitContext = undefined;   dropped.push('gitContext'); }
  if (over() && ctx.projectMap)          { ctx.projectMap = undefined;   dropped.push('projectMap'); }
  if (over() && ctx.recentBuilds?.length){ ctx.recentBuilds = undefined; dropped.push('recentBuilds'); }
  if (over() && ctx.recentChat)          { ctx.recentChat = undefined;   dropped.push('recentChat'); }
  if (over() && ctx.deadEnds)            { ctx.deadEnds = undefined;     dropped.push('deadEnds'); }
  if (over() && ctx.projectRules)        { ctx.projectRules = undefined; dropped.push('projectRules'); }
  if (over() && ctx.existingFiles) {
    for (const k of Object.keys(ctx.existingFiles)) {
      while (over() && ctx.existingFiles[k].length > 1000) {
        ctx.existingFiles[k] = ctx.existingFiles[k].slice(0, Math.floor(ctx.existingFiles[k].length / 2)) + '\n[...trimmed to fit context window]';
        markTrim('existingFiles');
      }
    }
  }
  return { dropped, trimmed, usedTokens: tokens() };
}
