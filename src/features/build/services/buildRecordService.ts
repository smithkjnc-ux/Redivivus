// [SCOPE] Build Record reassembler — stitches the ALREADY-saved data (blueprint_revisions.jsonl = every build +
// fix, build_log.jsonl = tokens, fix-pipeline-*.log = the Supervisor/Worker/Guardian detail, snapshots = revert
// points) into ONE human-readable timeline so a user can review exactly what each build/fix/edit did. Stores no
// new data — it reassembles on request. See docs/REDIVIVUS_BUILD_CONTRACT.md.

import * as fs from 'fs';
import * as path from 'path';

interface Rev {
  rev: number; ts: string; kind: string; request?: string; summary?: string;
  files?: string[]; by?: string; snapshotId?: string; mechanics_delta?: string;
}

function readJsonl(p: string): Record<string, unknown>[] {
  try {
    return fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x): x is Record<string, unknown> => !!x);
  } catch { return []; }
}

const _fmt = (ts: string): string => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };

/** Reassemble the full build/fix timeline for a project into markdown from the saved sources. */
export function reassembleBuildRecord(root: string): string {
  const dir = path.join(root, '.redivivus');
  const revs = readJsonl(path.join(dir, 'blueprint_revisions.jsonl')) as unknown as Rev[];
  const builds = readJsonl(path.join(dir, 'build_log.jsonl'));
  let fixLogs: string[] = [];
  try { fixLogs = fs.readdirSync(path.join(dir, 'logs')).filter(f => f.startsWith('fix-pipeline')); } catch { /* none */ }

  const name = path.basename(root);
  const out: string[] = [
    `# Redivivus Build Record — ${name}`, '',
    `> Reassembled on demand from saved revisions, build logs, and fix-pipeline logs — no data is duplicated.`,
    `> ${revs.length} entr${revs.length === 1 ? 'y' : 'ies'}. Regenerate any time via "Redivivus: Show Build Record".`, '',
  ];
  if (revs.length === 0) {
    out.push('_No build/fix history recorded yet for this project._');
    return out.join('\n');
  }

  // Newest first.
  for (const r of [...revs].reverse()) {
    const icon = r.kind === 'fix' ? '[FIX]' : r.kind === 'build' ? '[BUILD]' : '[-]';
    out.push(`## ${icon} #${r.rev} - ${r.kind} - ${_fmt(r.ts)}${r.by ? ' - ' + r.by : ''}`);
    if (r.request) { out.push('', `**Requested:** "${String(r.request).slice(0, 600)}"`); }
    if (r.summary) { out.push(`**What it did:** ${r.summary}`); }
    if (r.files && r.files.length) { out.push(`**Files touched:** ${r.files.map(f => '`' + f + '`').join(', ')}`); }
    if (r.mechanics_delta) { out.push(`**Behavior change:** ${r.mechanics_delta}`); }
    // Enrich a build entry with token count from build_log (matched on the start of the task text).
    const b = builds.find(x => typeof x.task === 'string' && r.request && (x.task as string).slice(0, 40) === r.request.slice(0, 40));
    if (b) {
      const tok = (b.totalTokens as number) || (((b.inputTokens as number) || 0) + ((b.outputTokens as number) || 0));
      if (tok) { out.push(`**Tokens:** ${tok.toLocaleString()}`); }
    }
    if (r.snapshotId) { out.push(`**Snapshot:** \`${r.snapshotId}\` - revert this exact change from the History panel.`); }
    if (r.kind === 'fix' && fixLogs.length) {
      out.push(`**Full detail:** the Supervisor diagnosis -> Worker edit -> Guardian verdict is in \`.redivivus/logs/\`.`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** Write the reassembled record to docs/REDIVIVUS_RECORD.md and return its path. */
export function writeBuildRecord(root: string): string {
  const md = reassembleBuildRecord(root);
  const docsDir = path.join(root, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const outPath = path.join(docsDir, 'REDIVIVUS_RECORD.md');
  fs.writeFileSync(outPath, md, 'utf-8');
  return outPath;
}
