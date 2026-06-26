// [SCOPE] Redivivus Chat Panel Chunked Build — per-file build loop (extracted from chatPanelChunked.ts)
// AI generation extracted to chatPanelChunkedBuildFile.ts (Rule 9 split). Contract enforcement added.
import * as path from 'path';
import * as fs from 'fs';
import type { BuildContext } from './chatPanelBuild.js';
import { appendMsg, updateLastMsg } from './chatPanelChunked.js';
import { extractAllNarrators, encodeStoryToken } from './buildOutput.js';
import { Redivivus_WORKER_RULES } from '../../../shared/ai/infrastructure/redivivusWorkerRules.js';
import { generateFileCode } from './chatPanelChunkedBuildFile.js';
import { extractContractFromCode, mergeContract, buildContractBlock, detectContractViolations, emptyContract } from '../../../services/blueprint/blueprintContract.js';
import { formatVaultContext } from '../../vault/infrastructure/vaultContextService.js';

export interface FileBuildLoopContext {
  task: string;
  ctx: BuildContext;
  filePlan: Array<{ filename: string; purpose: string }>;
  relevant: Array<any>;
  blueprintContext: string;
  answersBlock: string;
  routing: any;
  supervisor: string;
  worker: string | null;
  supervisorLabel: string;
  workerLabel: string | null;
  buildId: string;
  phaseUndo: any;
  ledger: any;
  storyMsgIndex: number;
  projectType: string;
}

export interface FileBuildLoopResult {
  success: boolean;
  builtFiles: string[];
  totalTokens: number;
  totalCost: number;
  storyLines: string[];
}

export async function runFileBuildLoop(lctx: FileBuildLoopContext): Promise<FileBuildLoopResult> {
  const { task, ctx, filePlan, relevant, blueprintContext, answersBlock, routing, supervisor, worker, supervisorLabel, workerLabel, buildId, phaseUndo, ledger, storyMsgIndex, projectType } = lctx;
  const { conversation } = ctx;
  const builtFiles: string[] = [];
  let totalTokens = 0;
  let totalCost = 0;
  const storyLines: string[] = [];

  function updateStory(lines: string[]): void {
    ctx.conversation[storyMsgIndex].content = encodeStoryToken(lines);
    ctx.refresh();
  }

  for (let i = 0; i < filePlan.length; i++) {
    const entry = filePlan[i];
    const fileNum = i + 1;
    const total = filePlan.length;
    const phaseName = `File ${fileNum}: ${entry.filename}`;
    phaseUndo.snapshotBeforePhase(buildId, phaseName, [entry.filename], `Build ${entry.filename}: ${entry.purpose}`);
    appendMsg(ctx, `⚙️ Writing part ${fileNum} of ${total}: \`${entry.filename}\`...`);

    const absPath = path.join(ctx.root, entry.filename);
    const exists = fs.existsSync(absPath);
    const existingContent = exists ? fs.readFileSync(absPath, 'utf8') : '';
    const existingBlock = exists
      ? `\nEXISTING FILE CONTENT OF ${entry.filename} (Modify this content surgically. Preserve all other existing functions, structures, annotations, and imports unless explicitly asked otherwise):\n\`\`\`\n${existingContent}\n\`\`\`\n`
      : '';

    const allFiles = filePlan.map(f => `  - ${f.filename}: ${f.purpose}`).join('\n');
    // [WARN] Vault context only for NEW files — injecting into surgical edits caused AI to dump unrelated code
    const vaultBlock = (!exists && relevant.length > 0)
      ? `VAULT CODE (strict rules):\n- COPY any vault item that fits into your output as-is, marked // [FROM VAULT: name].\n- Do NOT rewrite or create a parallel version of vault code.\n- Only write NEW code for what vault doesn't cover.\n${formatVaultContext(relevant.slice(0, 4))}\n`
      : '';
    const isHtmlFile = entry.filename.endsWith('.html');
    const surgicalRules = exists
      ? `- You are MODIFYING an existing file. Output the COMPLETE updated file content.\n- Preserve ALL existing functions, imports, annotations, and comments.\n- Only add/change what the PURPOSE requires. Do NOT add vault code or unrelated functions.\n- Do NOT wrap your output in markdown fences.`
      : (isHtmlFile ? '- HTML files MUST start with <!DOCTYPE html> on line 1. Add a <!-- NARRATOR: description --> comment as the SECOND line, inside <head> — NOT before <!DOCTYPE html>.' : '- Add a [SCOPE] comment at the top');
    const singleFileRule = (projectType.includes('single-file tool') || projectType.includes('script'))
      ? '- [BROWSER GAMES AND SIMPLE TOOLS]: ALWAYS output a single self-contained index.html file with all CSS and JavaScript inline. Do NOT use external .js or .css files. Do NOT use a src/ directory. For games, center the <canvas> on screen using CSS (`body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #222; overflow: hidden; } canvas { display: block; }`).'
      : '- [BROWSER/HTML PROJECTS ONLY]: Do NOT put JavaScript inside HTML files. Always use a separate .js file and link it via <script src="...">. Do NOT use ES modules or import/export keywords. Use global variables so the app runs natively via file:// without CORS errors.';

    const contract = ctx.contract ?? emptyContract();
    const contractBlock = buildContractBlock(contract);

    const filePrompt = `You are an expert software engineer. Build one file as part of a larger project.
Write clean, modern, complete code. Prioritize real functionality and polished UX — never cut features to save lines.

PROJECT TASK: "${task}"
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}${answersBlock ? `${answersBlock}\n` : ''}ALL FILES IN THIS PROJECT (for import awareness):
${allFiles}

FILE TO BUILD NOW: ${entry.filename}
PURPOSE: ${entry.purpose}
${existingBlock}
${vaultBlock}${contractBlock ? `${contractBlock}\n\n` : ''}RULES:
- Implement ONLY ${entry.filename} — do not output any other file
- Write as many lines as the feature requires — never truncate or stub out functionality
${surgicalRules}
- For JS/TS/Python: first line must be \`// NARRATOR: [one sentence describing what this file does]\`. For HTML: add \`<!-- NARRATOR: description -->\` inside <head>, never before <!DOCTYPE html>. NARRATOR describes the FILE only -- never copy or quote the task string or any system context
- Write production-ready code: correct logic, all edge cases handled, clean readable structure
${singleFileRule}
- Return ONLY the complete file source code — no markdown fences, no explanation

QUALITY STANDARDS:
- Use modern syntax: ES2020+ JS, CSS custom properties in stylesheets, semantic HTML5
- CANVAS API WARNING: ctx.fillStyle, ctx.strokeStyle, and gradient.addColorStop() do NOT resolve CSS variables. Use JavaScript constants or hardcoded hex/rgb values for all canvas drawing — never var(--name)
- UI should be polished: good spacing, readable fonts, smooth transitions, clear user feedback on actions
- Never let errors fail silently — add meaningful console.error or user-visible messages
- Use descriptive names; code should read like documentation
- Web UIs: use flexbox or grid, responsive layout, accessible markup (aria-label, alt, button roles)`;

    let code = '';
    let fileTokens = 0;
    let fileCost = 0;

    try {
      const genResult = await generateFileCode({
        filePrompt, entry, fileNum, fileIndex: i, task, routing,
        supervisor, worker, supervisorLabel, workerLabel, filePlan,
        ledger, ctx,
        onMsg: (content) => appendMsg(ctx, content),
      });
      code = genResult.code;
      fileTokens = genResult.fileTokens;
      fileCost = genResult.fileCost;
      totalTokens += fileTokens;
      totalCost += fileCost;

      const violations = detectContractViolations(code, entry.filename, contract);
      if (violations.length > 0 && ctx.contract) {
        const violationDesc = violations.map(v => v.detail).join('; ');
        appendMsg(ctx, `[!] Fixing contract violation in \`${entry.filename}\` — regenerating...`);
        const fixPrompt = `${filePrompt}\n\nCONTRACT VIOLATION DETECTED — fix before outputting:\n${violationDesc}`;
        try {
          const fixed = await generateFileCode({ filePrompt: fixPrompt, entry, fileNum, fileIndex: -1, task, routing, supervisor, worker, supervisorLabel, workerLabel, filePlan, ledger, ctx, onMsg: (c) => appendMsg(ctx, c) });
          code = fixed.code;
          totalTokens += fixed.fileTokens;
          totalCost += fixed.fileCost;
        } catch { /* fall through -- use original code if fix generation fails */ }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `File ${entry.filename}: ${errMsg}`, Math.ceil(filePrompt.length / 4));
      conversation.pop();
      appendMsg(ctx, `❌ Hit a snag on part ${fileNum} of ${total}: \`${entry.filename}\`\n\n**Reason:** ${errMsg}${builtFiles.length > 0 ? `\n\n_${builtFiles.length} part${builtFiles.length !== 1 ? 's' : ''} completed before this._` : ''}`);
      return { success: false, builtFiles, totalTokens, totalCost, storyLines };
    }

    const fileNarrations = extractAllNarrators(code);
    code = code.replace(/^\s*(?:\/\/|#|--)?\s*NARRATOR:\s*.+\n?/gm, '').trim();

    try {
      const writePath = path.join(ctx.root, entry.filename);
      const dir = path.dirname(writePath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(writePath, code, 'utf8');
      builtFiles.push(entry.filename);
      // [Redivivus] Live preview: open each built file beside chat immediately (preview mode reuses same tab slot).
      try { const vscode = await import('vscode'); const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(writePath)); await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }); } catch { /* non-blocking */ }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      ctx.logError(task, filePrompt, `Write failed for ${entry.filename}: ${errMsg}`, Math.ceil(filePrompt.length / 4));
      conversation.pop();
      appendMsg(ctx, `❌ Could not save \`${entry.filename}\`\n\n**Reason:** ${errMsg}\n\nTry again — if it keeps failing, check your disk space.`);
      return { success: false, builtFiles, totalTokens, totalCost, storyLines };
    }

    if (ctx.contract !== undefined) {
      ctx.contract = mergeContract(ctx.contract, extractContractFromCode(entry.filename, code));
    }

    conversation.pop();
    if (fileNarrations.length > 0) { storyLines.push(...fileNarrations); }
    else { storyLines.push(`Built \`${entry.filename}\` — ${entry.purpose}`); }
    updateStory(storyLines);
    appendMsg(ctx, `✅ Built ${fileNum} of ${total}: \`${entry.filename}\`\n__BUILD_RESULT__${entry.filename}|||${path.join(ctx.root, entry.filename)}|||END__`, fileTokens, fileCost);
  }
  return { success: true, builtFiles, totalTokens, totalCost, storyLines };
}
