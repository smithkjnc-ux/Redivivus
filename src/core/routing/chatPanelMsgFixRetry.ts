// [SCOPE] Fix pipeline retry helpers — pattern-violation retry and no-output retry.
// Called from chatPanelMsgFix.ts. Both are transparent to the user on success.

import * as fs from 'fs';
import * as path from 'path';
import { validateOutputFiles } from './chatPanelMsgFixPatterns';
import type { MessageHandlerDeps } from './chatPanelMessages';

export async function retryPatternFix(params: {
  written: string[];
  activePatterns: any[];
  root: string;
  diagnosis: string;
  supervisorLabel: string;
  allowedRels: Set<string>;
  deps: MessageHandlerDeps;
  userText: string;
  conversation: any[];
  refresh: () => void;
}): Promise<{ written: string[]; workerLabel: string; retried: boolean }> {
  const { written, activePatterns, root, diagnosis, supervisorLabel, allowedRels, deps, userText, conversation, refresh } = params;

  const writtenFixes = written.map(rel => ({
    rel,
    content: fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), 'utf-8') : '',
  }));
  const violations = validateOutputFiles(writtenFixes, userText);
  if (violations.length === 0) { return { written, workerLabel: 'AI', retried: false }; }

  conversation[conversation.length - 1].content = 'Pattern still detected — applying targeted fix...';
  refresh();

  const violationInstructions = violations.map(v =>
    `STILL PRESENT: ${v.pattern.name}\nIn files: ${v.files.join(', ')}\nREQUIRED FIX:\n${v.pattern.workerRule}`
  ).join('\n\n');

  const retryDiagnosis =
    `${diagnosis}\n\n=== AUTO-RETRY: previous fix did not resolve known pattern ===\n` +
    `${violationInstructions}\n\nApply the required fix above now. Do not skip or work around it.`;

  const retryFilesBlock = writtenFixes.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');

  try {
    const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
    const retryEscalation = await runEscalationLoop({
      diagnosis: retryDiagnosis,
      fileNames: written.join(', '),
      filesBlock: retryFilesBlock,
      activePatterns,
      deps,
      root,
      supervisorLabel,
    });
    const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
    const retryApply = await applyFixContent(retryEscalation.finalResponse, root, allowedRels, userText);
    if (retryApply.written.length > 0) {
      return {
        written: [...new Set([...written, ...retryApply.written])],
        workerLabel: retryEscalation.workerLabel,
        retried: true,
      };
    }
  } catch { /* best-effort — if retry fails, original write stands */ }

  return { written, workerLabel: 'AI', retried: true };
}

/** Retry when Worker produced no file output or edits failed to apply. */
export async function retryNoOutput(params: {
  diagnosis: string; filesBlock: string; fileNames: string; activePatterns: any[];
  allowedRels: Set<string>; deps: MessageHandlerDeps; userText: string;
  conversation: any[]; refresh: () => void; supervisorLabel: string; root: string;
  failedErrors?: string[];
}): Promise<{ written: string[]; failed: string[]; skipped: string[]; fixSnapId: string | undefined; workerLabel: string }> {
  const { diagnosis, filesBlock, fileNames, activePatterns, allowedRels, deps, userText, conversation, refresh, supervisorLabel, root, failedErrors } = params;
  
  let formatDiagnosis = '';
  if (failedErrors && failedErrors.length > 0) {
    conversation[conversation.length - 1].content = 'Fix failed to apply. Retrying with explicit match instructions...';
    refresh();
    formatDiagnosis = 
      `${diagnosis}\n\n` +
      `CRITICAL: Your previous response failed to apply. Errors:\n${failedErrors.join('\n')}\n\n` +
      `This happens when your SEARCH blocks do not exactly match the file content. You MUST output exact file contents or perfectly matching SEARCH blocks.\n` +
      `Write actual code — not instructions.`;
  } else {
    conversation[conversation.length - 1].content = 'Retrying with explicit format instructions...';
    refresh();
    formatDiagnosis =
      `${diagnosis}\n\n` +
      `CRITICAL: Your previous response produced NO parseable code changes.\n` +
      `You MUST output every changed file using this exact format:\n` +
      `<file path="relative/path/to/file">\n<content>\n[complete new file content]\n</content>\n</file>\n` +
      `Output ONLY the file blocks above. No prose, no markdown headers, no explanation.`;
  }

  try {
    const { runEscalationLoop } = await import('./chatPanelMsgFixEscalation.js');
    const escalation = await runEscalationLoop({ diagnosis: formatDiagnosis, fileNames, filesBlock, activePatterns, deps, root, supervisorLabel });
    const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
    const res = await applyFixContent(escalation.finalResponse, root, allowedRels, userText);
    return { ...res, workerLabel: escalation.workerLabel };
  } catch {
    return { written: [], failed: [], skipped: [], fixSnapId: undefined, workerLabel: 'AI' };
  }
}
