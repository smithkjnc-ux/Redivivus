// [SCOPE] Helpers extracted from chatPanelMsgFixEscalation.ts (Rule 9 split). Each is a self-contained
// step of the Worker → Verify → Guardian retry loop; the loop's control flow stays in the main file.

import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { modelLabel } from './chatPanelMsgFixUtils.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { appendProjectDeadEnd } from './chatPanelMsgFixDeadEnds.js';
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
  // [GAP1] Set when Guardian approved a pre-applied fix — Phase23 skips re-apply
  preApplied?: boolean;
  preAppliedFiles?: string[];
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


/** Renders the Guardian verdict row + records its usage. Returns the derived guardianLabel + scopeNote. */
export function renderGuardianVerdict(p: {
  guardianRan: boolean; guardianResult: any; guardianProvider: string; workerResponse: string; root: string; deps: MessageHandlerDeps;
  layerName?: string; // 'Compliance Verifier' | 'Code Inspector' — omit for legacy single-pass label
}): { guardianLabel: string; scopeNote: string } {
  const { guardianRan, guardianResult, guardianProvider, workerResponse, root, deps, layerName } = p;
  let guardianLabel: string;
  let scopeNote = '';
  const passLabel = layerName ? `${layerName} — passed` : 'Final review — approved';
  const failLabel = layerName ? `${layerName} — issues found` : 'Final review found issues — improving';
  if (guardianRan) {
    fixActStep({ phase: 'guardian', status: guardianResult.passed ? 'pass' : 'fix',
      label: guardianResult.passed ? passLabel : failLabel,
      detail: (guardianResult.issues || []).join('\n') || undefined,
      model: modelLabel(guardianProvider) });
    if (guardianResult.issues?.length) {
      fixLog(`${layerName || 'Guardian'} issues found`, { issues: guardianResult.issues });
    }
    deps.usageTracker?.recordUsage(
      Math.ceil(workerResponse.length / 4), 0,
      guardianProvider, guardianResult.inputTokens, guardianResult.outputTokens,
      'guardian', require('path').basename(root)
    );
    guardianLabel = modelLabel(guardianProvider);
  } else {
    fixLog(`${layerName || 'Guardian'} could not run on any provider — fix applied WITHOUT review`);
    fixActStep({ phase: 'guardian', status: 'failover', label: `${layerName || 'Final review'} skipped — no AI reviewer available` });
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
}): Promise<{ filesBlock: string; diagnosis: string; supervisorLabel?: string }> {
  const { attempt, maxRetries, userText, root, accumulatedCritiques, projectDeadEnds, buildContext, activePatterns, projectRules, deps } = p;
  let filesBlock = p.filesBlock;
  let currentDiagnosis = p.currentDiagnosis;
  // [FIX] Do NOT re-call the Supervisor on Guardian rejection. The original prescription is still
  // correct — the Worker just needs to implement it more carefully. Calling the Supervisor again
  // adds 10K+ tokens per retry (3 retries = 3x Supervisor cost) for no benefit, since the
  // Supervisor doesn't know what the Worker wrote wrong. Instead, inject the Guardian's critique
  // directly into the diagnosis so the Worker sees EXACTLY what failed and avoids repeating it.
  if (attempt < maxRetries) {
    const lastCritique = accumulatedCritiques[accumulatedCritiques.length - 1] || '';
    const verifySuggestions = accumulatedCritiques
      .filter(c => c.startsWith('[VERIFY SUGGESTED APPROACH]'))
      .map(s => s.replace('[VERIFY SUGGESTED APPROACH] ', '').slice(0, 300))
      .join('\n- ');

    const correctionBlock = [
      `\n\n⚠️ PREVIOUS ATTEMPT FAILED — DO NOT REPEAT THE SAME APPROACH:`,
      lastCritique ? `Guardian critique: ${lastCritique.slice(0, 600)}` : '',
      verifySuggestions ? `Suggested correct approach:\n- ${verifySuggestions}` : '',
      `Make SURGICAL changes matching the prescription exactly. Do not rename variables or restructure code beyond what is prescribed.`,
    ].filter(Boolean).join('\n');

    currentDiagnosis = currentDiagnosis + correctionBlock;
    fixLog(`[RE-PRESCRIBE] Injecting Guardian critique into diagnosis for retry ${attempt + 1} — skipping Supervisor re-call`);

    // Re-read files from disk so the Worker sees the current state, not the pre-attempt snapshot
    try {
      const { resolveSourceFiles } = await import('./chatPanelMsgFixContext.js');
      if (userText) {
        const refreshedFiles = await resolveSourceFiles(root, userText, deps);
        if (refreshedFiles && refreshedFiles.length > 0) {
          filesBlock = refreshedFiles.map((f: { rel: string; content: string }) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
          fixLog(`[RE-PRESCRIBE] Refreshed ${refreshedFiles.length} files from disk for retry ${attempt + 1}`);
        }
      }
    } catch (err) {
      fixLog(`[RE-PRESCRIBE] File refresh skipped (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
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
    const { LearnedMemoryService } = require('../chat/logic/learnedMemoryService.js');
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
