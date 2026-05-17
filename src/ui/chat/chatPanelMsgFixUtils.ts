// [SCOPE] Fix pipeline helpers -- parseFixResponse, takeSnapshot, collectSourceFiles,
//         readProjectDeadEnds, appendProjectDeadEnd, getRecentBuildContext,
//         readProjectRules, writeProjectRoadmapEntry.
// Extracted from chatPanelMsgFix.ts (200-line split).
// parseFixResponse filters to allowedRels only -- prevents Worker from creating phantom files.
// Dead-end helpers read/write <project>/.chassis/dead_ends.md so the Supervisor never repeats
// approaches that have already been tried and failed in this project.
// getRecentBuildContext implements Rule 17: causation-first debugging via build_history.json.
// writeProjectRoadmapEntry logs AI-made file changes to the project's CHASSIS_ROADMAP.md.

import * as fs from 'fs';
import * as path from 'path';
import { BuildHistoryService } from '../../services/build/buildHistoryService.js';

/** Maps raw model ID strings to friendly display names for chat messages. */
export function modelLabel(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) { return 'Claude'; }
  if (m.includes('gemini')) { return 'Gemini'; }
  if (m.includes('gpt') || m.includes('openai')) { return 'GPT-4o'; }
  if (m.includes('llama') || m === 'groq') { return 'Groq'; }
  if (m.includes('grok') || m === 'xai') { return 'Grok'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'Kimi'; }
  return model || 'AI';
}

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20_000;

/** Parse Worker fix blocks. Only returns fixes whose paths are in allowedRels.
 *  Phantom files (paths not in the original source list) are collected in skipped[]. */
export function parseFixResponse(
  text: string,
  root: string,
  allowedRels: Set<string>,
): { fixes: { rel: string; abs: string; content: string }[]; skipped: string[] } {
  const all: { rel: string; abs: string; content: string }[] = [];
  const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = fixPattern.exec(text)) !== null) {
    const rel = match[1].trim().replace(/^\.?\//, '');
    const content = match[2].trimEnd();
    if (rel && content) { all.push({ rel, abs: path.join(root, rel), content }); }
  }
  if (all.length === 0) {
    const alt = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
    while ((match = alt.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\.?\//, '');
      const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
      if (rel && content && content.length > 10) { all.push({ rel, abs: path.join(root, rel), content }); }
    }
  }
  const fixes = all.filter(f => allowedRels.has(f.rel));
  const skipped = all.filter(f => !allowedRels.has(f.rel)).map(f => f.rel);
  return { fixes, skipped };
}

export function takeSnapshot(root: string, relPaths: string[]): void {
  try {
    const snapDir = path.join(root, '.chassis', 'fix-snapshots', `fix-${Date.now()}`);
    fs.mkdirSync(snapDir, { recursive: true });
    for (const rel of relPaths) {
      const src = path.join(root, rel);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(snapDir, rel.replace(/\//g, '__'))); }
    }
  } catch { /* best-effort */ }
}

export function collectSourceFiles(root: string): { rel: string; content: string }[] {
  const results: { rel: string; content: string }[] = [];
  function walk(dir: string, depth: number): void {
    if (results.length >= MAX_FILES || depth > 4) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir).sort(); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) { continue; }
      const full = path.join(dir, entry); const rel = path.relative(root, full);
      let stat: fs.Stats; try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(entry).toLowerCase())) { continue; }
      try {
        let c = fs.readFileSync(full, 'utf-8');
        if (c.length > MAX_FILE_BYTES) { c = c.slice(0, MAX_FILE_BYTES) + '\n// ...'; }
        results.push({ rel, content: c });
      } catch { continue; }
      if (results.length >= MAX_FILES) { return; }
    }
  }
  walk(root, 0); return results;
}

const DEAD_ENDS_PATH = (root: string) => path.join(root, '.chassis', 'dead_ends.md');
const DEAD_ENDS_HEADER = '# Dead End Log\nApproaches tried and failed in this project. Read before suggesting a fix.\n\n---\n\n';
const MAX_DEAD_ENDS_BYTES = 8_000;

/** Returns the project's dead_ends.md content (truncated), or empty string if absent. */
export function readProjectDeadEnds(root: string): string {
  try {
    const p = DEAD_ENDS_PATH(root);
    if (!fs.existsSync(p)) { return ''; }
    let text = fs.readFileSync(p, 'utf-8');
    if (text.length > MAX_DEAD_ENDS_BYTES) { text = text.slice(0, MAX_DEAD_ENDS_BYTES) + '\n// (truncated)'; }
    return text;
  } catch { return ''; }
}

const MAX_RULES_BYTES = 4_000;

/**
 * Pre-flight Rule 4 — Read .chassis/rules.md before generating or fixing code.
 * Returns the project's rules content (truncated), or empty string if absent.
 * Supervisors use this to avoid proposing approaches that violate project constraints.
 */
export function readProjectRules(root: string): string {
  try {
    const p = path.join(root, '.chassis', 'rules.md');
    if (!fs.existsSync(p)) { return ''; }
    let text = fs.readFileSync(p, 'utf-8');
    if (text.length > MAX_RULES_BYTES) { text = text.slice(0, MAX_RULES_BYTES) + '\n// (truncated)'; }
    return text;
  } catch { return ''; }
}

/**
 * Rule 17 — Causation-first debugging.
 * Reads build_history.json and returns a causation alert string if any source files
 * were touched by a recent build. Supervisor sees this BEFORE diagnosing any other cause.
 * Returns empty string when no relevant history exists.
 */
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
    return `CAUSATION-FIRST (Rule 17): These source files were recently written by CHASSIS builds.\n` +
      `Check whether the bug was INTRODUCED by a build before assuming it is a pre-existing issue.\n` +
      `If the reported symptom appeared AFTER a build, that build is the most likely cause.\n` +
      lines.join('\n');
  } catch { return ''; }
}

/**
 * Appends a "Recent Fixes" entry to the project's CHASSIS_ROADMAP.md after every
 * AI-driven file write. Implements audit #5: pipelines must log their changes.
 * Inserts after the first *Last updated* line so new entries appear at the top.
 * No-ops silently when the roadmap is absent (non-CHASSIS projects are unaffected).
 */
export function writeProjectRoadmapEntry(root: string, heading: string, bullets: string[]): void {
  try {
    const roadmapPath = path.join(root, 'CHASSIS_ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) { return; }
    const raw = fs.readFileSync(roadmapPath, 'utf-8');
    const date = new Date().toISOString().slice(0, 10);
    const entry = `\n## Recent Fixes -- ${date} (${heading})\n\n${bullets.map(b => `- ${b}`).join('\n')}\n`;
    // Insert after *Last updated* line, before the first ## heading
    const insertAt = raw.indexOf('\n## ');
    const updated = insertAt >= 0
      ? raw.slice(0, insertAt) + entry + raw.slice(insertAt)
      : raw + entry;
    // Update *Last updated* line
    const finalText = updated.replace(
      /\*Last updated:.*?\*/,
      `*Last updated: ${date} -- ${heading}*`
    );
    fs.writeFileSync(roadmapPath, finalText, 'utf-8');
  } catch { /* best-effort -- never block a build */ }
}

/** Appends a dead-end entry to the project's .chassis/dead_ends.md. Best-effort. */
export function appendProjectDeadEnd(root: string, patternName: string, triedWhat: string, whyFails: string, doInstead: string): void {
  try {
    const p = DEAD_ENDS_PATH(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : DEAD_ENDS_HEADER;
    const date = new Date().toISOString().slice(0, 10);
    const entry = `## [DEAD] ${patternName} (logged ${date})\n- **What was tried:** ${triedWhat}\n- **Why it fails:** ${whyFails}\n- **Do this instead:** ${doInstead}\n\n---\n\n`;
    fs.writeFileSync(p, existing + entry, 'utf-8');
  } catch { /* best-effort */ }
}
