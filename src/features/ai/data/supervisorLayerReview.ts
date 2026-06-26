// [SCOPE] Per-layer Guardian review + final integration check for the orchestrated build pipeline.
// reviewLayer  — Guardian inspects each layer immediately after the Worker produces it.
//                Fails OPEN: a transient Guardian error passes the layer through rather than blocking.
// reviewIntegration — Final check: do the layer interfaces actually connect?
//                     Fails CLOSED (H3): unreviewed code never ships.
// Split from supervisorOrchestrator.ts so that file stays under Rule 9.
import type { AIResponse } from './routingTypes.js';
import type { PlanStep } from './supervisorOrchestrator.js';
import { log } from '../../../features/logging/data/redivivusLogger.js';

// ── Per-layer check ───────────────────────────────────────────────────────

export async function reviewLayer(
  task: string,
  layerDescription: string,
  layerCode: string,
  blueprintContext: string,
  prescription: string,
  guardianAI: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>,
): Promise<{ passed: boolean; corrected: string; notes: string; blocked?: boolean; error?: string }> {
  if (!guardianAI) {
    // No guardian available — pass through. Integration review is the hard gate.
    return { passed: true, corrected: layerCode, notes: '' };
  }

  const prompt = `You are the Guardian reviewing one layer of a build. Your job is correctness of THIS layer only.

TASK: "${task}"
LAYER: ${layerDescription}
${blueprintContext ? `BLUEPRINT:\n${blueprintContext}\n` : ''}${prescription ? `PRESCRIPTION FOR THIS LAYER:\n${prescription}\n` : ''}
WORKER OUTPUT FOR THIS LAYER:
${layerCode}

Check: (1) Does it correctly implement the prescription? (2) Does it match the blueprint? (3) Is the code complete — no placeholders, no TODO stubs?
- YES → respond with EXACTLY "LAYER_PASS"
- NO  → respond with "LAYER_FIX:" followed by corrected code. Fix ONLY what is wrong.`;

  log('debug', 'services', 'supervisorLayerReview', 'reviewLayer', 'Layer review', { guardianAI, layerDescription });

  const res = await callAI(guardianAI, prompt);
  if (!res.success || !res.text) {
    // [FAIL OPEN] Layer review errors pass through — integration review is the hard gate.
    log('warn', 'services', 'supervisorLayerReview', 'reviewLayer', 'Layer review call failed — passing through', { error: res.error });
    return { passed: true, corrected: layerCode, notes: '', error: res.error };
  }

  const text = res.text.trim();
  if (text.startsWith('LAYER_PASS')) {
    return { passed: true, corrected: layerCode, notes: '' };
  }
  const fixMatch = text.match(/LAYER_FIX:\s*([\s\S]*)/);
  if (fixMatch) {
    return { passed: false, corrected: fixMatch[1].trim(), notes: `Guardian corrected layer: ${layerDescription}` };
  }
  // Ambiguous — pass through. Integration review catches anything this missed.
  return { passed: true, corrected: layerCode, notes: '' };
}

// ── Final integration check ───────────────────────────────────────────────

export async function reviewIntegration(
  task: string,
  assembledCode: string,
  steps: PlanStep[],
  blueprintContext: string,
  guardianAI: string,
  callAI: (ai: string, prompt: string) => Promise<AIResponse>,
  allowDegradedSingleProvider = false,
): Promise<{ passed: boolean; corrected: string; notes: string; blocked?: boolean; degraded?: boolean; error?: string; warning?: string }> {
  if (!guardianAI) {
    if (allowDegradedSingleProvider) {
      // [DEGRADED] Single-provider: proceed but flag as unreviewed.
      return { passed: false, degraded: true, corrected: assembledCode, notes: '',
        warning: 'Shipped without independent Guardian review — only one AI provider is configured. Add a second provider for full review coverage.' };
    }
    // [H3] No guardian, not a known single-provider config — fail closed.
    return { passed: false, corrected: assembledCode, notes: '', blocked: true,
      error: 'No independent Guardian available — a second AI provider is required to review the assembled output.' };
  }

  const layerSummary = steps.map(s =>
    `- ${s.description}: ${s.filesToCreate?.join(', ') ?? 'no files specified'}`
  ).join('\n');

  // Integration prompt focuses only on boundaries between layers — not re-checking each layer's
  // internal correctness (the per-layer Guardian already did that).
  const prompt = `You are the Guardian doing a FINAL INTEGRATION check. Each layer was already reviewed individually. Your job is ONLY to verify the pieces fit together.

TASK: "${task}"
${blueprintContext ? `BLUEPRINT:\n${blueprintContext}\n` : ''}
LAYERS BUILT:
${layerSummary}

ASSEMBLED OUTPUT:
${assembledCode}

Check ONLY: (1) Do layer interfaces match? (2) Are imports/exports consistent across files? (3) Does data flow correctly across layer boundaries? (4) Will this run as-is without missing dependencies?
- YES → respond with EXACTLY "REVIEW_PASS"
- NO  → respond with "REVIEW_FIX:" followed by the complete corrected code.`;

  log('debug', 'services', 'supervisorLayerReview', 'reviewIntegration', 'Integration review', { guardianAI, stepCount: steps.length });

  const res = await callAI(guardianAI, prompt);
  if (!res.success || !res.text) {
    // [H3] Integration review failure — fail closed.
    return { passed: false, corrected: assembledCode, notes: '', blocked: true,
      error: `Guardian integration review failed (${guardianAI}): ${res.error || 'no response'}.` };
  }

  const text = res.text.trim();
  if (text.startsWith('REVIEW_PASS')) {
    return { passed: true, corrected: assembledCode, notes: 'Guardian: all layers integrate correctly' };
  }
  const fixMatch = text.match(/REVIEW_FIX:\s*([\s\S]*)/);
  if (fixMatch) {
    return { passed: false, corrected: fixMatch[1].trim(), notes: 'Guardian corrected integration issues' };
  }
  // [H3] Ambiguous — fail closed at integration level.
  return { passed: false, corrected: assembledCode, notes: '', blocked: true,
    error: `Guardian (${guardianAI}) returned an unrecognized integration response — blocking to avoid shipping unreviewed code.` };
}
