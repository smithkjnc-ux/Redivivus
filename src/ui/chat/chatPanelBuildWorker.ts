// [SCOPE] CHASSIS Build Pipeline — Worker AI execution and prompt assembly
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import { BuildContext } from './chatPanelBuild.js';
import { tracer } from '../../services/pipelineTracer.js';
import { CHASSIS_WORKER_RULES } from '../../services/ai/chassisWorkerRules.js';

// AI display names for user messages
const AI_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  openai: 'GPT-4o',
  groq: 'Groq',
  xai: 'Grok',
  kimi: 'Kimi'
};

export async function executeWorkerBuild(ctx: BuildContext, prompt: string): Promise<{ success: boolean; text: string; error?: string; routedTo?: string }> {
  try {
    // First attempt with primary AI
    let res = await ctx.routing.routeByComplexity(ctx.task, prompt);
    
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
    
    return res;
  } catch (err) {
    return { success: false, text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildWorkerPrompt(ctx: BuildContext, relPath: string, isModifying: boolean, existingContent: string, supervisorSpec: string | null, vaultSummary: string): string {
  const { task, blueprintContext } = ctx;
  const isHtml = relPath.endsWith('.html');
  const role = supervisorSpec ? 'CHASSIS Worker AI. Implementation only.' : 'CHASSIS AI. Generate complete code.';
  
  const rules = isHtml
    ? '- COMPLETE, self-contained HTML file. CSS/JS inline. No external files. No modules.\n- Must open via double-click on file://.'
    : '- [SCOPE] comment at top.\n- // NARRATOR: comment on first line describing the file.\n- Use EVERY input variable in the actual computation — if you parse or declare it, it MUST appear in the formula or logic, not just in a comment or unused variable.\n- CLI tools: every command-line argument that is parsed MUST affect the output. If args include distance, pay, and fuelCost, all three must participate in the calculation.';

  const modRules = isModifying 
    ? '- SURGICAL EDIT. Output COMPLETE file including all existing code plus your changes.\n- DO NOT OMIT ANYTHING.'
    : '- Creating NEW file.';

  return `${role}\n\nTASK: ${task}\nSPEC: ${supervisorSpec || 'None'}\nFILE: ${relPath}\n\nCONTEXT:\n${blueprintContext}\n\nVAULT:\n${vaultSummary}\n\n${isModifying ? 'EXISTING CONTENT:\\n' + existingContent : ''}\n\nRULES:\n${rules}\n${modRules}\n\n${CHASSIS_WORKER_RULES}\n\nReturn ONLY the code.`;
}
