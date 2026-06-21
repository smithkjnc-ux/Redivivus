// [SCOPE] Agent-side wiring for Tool-Gap escalation (extracted from agentTools.ts for Rule 9).
// Turns an agent context into the injectable deps resolveToolGap() needs: a Supervisor
// re-prescription call and the live user cost-choice.

import { type Represcribe, type ToolGapDeps, writeToolGapFlag } from './toolGapEscalation.js';
import { extractMissingCapabilities } from './agentToolGapExtract.js';
import { installHint } from './agentToolGapInstall.js';

interface ToolGapCtx {
  root: string;
  task: string;
  log: (msg: string) => void;
  routing?: any;
  askUser?: (prompt: string) => Promise<'alternate' | 'wait'>;
}

// [TOOL-GAP] Ask the Supervisor for a re-prescription on an out-of-plan command — the same chance it
// gets after a Guardian rejection. Returns whether a path exists and whether it costs more.
async function represcribeViaSupervisor(ctx: ToolGapCtx, command: string, task: string, plan: string): Promise<Represcribe> {
  try {
    const routing: any = ctx.routing;
    if (!routing?.routeByComplexity) { return { found: false, costlier: false }; }
    const prompt = `A Worker wants to run a shell command that is NOT in the approved plan.

APPROVED PLAN:
${plan || '(none)'}

COMMAND THE WORKER WANTS TO RUN: ${command}
TASK: ${task}

Can the task be accomplished using ONLY the available toolset? Reply with EXACTLY ONE line:
- "PROCEED: <command>" — a free/low-cost alternative exists (give the exact command to run instead; may equal the original if it is actually fine).
- "COSTLY: <command>" — an alternative exists but needs extra retries / a pricier approach / more AI calls.
- "DEAD_END: <missing capability>" — no viable approach exists in the toolset.`;
    const res = await routing.routeByComplexity(task, prompt);
    const text = (res?.text || '').trim();
    const m = text.match(/^(PROCEED|COSTLY|DEAD_END)\s*:\s*([\s\S]*)$/i);
    if (!m) { return { found: false, costlier: false, note: 'Supervisor returned no clear path.' }; }
    const verdict = m[1].toUpperCase();
    const rest = m[2].trim();
    if (verdict === 'PROCEED') { return { found: true, costlier: false, command: rest || command }; }
    if (verdict === 'COSTLY') { return { found: true, costlier: true, command: rest || command }; }
    return { found: false, costlier: false, neededTool: rest || undefined, note: 'Supervisor: dead end.' };
  } catch {
    return { found: false, costlier: false };
  }
}

/** True if `x` resolves on PATH right now. Only a strict token is checkable, else false (never false-log). */
function toolExists(x: string): boolean {
  if (!/^[A-Za-z0-9._+-]+$/.test(x)) { return false; }
  try { require('child_process').execSync(`command -v ${x}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Log a confirmed-missing capability as a per-project dead-end + raise the owner flag, and return a one-line
 *  note for the agent's failure output. `pattern` keys the dead-end (tool-unavailable / python-module). */
function logGap(ctx: ToolGapCtx, command: string, pattern: string, name: string, reason: string, instead: string): string {
  try {
    const kind: 'tool' | 'module' = pattern.startsWith('python-module') ? 'module' : 'tool';
    const install = installHint(name, kind); // copy-pasteable owner guidance — carried to the flag + dead-end
    const { appendProjectDeadEnd } = require('../../core/routing/chatPanelMsgFixDeadEnds.js');
    appendProjectDeadEnd(ctx.root, pattern, `The Agent ran \`${command}\` but ${reason}`, `${reason} Install: ${install}`, instead);
    writeToolGapFlag(require('fs'), { tool: name, task: ctx.task, command, reason, missing: [{ name, kind, install }], install });
    ctx.log(`🛑 Tool gap: ${pattern} — logged as a project dead-end and flagged for the owner (install: ${install}).`);
    return `\n\n🛑 Tool gap: ${reason} **Install:** ${install}. Logged as a project dead-end and flagged for you (rigops will show it). ${instead}`;
  } catch { return ''; }
}

// [TOOL-GAP] A command FAILED at runtime. Detect the missing capability — even when it's INDIRECT (buried in
// a `python3 -c "import X"` or behind a `command -v X` probe), not just a bare executable that exited 127 —
// and log a SEPARATE per-capability project dead-end + owner flag. Each missing thing is logged on its own;
// we never bundle. Returns a one-line note for the agent's failure output (so the model + user see it), or ''.
export function noteToolGapOnFailure(ctx: ToolGapCtx, command: string, err: any): string {
  try {
    const text = `${err?.code ?? ''} ${err?.stdout ?? ''} ${err?.stderr ?? ''} ${err?.message ?? ''}`;
    // (a) A Python import failed — the missing capability is the MODULE, even though the command ran python.
    const mod = text.match(/No module named ['"]?([A-Za-z0-9_]+)/)?.[1];
    if (mod) {
      return logGap(ctx, command, `python-module: ${mod}`, mod,
        `the Python module \`${mod}\` isn't installed here.`,
        `Install it (e.g. \`pip install ${mod}\`) or use a tool that is installed — don't keep importing ${mod}.`);
    }
    // (b) An availability probe failed — the probed tool is genuinely missing.
    const probe = command.match(/\b(?:command -v|which|type)\s+([A-Za-z0-9._+-]+)/)?.[1];
    if (probe && !toolExists(probe)) {
      return logGap(ctx, command, `tool-unavailable: ${probe}`, probe,
        `\`${probe}\` isn't installed here.`,
        `Don't prescribe ${probe} for this project — use an installed alternative, or ask the user to install it.`);
    }
    // (c) A bare executable wasn't found (exit 127 / command not found), confirmed genuinely absent.
    const exe = ((command || '').trim().split(/\s+/)[0] || '').split('/').pop() || '';
    if (exe && /^[A-Za-z0-9._+-]+$/.test(exe) && (err?.code === 127 || /(command )?not found/i.test(text)) && !toolExists(exe)) {
      return logGap(ctx, command, `tool-unavailable: ${exe}`, exe,
        `\`${exe}\` isn't installed here (the command exited 'command not found').`,
        `Don't prescribe ${exe} for this project — use an installed alternative, or ask the user to install it.`);
    }
    return '';
  } catch { return ''; /* best-effort, never break the command result */ }
}

export function buildToolGapDeps(ctx: ToolGapCtx): ToolGapDeps {
  return {
    represcribe: (command, task, plan) => represcribeViaSupervisor(ctx, command, task, plan),
    askUser: ctx.askUser || (async () => 'wait'), // default: don't spend extra tokens without consent
    log: ctx.log,
    fs: require('fs'),
    // [TOOL-GAP] Name the REAL missing capabilities in `command` (pandoc, weasyprint, a python module) so the
    // dead end + owner flag are keyed on the thing to install — never the `set`/`bash` wrapper they sat inside.
    missingCapabilities: (command) => extractMissingCapabilities(command),
    // [DEAD-END] On a true dead end, teach this project so a future fix won't prescribe the missing tool.
    // resolveToolGap now passes the SPECIFIC capability name + kind (one call per missing thing), so we key
    // the entry directly on it — `tool-unavailable: <exe>` (revalidates via `command -v`) or
    // `python-module: <mod>` (revalidates via import) — and auto-retires once it's installed.
    recordDeadEnd: (tool, command, reason, kind) => {
      try {
        const pattern = kind === 'module' ? `python-module: ${tool}` : `tool-unavailable: ${tool}`;
        const what = kind === 'module' ? `the Python module \`${tool}\`` : `\`${tool}\``;
        const instead = kind === 'module'
          ? `Install it (e.g. \`pip install ${tool}\`) or use an installed alternative — don't keep importing ${tool}.`
          : `Do NOT prescribe ${tool} for this project — it isn't installed/available. Use an installed alternative, or ask the user to install it.`;
        const { appendProjectDeadEnd } = require('../../core/routing/chatPanelMsgFixDeadEnds.js');
        appendProjectDeadEnd(
          ctx.root, pattern,
          `The Agent ran \`${command}\` but ${what} is not available here and no workaround exists in the toolset.`,
          reason, instead,
        );
      } catch { /* best-effort, same as the flag */ }
    },
  };
}
