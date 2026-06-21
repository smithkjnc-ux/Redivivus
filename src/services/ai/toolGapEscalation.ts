// [SCOPE] Tool-Gap escalation — tiered handling when a Worker's command diverges from the approved
// plan. Pilot surface: the run_command agent tool (agentTools.ts). Tiers:
//   0. plan-match  → command aligns with the Supervisor's plan → run as-is, no escalation.
//   1. supervisor  → out-of-plan: give the Supervisor the same re-prescription it gets after a
//                    Guardian rejection. A free/low-cost alternate → just proceed.
//   2. user choice → a viable but costlier alternate → live per-session cost decision in the chat.
//   3. dead end    → no path in the toolset → write ~/.redivivus/pending_toolgap.json + block.
// Pure/injectable so it can be tested without VS Code, the network, or a real filesystem.

import * as path from 'path';
import * as os from 'os';

/** The flag rigops polls (present = a tool gap needs the owner). Matches config/projects.yaml. */
export const TOOL_GAP_FLAG = path.join(os.homedir(), '.redivivus', 'pending_toolgap.json');

/** Supervisor's verdict on an out-of-plan command (its re-prescription opportunity). */
export interface Represcribe {
  found: boolean;       // a viable approach exists within the current toolset
  costlier: boolean;    // that approach costs more (extra retries / pricier / more AI calls)
  command?: string;     // the alternate command to run instead (defaults to the original)
  neededTool?: string;  // for the dead-end flag: which capability was missing
  note?: string;
}

type FsLike = Pick<typeof import('fs'), 'existsSync' | 'writeFileSync' | 'unlinkSync' | 'mkdirSync'>;

/** One genuinely-missing capability + how to install it. Mirrors agentToolGapExtract.MissingCap.
 *  `what` = plain-English purpose, `note` = optional caveat (e.g. native libs) — both for the user card. */
export interface MissingCap { name: string; kind: 'tool' | 'module'; install: string; what?: string; note?: string; }

export interface ToolGapDeps {
  represcribe: (command: string, task: string, plan: string) => Promise<Represcribe>;
  askUser: (prompt: string) => Promise<'alternate' | 'wait'>;
  log: (msg: string) => void;
  fs: FsLike;
  flagPath?: string;
  // [DEAD-END] Record a true dead end as a PROJECT dead-end (dead_ends.md) so a FUTURE fix's Supervisor
  // won't prescribe the missing tool again. Injected (keeps this module pure/testable). Best-effort.
  recordDeadEnd?: (tool: string, command: string, reason: string, kind?: 'tool' | 'module') => void;
  // [TOOL-GAP] Pull the REAL missing capabilities out of `command` (impure: probes PATH / python imports).
  // Injected so this module stays pure/testable. Lets us name pandoc/weasyprint instead of the `set`
  // wrapper, and carry install steps to the owner flag. Absent → fall back to firstRealToken().
  missingCapabilities?: (command: string) => MissingCap[];
}

export type ToolGapOutcome =
  | { kind: 'in-plan' }                          // matched the plan — run as-is, no escalation
  | { kind: 'proceed'; command: string }         // Supervisor's free/low-cost alternate
  | { kind: 'proceed-costly'; command: string }  // user approved the costlier alternate
  | { kind: 'wait' }                             // user chose to wait
  | { kind: 'blocked'; message: string };        // dead end — flag written, needs the owner

/** Plan-match (NOT a hardcoded whitelist): does `command` align with what the Supervisor's plan
 *  approved? True if the exact command appears in the plan, or the command's verb phrase — the
 *  executable (basename) + its first sub-token — is referenced by the plan. Comparing the verb phrase
 *  (not just the executable) means `npm ci` ≠ `npm install`, while `npm install lodash` still matches a
 *  plan that says `npm install` (trailing operands are ignored). An empty plan approves nothing → gap. */
export function commandInPlan(command: string, plan: string): boolean {
  const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const c = norm(command);
  const p = norm(plan);
  if (!c) { return true; }   // nothing to run
  if (!p) { return false; }  // no plan → can't confirm it's approved → treat as a gap
  if (p.includes(c)) { return true; }
  const toks = c.split(' ');
  const exe = (toks[0] || '').split('/').pop() || ''; // strip any path on the executable
  if (!exe) { return false; }
  const phrase = toks.length > 1 ? `${exe} ${toks[1]}` : exe;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `.`, `/`, `-` are NOT boundaries, so `npm install` won't spuriously match `npm installation`.
  return new RegExp(`(^|[^a-z0-9_./-])${esc}([^a-z0-9_./-]|$)`).test(p);
}

/** Run the tiered escalation for a single out-of-plan-or-not command. Never throws. */
export async function resolveToolGap(
  command: string,
  plan: string,
  task: string,
  deps: ToolGapDeps,
): Promise<ToolGapOutcome> {
  // Tier 0 — in plan: proceed silently.
  if (commandInPlan(command, plan)) { return { kind: 'in-plan' }; }

  // Tier 1 — Supervisor re-prescription (same chance it gets after a Guardian rejection).
  const rx = await deps.represcribe(command, task, plan);
  if (rx.found && !rx.costlier) {
    return { kind: 'proceed', command: rx.command || command };
  }

  // Tier 2 — viable but costlier: live per-session cost choice in the chat.
  if (rx.found && rx.costlier) {
    const choice = await deps.askUser(
      "I don't have a clean way to do this — try an alternate approach (uses additional tokens), or wait?",
    );
    return choice === 'alternate'
      ? { kind: 'proceed-costly', command: rx.command || command }
      : { kind: 'wait' };
  }

  // Tier 3 — true dead end: name the REAL missing capabilities (not the `set`/`bash` wrapper they were
  // buried in), write the owner flag WITH install steps, record each as a separate project dead-end, block.
  const flagPath = deps.flagPath || TOOL_GAP_FLAG;
  const reason = rx.note || 'No viable approach exists in the current toolset.';
  const caps = (deps.missingCapabilities?.(command) || []).filter((c) => c && c.name);
  const tool = rx.neededTool || caps[0]?.name || firstRealToken(command) || command;
  const missing = caps.length ? caps : undefined;
  const install = missing ? missing.map((c) => `${c.name} — ${c.install}`).join('\n') : undefined;
  writeToolGapFlag(deps.fs, { tool, task, command, reason, missing, install }, flagPath);
  // The flag alerts the owner NOW; this teaches the pipeline so a future fix doesn't repeat the dead end.
  // Each missing capability is logged on its own (never bundled) so revalidation can retire them one by one.
  if (missing) {
    for (const c of missing) {
      const what = c.kind === 'module' ? `Python module \`${c.name}\`` : `\`${c.name}\``;
      deps.recordDeadEnd?.(c.name, command, `${reason} — ${what} is missing. Install: ${c.install}`, c.kind);
    }
  } else {
    deps.recordDeadEnd?.(tool, command, reason);
  }
  const message = missing
    ? `🛑 **Tool gap — needs your attention.** Missing: ${missing.map((c) => `\`${c.name}\``).join(', ')}. ` +
      `No workaround exists in the toolset. Flagged for the owner (\`${flagPath}\`) with install steps; build paused.`
    : `🛑 **Tool gap — needs your attention.** I need a capability the toolset doesn't have ` +
      `(\`${tool}\`) to run \`${command}\`, and there is no workaround. Flagged for the owner ` +
      `(\`${flagPath}\`); the build is paused until it's resolved.`;
  return { kind: 'blocked', message };
}

/** Pure fallback when no extractor is injected: the first REAL command token, skipping shell builtins /
 *  wrappers / VAR=val assignments so we never key a dead end on `set`, `sudo`, `bash`, etc. */
function firstRealToken(command: string): string {
  const noise = new Set(['set', 'cd', 'export', 'echo', 'printf', 'env', 'bash', 'sh', 'zsh', 'sudo',
    'nohup', 'time', 'if', 'while', 'for', 'then', 'do', 'test']);
  for (const seg of (command || '').split(/[\n;|]+|&&|\|\|/)) {
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < toks.length && (noise.has(toks[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]))) { i++; }
    const t = (toks[i] || '').split('/').pop() || '';
    if (t && /^[A-Za-z]/.test(t)) { return t; }
  }
  return '';
}

/** Write the owner flag (~/.redivivus/pending_toolgap.json) rigops polls. Shared by the out-of-plan
 *  dead-end tier AND the in-plan tool-not-found path so a missing tool surfaces to the owner the same
 *  way whether the plan diverged or a planned tool simply isn't installed. Best-effort. */
export function writeToolGapFlag(
  fs: Pick<typeof import('fs'), 'mkdirSync' | 'writeFileSync'>,
  payload: { tool: string; task: string; command: string; reason: string; missing?: MissingCap[]; install?: string },
  flagPath: string = TOOL_GAP_FLAG,
): void {
  try {
    fs.mkdirSync(path.dirname(flagPath), { recursive: true });
    fs.writeFileSync(flagPath, JSON.stringify({ ...payload, at: new Date().toISOString() }, null, 2));
  } catch { /* the flag is a best-effort signal, not load-bearing */ }
}

/** Clear the dead-end flag. Call when a build is RETRIED (the gap is presumed fixed); if it isn't,
 *  the next out-of-plan command re-writes it. Keeps rigops from showing a stale red after a fix. */
export function clearToolGapFlag(
  fs: Pick<typeof import('fs'), 'existsSync' | 'unlinkSync'>,
  flagPath: string = TOOL_GAP_FLAG,
): void {
  try { if (fs.existsSync(flagPath)) { fs.unlinkSync(flagPath); } } catch { /* best-effort */ }
}
