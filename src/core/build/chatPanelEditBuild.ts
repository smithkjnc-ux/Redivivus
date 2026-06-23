// [SCOPE] Edit-file build pipeline — patches existing files in-place for Fix This (TODO / scope fixes).
// Helper types and utilities -> chatPanelEditBuildHelpers.ts

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import type {
  EditBuildContext} from './chatPanelEditBuildHelpers';
import { parseLineNum, extractExcerpt, spliceExcerpt,
  saveNewBlocksToVault, updateLastMsg, appendMsg,
} from './chatPanelEditBuildHelpers';

export type { EditBuildContext };

/** Read the contents of files imported by the target file — gives the Worker awareness of existing
 *  exports/interfaces so it doesn't invent nonexistent symbols. Limited to direct local imports. */
function _gatherImportContext(absPath: string, root: string): string {
  try {
    const src = fs.readFileSync(absPath, 'utf-8');
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    const seen = new Set<string>();
    const chunks: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      const raw = m[1];
      const dir = path.dirname(absPath);
      // Try .ts, .js, /index.ts extensions
      const candidates = [raw, raw + '.ts', raw + '.js', raw + '/index.ts'].map(c => path.resolve(dir, c));
      for (const c of candidates) {
        if (seen.has(c)) { break; }
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          seen.add(c);
          const content = fs.readFileSync(c, 'utf-8');
          const relPath = path.relative(root, c);
          // Limit to first 80 lines to control prompt size
          const preview = content.split('\n').slice(0, 80).join('\n');
          chunks.push(`--- RELATED FILE: ${relPath} ---\n\`\`\`\n${preview}\n\`\`\``);
          break;
        }
      }
    }
    return chunks.length > 0 ? '\n\nRELATED FILES (these exist — reference their REAL exports, do NOT invent new ones):\n' + chunks.join('\n\n') + '\n' : '';
  } catch { return ''; }
}

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
        `Use SURGICAL EDITS. Output ONLY the changed parts:\n` +
        `<<<SEARCH\n[exact existing code to find]\n===\n[replacement code]\nREPLACE>>>\n\n` +
        `RULES:\n- Use <<<SEARCH...REPLACE>>> for each change. Do NOT return the full file.\n` +
        `- Change [TODO] to [DONE] once implemented\n` +
        `- Preserve all other annotations exactly\n` +
        `- Write real, working code — no placeholders\n` +
        `- If you must return a full file (e.g. file is tiny), that is also acceptable.`;
    }
  } else if (issueType === 'refactor') {
    // [FIX] Refactor edits get related-file context so the Worker knows what exports/interfaces
    // actually exist in the project — prevents it from inventing nonexistent symbols or files.
    const importCtx = _gatherImportContext(absPath, root);
    // [REVISIONS] Include blueprint evolution + dead ends so the Worker understands project history
    // and never repeats approaches that have already failed. This is annotation-based understanding.
    let projectHistoryCtx = '';
    try {
      const { getBlueprintEvolutionContext } = await import('../routing/chatPanelMsgFixBuildCtx.js');
      const { readProjectDeadEnds } = await import('../routing/chatPanelMsgFixDeadEnds.js');
      const bpEvolution = getBlueprintEvolutionContext(root);
      const deadEnds = readProjectDeadEnds(root);
      if (bpEvolution) { projectHistoryCtx += '\n\n' + bpEvolution; }
      if (deadEnds) { projectHistoryCtx += '\n\nDEAD ENDS (approaches that failed — do NOT repeat these):\n' + deadEnds.slice(0, 2000); }
    } catch { /* best-effort */ }
    editPrompt =
      `Refactor this file \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
      `TASK: ${task}${bpSection}${importCtx}${projectHistoryCtx}\n` +
      `Use SURGICAL EDITS. Output ONLY the changed parts:\n` +
      `<<<SEARCH\n[exact existing code to find]\n===\n[replacement code]\nREPLACE>>>\n\n` +
      `RULES:\n- Use <<<SEARCH...REPLACE>>> for each change. Do NOT return the full file.\n` +
      `- Make REAL code changes — not comments, not placeholders, not annotations.\n` +
      `- NEVER import from a module that does not exist. If you need a new interface or function, CREATE it in the appropriate existing file using a separate SEARCH/REPLACE block.\n` +
      `- NEVER reference a symbol unless you can see it in the file content or RELATED FILES above.\n` +
      `- You may emit multiple SEARCH/REPLACE blocks targeting DIFFERENT files by prefixing: FILE: <relativePath>\n` +
      `- If you must return a full file (e.g. file is tiny), that is also acceptable.`;
  } else {
    editPrompt =
      `Add Redivivus annotation comments to \`${filePath}\`:\n\`\`\`\n${originalContent}\n\`\`\`\n\n` +
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
    // [FIX] Try surgical edits first if AI returned SEARCH/REPLACE blocks
    const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('../../services/build/surgicalEditService.js');
    if (!useExcerpt && detectResponseFormat(res.text) === 'surgical') {
      const edits = parseSurgicalEdits(res.text).map(e => ({ ...e, filePath: filePath }));
      if (edits.length > 0) {
        const results = applySurgicalEdits(edits, root);
        if (results.every(r => r.success)) {
          newContent = fs.readFileSync(absPath, 'utf-8');
        } else {
          // Surgical failed — fall back to full-file
          newContent = result;
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
    const { SnapshotService } = await import('../../services/snapshotService.js');
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
      const { BuildHistoryService, makeBuildHistoryEntry } = await import('../../services/build/buildHistoryService.js');
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
      const { runCompileCheck } = await import('../../services/build/compileRunner.js');
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
          const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits } = await import('../../services/build/surgicalEditService.js');
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
