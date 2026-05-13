// [SCOPE] CHASSIS Supervisor Review — lightweight phase validation run after each Worker build phase.
// Checks for hallucinations and scope drift. Supervisor corrects or takes over on failure.
// [WARN] scope_check makes a real AI call (max_tokens:50). Keep fast — called after every phase.

import { callProvider } from './routingProviders.js';

/** Caller signature injected from RoutingService to avoid circular imports */
export type ProviderCaller = (ai: string, prompt: string) => Promise<{ text: string; success: boolean; error?: string }>;

/** Returns true if the response indicates a quota/balance/rate-limit failure (HTTP 429 or equivalent) */
function isQuotaError(res: { success: boolean; error?: string }): boolean {
  if (res.success) { return false; }
  const e = (res.error || '').toLowerCase();
  return e.includes('429') || e.includes('quota') || e.includes('insufficient') || e.includes('rate limit') || e.includes('balance');
}

export interface PhaseReviewResult {
  passed: boolean;
  issues: string[];
  // If not passed, supervisor's corrected code (or null if supervisor also failed)
  correctedCode: string | null;
  // Which step failed: 'hallucination' | 'scope' | 'none'
  failedCheck: 'hallucination' | 'scope' | 'none';
}

/**
 * Lightweight hallucination check — static analysis only, no AI call.
 * Flags code that imports packages clearly not mentioned in the build plan,
 * or calls functions that appear to be undefined within the output.
 */
export function hallucinationCheck(code: string, plan: string): { suspicious: boolean; reason: string } {
  const planLower = plan.toLowerCase();

  // Extract import targets from code
  const importMatches = [
    ...code.matchAll(/^\s*import\s+.*?\s+from\s+['"]([^'"./][^'"]*)['"]/gm),
    ...code.matchAll(/^\s*(?:const|let|var)\s+.*?=\s*require\(['"]([^'"./][^'"]*)['"]\)/gm),
    ...code.matchAll(/^\s*import\s+['"]([^'"./][^'"]*)['"]/gm),
  ].map(m => m[1].toLowerCase().split('/')[0]); // top-level package only

  // Allow universally safe builtins
  const safeBuiltins = new Set([
    'fs','path','os','crypto','http','https','url','stream','events','util',
    'child_process','buffer','assert','readline','zlib','net','dns','tls',
    'process','console','timers','querystring','string_decoder','punycode',
  ]);

  const suspicious: string[] = [];
  for (const pkg of importMatches) {
    if (safeBuiltins.has(pkg)) { continue; }
    // If the package name doesn't appear anywhere in the plan text, flag it
    if (!planLower.includes(pkg)) {
      suspicious.push(pkg);
    }
  }

  if (suspicious.length > 0) {
    return { suspicious: true, reason: `Imports not mentioned in plan: ${suspicious.join(', ')}` };
  }
  return { suspicious: false, reason: '' };
}

/**
 * Scope check — asks Supervisor: "Does this code match what was asked?"
 * Returns true if code is on-scope, false if Supervisor says NO.
 * Uses max ~50 tokens for the YES/NO answer — fast and cheap.
 */
export async function scopeCheck(
  code: string,
  originalPrompt: string,
  supervisorAI: string,
  caller: ProviderCaller
): Promise<{ onScope: boolean; reason: string }> {
  const checkPrompt = `You are a code reviewer. Does the following code correctly implement what was asked?

ORIGINAL REQUEST:
"${originalPrompt.slice(0, 400)}"

CODE (first 60 lines):
\`\`\`
${code.split('\n').slice(0, 60).join('\n')}
\`\`\`

Reply with EXACTLY "YES" if the code matches the request, or "NO: [one sentence reason]" if it does not. Nothing else.`;

  try {
    const res = await caller(supervisorAI, checkPrompt);
    if (!res.success) { return { onScope: true, reason: '' }; } // fail open
    const answer = res.text.trim().toUpperCase();
    if (answer.startsWith('NO')) {
      const reason = res.text.trim().replace(/^NO:?\s*/i, '').trim();
      return { onScope: false, reason: reason || 'Scope drift detected' };
    }
    return { onScope: true, reason: '' };
  } catch {
    return { onScope: true, reason: '' }; // fail open — never block on review failure
  }
}

/**
 * Full phase review: runs hallucination check first (free), then scope check (1 AI call).
 * If issues found, Supervisor attempts a correction prompt to the Worker.
 * If Worker correction fails, Supervisor generates the code itself.
 */
export async function reviewPhase(opts: {
  code: string;
  originalPrompt: string;
  filePrompt: string;
  planSummary: string;
  supervisorAI: string;
  workerAI: string;
  caller: ProviderCaller;
  logFallback: (msg: string) => void;
}): Promise<PhaseReviewResult> {
  const { code, originalPrompt, filePrompt, planSummary, supervisorAI, workerAI, caller, logFallback } = opts;

  // 1. Hallucination check (free — no AI call)
  const hallCheck = hallucinationCheck(code, planSummary);
  if (hallCheck.suspicious) {
    logFallback(`[SUPERVISOR] Hallucination flag: ${hallCheck.reason}`);
    // Attempt Worker correction
    const fixPrompt = `The following code has a potential hallucination issue: ${hallCheck.reason}\n\nFix the code so it only uses packages and dependencies that are explicitly needed for this task:\n"${originalPrompt.slice(0, 300)}"\n\nReturn ONLY the corrected code, no explanation.\n\n\`\`\`\n${code}\n\`\`\``;
    const workerFix = await caller(workerAI, fixPrompt).catch(() => ({ text: '', success: false as const }));
    const workerFixFailed = !workerFix.success || isQuotaError(workerFix) || !workerFix.text.trim();
    if (!workerFixFailed) {
      return { passed: false, issues: [hallCheck.reason], correctedCode: workerFix.text.trim(), failedCheck: 'hallucination' };
    }
    // Worker failed or quota error — Supervisor does it
    const fallbackReason = isQuotaError(workerFix) ? 'Worker 429/quota' : 'Worker failed';
    logFallback(`[SUPERVISOR FALLBACK] ${fallbackReason} on hallucination correction — Supervisor taking over`);
    const supRes = await caller(supervisorAI, filePrompt).catch(() => ({ text: '', success: false as const }));
    return {
      passed: false, issues: [hallCheck.reason],
      correctedCode: supRes.success && supRes.text.trim() ? supRes.text.trim() : null,
      failedCheck: 'hallucination',
    };
  }

  // 2. Scope check (1 AI call to Supervisor)
  const scope = await scopeCheck(code, originalPrompt, supervisorAI, caller);
  if (!scope.onScope) {
    logFallback(`[SUPERVISOR] Scope drift: ${scope.reason}`);
    // Attempt Worker correction
    const fixPrompt = `Your previous code was off-scope. Issue: ${scope.reason}\n\nRe-read the original task and fix:\n"${originalPrompt.slice(0, 400)}"\n\nReturn ONLY the corrected code, no explanation.\n\n\`\`\`\n${code}\n\`\`\``;
    const workerFix = await caller(workerAI, fixPrompt).catch(() => ({ text: '', success: false as const }));
    const workerFixFailed = !workerFix.success || isQuotaError(workerFix) || !workerFix.text.trim();
    if (!workerFixFailed) {
      return { passed: false, issues: [scope.reason], correctedCode: workerFix.text.trim(), failedCheck: 'scope' };
    }
    // Worker failed or quota error — Supervisor does it
    const fallbackReason = isQuotaError(workerFix) ? 'Worker 429/quota' : 'Worker failed';
    logFallback(`[SUPERVISOR FALLBACK] ${fallbackReason} on scope correction — Supervisor taking over`);
    const supRes = await caller(supervisorAI, filePrompt).catch(() => ({ text: '', success: false as const }));
    return {
      passed: false, issues: [scope.reason],
      correctedCode: supRes.success && supRes.text.trim() ? supRes.text.trim() : null,
      failedCheck: 'scope',
    };
  }

  return { passed: true, issues: [], correctedCode: null, failedCheck: 'none' };
}
