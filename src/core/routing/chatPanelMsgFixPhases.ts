// [SCOPE] Phase 1 (Supervisor) and Phase 2 (Worker) LLM invocations for the fix pipeline.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { buildSupervisorNotes, buildWorkerRules } from './chatPanelMsgFixPatterns';
import { CHASSIS_WORKER_RULES } from '../../services/ai/chassisWorkerRules';

export async function runPhase1Supervisor(
  userText: string,
  filesBlock: string,
  buildContext: string,
  activePatterns: any[],
  projectDeadEnds: string,
  projectRules: string,
  deps: MessageHandlerDeps,
  root: string,
  imageBase64?: string,
  imageType?: string,
  isRetry = false
): Promise<{ diagnosis: string, supervisorLabel: string, expandedFilesBlock: string } | null> {
  const supervisorSystem = `You are the Supervisor AI in the CHASSIS code editing system. Your role is to analyze the user's request and identify exactly what changes are needed in the existing code.

BEHAVIORAL RULES:
- Handle BOTH bug reports AND feature/change requests (add X, change Y, update Z). Identify ONLY the specific changes needed for this exact request.
- Be specific: name actual variable names, function names, and exact lines.
- Do NOT suggest unnecessary refactoring or restructuring. BUT: if the current approach is fundamentally broken (e.g., relies on missing files, uses wrong APIs, has architectural issues that prevent the feature from working), explicitly recommend the correct approach and what needs to change.
- Read [SCOPE] and [ANNOTATION] comments in source files FIRST -- they explain what each section does.
- For bugs: state Severity (CRITICAL/HIGH/MODERATE), File + function/line, What is wrong, What the correct fix is.
- For features/changes: state which files to modify, what to add or change, and the exact implementation details.
- Number each required change.
CRITICAL: Do NOT write "Solution:", "Verification Completed:", grep command results, or any language implying the fix was already applied. You are DIAGNOSING what needs to change. The Worker implements it AFTER you. Never claim to have run commands or tested anything.
REQUIRED FORMAT: Begin your entire response with exactly this line (do not skip it):
PLAIN: [One plain-English sentence — what is wrong and what needs to change. No jargon. Example: "The bird moves too fast because the speed value is too high — I'll lower it to something more playable."]
Then continue with your full technical analysis.${buildSupervisorNotes(activePatterns)}
CONTEXT EXPANSION: If you see an import or reference to a file not included in the provided sources, add at the very end of your response:
NEEDS_FILES:
relative/path/to/file.ts
CHASSIS will fetch those files and re-run your analysis with full context. Only list files you have strong reason to need. Max 8 files. Omit this section entirely if the provided files are sufficient.`;

  // Blueprint context (who/what/where/when/why) — tells Supervisor what the project is
  const _cfg = deps.chassis?.loadConfig?.();
  const _bp = _cfg?.blueprint;
  const _bpBlock = _bp
    ? `PROJECT BLUEPRINT:\n- What: ${_bp.what}\n- Who: ${_bp.who}\n- Platform/Where: ${_bp.where}\n- Timeline: ${_bp.when}\n- Goal: ${_bp.why}\n\n`
    : '';

  // Recent roadmap entries — tells Supervisor what changed recently
  let _roadmapBlock = '';
  try {
    const _rp = path.join(root, 'CHASSIS_ROADMAP.md');
    if (fs.existsSync(_rp)) {
      const _recent = fs.readFileSync(_rp, 'utf-8').slice(-700).trim();
      if (_recent) { _roadmapBlock = `RECENT PROJECT CHANGES:\n${_recent}\n\n`; }
    }
  } catch {}

  // File skeleton — architecture overview from [SCOPE] annotations without full file content
  const _skelLines: string[] = [];
  for (const blk of filesBlock.split(/\n\/\/ === FILE: /).slice(1)) {
    const nl = blk.indexOf('\n'); if (nl === -1) { continue; }
    const rel = blk.slice(0, nl).replace(/\s*===\s*$/, '').trim();
    const scopeLine = blk.slice(nl + 1).split('\n').slice(0, 4).find(l => /\[SCOPE\]|\[NARRATOR\]/.test(l));
    if (scopeLine) { _skelLines.push(`  ${rel}: ${scopeLine.replace(/\/\/\s*\[(?:SCOPE|NARRATOR)\]\s*/i, '').trim()}`); }
  }
  const _skelBlock = _skelLines.length > 0 ? `FILE ARCHITECTURE (role of each file):\n${_skelLines.join('\n')}\n\n` : '';

  const diagPrompt = `${_bpBlock}${_roadmapBlock}${_skelBlock}${buildContext ? buildContext + '\n\n' : ''}User reports: "${userText}"

Source files:
${filesBlock}${projectDeadEnds ? `\n\nPREVIOUSLY FAILED APPROACHES (DO NOT suggest these again):\n${projectDeadEnds}` : ''}${projectRules ? `\n\nPROJECT RULES (your fix must not violate these):\n${projectRules}` : ''}`;

  const diagRes = await deps.routing.prompt(diagPrompt, 60_000, imageBase64, imageType, supervisorSystem);
  if (!diagRes.success || !diagRes.text?.trim()) {
    throw new Error(`Supervisor returned no response. Error: ${diagRes.error || 'unknown'}. Check your API key in Settings.`);
  }
  let diagnosis = diagRes.text.trim();
  const supervisorLabel = modelLabel(diagRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((diagPrompt.length+diagnosis.length)/4), 0, diagRes.model||'claude', diagRes.inputTokens, diagRes.outputTokens, 'supervisor', require('path').basename(root));
  if (!isRetry) { // Expand context if Supervisor identified missing files (one round-trip only)
    const reqd = (diagnosis.match(/NEEDS_FILES:\n([\s\S]*?)(?=\n\n|$)/)?.[1] || '').trim().split('\n').map(l => l.trim()).filter(l => l && !l.includes('..') && !l.startsWith('/'));
    const extra = reqd.slice(0, 8).flatMap(rel => { try { return [{ rel, content: fs.readFileSync(path.join(root, rel), 'utf-8') }]; } catch { return []; } });
    if (extra.length > 0) {
      const expanded = filesBlock + '\n\n' + extra.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      return runPhase1Supervisor(userText, expanded, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType, true);
    }
  }
  diagnosis = diagnosis.replace(/\nNEEDS_FILES:\n[\s\S]*$/, '').trim();
  return { diagnosis, supervisorLabel, expandedFilesBlock: filesBlock };
}

export async function runPhase2Worker(
  diagnosis: string,
  fileNames: string,
  filesBlock: string,
  activePatterns: any[],
  deps: MessageHandlerDeps,
  root: string
): Promise<{ workerResponse: string, workerLabel: string } | null> {
  const workerSystem = `You are the Worker AI in the CHASSIS code editing system. You make precise, surgical code changes.

IDENTITY AND DISCIPLINE:
- You implement ONLY the specific changes described in the Supervisor's analysis. Nothing else.
- You make surgical edits -- modify ONLY the exact lines that need to change.
- You NEVER refactor, rename variables, reformat code, or "improve" anything beyond the requested change.
- You NEVER create new files or invent file paths that the Supervisor did not identify.
- You read [SCOPE] and [ANNOTATION] comments to understand code structure before changing anything.
- For every block of code you REMOVE or REPLACE, add a [DEAD] comment above it.
${deps.assistMode ? '' : CHASSIS_WORKER_RULES + '\n'}${buildWorkerRules(activePatterns, 9)}
OUTPUT FORMAT — choose based on scope:

SURGICAL (targeted change ≤ ~30% of file):
## Edit: relative/path/to/file
<<<SEARCH
[exact existing code — copy verbatim, include 2-3 context lines]
===
[replacement code]
REPLACE>>>

UNIFIED DIFF: standard git diff format (--- a/path  +++ b/path  @@ hunks) — use when exact text match would be fragile.

FULL FILE (structural rewrite or >30% of file changed):
## Fix: relative/path/to/file
\`\`\`[language]
[complete new file content]
\`\`\`
Output ONLY these blocks. No prose, no explanations.`;

  const fixPrompt = `SUPERVISOR ANALYSIS:
${diagnosis}

PROJECT SOURCE FILES:
${fileNames}

${filesBlock}`;

  const fixRes = await deps.routing.prompt(fixPrompt, 90_000, undefined, undefined, workerSystem);
  if (!fixRes.success || !fixRes.text?.trim()) {
    throw new Error(`Worker returned no response. Error: ${fixRes.error || 'unknown'}.`);
  }
  const workerResponse = fixRes.text.trim();
  const workerLabel = modelLabel(fixRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((fixPrompt.length+workerResponse.length)/4), 0, fixRes.model||'claude', fixRes.inputTokens, fixRes.outputTokens, 'worker', require('path').basename(root));
  return { workerResponse, workerLabel };
}

export interface SupervisorVerifyResult {
  passed: boolean;
  issues: string[];
  suggestion?: string;
}

export async function runSupervisorVerify(
  diagnosis: string,
  workerResponse: string,
  userText: string,
  deps: MessageHandlerDeps,
  root: string
): Promise<SupervisorVerifyResult> {
  const verifySystem = `You are the Supervisor AI verifying your Worker's output. You wrote the diagnosis. Now check: did the Worker LOGICALLY achieve what you asked for?

VERIFICATION RULES:
- You are checking LOGIC, not syntax. The code may compile fine but still be wrong.
- Compare each bug in your diagnosis to the Worker's edit. Did it actually fix the root cause, or just paper over the symptom?
- Check: Are the variable names, function calls, and logic paths correct for what you intended?
- Check: Did the Worker misunderstand your diagnosis and fix the wrong thing?
- If the Worker got it right: respond with ONLY the word PASS
- If the Worker got it wrong: respond with FAIL followed by a brief explanation of what is logically wrong and what the correct fix should be.`;

  const verifyPrompt = `ORIGINAL USER REPORT: "${userText}"

YOUR DIAGNOSIS (what you asked the Worker to fix):
${diagnosis}

WORKER'S PROPOSED FIX:
${workerResponse}

Does this fix LOGICALLY achieve what you diagnosed? Does the code change actually address the root cause you identified?`;

  try {
    const res = await deps.routing.prompt(verifyPrompt, 45_000, undefined, undefined, verifySystem);
    if (!res.success || !res.text?.trim()) {
      // Verification failed to run — pass through (don't block the pipeline)
      return { passed: true, issues: [] };
    }
    deps.usageTracker?.recordUsage(Math.ceil((verifyPrompt.length + (res.text?.length || 0)) / 4), 0, res.model || 'claude', res.inputTokens, res.outputTokens, 'supervisor', require('path').basename(root));

    const answer = res.text.trim();
    if (answer.startsWith('PASS') || answer.toLowerCase().startsWith('pass')) {
      return { passed: true, issues: [] };
    }
    // Extract the explanation after FAIL
    const explanation = answer.replace(/^FAIL\s*/i, '').trim();
    return { passed: false, issues: [explanation], suggestion: explanation };
  } catch {
    // Non-blocking — if verification errors out, let the pipeline continue
    return { passed: true, issues: [] };
  }
}
