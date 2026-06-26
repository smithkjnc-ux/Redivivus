// [SCOPE] Redivivus Build Pipeline — Worker AI execution and prompt assembly
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import type { BuildContext } from './chatPanelBuild.js';
import { tracer } from '../../project/application/pipelineTracer.js';
import { Redivivus_WORKER_RULES } from '../../../shared/ai/infrastructure/redivivusWorkerRules.js';
import { streamProvider } from '../../../shared/ai/infrastructure/streamingProviders.js';
import { scanProjectExports, formatExportsForPrompt } from '../../workspace/domain/code/projectExportScanner.js';

// AI display names for user messages
const AI_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'GPT-4o',
  groq: 'Groq',
  xai: 'Grok',
  kimi: 'Kimi',
  deepseek: 'DeepSeek'
};

export async function executeWorkerBuild(ctx: BuildContext, prompt: string, onChunk?: (chunk: string) => void, tier: 'flash' | 'pro' | 'ultra' = 'flash'): Promise<{ success: boolean; text: string; error?: string; routedTo?: string; inputTokens?: number; outputTokens?: number; streamed?: boolean }> {
  // Try real streaming first when the caller wants live chunks
  if (onChunk) {
    const { worker } = ctx.routing.selectSupervisorAndWorker();
    const ai = worker || ctx.routing.getAvailableAI().ai;
    const streamRes = await streamProvider(ai, prompt, onChunk, 300_000, undefined, tier);
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
        if (fallbackAI === failedAI) {continue;}

        tracer.failover(failedAI, fallbackAI, 'timed out');
        // Notify user of failover
        ctx.conversation.push({
          role: 'assistant',
          content: `⏱️ ${AI_LABELS[failedAI] || failedAI} timed out — retrying with ${AI_LABELS[fallbackAI] || fallbackAI}...`,
          timestamp: Date.now()
        });
        ctx.refresh();

        // Try fallback
        const { callProvider } = await import('../../../shared/ai/domain/providers/providerFactory.js');
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

export function buildWorkerPrompt(ctx: BuildContext, relPath: string, isModifying: boolean, existingContent: string, supervisorSpec: string | null, vaultSummary: string, sourceRef?: string, similarCode?: string): string {
  const { blueprintContext, root } = ctx;
  // Extract visual contract from task string and surface it as a labeled block
  const vcMatch = ctx.task.match(/\n\nVISUAL CONTRACT \(locked[^)]*\):[^\n]*(?:\n[^\n]+)*/);
  const vcBlock = vcMatch ? `\n${vcMatch[0].trimStart()}\n` : '';
  const task = vcMatch ? ctx.task.replace(vcMatch[0], '').trim() : ctx.task;
  const isHtml = relPath.endsWith('.html');
  const role = supervisorSpec ? 'Redivivus Worker AI. Implementation only.' : 'Redivivus AI. Generate complete code.';
  
  const rules = isHtml
    ? '- COMPLETE, self-contained HTML file. CSS/JS inline. No external files. No modules.\n- Must open via double-click on file://.'
    : '- [SCOPE] comment at top.\n- // NARRATOR: comment on first line describing the file.\n- Use EVERY input variable in the actual computation — if you parse or declare it, it MUST appear in the formula or logic, not just in a comment or unused variable.\n- CLI tools: every command-line argument that is parsed MUST affect the output. If args include distance, pay, and fuelCost, all three must participate in the calculation.';

  // [FIX] HTML files: always full rewrite. HTML with inline JS is self-contained — surgical SEARCH blocks
  // require exact whitespace reproduction which LLMs do unreliably on large files.
  const modRules = (isModifying && !isHtml)
    ? `- SURGICAL EDIT MODE. Output ONLY the changes using this exact format:
<<<SEARCH
[exact existing code to find -- copy verbatim, include 2-3 lines of context for uniqueness]
===
[replacement code]
REPLACE>>>
- Multiple edits: repeat the <<<SEARCH...REPLACE>>> block for each change.
- The SEARCH block must match the existing file EXACTLY (same indentation, whitespace).
- Do NOT output the entire file. Only show the parts that change.`
    : '- Output the COMPLETE file.';

  const vaultBlock = vaultSummary
    ? `VAULT CODE (already written and tested — strict rules apply):\n- If a vault item solves part of the task: COPY IT into your output as-is. Mark it with // [FROM VAULT: name].\n- DO NOT rewrite or duplicate vault code. Do not create a parallel version.\n- Only write NEW code for parts NOT covered by vault items.\n${vaultSummary}`
    : '';
  const redivivusRules = ctx.assistMode ? '' : `\n\n${Redivivus_WORKER_RULES}`;
  const ext = relPath.split('.').pop()?.toUpperCase() || 'code';
  const sourceBlock = sourceRef ? `\nSOURCE REFERENCE (existing implementation in a different language -- use this as a guide for game logic, physics, and behavior, but rewrite as native ${ext}):\n${sourceRef}` : '';
  // [DONE] Rule 18 complement — static scan (not AI) tells Worker what already exists so it imports real names
  const exportsBlock = root ? formatExportsForPrompt(scanProjectExports(root, relPath)) : '';
  const similarBlock = similarCode ? `\n\n${similarCode}` : '';
  return `${role}\n\nTASK: ${task}\nSPEC: ${supervisorSpec || 'None'}\nFILE: ${relPath}${vcBlock}\n\nCONTEXT:\n${blueprintContext}\n\n${exportsBlock ? exportsBlock + '\n\n' : ''}${vaultBlock}${similarBlock}\n${isModifying ? 'EXISTING CONTENT:\n' + existingContent : ''}${sourceBlock}\n\nRULES:\n${rules}\n${modRules}${redivivusRules}\n\nReturn ONLY the code.`;
}
