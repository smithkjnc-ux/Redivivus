// [SCOPE] CHASSIS Build Pipeline — Code Review (Guardian & Static Validation)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import { BuildContext } from './chatPanelBuild.js';
import { LearnedMemoryService } from '../../services/learnedMemoryService.js';

export async function runGuardianReview(ctx: BuildContext, code: string, relPath: string, supervisorSpec: string | null): Promise<string> {
  const { routing, blueprintContext, root, task } = ctx;
  try {
    const guardianContext = supervisorSpec ? `${blueprintContext}\n\nSPEC:\n${supervisorSpec}` : blueprintContext;
    const review = await routing.guardianReview(task, code, 'worker', guardianContext);
    if (review && !review.passed && review.correctedText) {
      const learned = new LearnedMemoryService(root);
      review.issues.forEach(issue => learned.addNeverDo(issue, relPath.split('.').pop() || 'code'));
      return review.correctedText;
    }
  } catch {}
  return code;
}

export async function runStaticValidation(code: string, relPath: string): Promise<string> {
  try {
    const { validateCode } = await import('../../services/code/codeValidator.js');
    const res = validateCode(code, relPath.split('.').pop() || '');
    if (res.autoFixed) return res.code;
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
        return res.text.replace(/^```[a-zA-Z]*\\n?/m, '').replace(/\\n?```$/m, '').trim();
      }
    }
  } catch {}
  return code;
}
