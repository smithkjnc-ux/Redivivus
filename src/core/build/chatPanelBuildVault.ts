// [SCOPE] Redivivus Build Pipeline — Vault assembly build
// [FIX] Was raw concatenation — now uses AI to adapt and merge vault items into a working file.
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as path from 'path';
import * as vscode from 'vscode';
import type { BuildContext } from './chatPanelBuild';
import { inferExtension, deriveFileBase, extractCodeFromResponse } from './chatPanelBuildInference';
import { createSnapshot, writeBuiltFile, captureToVault } from './chatPanelBuildWriter';
import { buildResultCard } from './buildOutput.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild';
import { appendCompileAction, maybeAutoCompile } from './chatPanelBuildPipeline';

// Maps file extension to compatible vault language tags.
// Vault is organized by language — JS components are not fed to Python builds.
// When no native-language items exist, fall through to runSingleFileBuild.
// The vault fills up over time in each language as more programs are built.
const LANG_COMPAT: Record<string, string[]> = {
  '.py':   ['python', 'py'],
  '.rs':   ['rust', 'rs'],
  '.go':   ['go', 'golang'],
  '.ts':   ['typescript', 'ts', 'javascript', 'js'],
  '.tsx':  ['typescript', 'tsx', 'react', 'javascript', 'js'],
  '.js':   ['javascript', 'js'],
  '.html': ['html', 'javascript', 'js'],
  '.java': ['java'],
  '.c':    ['c'],
  '.cpp':  ['cpp', 'c++'],
  '.rb':   ['ruby'],
  '.sh':   ['bash', 'shell', 'sh'],
};

export async function runVaultAssemblyBuild(ctx: BuildContext, vaultItems: any[]): Promise<void> {
  const { task, root, blueprintContext, routing, conversation } = ctx;
  const buildStart = Date.now();

  const where = blueprintContext.match(/Where: (.+)/)?.[1]?.toLowerCase() || '';
  const ext = inferExtension(task.toLowerCase(), where);

  // Filter to language-compatible vault items only.
  // No match = fresh build in the correct language (vault grows over time per language).
  const compatLangs = LANG_COMPAT[ext] || [];
  let filteredItems = compatLangs.length > 0
    ? vaultItems.filter(i => compatLangs.some(l => (i.language || '').toLowerCase().includes(l)))
    : vaultItems;

  if (filteredItems.length === 0) {
    conversation.push({ role: 'assistant', content: `No ${ext.slice(1).toUpperCase()} components in vault yet -- building from scratch...`, timestamp: Date.now() });
    ctx.refresh();
    await (require('./chatPanelBuild.js') as any).runSingleFileBuild(ctx);
    return;
  }

  // [FIX] AI relevance filter — keyword overlap in findSimilar() produces false positives.
  // Example: "make bird look like a bird" matches audio functions named getBirdDuration.
  // Use a fast AI call to keep only vault items that actually apply to this task.
  if (filteredItems.length > 2) {
    try {
      const itemList = filteredItems.slice(0, 12).map((item: any, i: number) =>
        `${i + 1}. ${item.name}: ${(item.description || '').slice(0, 80)}`
      ).join('\n');
      const relevanceCheck = `Task: "${task.slice(0, 200)}"\n\nVault components:\n${itemList}\n\nWhich component numbers are directly relevant to implementing this task? Reply ONLY with comma-separated numbers (e.g. "1,3") or the word "none".`;
      const checkRes = await routing.routeByComplexity(task, relevanceCheck, 12_000);
      const reply = checkRes.text?.trim().toLowerCase() || '';
      if (reply === 'none' || reply === '') {
        filteredItems = [];
      } else {
        const relevant = (reply.match(/\d+/g) || []).map(Number);
        if (relevant.length > 0) { filteredItems = filteredItems.filter((_: any, i: number) => relevant.includes(i + 1)); }
      }
    } catch { /* relevance check failed — proceed with all items */ }
  }

  if (filteredItems.length === 0) {
    conversation.push({ role: 'assistant', content: `Vault items not relevant to this task -- building from scratch...`, timestamp: Date.now() });
    ctx.refresh();
    await (require('./chatPanelBuild.js') as any).runSingleFileBuild(ctx);
    return;
  }

  const fileBase = await deriveFileBase(task, ctx.routing, ctx.usageTracker);
  const relPath = ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`;
  const absPath = path.join(root, relPath);

  const itemsBlock = filteredItems.slice(0, 5).map((item: any) =>
    `// === VAULT ITEM: ${item.name} (${item.language}) ===\n// ${item.description || 'reusable component'}\n${item.code}`
  ).join('\n\n');

  // [FIX] Changed "do not rewrite from scratch" to selective use — prevents forcing unrelated vault items in.
  const assemblyPrompt = `You are assembling a working program from existing code components.

TASK: "${task}"
TARGET FILE: ${relPath}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
VAULT COMPONENTS (use ONLY what is directly relevant to this task -- skip any that do not apply):
${itemsBlock}

INSTRUCTIONS:
- Identify which of the above components are actually useful for this specific task
- Incorporate relevant ones; write any missing parts from scratch
- Do NOT force in components that are unrelated (e.g. skip audio functions if the task is visual)
- Return a COMPLETE, runnable ${ext.slice(1)} file
- No markdown fences, no explanation -- code only`;

  conversation.push({ role: 'assistant', content: `\u{1F4E6} Assembling from ${filteredItems.length} vault item${filteredItems.length !== 1 ? 's' : ''}...`, timestamp: Date.now() });
  ctx.refresh();

  let code: string;
  try {
    const res = await routing.routeByComplexity(task, assemblyPrompt, 90_000);
    if (!res.success || !res.text.trim()) { throw new Error(res.error || 'AI returned empty response'); }
    code = extractCodeFromResponse(res.text);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    conversation[conversation.length - 1].content = `❌ Vault assembly failed: ${errMsg}`;
    ctx.refresh();
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  const snapshotId = createSnapshot(root, task, relPath);
  writeBuiltFile(absPath, code, { root, task });

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath], filteredItems.length, 0, 0, elapsed, snapshotId, 0, false);
  const previewToken = relPath.endsWith('.html') ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__` : '';
  const currentRoots = (vscode.workspace.workspaceFolders ?? []).map(f => path.resolve(f.uri.fsPath));
  const openWsToken = root && !currentRoots.includes(path.resolve(root)) ? `\n__OPEN_WORKSPACE__${root}|||END_OPEN__` : '';
  const editToken = /\.(html|css)$/i.test(relPath) && root ? `\n__EDIT_VISUALLY__${root}|||END_EDIT_VISUALLY__` : '';
  const nextSteps = buildPostBuildGuidance(root, [relPath]);
  const compileBtn = appendCompileAction(relPath);
  const componentNames = filteredItems.slice(0, 8).map((i: any) => i.name).join(', ');
  const componentLine = `\n_Components: ${componentNames}${filteredItems.length > 8 ? ` +${filteredItems.length - 8} more` : ''}_`;
  conversation[conversation.length - 1].content =
    `\u{1F4E6} **Built from Vault** (${filteredItems.length} component${filteredItems.length !== 1 ? 's' : ''} adapted)${componentLine}\n\n${resultCard}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__${openWsToken}${previewToken}${editToken}${nextSteps}${compileBtn}`;
  ctx.refresh();

  captureToVault(ctx, absPath, relPath);
  ctx.onBuildFinished?.(task, [relPath]);
  await maybeAutoCompile(ctx, task, relPath, absPath);
}
