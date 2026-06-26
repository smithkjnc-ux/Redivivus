// [SCOPE] Auto-create project folder for "Just Build" with no folder open.
// Uses AI to extract 5W from the user's task — fills blueprint fully, not just 'what'.
// Returns enriched { dir, blueprint, blueprintContext } so the caller can refresh state.

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { BuildRequestDeps } from '../../features/ai/logic/chatPanelIntent.js';
import type { ExtractedBlueprint } from '../blueprint/logic/blueprintExtractor.js';
import { extractBlueprintFromPrompt } from '../blueprint/logic/blueprintExtractor.js';
import { deriveFileBase } from './chatPanelBuildInference.js';
import { scaffoldAt } from '../project/logic/redivivusInit.js';

export interface AutoCreateResult {
  dir: string;
  blueprint: ExtractedBlueprint;
  blueprintContext: string;
}

// Tracks the most recently auto-created project folder so handleCreateFile can save there
// instead of the projects container when the user hasn't switched workspace yet.
export let lastAutoCreatedDir: string | undefined;

export async function autoCreateProject(task: string, deps: BuildRequestDeps): Promise<AutoCreateResult> {
  // AI extracts all 5W fields from the user's request — no guess left in config as '?'
  const extracted = await extractBlueprintFromPrompt(task, deps.routing);
  const slug = extracted.suggestedName || await deriveFileBase(task, deps.routing, deps.usageTracker);

  const projectsDir = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!
    .replace('~', os.homedir());

  // [CATEGORY] AI-first classification — understands project type from the full task description even
  // when no exact keywords appear (e.g. "create a hello file" → utilities, not uncategorised).
  // [Rule 18] Regex classifyCategory() is kept as catch-block fallback only.
  const { classifyCategory } = require('../../services/project/projectResolver.js');
  let category = '';
  try {
    const catPrompt = `Reply with ONE category name only, or NONE if it truly doesn't fit any.
Categories: games, video, web, utilities, tools, apps
- games: games, simulations, interactive entertainment
- video: video players, streaming tools, media tools
- web: websites, landing pages, portfolios, web apps, dashboards
- utilities: scripts, CLI tools, file tools, converters, automation, batch tasks
- tools: dev tools, plugins, extensions, linters, build tools, SDKs
- apps: backends, APIs, servers, full-stack apps, SaaS

Task: "${task.slice(0, 300)}"
Blueprint: "${extracted.what || ''} ${extracted.why || ''}"
Reply with ONE of: games, video, web, utilities, tools, apps, NONE`;
    const catResult = await deps.routing.prompt(catPrompt, 12_000);
    if (catResult.success && catResult.text) {
      const t = catResult.text.trim().toLowerCase();
      const valid = ['games', 'video', 'web', 'utilities', 'tools', 'apps'];
      const match = valid.find(c => t.includes(c));
      category = match || '';
    }
  } catch {
    category = classifyCategory({ what: extracted.what, why: extracted.why });
  }

  const dir = category ? path.join(projectsDir, category, slug) : path.join(projectsDir, slug);
  lastAutoCreatedDir = dir;

  const bp = {
    what:  extracted.what  || task.slice(0, 200),
    who:   extracted.who   || '',
    where: extracted.where || '',
    when:  extracted.when  || 'now',
    why:   extracted.why   || '',
    health: { confirmed: 0, assumed: 0, unknown: 5, confidence: 'low' as const },
    locked: false,
    version: '1.0',
    revision: 1,
  };

  // Full scaffold: .redivivus/{config,blueprint,work_log,dead_ends,sessions/},
  // src/, tests/, docs/, README.md, .gitignore, and all AI-editor shim files
  // (.windsurfrules, .cursorrules, CLAUDE.md, GEMINI.md, etc.)
  await scaffoldAt(dir, slug, bp);

  const blueprintContext = [
    `Project: ${slug}`,
    `Who: ${bp.who   || '?'}`,
    `What: ${bp.what}`,
    `Where: ${bp.where || '?'}`,
    `When: ${bp.when}`,
    `Why: ${bp.why   || '?'}`,
  ].join('\n');

  return { dir, blueprint: extracted, blueprintContext };
}
