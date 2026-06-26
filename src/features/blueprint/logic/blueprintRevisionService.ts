// [SCOPE] Blueprint revision service — detects project drift and auto-generates revised WHAT descriptions.
// Preserves original blueprint in a Revision History section. Triggers every 3 builds.
// Called non-blocking from chatPanelBuildRunner after every successful build.

import * as fs from 'fs';
import * as path from 'path';
import { syncBlueprintMd } from '../data/blueprintWriter.js';

const BUILDS_PER_REVISION = 3;

/** Returns true when the build counter says a revision is due. */
export function isRevisionDue(config: any): boolean {
  if (!config?.blueprint?.what) { return false; }
  const total = config.totalBuilds ?? 0;
  const lastAt = config.lastRevisionAtBuild ?? 0;
  return total - lastAt >= BUILDS_PER_REVISION;
}

/** Increment build counter in config (non-destructive — caller must saveConfig). */
export function incrementBuildCounter(config: any): any {
  config.totalBuilds = (config.totalBuilds ?? 0) + 1;
  return config;
}

/** Generates an updated WHAT sentence + change reason by asking the AI to describe the current project files. */
export async function generateRevisedWhat(
  root: string,
  originalWhat: string,
  routing: any
): Promise<{ what: string; reason: string } | null> {
  try {
    // Build a compact file listing for context
    const entries: string[] = [];
    const scanDir = (dir: string, depth = 0) => {
      if (depth > 2) { return; }
      try {
        for (const name of fs.readdirSync(dir)) {
          if (['.redivivus', 'node_modules', '.git', '.github'].includes(name)) { continue; }
          const full = path.join(dir, name);
          const rel = path.relative(root, full).replace(/\\/g, '/');
          try {
            if (fs.statSync(full).isDirectory()) { scanDir(full, depth + 1); }
            else { entries.push(rel); }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    };
    scanDir(root);

    // Include content of small config/data files
    const configPreviews: string[] = [];
    for (const rel of entries) {
      const base = path.basename(rel).toLowerCase();
      if (/config|sounds?|animals?|data|registry/.test(base) && rel.endsWith('.js')) {
        try {
          const content = fs.readFileSync(path.join(root, rel), 'utf-8');
          const lines = content.split('\n').length;
          if (lines <= 80) {
            const clean = content.split('\n')
              .filter(l => l.trim() && !l.trim().startsWith('//'))
              .slice(0, 20).join('\n');
            if (clean.trim()) { configPreviews.push(`// ${rel}\n${clean}`); }
          }
        } catch { /* skip */ }
      }
    }

    const fileList = entries.slice(0, 40).join(', ');
    const configCtx = configPreviews.slice(0, 2).join('\n\n');
    const prompt = `You are updating a project blueprint. Write ONE plain sentence describing what this project currently does.

Original spec: "${originalWhat}"

Current files: ${fileList}
${configCtx ? `\nKey config content:\n${configCtx}` : ''}

Rules:
- Name actual features, counts, and capabilities that exist NOW (not the original spec)
- Be specific (e.g. "6 animal sounds" not "several sounds")
- One sentence only for "what", no prefix like "This project"
- Return JSON only (no markdown): {"what": "...", "reason": "..."}
- "reason": 3-6 word phrase — WHY it changed (e.g. "user added 2 sounds", "dark mode added", "bug fixed")`;

    const result = await routing.prompt(prompt, 20_000);
    if (result.success && result.text?.trim()) {
      try {
        const parsed = JSON.parse(result.text.trim().replace(/^```json?\n?|```$/g, ''));
        if (parsed.what) { return { what: String(parsed.what).replace(/^["']|["']$/g, ''), reason: String(parsed.reason || 'project updated') }; }
      } catch { /* fall back to raw text */ }
      return { what: result.text.trim().replace(/^["']|["']$/g, ''), reason: 'project updated' };
    }
  } catch { /* non-fatal */ }
  return null;
}

/** Writes the revised blueprint.md with full revision history preserved. */
export function applyRevision(
  blueprintPath: string,
  config: any,
  newWhat: string,
  projectName: string,
  reason?: string
): void {
  const bp = config.blueprint;
  if (!bp) { return; }

  const now = new Date().toISOString().slice(0, 10);
  const revNum = (config.blueprintRevision ?? 1) + 1;
  const originalWhat = config.blueprintOriginalWhat ?? bp.what;
  const status = bp.locked ? 'LOCKED' : 'DRAFT';

  // Build revision history from existing entries + the one being archived
  const existingHistory: string = (() => {
    try {
      const current = fs.readFileSync(blueprintPath, 'utf-8');
      const histMatch = current.match(/## Revision History\n([\s\S]*?)(?:\n---\n\*Generated|$)/);
      return histMatch ? histMatch[1].trim() : '';
    } catch { return ''; }
  })();

  const _changeNote = reason ? `\n**Change:** ${reason}` : '';
  const archivedEntry = `### Rev ${revNum - 1}${revNum === 2 ? ' — Original' : ''} (${config.lastRevisionDate || bp.lockedAt?.slice(0, 10) || now})\n**WHAT:** ${bp.what}${_changeNote}`;
  const fullHistory = [archivedEntry, existingHistory].filter(Boolean).join('\n\n');

  const content = `# Blueprint — ${projectName}

**Status:** ${status}
**Revision:** ${revNum} — updated ${now}

---

## WHO
${bp.who || 'Not answered'}

## WHAT (Rev ${revNum})
${newWhat}

## WHERE
${bp.where || 'Not answered'}

## WHEN
${bp.when || 'Not answered'}

## WHY
${bp.why || 'Not answered'}

---

## Health
- Confirmed: ${bp.health?.confirmed ?? 0}
- Assumed: ${bp.health?.assumed ?? 0}
- Unknown: ${bp.health?.unknown ?? 0}
- Confidence: ${(bp.health?.confidence ?? 'unknown').toUpperCase()}

---

## Revision History

${fullHistory}

---
*Generated by Redivivus v${bp.version || '0.3.6'}*
`;

  fs.writeFileSync(blueprintPath, content, 'utf-8');

  // Update config with revision metadata
  config.blueprint.what = newWhat;
  config.blueprintRevision = revNum;
  config.blueprintOriginalWhat = originalWhat;
  config.lastRevisionAtBuild = config.totalBuilds ?? 0;
  config.lastRevisionDate = now;
}

/** Non-blocking wrapper — increment build counter, auto-revise blueprint every 3 builds. */
export async function tryBlueprintRevision(root: string, redivivus: any, routing: any): Promise<void> {
  if (!redivivus?.isInitialized?.()) { return; }
  const config = redivivus.loadConfig?.();
  if (!config?.blueprint?.what) { return; }

  incrementBuildCounter(config);
  redivivus.saveConfig?.(config);
  if (!isRevisionDue(config)) { return; }

  const _path = path;
  const projectName: string = config.projectName || _path.basename(root);
  const blueprintPath = _path.join(root, 'blueprint.md');
  const rev = await generateRevisedWhat(root, config.blueprint.what, routing);
  if (!rev?.what || rev.what === config.blueprint.what) { return; }

  applyRevision(blueprintPath, config, rev.what, projectName, rev.reason);
  redivivus.saveConfig?.(config);
  syncBlueprintMd(redivivus, config);
}
