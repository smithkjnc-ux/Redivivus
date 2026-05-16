// [SCOPE] Auto-create project folder for "Just Build" with no folder open.
// Uses AI to extract 5W from the user's task — fills blueprint fully, not just 'what'.
// Returns enriched { dir, blueprint, blueprintContext } so the caller can refresh state.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BuildRequestDeps } from './chatPanelIntent.js';
import { extractBlueprintFromPrompt, ExtractedBlueprint } from '../../services/blueprint/blueprintExtractor.js';
import { deriveFileBase } from './chatPanelBuildInference.js';

export interface AutoCreateResult {
  dir: string;
  blueprint: ExtractedBlueprint;
  blueprintContext: string;
}

export async function autoCreateProject(task: string, deps: BuildRequestDeps): Promise<AutoCreateResult> {
  // AI extracts all 5W fields from the user's request — no guess left in config as '?'
  const extracted = await extractBlueprintFromPrompt(task, deps.routing);
  const slug = extracted.suggestedName || await deriveFileBase(task, deps.routing);

  const projectsDir = vscode.workspace.getConfiguration('chassis')
    .get<string>('projectsDirectory', '~/projects')!
    .replace('~', os.homedir());
  const dir = path.join(projectsDir, slug);
  fs.mkdirSync(path.join(dir, '.chassis'), { recursive: true });

  const bp = {
    what:  extracted.what  || task.slice(0, 200),
    who:   extracted.who   || '',
    where: extracted.where || '',
    when:  extracted.when  || 'now',
    why:   extracted.why   || '',
  };
  const config = { projectName: slug, initialized: true, blueprint: bp };
  fs.writeFileSync(path.join(dir, '.chassis', 'config.json'), JSON.stringify(config, null, 2));

  const bpLines = [`# ${slug}`, '', `**What:** ${bp.what}`,
    bp.who   ? `**Who:** ${bp.who}`   : '',
    bp.where ? `**Where:** ${bp.where}` : '',
    bp.when  ? `**When:** ${bp.when}`  : '',
    bp.why   ? `**Why:** ${bp.why}`   : '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(path.join(dir, '.chassis', 'blueprint.md'), bpLines + '\n');

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
