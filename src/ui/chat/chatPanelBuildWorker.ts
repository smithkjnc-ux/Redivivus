// [SCOPE] CHASSIS Build Pipeline — Worker AI execution and prompt assembly
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import { BuildContext } from './chatPanelBuild.js';
import { tracer } from '../../services/pipelineTracer.js';
import { CHASSIS_WORKER_RULES } from '../../services/ai/chassisWorkerRules.js';
import { streamProvider } from '../../services/ai/streamingProviders.js';

// AI display names for user messages
const AI_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'GPT-4o',
  groq: 'Groq',
  xai: 'Grok',
  kimi: 'Kimi'
};

export async function executeWorkerBuild(ctx: BuildContext, prompt: string, onChunk?: (chunk: string) => void): Promise<{ success: boolean; text: string; error?: string; routedTo?: string; inputTokens?: number; outputTokens?: number; streamed?: boolean }> {
  // Try real streaming first when the caller wants live chunks
  if (onChunk) {
    const { worker } = ctx.routing.selectSupervisorAndWorker();
    const ai = worker || ctx.routing.getAvailableAI().ai;
    const streamRes = await streamProvider(ai, prompt, onChunk, 300_000);
    if (streamRes.success && streamRes.text) {
      return { success: true, text: streamRes.text, routedTo: ai, streamed: true };
    }
    // Streaming failed — fall through to non-streaming with a single onChunk call at the end
  }

  try {
    // Non-streaming path (also the fallback when streaming fails)
    let res = await ctx.routing.routeByComplexity(ctx.task, prompt);
    if (onChunk && res.success && res.text) { onChunk(res.text); }

    // If failed due to timeout, try fallback AIs with user notification
    if (!res.success && res.error?.toLowerCase().includes('time')) {
      const routing = ctx.routing as any;
      const keyMap: Record<string, () => string | null> = routing.getKeyMap ? routing.getKeyMap() : {};
      const availableAIs = Object.entries(keyMap)
        .filter(([_, getKey]) => typeof getKey === 'function' && getKey())
        .map(([ai]) => ai);

      const failedAI = res.routedTo || 'primary AI';

      for (const fallbackAI of availableAIs) {
        if (fallbackAI === failedAI) continue;

        tracer.failover(failedAI, fallbackAI, 'timed out');
        // Notify user of failover
        ctx.conversation.push({
          role: 'assistant',
          content: `⏱️ ${AI_LABELS[failedAI] || failedAI} timed out — retrying with ${AI_LABELS[fallbackAI] || fallbackAI}...`,
          timestamp: Date.now()
        });
        ctx.refresh();

        // Try fallback
        const { callProvider } = await import('../../services/ai/routingProviders.js');
        const f = (url: string, opts: RequestInit) => routing.fetchWithTimeout(url, opts, 120_000);
        const fallbackRes = await callProvider(fallbackAI, prompt, f);

        if (fallbackRes.success) {
          return { ...fallbackRes, routedTo: fallbackAI };
        }
      }
    }

    return { ...res, inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  } catch (err) {
    return { success: false, text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildWorkerPrompt(ctx: BuildContext, relPath: string, isModifying: boolean, existingContent: string, supervisorSpec: string | null, vaultSummary: string, sourceRef?: string): string {
  const { task, blueprintContext } = ctx;
  const isHtml = relPath.endsWith('.html');
  const role = supervisorSpec ? 'CHASSIS Worker AI. Implementation only.' : 'CHASSIS AI. Generate complete code.';
  
  const rules = isHtml
    ? '- COMPLETE, self-contained HTML file. CSS/JS inline. No external files. No modules.\n- Must open via double-click on file://.'
    : '- [SCOPE] comment at top.\n- // NARRATOR: comment on first line describing the file.\n- Use EVERY input variable in the actual computation — if you parse or declare it, it MUST appear in the formula or logic, not just in a comment or unused variable.\n- CLI tools: every command-line argument that is parsed MUST affect the output. If args include distance, pay, and fuelCost, all three must participate in the calculation.';

  const modRules = isModifying 
    ? `- SURGICAL EDIT MODE. Output ONLY the changes using this exact format:
<<<SEARCH
[exact existing code to find -- copy verbatim, include 2-3 lines of context for uniqueness]
===
[replacement code]
REPLACE>>>
- Multiple edits: repeat the <<<SEARCH...REPLACE>>> block for each change.
- The SEARCH block must match the existing file EXACTLY (same indentation, whitespace).
- Do NOT output the entire file. Only show the parts that change.`
    : '- Creating NEW file.';

  const vaultBlock = vaultSummary
    ? `VAULT CODE (already written and tested — strict rules apply):\n- If a vault item solves part of the task: COPY IT into your output as-is. Mark it with // [FROM VAULT: name].\n- DO NOT rewrite or duplicate vault code. Do not create a parallel version.\n- Only write NEW code for parts NOT covered by vault items.\n${vaultSummary}`
    : '';
  const chassisRules = ctx.assistMode ? '' : `\n\n${CHASSIS_WORKER_RULES}`;
  const ext = relPath.split('.').pop()?.toUpperCase() || 'code';
  const sourceBlock = sourceRef ? `\nSOURCE REFERENCE (existing implementation in a different language -- use this as a guide for game logic, physics, and behavior, but rewrite as native ${ext}):\n${sourceRef}` : '';
  return `${role}\n\nTASK: ${task}\nSPEC: ${supervisorSpec || 'None'}\nFILE: ${relPath}\n\nCONTEXT:\n${blueprintContext}\n\n${vaultBlock}\n${isModifying ? 'EXISTING CONTENT:\n' + existingContent : ''}${sourceBlock}\n\nRULES:\n${rules}\n${modRules}${chassisRules}\n\nReturn ONLY the code.`;
}
