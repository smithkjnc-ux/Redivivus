// [SCOPE] Redivivus Build Pipeline — Code Review (Guardian & Static Validation)
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import type { BuildContext } from './chatPanelBuild.js';
import { LearnedMemoryService } from '../chat/logic/learnedMemoryService.js';

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
    const { runGuardianWithRetry } = await import('../../features/ai/data/guardianRetryHandler.js');
    const result = await runGuardianWithRetry(ctx, code, relPath, supervisorSpec, guardianContext);

    // Persist final issues as NeverDo entries AND send to backend for collective learning
    if (result.finalIssues.length > 0) {
      const learned = new LearnedMemoryService(root);
      const ext = relPath.split('.').pop() || 'code';
      const { logGotcha } = await import('../../features/api/data/apiClientTelemetry.js');
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

export async function runStaticCompilationGate(code: string, absPath: string, root: string, isMod: boolean): Promise<string | null> {
  // Only run for JS/TS files
  if (!['.ts', '.tsx', '.js', '.jsx'].some(e => absPath.endsWith(e))) { return null; }
  
  const fs = await import('fs');
  const path = await import('path');
  const { runCompileCheck } = await import('./services/compileRunner.js');
  
  let originalContent: string | null = null;
  const fileExists = fs.existsSync(absPath);
  
  if (fileExists) {
    try { originalContent = fs.readFileSync(absPath, 'utf8'); } catch {}
  }
  
  try {
    // Write the new code to disk temporarily
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(absPath, code, 'utf8');
    
    // Run the deterministic compile check
    const result = runCompileCheck(root);
    
    // If it fails, extract the relevant error
    if (!result.success) {
      // Find the specific error for this file to avoid massive error dumps
      const relPath = path.relative(root, absPath);
      const lines = result.output.split('\n');
      const fileErrors = lines.filter(l => l.includes(relPath));
      if (fileErrors.length > 0) {
        return `Compilation error in ${relPath}:\n${fileErrors.join('\n').slice(0, 500)}`;
      }
      return `Compilation error:\n${result.output.slice(0, 500)}`;
    }
    return null; // Passed compilation
  } finally {
    // Perfect revert
    try {
      if (originalContent !== null) {
        fs.writeFileSync(absPath, originalContent, 'utf8');
      } else if (!isMod && fileExists) {
        // If it was a new file, we created it just for this check. Delete it.
        fs.unlinkSync(absPath);
      }
    } catch {}
  }
}

export async function runStaticCompilationGateForFix(workerResponse: string, root: string): Promise<string | null> {
  const fs = await import('fs');
  const path = await import('path');
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('./services/surgicalEditService.js');
  const { runCompileCheck } = await import('./services/compileRunner.js');

  const format = detectResponseFormat(workerResponse);
  if (format !== 'surgical') {
    return null; // Skip static check for full-file fixes for now as file routing is ambiguous
  }

  const edits = parseSurgicalEdits(workerResponse);
  if (edits.length === 0) { return null; }

  // Snapshot original file states
  const snapshots = new Map<string, string>();
  for (const edit of edits) {
    const absPath = path.join(root, edit.filePath);
    if (fs.existsSync(absPath) && !snapshots.has(absPath)) {
      snapshots.set(absPath, fs.readFileSync(absPath, 'utf8'));
    }
  }

  try {
    const results = applySurgicalEdits(edits, root);
    const failed = results.find(r => !r.success);
    if (failed) {
      return `Surgical edit failed to apply to ${failed.filePath}: ${failed.error}`;
    }

    const result = runCompileCheck(root);
    if (!result.success) {
      // Find errors relevant to touched files
      const relPaths = [...new Set(edits.map(e => e.filePath))];
      const lines = result.output.split('\n');
      const relevantErrors = lines.filter(l => relPaths.some(rp => l.includes(rp)));
      if (relevantErrors.length > 0) {
        return `Compilation error after fix:\n${relevantErrors.join('\n').slice(0, 500)}`;
      }
      return `Compilation error:\n${result.output.slice(0, 500)}`;
    }
    return null;
  } finally {
    // Perfect revert
    for (const [absPath, content] of snapshots) {
      try { fs.writeFileSync(absPath, content, 'utf8'); } catch {}
    }
  }
}

export async function runStaticValidation(code: string, relPath: string): Promise<string> {
  try {
    const { validateCode } = await import('../workspace/logic/codeValidator.js');
    const res = validateCode(code, relPath.split('.').pop() || '');
    if (res.autoFixed) {return res.code;}
  } catch {}
  return code;
}

export async function runImportValidation(ctx: BuildContext, code: string, absPath: string, root: string): Promise<string> {
  try {
    const { validateImports, buildImportRepairPrompt } = await import('../../features/ai/data/importValidator.js');
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
