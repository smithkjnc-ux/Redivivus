// [SCOPE] Agent-side wiring for Tool-Gap escalation (extracted from agentTools.ts for Rule 9).
// Turns an agent context into the injectable deps resolveToolGap() needs: a Supervisor
// re-prescription call and the live user cost-choice.

import { type Represcribe, type ToolGapDeps } from './toolGapEscalation.js';

interface ToolGapCtx {
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

export function buildToolGapDeps(ctx: ToolGapCtx): ToolGapDeps {
  return {
    represcribe: (command, task, plan) => represcribeViaSupervisor(ctx, command, task, plan),
    askUser: ctx.askUser || (async () => 'wait'), // default: don't spend extra tokens without consent
    log: ctx.log,
    fs: require('fs'),
  };
}
