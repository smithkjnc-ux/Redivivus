// [SCOPE] Editor rule-file registry + helpers. Controls WHICH AI-editor shim files (CLAUDE.md,
// .cursorrules, .windsurfrules, GEMINI.md, .clinerules, copilot-instructions) get written into a
// project. Default is NONE — users opt in to the editors they actually use via `redivivus.editorRuleFiles`.
// The canonical rules always live in .redivivus/rules.md (written separately); these are external mirrors.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { wrapForClaude, wrapForGemini } from './rulesWrappers.js';

export interface EditorRuleFile {
  key: string;        // stable id stored in the setting
  label: string;      // shown in the configure picker
  file: string;       // path relative to project root
  wrap?: (rules: string, projectName: string) => string; // optional per-editor header
}

export const EDITOR_RULE_FILES: EditorRuleFile[] = [
  { key: 'claude',   label: 'Claude Code  ·  CLAUDE.md', file: 'CLAUDE.md', wrap: wrapForClaude },
  { key: 'cursor',   label: 'Cursor  ·  .cursorrules', file: '.cursorrules' },
  { key: 'windsurf', label: 'Windsurf  ·  .windsurfrules', file: '.windsurfrules' },
  { key: 'gemini',   label: 'Gemini CLI  ·  GEMINI.md', file: 'GEMINI.md', wrap: wrapForGemini },
  { key: 'cline',    label: 'Cline  ·  .clinerules', file: '.clinerules' },
  { key: 'copilot',  label: 'GitHub Copilot  ·  .github/copilot-instructions.md', file: '.github/copilot-instructions.md' },
];

// Present in every Redivivus-generated rules file — used to avoid deleting a user's hand-written shim.
const RULES_MARKER = 'Redivivus Project Rules';

/** Editor keys the user has opted into. Default: [] (no shim files written). */
export function getEnabledEditorKeys(): string[] {
  const v = vscode.workspace.getConfiguration('redivivus').get<string[]>('editorRuleFiles', []);
  return Array.isArray(v) ? v : [];
}

export async function setEnabledEditorKeys(keys: string[]): Promise<void> {
  await vscode.workspace.getConfiguration('redivivus').update('editorRuleFiles', keys, vscode.ConfigurationTarget.Global);
}

/** Write the enabled editor shims into `root`. Returns the files written. */
export function writeEnabledShims(root: string, rules: string, projectName: string, keys: string[] = getEnabledEditorKeys()): string[] {
  const created: string[] = [];
  for (const e of EDITOR_RULE_FILES) {
    if (!keys.includes(e.key)) { continue; }
    const full = path.join(root, e.file);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(full, e.wrap ? e.wrap(rules, projectName) : rules);
    created.push(e.file);
  }
  return created;
}

/** Delete Redivivus-generated shims for editors NOT in `keys`. Never touches hand-written files. */
export function removeDisabledShims(root: string, keys: string[] = getEnabledEditorKeys()): string[] {
  const removed: string[] = [];
  for (const e of EDITOR_RULE_FILES) {
    if (keys.includes(e.key)) { continue; }
    const full = path.join(root, e.file);
    try {
      if (fs.existsSync(full) && fs.readFileSync(full, 'utf-8').includes(RULES_MARKER)) {
        fs.unlinkSync(full);
        removed.push(e.file);
      }
    } catch { /* never block on cleanup */ }
  }
  return removed;
}
