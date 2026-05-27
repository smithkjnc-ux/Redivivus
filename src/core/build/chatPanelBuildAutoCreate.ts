// [SCOPE] Auto-create project folder for "Just Build" with no folder open.
// Uses AI to extract 5W from the user's task — fills blueprint fully, not just 'what'.
// Returns enriched { dir, blueprint, blueprintContext } so the caller can refresh state.

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { BuildRequestDeps } from '../ai/chatPanelIntent';
import type { ExtractedBlueprint } from '../../services/blueprint/blueprintExtractor';
import { extractBlueprintFromPrompt } from '../../services/blueprint/blueprintExtractor';
import { deriveFileBase } from './chatPanelBuildInference';
import { scaffoldAt } from '../../services/project/redivivusInit.js';

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
  const slug = extracted.suggestedName || await deriveFileBase(task, deps.routing);

  const projectsDir = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!
    .replace('~', os.homedir());
  const dir = path.join(projectsDir, slug);
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
