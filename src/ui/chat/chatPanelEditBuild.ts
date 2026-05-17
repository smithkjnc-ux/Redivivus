// [SCOPE] Edit-file build pipeline — patches existing files in-place for Fix This (TODO / scope fixes).
// Helper types and utilities -> chatPanelEditBuildHelpers.ts

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import {
  EditBuildContext, parseLineNum, extractExcerpt, spliceExcerpt,
  saveNewBlocksToVault, updateLastMsg, appendMsg,
} from './chatPanelEditBuildHelpers.js';

export type { EditBuildContext };

export async function runEditFileBuild(ctx: EditBuildContext): Promise<void> {
  const { filePath, task, issueType, root, blueprintContext, routing, vault, conversation } = ctx;
  const absPath = path.join(root, filePath);
  const bpSection = blueprintContext ? `\nPROJECT CONTEXT:\n${blueprintContext}\n` : '';

  let originalContent: string;
  try {
    originalContent = fs.readFileSync(absPath, 'utf-8');
  } catch (err) {
    appendMsg(ctx, `❌ Could not read \`${filePath}\`: ${err instanceof Error ? err.message : String(err)}`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, String(err)); }
    return;
  }

  const lines = originalContent.split('\n');
  let editPrompt: string;
  let useExcerpt = false;
  let excerptStart = 0, excerptEnd = lines.length - 1;

  if (issueType === 'todo') {
    const lineNum = parseLineNum(task);
    if (lineNum && lines.length > 200) {
      const ex = extractExcerpt(lines, lineNum);
      excerptStart = ex.start; excerptEnd = ex.end;
      useExcerpt = true;
      editPrompt =
        `Edit this excerpt from \`${filePath}\` (lines ${ex.start + 1}–${ex.end + 1}):\n\`\`\`\n${ex.excerpt}\n\`\`\`\n\n` +
        `TASK: ${task}${bpSection}\n` +
        `RULES:\n- Return ONLY the modified excerpt (same line range, no fences, no explanation)\n` +
        `- Change [TODO] to [DONE] once the task is implemented\n` +
        `- Preserve all other [SCOPE], [WARN], [NEXT], [DEAD] annotations exactly\n` +
        `- Write real, working code — no placeholders or stubs`;
    } else {
      editPrompt =
        `Edit this file \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
        `TASK: ${task}${bpSection}\n` +
        `RULES:\n- Return ONLY the complete updated file (no fences, no explanation)\n` +
        `- Change [TODO] to [DONE] once implemented\n` +
        `- Preserve all other annotations exactly\n` +
        `- Write real, working code — no placeholders`;
    }
  } else {
    editPrompt =
      `Add CHASSIS annotation comments to \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
      `TASK: ${task}${bpSection}\n` +
      `RULES:\n- Return ONLY the complete updated file (no fences, no explanation)\n` +
      `- Add \`// [SCOPE]\` at line 1 describing what this file does in one sentence\n` +
      `- Add \`// [WARN]\` near any fragile, risky, or side-effect-heavy logic\n` +
      `- Do NOT change any existing code — comments only`;
  }

  appendMsg(ctx, `📂 Editing \`${filePath}\`...`);
  const promptLen = Math.ceil(editPrompt.length / 4);
  let newContent: string;

  try {
    const res = await routing.routeByComplexity(task, editPrompt, 90_000);
    if (!res.success) { throw new Error(res.error || 'AI generation failed'); }
    const result = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
    if (!result) { throw new Error('AI returned an empty response — the file may be too large.'); }
    // [WARN] Reject prose — AI returns explanation text instead of code when file context is missing.
    // Writing prose to disk corrupts the file.
    if (/^[A-Z][a-z]/.test(result) && !result.includes('<') && !result.includes('{') && !result.includes('//') && result.length < 800) {
      throw new Error('AI returned an explanation instead of code. Try again.');
    }
    newContent = useExcerpt ? spliceExcerpt(lines, excerptStart, excerptEnd, result) : result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, errMsg, promptLen);
    conversation.pop();
    appendMsg(ctx, `❌ Edit failed\n\n**Reason:** ${errMsg}\n\nTry again or describe the change differently.`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  let tempOrigPath: string | undefined;
  try {
    tempOrigPath = path.join(os.tmpdir(), `chassis-orig-${Date.now()}-${path.basename(absPath)}`);
    fs.writeFileSync(tempOrigPath, originalContent, 'utf-8');
    fs.writeFileSync(absPath, newContent, 'utf-8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, `Write failed: ${errMsg}`, promptLen);
    appendMsg(ctx, `&#x274C; Could not write \`${filePath}\`\n\n**Reason:** ${errMsg}`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  const oldLines = originalContent.split('\n'); const newLines = newContent.split('\n');
  const added = newLines.filter(l => !oldLines.includes(l)).length;
  const removed = oldLines.filter(l => !newLines.includes(l)).length;
  const diffSummary = `(+${added} / -${removed} lines)`;

  if (tempOrigPath) {
    vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(tempOrigPath), vscode.Uri.file(absPath), `CHASSIS Edit: ${path.basename(filePath)} ${diffSummary}`).then(undefined, () => {});
  }

  let vaultMsg = '';
  if (vault) {
    const saved = await saveNewBlocksToVault(absPath, vault);
    if (saved > 0) { vaultMsg = `\n&#x1F4BE; Saved **${saved}** new code block${saved !== 1 ? 's' : ''} to vault`; }
  }

  updateLastMsg(ctx, `&#x2705; Fixed \`${filePath}\` ${diffSummary}${vaultMsg}\n\n_Diff view opened — close it to dismiss._`);
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, [filePath]); }
}
