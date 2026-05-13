// [SCOPE] CHASSIS Build Pipeline — Worker AI execution and prompt assembly
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import { BuildContext } from './chatPanelBuild.js';

export async function executeWorkerBuild(ctx: BuildContext, prompt: string): Promise<{ success: boolean; text: string; error?: string; routedTo?: string }> {
  try {
    const res = await ctx.routing.routeByComplexity(ctx.task, prompt);
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
    : '- [SCOPE] comment at top.\n- // NARRATOR: comment on first line describing the file.';

  const modRules = isModifying 
    ? '- SURGICAL EDIT. Output COMPLETE file including all existing code plus your changes.\n- DO NOT OMIT ANYTHING.'
    : '- Creating NEW file.';

  return `${role}\n\nTASK: ${task}\nSPEC: ${supervisorSpec || 'None'}\nFILE: ${relPath}\n\nCONTEXT:\n${blueprintContext}\n\nVAULT:\n${vaultSummary}\n\n${isModifying ? 'EXISTING CONTENT:\\n' + existingContent : ''}\n\nRULES:\n${rules}\n${modRules}\n\nReturn ONLY the code.`;
}
