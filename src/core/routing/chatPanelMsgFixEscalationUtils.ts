// [SCOPE] Helpers extracted from chatPanelMsgFixEscalation.ts (Rule 9 split). Each is a self-contained
// step of the Worker → Verify → Guardian retry loop; the loop's control flow stays in the main file.

import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { fixLog } from '../../services/logging/fixPipelineLogger';
import { appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds';
import { fixActStep } from './fixActivityPanel.js';

// [DONE] EscalationResult moved here from chatPanelMsgFixEscalation.ts (Rule 9 split)
export interface EscalationResult {
  finalResponse: string;
  workerLabel: string;
  guardianLabel: string;
  guardianNote: string;
  scopeNote: string;
  needsAgentHandoff: boolean;
  retryCount: number;
  escalated: boolean;
  forceSurgical?: boolean;
  accumulatedCritiques?: string[];
}

/** Truncation/cut-off detector — when a critique looks like the output was cut off, the retry switches
 *  to surgical-edit format for reliability. */
export function isTruncationText(s: string): boolean {
  return /truncated|incomplete|cuts off mid-function|max_tokens|finish_reason.*length/i.test(s);
}

/** Renders a 4-step progress list into the last conversation message. */
export function updateStatus(conversation: any[], supervisorLabel: string, phase: 'worker' | 'verify' | 'guardian', attempt: number, escalated: boolean, streamBytes = 0): void {
  const lastMsg = conversation[conversation.length - 1];
  if (!lastMsg) { return; }
  const retry = attempt > 0 ? (escalated ? ' — escalated' : ` — retry ${attempt}`) : '';
  const kbNote = streamBytes > 512 ? ` (${(streamBytes / 1024).toFixed(1)} KB)` : '';
  const workerStatus = phase === 'worker' ? `writing fix${kbNote}${retry}...` : `fix written${attempt > 0 ? retry : ''}`;
  const verifyStatus = phase === 'verify' ? 'checking logic...' : phase === 'guardian' ? 'done' : 'pending';
  const guardianStatus = phase === 'guardian' ? 'reviewing...' : 'pending';
  lastMsg.content =
    `Supervisor (${supervisorLabel}): done\n` +
    `Worker: ${workerStatus}\n` +
    `Verify: ${verifyStatus}\n` +
    `Guardian: ${guardianStatus}`;
}

/** Creates a copy of deps with accumulated Guardian critiques injected into the routing context */
export function enrichDepsWithCritiques(deps: MessageHandlerDeps, critiques: string[]): MessageHandlerDeps {
  const critiqueBlock = critiques.map((c, i) => `Attempt ${i + 1} failed: ${c}`).join('\n');

  // Extract explicit file prohibitions from critiques — surface as hard constraints at the TOP
  // so the Worker can't bury them at the end and ignore them.
  const forbiddenFiles: string[] = [];
  for (const c of critiques) {
    // Match patterns like: "only involve style.css, leaving index.html unchanged"
    // or "should NOT modify index.html" or "do not touch index.html"
    const notPatterns = c.matchAll(/(?:leaving|unchanged|do not (?:touch|modify)|should not (?:touch|modify)|must not (?:touch|modify))\s+[`']?([\w./\\-]+\.[a-zA-Z0-9]{1,6})[`']?/gi);
    for (const m of notPatterns) { if (!forbiddenFiles.includes(m[1])) { forbiddenFiles.push(m[1]); } }
  }
  const forbiddenBlock = forbiddenFiles.length > 0
    ? `⛔ FORBIDDEN — DO NOT MODIFY THESE FILES (previous attempts failed because they changed them):\n${forbiddenFiles.map(f => `- ${f}`).join('\n')}\n\n`
    : '';

  const enrichedRouting = Object.create(deps.routing);
  const originalPrompt = deps.routing.prompt.bind(deps.routing);
  enrichedRouting.prompt = async (text: string, timeoutMs?: number, imageBase64?: string, imageType?: string) => {
    // Forbidden files go FIRST (highest priority), critique block goes BEFORE the task (not after)
    const enriched = `${forbiddenBlock}PREVIOUS ATTEMPTS FAILED — read carefully before writing:\n${critiqueBlock}\n\n${text}`;
    return originalPrompt(enriched, timeoutMs, imageBase64, imageType);
  };
  return { ...deps, routing: enrichedRouting };
}

/** Phase 2.5 — Supervisor verifies the Worker's logic. Returns a directive for the loop:
 *  'pass' → continue to Guardian; 'retry' → loop again; 'fail' → caller throws (rejected after N tries).
 *  Pushes critiques in place; `forceSurgical` is true when a truncation was detected. */
export async function runVerifyStep(p: {
  diagnosis: string; workerResponse: string; deps: MessageHandlerDeps; root: string;
  conversation: any[]; supervisorLabel: string; attempt: number; maxRetries: number; critiques: string[];
}): Promise<{ action: 'pass' | 'retry' | 'fail'; message?: string; forceSurgical: boolean; verifySuggestion?: string }> {
  const { diagnosis, workerResponse, deps, root, conversation, supervisorLabel, attempt, maxRetries, critiques } = p;
  let forceSurgical = false;
  try {
    const { runSupervisorVerify } = await import('./chatPanelMsgFixVerify.js');
    const userRequest = conversation.map(m => m.role === 'user' ? m.content : '').filter(Boolean).pop() || 'Fix the issue';
    fixLog(`Supervisor verify (attempt ${attempt + 1}): Starting...`);
    const verifyResult = await runSupervisorVerify(diagnosis, workerResponse, userRequest, deps, root);
    fixLog(`Supervisor verify result`, { passed: verifyResult.passed, issues: verifyResult.issues });

    if (!verifyResult.passed) {
      const logicIssue = verifyResult.issues.join('; ') || 'Logic does not match intent';
      const verifySuggestion = verifyResult.suggestion;
      critiques.push(`[SUPERVISOR LOGIC CHECK] ${logicIssue}`);
      fixLog(`Supervisor REJECTED Worker logic (attempt ${attempt + 1})`, { issue: logicIssue.substring(0, 300) });
      fixActStep({ phase: 'supervisor', status: 'fix', label: "Checked the fix — it didn't match the intent, retrying", detail: logicIssue });

      if (isTruncationText(logicIssue) && attempt < maxRetries) {
        forceSurgical = true;
        fixLog(`[TRUNCATION DETECTED] Switching to surgical format for retry ${attempt + 2}`);
        critiques.push(`[FORMAT CHANGE] Previous attempt used FULL FILE but output was truncated. Use SURGICAL EDITS (SEARCH/REPLACE) instead for reliability.`);
      }

      if (attempt < maxRetries) {
        conversation[conversation.length - 1].content =
          `Supervisor (${supervisorLabel}): done\nWorker: rejected — "${logicIssue.slice(0, 80)}" — retrying...\nVerify: pending\nGuardian: pending`;
        return { action: 'retry', forceSurgical, verifySuggestion };
      }
      return { action: 'fail', message: logicIssue, forceSurgical, verifySuggestion };
    }
    fixActStep({ phase: 'supervisor', status: 'pass', label: 'Checked — the fix matches what you asked for' });
    return { action: 'pass', forceSurgical, verifySuggestion: undefined };
  } catch (e: any) {
    if (e.message?.startsWith('Supervisor rejected Worker output')) { throw e; }
    fixLog(`Supervisor verify skipped (error): ${e?.message || e}`);
    return { action: 'pass', forceSurgical };
  }
}

/** Renders the Guardian verdict row + records its usage. Returns the derived guardianLabel + scopeNote. */
export function renderGuardianVerdict(p: {
  guardianRan: boolean; guardianResult: any; guardianProvider: string; workerResponse: string; root: string; deps: MessageHandlerDeps;
}): { guardianLabel: string; scopeNote: string } {
  const { guardianRan, guardianResult, guardianProvider, workerResponse, root, deps } = p;
  let guardianLabel: string;
  let scopeNote = '';
  if (guardianRan) {
    fixActStep({ phase: 'guardian', status: guardianResult.passed ? 'pass' : 'fix',
      label: guardianResult.passed ? 'Final review — approved' : 'Final review found issues — improving',
      detail: (guardianResult.issues || []).join('\n') || undefined,
      model: modelLabel(guardianProvider) });
    if (guardianResult.issues?.length) {
      fixLog(`Guardian issues found`, { issues: guardianResult.issues });
    }
    deps.usageTracker?.recordUsage(
      Math.ceil(workerResponse.length / 4), 0,
      guardianProvider, guardianResult.inputTokens, guardianResult.outputTokens,
      'guardian', require('path').basename(root)
    );
    guardianLabel = modelLabel(guardianProvider);
  } else {
    fixLog(`Guardian could not run on any provider — fix applied WITHOUT final review`);
    fixActStep({ phase: 'guardian', status: 'failover', label: 'Final review skipped — no AI reviewer available' });
    guardianLabel = 'skipped';
  }
  if (guardianResult.scopeAlerts?.length) {
    scopeNote = `\n\n**Guardian also noticed (not applied -- say "also fix..." to address):**\n${guardianResult.scopeAlerts.map((a: string) => `- ${a}`).join('\n')}`;
  }
  return { guardianLabel, scopeNote };
}

/** [STAGE 2] After a Guardian rejection, call the Supervisor again with enriched dead-end context to
 *  get a fresh prescription. Returns possibly-updated { filesBlock, diagnosis }. Never throws. */
export async function represcribeAfterRejection(p: {
  attempt: number; maxRetries: number; userText?: string; root: string; filesBlock: string; currentDiagnosis: string;
  accumulatedCritiques: string[]; projectDeadEnds?: string; buildContext?: string; activePatterns: any[]; projectRules?: string; deps: MessageHandlerDeps;
}): Promise<{ filesBlock: string; diagnosis: string }> {
  const { attempt, maxRetries, userText, root, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules, deps } = p;
  let filesBlock = p.filesBlock;
  let currentDiagnosis = p.currentDiagnosis;
  if (attempt < maxRetries && userText) {
    fixLog(`[RE-PRESCRIBE] Guardian rejected attempt ${attempt + 1} — calling Supervisor for new prescription`);
    try {
      const { resolveSourceFiles } = await import('./chatPanelMsgFixContext.js');
      const refreshedFiles = await resolveSourceFiles(root, userText, deps);
      if (refreshedFiles && refreshedFiles.length > 0) {
        filesBlock = refreshedFiles.map((f: { rel: string; content: string }) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
        fixLog(`[RE-PRESCRIBE] Refreshed file contents for re-prescription (${refreshedFiles.length} files)`);
      }
      // Separate positive Verify suggestions from failure critiques — treat them differently
      const verifySuggestions = accumulatedCritiques.filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'));
      const failureCritiques = accumulatedCritiques.filter(c => !c.startsWith('[VERIFY SUGGESTED APPROACH]'));
      const sessionDeadEnds = failureCritiques
        .map((c, i) => {
          // Extract prescriptive guidance from the critique — sentences that tell us WHAT TO DO.
          const prescriptiveLines = c.split(/(?<=[.!])\s+/)
            .filter(s => /correct fix should|should (?:instead|only|be)|needs? (?:a |to )|use .+instead|canvas itself needs|try instead|correct approach/i.test(s))
            .join(' ').trim();
          const hintBlock = prescriptiveLines ? `\n- CORRECT APPROACH HINT (from Verify): ${prescriptiveLines.slice(0, 400)}` : '';
          return `## Attempt ${i + 1} failed\n- What was tried: ${currentDiagnosis.slice(0, 100).replace(/\n/g, ' ')}...\n- Why it failed: ${c.slice(0, 400)}\n- Do NOT repeat this approach${hintBlock}`;
        })
        .join('\n\n');
      const verifyHintBlock = verifySuggestions.length > 0
        ? `## Verify AI suggested these approaches (use as guidance):\n${verifySuggestions.map(s => `- ${s.replace('[VERIFY SUGGESTED APPROACH] ', '').slice(0, 300)}`).join('\n')}`
        : '';
      const enrichedDeadEnds = [projectDeadEnds, sessionDeadEnds, verifyHintBlock].filter(Boolean).join('\n\n---\n\n');

      const { runPhase1Supervisor } = await import('./chatPanelMsgFixPhases.js');
      const rePrescription = await runPhase1Supervisor(
        userText, filesBlock, buildContext || '', activePatterns, enrichedDeadEnds, projectRules || '', deps, root, undefined, undefined, true,
      );
      if (rePrescription && rePrescription.diagnosis) {
        const oldDiagnosis = currentDiagnosis.slice(0, 80);
        currentDiagnosis = rePrescription.diagnosis;
        fixLog(`[RE-PRESCRIBE] New prescription received`, { oldPreview: oldDiagnosis + '...', newPreview: currentDiagnosis.substring(0, 200) + '...' });
      } else {
        fixLog(`[RE-PRESCRIBE] Supervisor returned no new diagnosis, continuing with original prescription`);
      }
    } catch (err) {
      fixLog(`[RE-PRESCRIBE] Re-prescription failed, continuing with original prescription`, { err: err instanceof Error ? err.message : String(err) });
    }
  }
  return { filesBlock, diagnosis: currentDiagnosis };
}

/** Writes the accumulated Guardian rejection reasons to dead_ends.md when all retries are exhausted. */
export function logExhaustedDeadEnd(root: string, accumulatedCritiques: string[], retryCount: number, maxRetries: number, escalated: boolean): void {
  if (accumulatedCritiques.length === 0) { return; }
  const failureCritiques = accumulatedCritiques.filter(c => !c.startsWith('[VERIFY SUGGESTED APPROACH]'));
  const verifySuggestions = accumulatedCritiques.filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'));
  const critiqueText = failureCritiques.join('; ');
  const prescriptionAttempts = `Original + ${retryCount} re-prescription(s)${escalated ? ' + Supervisor self-fix' : ''}`;
  // What to try instead: prefer Verify's own suggestions, else generic advice
  const doInstead = verifySuggestions.length > 0
    ? verifySuggestions.map(s => s.replace('[VERIFY SUGGESTED APPROACH] ', '')).join('; ').slice(0, 300)
    : 'Try FULL FILE format instead of surgical edits, or rephrase the fix request more specifically';
  appendProjectDeadEnd(
    root,
    `guardian-rejected: ${critiqueText.slice(0, 80)}`,
    critiqueText,
    `Guardian rejected after ${maxRetries + 1} attempts (${prescriptionAttempts})`,
    doInstead,
  );
  // Also write to knowledge.json as never_do entries so future Supervisor prompts are informed
  try {
    const { LearnedMemoryService } = require('../../services/learnedMemoryService.js');
    const mem = new LearnedMemoryService(root);
    for (const critique of failureCritiques) {
      if (critique.length > 20 && !critique.startsWith('[FORMAT CHANGE]')) {
        mem.addNeverDo(
          critique.slice(0, 200),
          `Auto-logged: Guardian rejected after ${maxRetries + 1} attempts. ${doInstead.slice(0, 150)}`
        );
      }
    }
    fixLog('[DEAD END] Wrote Guardian rejection reasons to knowledge.json never_do entries', { count: failureCritiques.length });
  } catch (e) {
    fixLog('[DEAD END] Could not write to knowledge.json', { err: e instanceof Error ? e.message : String(e) });
  }
  fixLog('[DEAD END] Wrote Guardian rejection reasons to dead_ends.md', { critiques: accumulatedCritiques, prescriptionAttempts });
}
