// [SCOPE] Edit-file build pipeline — patches existing files in-place for Fix This (TODO / scope fixes).
// Helper types and utilities -> chatPanelEditBuildHelpers.ts

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import type {
  EditBuildContext} from './chatPanelEditBuildHelpers.js';
import { parseLineNum, extractExcerpt, spliceExcerpt,
  saveNewBlocksToVault, updateLastMsg, appendMsg,
} from './chatPanelEditBuildHelpers.js';

export type { EditBuildContext };

import { generateEditPrompt } from './chatPanelEditBuildPrompts.js';

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
  let useExcerpt = false;
  let excerptStart = 0, excerptEnd = lines.length - 1;
  let excerptText = '';

  if (issueType === 'todo') {
    const lineNum = parseLineNum(task);
    if (lineNum && lines.length > 200) {
      const ex = extractExcerpt(lines, lineNum);
      excerptStart = ex.start; excerptEnd = ex.end;
      useExcerpt = true;
      excerptText = ex.excerpt;
    }
  }

  const editPrompt = await generateEditPrompt(
    issueType, task, filePath, absPath, root, originalContent, bpSection,
    useExcerpt, excerptStart, excerptEnd, excerptText
  );

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
    // [FIX] Try surgical edits first if AI returned SEARCH/REPLACE blocks
    const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('./services/surgicalEditService.js');
    if (!useExcerpt && detectResponseFormat(res.text) === 'surgical') {
      const edits = parseSurgicalEdits(res.text).map(e => ({ ...e, filePath: filePath }));
      if (edits.length > 0) {
        const results = applySurgicalEdits(edits, root);
        if (results.every(r => r.success)) {
          newContent = fs.readFileSync(absPath, 'utf-8');
        } else {
          // [FIX] Surgical failed — do NOT fall back to writing raw AI text (which contains
          // <<<SEARCH...REPLACE>>> markers) to disk. That silently corrupts the file.
          // Throw so the caller surfaces a clean error instead.
          const failedEdits = results.filter(r => !r.success).map(r => r.error || 'search string not found').join('; ');
          throw new Error(`Surgical edit failed — search string not found in file. Try again. (${failedEdits})`);
        }
      } else {
        newContent = useExcerpt ? spliceExcerpt(lines, excerptStart, excerptEnd, result) : result;
      }
    } else {
      newContent = useExcerpt ? spliceExcerpt(lines, excerptStart, excerptEnd, result) : result;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, errMsg, promptLen);
    conversation.pop();
    appendMsg(ctx, `❌ Edit failed\n\n**Reason:** ${errMsg}\n\nTry again or describe the change differently.`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  // [FIX] Snapshot the original file BEFORE writing — enables proper rollback from History.
  let snapshotId: string | undefined;
  try {
    const { SnapshotService } = await import('../../project/application/snapshotService.js');
    const snap = new SnapshotService(root);
    snapshotId = snap.prepare(`[EDIT] ${task.slice(0, 80)}`, [filePath]);
  } catch { /* snapshot is best-effort */ }

  let tempOrigPath: string | undefined;
  try {
    tempOrigPath = path.join(os.tmpdir(), `redivivus-orig-${Date.now()}-${path.basename(absPath)}`);
    fs.writeFileSync(tempOrigPath, originalContent, 'utf-8');
    fs.writeFileSync(absPath, newContent, 'utf-8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    ctx.logError(task, editPrompt, `Write failed: ${errMsg}`, promptLen);
    appendMsg(ctx, `❌ Could not write \`${filePath}\`\n\n**Reason:** ${errMsg}`);
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  const oldLines = originalContent.split('\n');

  // [FIX] Record to project history so edits appear alongside builds and can be rolled back.
  if (snapshotId) {
    try {
      // Extract a human-readable description: prefer PRESCRIPTION section or fall back to first meaningful line
      let historyDesc = task.slice(0, 80);
      const prescMatch = task.match(/PRESCRIPTION:\s*\n(.+)/);
      if (prescMatch) { historyDesc = prescMatch[1].trim().slice(0, 120); }
      else if (task.includes('`' + filePath + '`')) { historyDesc = `Edit ${filePath}`; }
      const { BuildHistoryService, makeBuildHistoryEntry } = await import('./services/buildHistoryService.js');
      new BuildHistoryService(root).record(makeBuildHistoryEntry({
        snapshotId,
        task: `[EDIT] ${historyDesc}`,
        files: [filePath],
        tokensUsed: 0,
        costUSD: 0,
        source: 'ai',
        supervisor: 'edit',
        worker: null,
        resultCardToken: '',
      }));
    } catch { /* history is best-effort */ }
  }

  // [FIX] Compile verification for refactor edits — catches broken imports/missing symbols.
  // If compile fails, attempt ONE auto-fix pass by sending errors back to the AI.
  if (issueType === 'refactor') {
    try {
      const { runCompileCheck } = await import('./services/compileRunner.js');
      const compResult = runCompileCheck(root);
      if (!compResult.success && compResult.command) {
        updateLastMsg(ctx, `📂 Fixing compile errors in \`${filePath}\`...`);
        const fixPrompt =
          `The refactor of \`${filePath}\` introduced compile errors. Fix them.\n\n` +
          `CURRENT FILE:\n\`\`\`\n${fs.readFileSync(absPath, 'utf-8')}\n\`\`\`\n\n` +
          `COMPILE ERRORS:\n\`\`\`\n${compResult.output.slice(0, 3000)}\n\`\`\`\n\n` +
          `Use SURGICAL EDITS (<<<SEARCH...REPLACE>>>). Fix ONLY the errors — do not refactor further.\n` +
          `If a missing import/interface needs to be created in another file, prefix the block with: FILE: <relativePath>`;
        const fixRes = await routing.routeByComplexity(task, fixPrompt, 60_000);
        if (fixRes.success && fixRes.text) {
          const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('./services/surgicalEditService.js');
          if (detectResponseFormat(fixRes.text) === 'surgical') {
            const edits = parseSurgicalEdits(fixRes.text).map(e => ({ ...e, filePath: e.filePath || filePath }));
            applySurgicalEdits(edits, root);
          } else {
            // Full-file fallback
            const cleaned = fixRes.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
            if (cleaned.includes('{') || cleaned.includes('//')) {
              fs.writeFileSync(absPath, cleaned, 'utf-8');
            }
          }
          newContent = fs.readFileSync(absPath, 'utf-8');
          const newNewLines = newContent.split('\n');
          const newAdded = newNewLines.filter(l => !oldLines.includes(l)).length;
          const newRemoved = oldLines.filter(l => !newNewLines.includes(l)).length;
          // Update diffSummary references below
        }
      }
    } catch { /* compile check is best-effort */ }
  }

  // Recompute diff summary from final file state
  const finalContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : newContent;
  const finalLines = finalContent.split('\n');
  const finalAdded = finalLines.filter(l => !oldLines.includes(l)).length;
  const finalRemoved = oldLines.filter(l => !finalLines.includes(l)).length;
  const finalDiff = `(+${finalAdded} / -${finalRemoved} lines)`;

  if (tempOrigPath) {
    vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(tempOrigPath), vscode.Uri.file(absPath), `Redivivus Edit: ${path.basename(filePath)} ${finalDiff}`).then(undefined, () => {});
  }

  let vaultMsg = '';
  if (vault) {
    const saved = await saveNewBlocksToVault(absPath, vault);
    if (saved > 0) { vaultMsg = `\n💾 Saved **${saved}** new code block${saved !== 1 ? 's' : ''} to vault`; }
  }

  updateLastMsg(ctx, `✅ Fixed \`${filePath}\` ${finalDiff}${vaultMsg}\n\n_Diff view opened — close it to dismiss._`);
  if (ctx.onBuildFinished) { ctx.onBuildFinished(task, [filePath]); }
}
