// [SCOPE] CHASSIS Build Pipeline — Vault assembly build
// [FIX] Was raw concatenation — now uses AI to adapt and merge vault items into a working file.
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { BuildContext } from './chatPanelBuild.js';
import { inferExtension, deriveFileBase } from './chatPanelBuildInference.js';
import { createSnapshot, writeBuiltFile, captureToVault } from './chatPanelBuildWriter.js';
import { buildResultCard } from './chatPanelStory.js';
import { buildPostBuildGuidance } from './chatPanelPostBuild.js';

export async function runVaultAssemblyBuild(ctx: BuildContext, vaultItems: any[]): Promise<void> {
  const { task, root, blueprintContext, routing, conversation } = ctx;
  const buildStart = Date.now();

  const where = blueprintContext.match(/Where: (.+)/)?.[1]?.toLowerCase() || '';
  const ext = inferExtension(task.toLowerCase(), where);
  const fileBase = await deriveFileBase(task, ctx.routing);
  const relPath = ext === '.html' ? 'index.html' : `src/${fileBase}${ext}`;
  const absPath = path.join(root, relPath);

  // Format vault items for the AI — include name, description, and full code
  const itemsBlock = vaultItems.slice(0, 5).map(item =>
    `// === VAULT ITEM: ${item.name} (${item.language}) ===\n// ${item.description || 'reusable component'}\n${item.code}`
  ).join('\n\n');

  // [FIX] Use AI to adapt vault items to the specific task instead of raw concatenation.
  // Raw concat produced unrunnable code: no imports merged, no type conflicts resolved, no gaps filled.
  const assemblyPrompt = `You are assembling a working program from existing code components.

TASK: "${task}"
TARGET FILE: ${relPath}
${blueprintContext ? `PROJECT CONTEXT:\n${blueprintContext}\n` : ''}
EXISTING VAULT COMPONENTS (adapt these — do not rewrite from scratch):
${itemsBlock}

INSTRUCTIONS:
- Combine and adapt these components to implement the task
- Fix any import conflicts, type mismatches, or missing connections between components
- Fill in any gaps not covered by the vault items
- Return a COMPLETE, runnable ${ext.slice(1)} file
- No markdown fences, no explanation — code only`;

  conversation.push({ role: 'assistant', content: `&#x1F4E6; Assembling from ${vaultItems.length} vault item${vaultItems.length !== 1 ? 's' : ''}...`, timestamp: Date.now() });
  ctx.refresh();

  let code: string;
  try {
    const res = await routing.routeByComplexity(task, assemblyPrompt, 90_000);
    if (!res.success || !res.text.trim()) { throw new Error(res.error || 'AI returned empty response'); }
    code = res.text.replace(/^```[a-zA-Z]*\n?/m, '').replace(/\n?```$/m, '').trim();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    conversation[conversation.length - 1].content = `&#x274C; Vault assembly failed: ${errMsg}`;
    ctx.refresh();
    if (ctx.onBuildFailed) { ctx.onBuildFailed(task, errMsg); }
    return;
  }

  const snapshotId = createSnapshot(root, task, relPath);
  writeBuiltFile(absPath, code);

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath], vaultItems.length, 0, 0, elapsed, snapshotId, 0, false);
  const previewToken = relPath.endsWith('.html') ? `\n__PREVIEW_BROWSER__${absPath}|||END_PREVIEW_BROWSER__` : '';
  const nextSteps = buildPostBuildGuidance(root, [relPath]);
  conversation[conversation.length - 1].content =
    `&#x1F4E6; **Built from Vault** (${vaultItems.length} component${vaultItems.length !== 1 ? 's' : ''} adapted)\n\n${resultCard}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__${previewToken}${nextSteps}`;
  ctx.refresh();

  captureToVault(ctx, absPath, relPath);
  ctx.onBuildFinished?.(task, [relPath]);
}
