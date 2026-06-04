// [SCOPE] Redivivus Build Pipeline — Code Review (Guardian & Static Validation)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import type { BuildContext } from './chatPanelBuild';
import { LearnedMemoryService } from '../../services/learnedMemoryService';

export interface GuardianReviewResult {
  code: string;
  qualityScore: number;
}

export async function runGuardianReview(ctx: BuildContext, code: string, relPath: string, supervisorSpec: string | null): Promise<GuardianReviewResult> {
  const { blueprintContext, root, task, routing } = ctx;
  try {
    // [RULE 18] Inject task-relevant NeverDo entries so Guardian checks project-specific gotchas
    const neverDo = await new LearnedMemoryService(root).getNeverDoForTask(task, routing);
    const baseContext = supervisorSpec ? `${blueprintContext}\n\nSPEC:\n${supervisorSpec}` : blueprintContext;
    const guardianContext = neverDo ? `${baseContext}\n${neverDo}` : baseContext;

    // Stage 6: retry loop with user escalation (replaces one-shot correction)
    const { runGuardianWithRetry } = await import('../../services/ai/guardianRetryHandler.js');
    const result = await runGuardianWithRetry(ctx, code, relPath, supervisorSpec, guardianContext);

    // Persist final issues as NeverDo entries AND send to backend for collective learning
    if (result.finalIssues.length > 0) {
      const learned = new LearnedMemoryService(root);
      const ext = relPath.split('.').pop() || 'code';
      const { logGotcha } = await import('../../services/api/apiClient.js');
      result.finalIssues.forEach(issue => {
        learned.addNeverDo(issue, ext);
        logGotcha({ pattern: issue.slice(0, 200), issueText: issue, buildContext: ext, taskSummary: task.slice(0, 200) });
      });
    }

    return { code: result.code, qualityScore: result.qualityScore };
  } catch {
    return { code, qualityScore: 3 };
  }
}

export async function runStaticValidation(code: string, relPath: string): Promise<string> {
  try {
    const { validateCode } = await import('../../services/code/codeValidator.js');
    const res = validateCode(code, relPath.split('.').pop() || '');
    if (res.autoFixed) {return res.code;}
  } catch {}
  return code;
}

export async function runImportValidation(ctx: BuildContext, code: string, absPath: string, root: string): Promise<string> {
  try {
    const { validateImports, buildImportRepairPrompt } = await import('../../services/ai/importValidator.js');
    const check = validateImports(code, absPath, root);
    if (!check.valid) {
      const repairPrompt = buildImportRepairPrompt(ctx.task, code, check, absPath);
      const res = await ctx.routing.routeByComplexity(ctx.task, repairPrompt);
      if (res.success && res.text) {
        const { extractCodeFromResponse } = await import('./chatPanelBuildInference.js');
        return extractCodeFromResponse(res.text);
      }
    }
  } catch {}
  return code;
}
