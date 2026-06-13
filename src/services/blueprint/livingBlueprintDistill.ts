// [SCOPE] Living Blueprint distillers — the AI calls that turn a build or an accepted fix into a behavioral
// contract update. AI distills behavior, code stores it (Rule 18). Routes via routing.prompt(role='worker') so
// it reuses whoever just did the work ("whoever did the change" — locked decision). Behavioral ONLY: the prompts
// forbid file/function/variable names so the contract never goes stale on a refactor.
// See docs/REDIVIVUS_LIVING_BLUEPRINT.md and [[living-blueprint-direction]].

import { getMechanics } from './livingBlueprintService.js';

const BUILD_SYS = `You write a BEHAVIORAL CONTRACT for a software project: the observable rules of what it SHOULD do.
RULES:
- Describe behavior a user can observe, NOT code. NEVER name files, functions, variables, or frameworks.
- Group short, labelled rules by area (e.g. controls, scoring, win/lose). Be concise — this is a spec, not prose.
- State WHEN things happen, not just what (timing/order matters for diagnosing bugs later).
Reply with ONLY the contract text.`;

const FIX_SYS = `You maintain a project's BEHAVIORAL CONTRACT after a change was just made.
Given the CURRENT contract and a description of the change, reply with ONLY valid JSON:
{"summary":"one behavioral sentence describing what changed","delta":["~ one behavioral rule that changed (use + add / ~ change / - remove)"],"mechanics":"the FULL updated contract, reconciled with the change"}
RULES: behavioral only — NEVER name files, functions, or variables. Keep the contract concise and observable.`;

/** Build seed: produce the initial behavioral contract from the build instruction + file list. */
export async function distillBuildMechanics(routing: any, task: string, fileList: string[]): Promise<string | null> {
  try {
    const prompt = `The project was just built from this instruction:\n"${task}"\n\nFiles produced: ${fileList.join(', ') || '(unknown)'}\n\nWrite the behavioral contract (observable rules only).`;
    const res = await routing.prompt(prompt, 45_000, undefined, undefined, BUILD_SYS, 'worker');
    const text = (res?.text || '').trim();
    return res?.success !== false && text.length > 20 ? text : null;
  } catch { return null; }
}

/** Fix revision: produce a behavioral summary + reconciled contract after an accepted fix. */
export async function distillFixRevision(
  routing: any, deps: any, userText: string, diagnosis: string,
): Promise<{ summary: string; delta: string[]; mechanics: string } | null> {
  try {
    const current = getMechanics(deps) || '(no contract yet — write one based on this change)';
    const plain = diagnosis.match(/PLAIN:\s*(.+?)(?:\n|$)/)?.[1]?.trim() || diagnosis.slice(0, 400);
    const prompt = `CURRENT CONTRACT:\n${current}\n\nCHANGE REQUEST: "${userText}"\nWHAT WAS CHANGED: ${plain}\n\nUpdate the contract.`;
    const res = await routing.prompt(prompt, 45_000, undefined, undefined, FIX_SYS, 'worker');
    if (res?.success === false) { return null; }
    const m = (res?.text || '').match(/\{[\s\S]*\}/);
    if (!m) { return null; }
    const parsed = JSON.parse(m[0]);
    if (!parsed.summary || !parsed.mechanics) { return null; }
    return {
      summary: String(parsed.summary).trim(),
      delta: Array.isArray(parsed.delta) ? parsed.delta.map((d: any) => String(d).trim()).filter(Boolean) : [],
      mechanics: String(parsed.mechanics).trim(),
    };
  } catch { return null; }
}
