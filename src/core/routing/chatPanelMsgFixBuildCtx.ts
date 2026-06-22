// [SCOPE] Build context helpers for the fix pipeline — project rules, build history, recent builds.
// Extracted from chatPanelMsgFixUtils.ts (Rule 9 split — was 241 lines).
// NOTE: chatPanelMsgFixContext.ts imports getRecentBuildContext from chatPanelMsgFixUtils, so
//       these functions live here (not there) to avoid a circular dependency.

import * as fs from 'fs';
import * as path from 'path';
import { BuildHistoryService } from '../../services/build/buildHistoryService';
import { buildGitContextBlock } from '../../services/workspace/gitContext';

const MAX_RULES_BYTES = 4_000;

/** Pre-flight Rule 4 — Read .redivivus/rules.md before generating or fixing code. */
export function readProjectRules(root: string): string {
  try {
    const p = path.join(root, '.redivivus', 'rules.md');
    if (!fs.existsSync(p)) { return ''; }
    let text = fs.readFileSync(p, 'utf-8');
    if (text.length > MAX_RULES_BYTES) { text = text.slice(0, MAX_RULES_BYTES) + '\n// (truncated)'; }
    return text;
  } catch { return ''; }
}

/** Rule 17 — Causation-first debugging.
 *  Reads build_history.json and returns a causation alert string if source files were touched by a recent build. */
export function getRecentBuildContext(root: string, sourceFiles: { rel: string }[]): string {
  try {
    const svc = new BuildHistoryService(root);
    const history = svc.list().filter(e => !e.undone).slice(0, 5);
    if (history.length === 0) { return ''; }
    const sourceSet = new Set(sourceFiles.map(f => f.rel));
    const now = Date.now();
    const lines: string[] = [];
    for (const entry of history) {
      const touched = entry.files.filter(f => sourceSet.has(f));
      if (touched.length === 0) { continue; }
      const ageMs = now - new Date(entry.timestamp).getTime();
      const ageMins = Math.round(ageMs / 60_000);
      const ageStr = ageMins < 2 ? 'just now' : ageMins < 60 ? `${ageMins} min ago` : `${Math.round(ageMins / 60)}h ago`;
      const aiStr = entry.worker ? `${entry.supervisor}+${entry.worker}` : entry.supervisor;
      lines.push(`- ${touched.join(', ')} -- last written by build: "${entry.task.slice(0, 80)}" (${ageStr}, AI: ${aiStr})`);
    }
    if (lines.length === 0) { return ''; }
    const buildCtx = 'CAUSATION-FIRST (Rule 17): These source files were recently written by Redivivus builds.\n' +
      'Check whether the bug was INTRODUCED by a build before assuming it is a pre-existing issue.\n' +
      'If the reported symptom appeared AFTER a build, that build is the most likely cause.\n' +
      lines.join('\n');
    const gitCtx = buildGitContextBlock(root);
    return [buildCtx, gitCtx].filter(Boolean).join('\n\n');
  } catch { return ''; }
}

/** Fix #5 — Multi-turn build continuity.
 *  Returns a brief summary of the last 3 builds so the AI knows what already exists. */
export function getRecentBuildsContext(root: string): string {
  try {
    const svc = new BuildHistoryService(root);
    const recent = svc.list().filter(e => !e.undone).slice(0, 3);
    if (recent.length === 0) { return ''; }
    const lines = recent.map(e => `- "${e.task.slice(0, 80)}" -> ${(e.files || []).slice(0, 3).join(', ')}`);
    return 'RECENTLY BUILT (already in this project -- build on top of these, do not recreate):\n' + lines.join('\n');
  } catch { return ''; }
}
