// [SCOPE] Client-side AI execution helpers for the cloud build pipeline.
// Extracted from cloudBuildClient.ts (Rule 9 split).

import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { streamProvider } from '../ai/streamingProviders.js';

const MAX_CONTINUATIONS = 3;

/** Continuation prompt — appended to a new request when the previous response was cut off. */
function makeContinuationPrompt(tail: string): string {
  return `The previous response was cut off by the token limit. Continue EXACTLY from where it ended — do NOT repeat, summarize, or restate any previous content. Resume the code immediately after this point:\n...${tail}`;
}

export async function executeClientAI(
  routing: any,
  prompt: string,
  keys: Record<string, string>,
  onChunk?: (chunk: string) => void,
): Promise<{ success: boolean; text: string; model: string; error?: string; inputTokens?: number; outputTokens?: number }> {
  // Streaming path — supports auto-continuation when the AI hits its output token limit
  if (onChunk) {
    let fullText = '';
    let usedModel = '';
    let currentProvider = routing.selectedProvider;
    let currentPrompt = prompt;

    for (let pass = 0; pass <= MAX_CONTINUATIONS; pass++) {
      const res = await streamProvider(currentProvider, currentPrompt, onChunk, 300_000, routing.systemMessage);

      if (!res.success) {
        if (pass > 0) { break; } // continuation failed — use what we have
        // First attempt failed — try fallbacks
        let recovered = false;
        for (const fb of (routing.fallbackProviders ?? [])) {
          if (!keys[fb]) { continue; }
          const fbRes = await streamProvider(fb, prompt, onChunk, 300_000, routing.systemMessage);
          if (fbRes.success) {
            fullText += fbRes.text;
            usedModel = fbRes.model;
            currentProvider = fb;
            if (!fbRes.truncated) { return { success: true, text: fullText, model: usedModel }; }
            recovered = true;
            break;
          }
        }
        if (!recovered) { return { success: false, text: '', model: '', error: 'All streaming providers failed' }; }
      } else {
        fullText += res.text;
        usedModel = res.model;
        if (!res.truncated) { break; } // clean finish — done
      }

      if (pass < MAX_CONTINUATIONS) {
        currentPrompt = makeContinuationPrompt(fullText.slice(-400));
      }
    }

    return usedModel ? { success: true, text: fullText, model: usedModel } : { success: false, text: '', model: '', error: 'All streaming providers failed' };
  }

  // Non-streaming fallback (no onChunk caller). Used by the Supervisor phase — we propagate
  // inputTokens/outputTokens so the Supervisor's usage can be tracked and attributed (it was
  // previously dropped here, which is why the Supervisor always showed 0 tokens in the dashboard).
  const fetchFn = createFetchWithTimeout();
  try {
    const response = await callProvider(routing.selectedProvider, prompt, fetchFn, (routing as any).tier, undefined, undefined, routing.systemMessage);
    return { success: true, text: response.text, model: response.model || routing.model, inputTokens: (response as any).inputTokens, outputTokens: (response as any).outputTokens };
  } catch (error: any) {
    for (const fallbackProvider of routing.fallbackProviders) {
      if (!keys[fallbackProvider]) { continue; }
      try {
        const response = await callProvider(fallbackProvider, prompt, fetchFn, (routing as any).tier, undefined, undefined, routing.systemMessage);
        return { success: true, text: response.text, model: response.model || fallbackProvider, inputTokens: (response as any).inputTokens, outputTokens: (response as any).outputTokens };
      } catch { continue; }
    }
    return { success: false, text: '', model: '', error: error?.message || 'All AI providers failed' };
  }
}

// [SCOPE] Supervisor outcome — captures whether the Supervisor (pro-tier, e.g. Claude) actually ran,
// which model/provider it used, and its token spend, so every layer (usage tracker, byline, history)
// can attribute the build truthfully instead of hardcoding "solo".
export interface SupervisorOutcome {
  ran: boolean;
  provider?: string;
  model?: string;        // exact model ID (for pricing/normalization), e.g. 'claude-sonnet-4-6'
  inputTokens?: number;
  outputTokens?: number;
  error?: string;        // set when a Supervisor was selected but its call failed -> worker built solo
}

// [WARN] Two-phase execution: Supervisor writes the prescription, Worker builds from it.
// If no Supervisor is selected (single provider) or the Supervisor call fails, the Worker builds solo —
// but we now record WHY (supervisor.error) instead of silently swallowing it.
export async function runTwoPhaseBuild(
  instructions: { supervisorInstructions: any | null; workerInstructions: any },
  keys: Record<string, string>,
  onProgress?: (msg: string) => void,
  onChunk?: (chunk: string) => void,
): Promise<{ aiResponse: Awaited<ReturnType<typeof executeClientAI>>; supervisor: SupervisorOutcome }> {
  let workerPrompt = instructions.workerInstructions.promptTemplate;
  const supervisor: SupervisorOutcome = { ran: false };

  if (instructions.supervisorInstructions) {
    const si = instructions.supervisorInstructions;
    onProgress?.('Supervisor planning your build...');
    const supRouting = {
      selectedProvider: si.selectedProvider, fallbackProviders: [] as string[],
      systemMessage: si.systemMessage, model: si.model, maxTokens: si.maxTokens,
      temperature: 0.3, tier: 'pro' as const,
    };
    const supRes = await executeClientAI(supRouting, si.prompt, keys);
    console.log(`[Redivivus] Supervisor: provider=${si.selectedProvider} model=${si.model} success=${supRes.success} textLen=${supRes.text?.length ?? 0} error=${supRes.error ?? 'none'}`);
    // [trace] Mirror to the debug log so one `tail -f ~/redivivus_debug.log` captures the full build path.
    try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] supervisor nominal=${si.model} actualRan=${supRes.model} provider=${si.selectedProvider} success=${supRes.success} in=${supRes.inputTokens ?? '?'} out=${supRes.outputTokens ?? '?'} err=${supRes.error ?? 'none'}\n`); } catch {}
    if (supRes.success && supRes.text.trim().length > 50) {
      // [SCOPE] Adaptive Orchestration — parse Supervisor's complexity assessment
      const complexityMatch = supRes.text.match(/\[COMPLEXITY:\s*(HIGH|STANDARD)\]/i);
      const isHighComplexity = complexityMatch?.[1]?.toUpperCase() === 'HIGH';

      // Strip the complexity tag from the prescription before injecting into the Worker prompt
      const cleanedPrescription = supRes.text.trim().replace(/\[COMPLEXITY:\s*(?:HIGH|STANDARD)\]\s*/gi, '').trim();

      workerPrompt = workerPrompt.replace('{{PRESCRIPTION}}', cleanedPrescription);
      supervisor.ran = true;
      supervisor.provider = si.selectedProvider;
      // [FIX] Record the model the provider ACTUALLY ran (supRes.model), not the nominal si.model.
      // claudeProvider selects its model from `tier` (here 'pro' -> claude-sonnet-4-6) and ignores
      // si.model, so si.model was often 'claude-opus-4-8' while the real call was Sonnet. That made the
      // byline lie ("Opus 4.8") AND over-reported cost ~5x (Sonnet tokens priced at Opus $15/$75 rates).
      supervisor.model = supRes.model || si.model;
      supervisor.inputTokens = supRes.inputTokens;
      supervisor.outputTokens = supRes.outputTokens;

      // [WARN] Adaptive Worker Upgrade — if Supervisor flags HIGH complexity, promote the Worker
      // to the Supervisor's provider and pro-tier model to prevent hallucinations on complex builds.
      if (isHighComplexity && si.selectedProvider !== instructions.workerInstructions.selectedProvider) {
        console.log(`[Redivivus] HIGH complexity detected — upgrading Worker from ${instructions.workerInstructions.selectedProvider}/${instructions.workerInstructions.model} to ${si.selectedProvider}/${si.model}`);
        instructions.workerInstructions.selectedProvider = si.selectedProvider;
        instructions.workerInstructions.model = si.model;
        onProgress?.('High complexity detected — upgrading Worker AI...');
      } else {
        onProgress?.(`${instructions.workerInstructions.selectedProvider} building from plan...`);
      }
    } else {
      // Supervisor failed — strip the placeholder and let the worker build solo, but keep the reason.
      supervisor.error = supRes.error || 'Supervisor returned an empty or too-short prescription';
      console.warn(`[Redivivus] Supervisor failed, worker running solo. Error: ${supervisor.error}`);
      workerPrompt = workerPrompt.replace('\nSUPERVISOR PRESCRIPTION — implement this exactly, do not deviate:\n{{PRESCRIPTION}}\n\n', '\n');
      onProgress?.('Building your project...');
    }
  }

  const aiResponse = await executeClientAI(instructions.workerInstructions, workerPrompt, keys, onChunk);
  // [trace] Worker provider/model + actual model that ran + token spend.
  try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] worker nominal=${instructions.workerInstructions.selectedProvider}/${instructions.workerInstructions.model} actualRan=${aiResponse.model} success=${aiResponse.success} in=${aiResponse.inputTokens ?? '?'} out=${aiResponse.outputTokens ?? '?'} err=${aiResponse.error ?? 'none'}\n`); } catch {}
  return { aiResponse, supervisor };
}

// [WARN] AbortController.abort() does not abort res.json() in Electron's fetch — use Promise.race for full-call timeouts.
// This helper only aborts the initial fetch (connection + headers), not body reads.
export function createFetchWithTimeout() {
  return async (url: string, options: RequestInit, timeoutMs?: number) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs || 240000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) { clearTimeout(id); throw e; }
  };
}
