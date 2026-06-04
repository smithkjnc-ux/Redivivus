// [SCOPE] Process cloud build results — write files to disk, record history, signal completion.
// Extracted from cloudBuildClient.ts (200-line split, Session 11DD).

import * as fs from 'fs';
import * as path from 'path';
import { writeBuiltFile, createSnapshot, openBuiltFile } from '../../core/build/chatPanelBuildWriter.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { CloudBuildResult } from './cloudBuildClient.js';
import { appendBuildLog } from './buildLogger.js';
import type { BuildMeta } from './buildLogger.js';
import { autoCaptureFiles } from '../vault/vaultAutoCapture.js';

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

  // [FIX] Strip project-name prefix from AI-generated paths (e.g. "react-todo-app/src/App.js" -> "src/App.js")
  // Shared helper so write, history, log, and the returned paths all agree on the on-disk path.
  const slug = path.basename(root);
  const stripSlug = (p: string): string => p.startsWith(slug + '/') ? p.slice(slug.length + 1) : p;
  for (const file of data.files) {
    const relPath = stripSlug(file.path);
    const absPath = path.join(root, relPath);
    const snapshotId = createSnapshot(root, task, relPath);
    // [FIX] Run static validator before writing — catches AI-generated runtime bugs (const reassignment, bad transform reset, etc.)
    let content = file.content;
    try {
      const { validateCode } = await import('../code/codeValidator.js');
      const ext = path.extname(relPath).replace('.', '');
      const validation = validateCode(content, ext);
      if (validation.autoFixed) { content = validation.code; }
    } catch { /* non-fatal — write original if validator errors */ }
    writeBuiltFile(absPath, content, { root, task });
    writtenPaths.push(absPath);
    // Pick the primary file to show — skip docs/config (md, json, toml, yaml)
    const ext = path.extname(relPath).toLowerCase();
    const isDoc = ['.md', '.json', '.yaml', '.yml', '.toml', '.txt'].includes(ext);
    if (!isDoc && (!primaryPath || ext === '.html')) { primaryPath = absPath; }
    if (snapshotId) {
      try {
        const { BuildHistoryService } = await import('../build/buildHistoryService.js');
        new BuildHistoryService(root).record({
          id: snapshotId,
          timestamp: new Date().toISOString(),
          task,
          files: [relPath],
          tokensUsed: (data.inputTokens ?? 0) + (data.outputTokens ?? 0),
          costUSD: data.costUSD ?? 0,
          source: 'ai',
          // [FIX] These were inverted for two-phase builds — the worker's model was stored in the
          // supervisor field and worker was always null. Now: two-phase -> supervisor = prescriber
          // (e.g. Claude), worker = the model that wrote the code; solo -> single model in supervisor,
          // worker null (matches how the history panel renders a single-AI build).
          supervisor: meta.supervisor?.ran ? (meta.supervisor.model ?? meta.supervisor.provider ?? 'supervisor') : (data.model ?? 'unknown'),
          worker: meta.supervisor?.ran ? (data.model ?? null) : null,
          resultCardToken: '',  // [NEXT] resultCardToken is built in chatPanelBuildRunner after this returns — needs 2-phase record
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
      const rel = stripSlug(f.path);
      let sizeBytes = 0;
      try { sizeBytes = fs.statSync(path.join(root, rel)).size; } catch {}
      return { path: rel, isNew: !!f.isNew, sizeBytes };
    }),
    inputTokens: data.inputTokens ?? 0,
    outputTokens: data.outputTokens ?? 0,
    totalTokens: (data.inputTokens ?? 0) + (data.outputTokens ?? 0),
  });

  // [FIX] Record the Supervisor and Worker as SEPARATE usage rows with correct roles. This was
  // hardcoded to a single role='solo' row using the worker's model, which is exactly why the usage
  // dashboard showed "Claude (Supervisor): 0 tokens" even when Claude wrote the prescription.
  if (deps.usageTracker) {
    const sup = meta.supervisor;
    const project = path.basename(root);
    if (sup?.ran && sup.model) {
      await deps.usageTracker.recordUsage(0, 0, sup.model, sup.inputTokens, sup.outputTokens, 'supervisor', project);
    }
    const workerRole = sup?.ran ? 'worker' : 'solo';
    await deps.usageTracker.recordUsage(0, 0, data.model, data.inputTokens, data.outputTokens, workerRole, project);
  }

  // Open the primary built file (html > code > first). Fallback: first written path.
  const fileToOpen = primaryPath ?? writtenPaths[0];
  if (fileToOpen) { openBuiltFile(fileToOpen).catch(() => {}); }

  // [FIX] Fire build:finished via the event emitter instead of ChatPanel.onBuildFinished.
  // buildEvents.on() lets every listener (save-points, session recording) register independently.
  const { buildEvents } = await import('./buildEvents.js');
  await buildEvents.emit('build:finished', task, writtenPaths, root);

  // Auto-capture reusable code from built files into the vault
  const vault = (deps as any).vault;
  const routing = (deps as any).routing;
  let captureCount = 0;
  if (vault && writtenPaths.length > 0) {
    const callAI = (prompt: string) => routing.prompt(prompt, 8_000);
    const captured = await autoCaptureFiles(writtenPaths, path.basename(root), vault, task, callAI).catch(() => null);
    captureCount = captured?.newItems ?? 0;
  }

  const normalizedFiles = data.files.map((f: any) => ({ ...f, path: stripSlug(f.path) }));
  return { success: true, files: normalizedFiles, narration: data.narration, model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens, captureCount };
}
