// [SCOPE] CHASSIS Build Pipeline — Vault assembly build
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { BuildContext } from './chatPanelBuild.js';
import { inferExtension, deriveFileBase } from './chatPanelBuildInference.js';
import { createSnapshot, writeBuiltFile, captureToVault } from './chatPanelBuildWriter.js';
import { buildResultCard } from './chatPanelStory.js';

export async function runVaultAssemblyBuild(ctx: BuildContext, vaultItems: any[]): Promise<void> {
  const { task, root, blueprintContext } = ctx;
  const buildStart = Date.now();
  const assembled = vaultItems.slice(0, 5).map(item => `// FROM VAULT: ${item.name}\n${item.code}`).join('\n\n');
  
  const where = blueprintContext.match(/Where: (.+)/)?.[1]?.toLowerCase() || '';
  const ext = inferExtension(task.toLowerCase(), where);
  const relPath = ext === '.html' ? 'index.html' : `src/${deriveFileBase(task.toLowerCase())}${ext}`;
  const absPath = path.join(root, relPath);

  const snapshotId = createSnapshot(root, task, relPath);
  writeBuiltFile(absPath, assembled);

  const elapsed = (Date.now() - buildStart) / 1000;
  const resultCard = buildResultCard([relPath], vaultItems.length, 0, 0, elapsed, snapshotId, 0, false);
  ctx.conversation.push({ role: 'assistant', content: `📦 **Built from Vault**\n\n${resultCard}\n__BUILD_RESULT__${relPath}|||${absPath}|||END__`, timestamp: Date.now() });
  ctx.refresh();
  
  captureToVault(ctx, absPath, relPath);
  ctx.onBuildFinished?.(task, [relPath]);
}
