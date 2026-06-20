// [SCOPE] Agent-side wiring for Tool-Gap escalation (extracted from agentTools.ts for Rule 9).
// Turns an agent context into the injectable deps resolveToolGap() needs: a Supervisor
// re-prescription call and the live user cost-choice.

import { type Represcribe, type ToolGapDeps, writeToolGapFlag } from './toolGapEscalation.js';

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

// [TOOL-GAP] A command FAILED at runtime. If the failure is "the executable isn't installed" (exit 127 /
// command not found) AND `command -v` confirms it's genuinely missing, log a SEPARATE per-tool project
// dead-end and raise the owner flag — exactly as an out-of-plan dead end would, even though this command
// was IN the plan. Each missing tool is logged on its own; we never bundle several failures into one "dead
// plan." Returns a one-line note to append to the agent's failure output (so the model + user see it), or ''.
export function noteToolGapOnFailure(ctx: ToolGapCtx, command: string, err: any): string {
  try {
    const exe = ((command || '').trim().split(/\s+/)[0] || '').split('/').pop() || '';
    if (!exe || !/^[a-zA-Z0-9._+-]+$/.test(exe)) { return ''; }
    const text = `${err?.code ?? ''} ${err?.stderr ?? ''} ${err?.message ?? ''}`;
    if (err?.code !== 127 && !/(command )?not found/i.test(text)) { return ''; }
    // Confirm it's truly absent (not a 127 bubbling up from something nested) before we teach the project.
    try { require('child_process').execSync(`command -v ${exe}`, { stdio: 'ignore' }); return ''; } catch { /* genuinely missing */ }
    const reason = `\`${exe}\` is not installed in this environment (the command exited 'command not found').`;
    const { appendProjectDeadEnd } = require('../../core/routing/chatPanelMsgFixDeadEnds.js');
    appendProjectDeadEnd(
      ctx.root,
      `tool-unavailable: ${exe}`,
      `The Agent ran \`${command}\` as part of the plan, but ${exe} is not available here.`,
      reason,
      `Do NOT prescribe ${exe} for this project — it isn't installed. Use an installed alternative, or ask the user to install it.`,
    );
    writeToolGapFlag(require('fs'), { tool: exe, task: ctx.task, command, reason });
    ctx.log(`🛑 Tool gap: \`${exe}\` is missing — logged as a project dead-end and flagged for the owner.`);
    return `\n\n🛑 Tool gap: \`${exe}\` isn't installed here. Logged as a project dead-end and flagged for you (rigops will show it). Install it or use an installed alternative — don't keep retrying ${exe}.`;
  } catch { return ''; /* best-effort, never break the command result */ }
}

export function buildToolGapDeps(ctx: ToolGapCtx): ToolGapDeps {
  return {
    represcribe: (command, task, plan) => represcribeViaSupervisor(ctx, command, task, plan),
    askUser: ctx.askUser || (async () => 'wait'), // default: don't spend extra tokens without consent
    log: ctx.log,
    fs: require('fs'),
    // [DEAD-END] On a true dead end, teach this project so a future fix won't prescribe the missing tool.
    // Key the entry on the actual EXECUTABLE (first token of the command) so revalidation can later check
    // `command -v <exe>` and auto-retire it once the tool is installed; keep the descriptive phrase in the body.
    recordDeadEnd: (tool, command, reason) => {
      try {
        const exe = ((command || '').trim().split(/\s+/)[0] || tool || '').split('/').pop() || tool;
        const { appendProjectDeadEnd } = require('../../core/routing/chatPanelMsgFixDeadEnds.js');
        appendProjectDeadEnd(
          ctx.root,
          `tool-unavailable: ${exe}`,
          `The Agent ran \`${command}\` (needed: ${tool}) but ${exe} is not available here and no workaround exists in the toolset.`,
          reason,
          `Do NOT prescribe ${exe} for this project — it isn't installed/available. Use an installed alternative, or ask the user to install it.`,
        );
      } catch { /* best-effort, same as the flag */ }
    },
  };
}
