// [SCOPE] Process cloud build results — write files to disk, record history, signal completion.
// Extracted from cloudBuildClient.ts (200-line split, Session 11DD).

import * as fs from 'fs';
import * as path from 'path';
import { writeBuiltFile, createSnapshot, openBuiltFile } from '../../core/build/chatPanelBuildWriter.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { CloudBuildResult } from './cloudBuildClient.js';
import { appendBuildLog } from './buildLogger.js';
import type { BuildMeta } from './buildLogger.js';

export async function processBuildResults(
  data: any,
  task: string,
  root: string,
  deps: BuildRequestDeps,
  meta: BuildMeta = { source: 'cloud' },
): Promise<CloudBuildResult> {
  // Ensure .redivivus/ structure exists — always, even for single-file builds.
  // scaffoldAt is idempotent: it skips files that already exist.
  if (!fs.existsSync(path.join(root, '.redivivus', 'config.json'))) {
    try {
      const { scaffoldAt } = await import('../project/redivivusInit.js');
      const slug = path.basename(root);
      await scaffoldAt(root, slug);
    } catch { /* non-fatal */ }
  }

  const writtenPaths: string[] = [];
  // Track the "best" file to open: prefer .html, then .ts/.js, then first file.
  let primaryPath: string | undefined;

  for (const file of data.files) {
    const absPath = path.join(root, file.path);
    const snapshotId = createSnapshot(root, task, file.path);
    writeBuiltFile(absPath, file.content, { root, task });
    writtenPaths.push(absPath);
    // Pick the primary file to show — skip docs/config (md, json, toml, yaml)
    const ext = path.extname(file.path).toLowerCase();
    const isDoc = ['.md', '.json', '.yaml', '.yml', '.toml', '.txt'].includes(ext);
    if (!isDoc && (!primaryPath || ext === '.html')) { primaryPath = absPath; }
    if (snapshotId) {
      try {
        const { BuildHistoryService } = await import('../build/buildHistoryService.js');
        new BuildHistoryService(root).record({
          id: snapshotId,
          timestamp: new Date().toISOString(),
          task,
          files: [file.path],
          tokensUsed: data.outputTokens ?? 0,
          costUSD: 0,
          source: 'ai',
          supervisor: data.model,
          worker: null,
          resultCardToken: '',
        });
      } catch {}
    }
  }

  appendBuildLog(root, {
    timestamp: new Date().toISOString(),
    task,
    project: path.basename(root),
    source: meta.source,
    provider: meta.provider,
    model: data.model,
    vaultItemsUsed: meta.vaultItemNames,
    files: data.files.map((f: any) => {
      let sizeBytes = 0;
      try { sizeBytes = fs.statSync(path.join(root, f.path)).size; } catch {}
      return { path: f.path, isNew: !!f.isNew, sizeBytes };
    }),
    inputTokens: data.inputTokens ?? 0,
    outputTokens: data.outputTokens ?? 0,
    totalTokens: (data.inputTokens ?? 0) + (data.outputTokens ?? 0),
  });

  if (deps.usageTracker) {
    deps.usageTracker.recordUsage(0, 0, data.model, data.inputTokens, data.outputTokens, 'solo',
      path.basename(root));
  }

  // Open the primary built file (html > code > first). Fallback: first written path.
  const fileToOpen = primaryPath ?? writtenPaths[0];
  if (fileToOpen) { openBuiltFile(fileToOpen).catch(() => {}); }

  // Add the project folder to the workspace without reloading the window.
  // updateWorkspaceFolders is non-destructive — Explorer updates in place.
  // Workspace folder is added by the "Open Project in Explorer" button (open-workspace-btn handler),
  // not here — avoids stale header and double-panel issues from auto-adding during build.
  const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
  ChatPanel.onBuildFinished?.(task, writtenPaths, root);

  return { success: true, files: data.files, narration: data.narration, model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
}
