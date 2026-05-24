// [SCOPE] CHASSIS Build Pipeline — Code Review (Guardian & Static Validation)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import type { BuildContext } from './chatPanelBuild';
import { LearnedMemoryService } from '../../services/learnedMemoryService';
import { extractCodeFromResponse } from './chatPanelBuildInference';

export interface GuardianReviewResult {
  code: string;
  qualityScore: number;
}

export async function runGuardianReview(ctx: BuildContext, code: string, relPath: string, supervisorSpec: string | null): Promise<GuardianReviewResult> {
  const { routing, blueprintContext, root, task } = ctx;
  try {
    const guardianContext = supervisorSpec ? `${blueprintContext}\n\nSPEC:\n${supervisorSpec}` : blueprintContext;
    const review = await routing.guardianReview(task, code, 'worker', guardianContext);

    // [FIX] Compute quality score based on review signals
    let positiveSignals = 0;
    if (review?.passed) {positiveSignals += 2;}              // Passed review: +2
    if (code.split('\n').length > 50) {positiveSignals += 1;} // Substantial code: +1
    if (!/TODO|FIXME|XXX/i.test(code)) {positiveSignals += 1;} // No TODO comments: +1
    if (supervisorSpec && review?.passed) {positiveSignals += 1;} // Supervisor + worker both ran: +1
    const qualityScore = Math.min(5, positiveSignals);

    // [FIX] Guard: correctedText starting with prose means Guardian failed to parse the code — don't write it to disk.
    const correctedLooksLikeCode = review?.correctedText && !review.correctedText.trimStart().startsWith('Since the worker') && !review.correctedText.trimStart().startsWith('GUARDIAN_PASS cannot');
    if (review && !review.passed && review.correctedText && correctedLooksLikeCode) {
      const learned = new LearnedMemoryService(root);
      review.issues.forEach(issue => learned.addNeverDo(issue, relPath.split('.').pop() || 'code'));
      return { code: extractCodeFromResponse(review.correctedText), qualityScore };
    }
    return { code, qualityScore };
  } catch {
    // Return original code with default quality score on error
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
        return extractCodeFromResponse(res.text);
      }
    }
  } catch {}
  return code;
}
