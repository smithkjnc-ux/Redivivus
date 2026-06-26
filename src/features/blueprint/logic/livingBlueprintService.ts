// [SCOPE] Living Blueprint storage — the behavioral contract (HEAD) + the append-only revision ledger.
// HEAD lives in config.blueprint.mechanics (rendered into blueprint.md by blueprintWriter). LEDGER lives in
// .redivivus/blueprint_revisions.jsonl. This file is pure I/O (no AI) — the distillers in livingBlueprintDistill.ts
// produce the text; here we only read/write/store it. See docs/REDIVIVUS_LIVING_BLUEPRINT.md.

import * as fs from 'fs';
import * as path from 'path';
import { syncBlueprintMd } from '../data/blueprintWriter.js';

export interface BlueprintRevision {
  rev: number;
  ts: string;
  kind: 'build' | 'fix' | 'addon' | 'modification';
  request: string;          // the user's request that drove this change
  summary: string;          // one behavioral sentence
  mechanics_delta?: string[]; // '+ add' / '~ change' / '- remove' behavioral rules
  files?: string[];
  by?: string;              // provider/model that made the change
  snapshotId?: string;      // -> .redivivus/snapshots for revert
}

function ledgerPath(root: string): string {
  return path.join(root, '.redivivus', 'blueprint_revisions.jsonl');
}

/** All revisions, oldest-first. Tolerates a partially-corrupt ledger (skips bad lines). */
export function readRevisions(root: string): BlueprintRevision[] {
  try {
    return fs.readFileSync(ledgerPath(root), 'utf-8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) as BlueprintRevision; } catch { return null; } })
      .filter((r): r is BlueprintRevision => !!r);
  } catch { return []; }
}

/** The next revision number (1-based). */
export function nextRev(root: string): number {
  const revs = readRevisions(root);
  return revs.length ? Math.max(...revs.map(r => r.rev || 0)) + 1 : 1;
}

/** Append one revision to the ledger. Non-blocking — never throws into the pipeline. */
export function appendRevision(root: string, entry: BlueprintRevision): void {
  try {
    const p = ledgerPath(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(entry) + '\n');
  } catch { /* ledger write is best-effort */ }
}

/** Compact recent-revisions block for the Supervisor prompt (how we got to the present). */
export function recentRevisionsBlock(root: string, k = 10): string {
  const revs = readRevisions(root).slice(-k);
  if (!revs.length) { return ''; }
  return revs.map(r => `- rev ${r.rev} (${r.kind}): ${r.summary}`).join('\n');
}

/** Read the current HEAD mechanics contract from config. */
export function getMechanics(deps: any): string {
  try { return deps?.redivivus?.loadConfig?.()?.blueprint?.mechanics || ''; } catch { return ''; }
}

/** Persist the HEAD mechanics into config + re-render blueprint.md. Non-blocking. */
export function setMechanics(deps: any, mechanics: string): void {
  try {
    const config = deps?.redivivus?.loadConfig?.();
    if (!config?.blueprint || !mechanics?.trim()) { return; }
    config.blueprint.mechanics = mechanics.trim();
    deps.redivivus.saveConfig?.(config);
    try { syncBlueprintMd(deps.redivivus, config); } catch { /* md render best-effort */ }
  } catch { /* config write best-effort */ }
}

// [DONE] fireLivingBlueprintSeed moved here from cloudBuildResultProcessor.ts (Rule 9 split)
/** Fire-and-forget: seed or append a build revision to the Living Blueprint contract. Never blocks the pipeline. */
export function fireLivingBlueprintSeed(root: string, dataModel: string | undefined, deps: any, routing: any, task: string, writtenPaths: string[]): void {
  if (!writtenPaths.length || !routing || !(deps as any).redivivus) { return; }
  (async () => {
    try {
      const lb = await import('./livingBlueprintService.js');
      const relFiles = writtenPaths.map((p: string) => { const path = require('path'); return path.relative(root, p).replace(/\\/g, '/'); });
      const userPrompt = String(task).replace(/^Build:\s*/, '').split(/\n\s*\n|\n\s*Project Blueprint:|\n\s*SUPERVISOR/)[0].trim().slice(0, 400);
      if (!lb.getMechanics(deps)) {
        const { distillBuildMechanics } = await import('./livingBlueprintDistill.js');
        console.log(`[LIVING BLUEPRINT] Distilling mechanics contract from build (${relFiles.length} files)...`);
        let mech = await distillBuildMechanics(routing, task, relFiles);
        if (!mech) {
          console.warn('[LIVING BLUEPRINT] Distillation returned no mechanics — retrying once.');
          mech = await distillBuildMechanics(routing, task, relFiles);
        }
        if (mech) {
          lb.setMechanics(deps, mech);
          lb.appendRevision(root, { rev: lb.nextRev(root), ts: new Date().toISOString(), kind: 'build', request: userPrompt, summary: 'Initial build — behavioral contract seeded.', files: relFiles, by: dataModel || 'AI' });
          console.log(`[LIVING BLUEPRINT] Mechanics contract seeded (${mech.length} chars) -> config.json + blueprint.md`);
        } else {
          console.warn(`[LIVING BLUEPRINT] FAILED to distill mechanics after retry — blueprint left WITHOUT a behavioral contract for: "${userPrompt.slice(0, 80)}"`);
        }
      } else {
        lb.appendRevision(root, { rev: lb.nextRev(root), ts: new Date().toISOString(), kind: 'build', request: userPrompt, summary: 'Rebuild / additional build.', files: relFiles, by: dataModel || 'AI' });
      }
    } catch (e) { console.warn('[LIVING BLUEPRINT] Mechanics seeding error (build unaffected):', e instanceof Error ? e.message : String(e)); }
  })();
}
