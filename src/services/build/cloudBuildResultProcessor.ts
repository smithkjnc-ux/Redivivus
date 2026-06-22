// [SCOPE] Process cloud build results — write files to disk, record history, signal completion.
// Extracted from cloudBuildClient.ts (200-line split, Session 11DD).
// Rule 9 split: raw-text extraction → cloudBuildFileNamer.ts, docs → buildContractDocs.ts, blueprint seed → livingBlueprintService.ts

import * as fs from 'fs';
import * as path from 'path';
import { writeBuiltFile, createSnapshot } from '../../core/build/chatPanelBuildWriter.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { CloudBuildResult } from './cloudBuildClient.js';
import { appendBuildLog } from './buildLogger.js';
import type { BuildMeta } from './buildLogger.js';
import { autoCaptureFiles } from '../vault/vaultAutoCapture.js';
import { extractFilesFromRawText } from './cloudBuildFileNamer.js';
import { writeBuildContractDocs } from './buildContractDocs.js';
import { fireLivingBlueprintSeed } from '../../services/blueprint/livingBlueprintService.js';

export async function processBuildResults(
  data: any,
  task: string,
  root: string,
  deps: BuildRequestDeps,
  meta: BuildMeta & { overrideResponseText?: string; supervisor?: any; workerProvider?: string } = { source: 'cloud' },
): Promise<CloudBuildResult> {
  // [DONE] Raw text extraction moved to cloudBuildFileNamer.ts (Rule 9 split)
  if (meta.overrideResponseText && data.files.length === 0) {
    extractFilesFromRawText(data, meta.overrideResponseText);
  }
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
  const relPaths: string[] = [];
  // Track the "best" file to open: prefer .html, then .ts/.js, then first file.
  let primaryPath: string | undefined;

  // [FIX] Strip project-name prefix from AI-generated paths (e.g. "react-todo-app/src/App.js" -> "src/App.js")
  // Shared helper so write, history, log, and the returned paths all agree on the on-disk path.
  const slug = path.basename(root);
  const stripSlug = (p: string): string => p.startsWith(slug + '/') ? p.slice(slug.length + 1) : p;

  // Gather all paths first to create a single unified snapshot for the entire build
  for (const file of data.files) {
    relPaths.push(stripSlug(file.path));
  }

  // Create a single snapshot for all files in this build BEFORE writing any new content
  const snapshotId = relPaths.length > 0 ? createSnapshot(root, task, relPaths as any) : undefined;

  const newRelPaths: string[] = [];
  for (const file of data.files) {
    const relPath = stripSlug(file.path);
    const absPath = path.join(root, relPath);
    const isNew = !fs.existsSync(absPath);
    // [FIX] Run static validator before writing — catches AI-generated runtime bugs (const reassignment, bad transform reset, etc.)
    let content = file.content;
    try {
      const { validateCode } = await import('../code/codeValidator.js');
      const ext = path.extname(relPath).replace('.', '');
      const validation = validateCode(content, ext);
      if (validation.autoFixed) { content = validation.code; }
    } catch { /* non-fatal — write original if validator errors */ }
    writeBuiltFile(absPath, content, { root, task, skipInitialSnapshot: true });
    if (isNew) newRelPaths.push(relPath);
    writtenPaths.push(absPath);
    // Pick the primary file to show — skip docs/config (md, json, toml, yaml)
    const ext = path.extname(relPath).toLowerCase();
    const isDoc = ['.md', '.json', '.yaml', '.yml', '.toml', '.txt'].includes(ext);
    if (!isDoc && (!primaryPath || ext === '.html')) { primaryPath = absPath; }
  }

  // [SCAFFOLD-DOCTOR] A freshly-built Prisma project whose schema uses env("DATABASE_URL") with no working
  // .env is broken out of the box (migrate/test/run fail on the missing var). Make it runnable immediately:
  // hardcode the SQLite url, or drop a .env placeholder for other providers. Idempotent + best-effort.
  try {
    const { ensureDatabaseUrl } = await import('./migrationsGuard.js');
    ensureDatabaseUrl(root);
  } catch { /* best-effort — never block a build */ }

  if (newRelPaths.length > 0) {
    try {
      const { SnapshotService } = await import('../../services/snapshotService.js');
      new SnapshotService(root).captureInitial(`First build: ${task.slice(0, 60)}`, newRelPaths);
    } catch {}
  }

  // Record a single history entry containing all files for this build
  if (snapshotId && relPaths.length > 0) {
    try {
      const { BuildHistoryService } = await import('../build/buildHistoryService.js');
      new BuildHistoryService(root).record({
        id: snapshotId,
        timestamp: new Date().toISOString(),
        task,
        files: relPaths,
        tokensUsed: (data.inputTokens ?? 0) + (data.outputTokens ?? 0) + (data.supervisorInputTokens ?? 0) + (data.supervisorOutputTokens ?? 0),
        costUSD: data.costUSD ?? 0,
        source: 'ai',
        supervisor: data.supervisorRan ? (data.supervisorModel ?? data.supervisorProvider ?? 'supervisor') : (meta.supervisor?.ran ? (meta.supervisor.model ?? meta.supervisor.provider ?? 'supervisor') : (data.model ?? 'unknown')),
        worker: data.supervisorRan ? (data.model ?? null) : (meta.supervisor?.ran ? (data.model ?? null) : null),
        resultCardToken: '',  // [NEXT] resultCardToken is built in chatPanelBuildRunner after this returns — needs 2-phase record
      });
    } catch {}
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

  // [DEAD] Removed auto-opening the built file in the editor. Dropping raw HTML/source into a tab
  // confuses non-technical users — the Preview tab already renders the result visually, and the file is
  // one click away in the Project Files tree. Was: `if (fileToOpen) openBuiltFile(fileToOpen)`.
  // [NEXT] If a "real need" emerges (e.g. a code-only project with no preview), gate re-opening behind
  // a setting or open only when no previewable HTML exists.
  void primaryPath; // keep primaryPath computed (used above for history/log selection)

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

  // [DONE] BUILD CONTRACT docs moved to buildContractDocs.ts (Rule 9 split)
  writeBuildContractDocs(root, data.narration, deps, writtenPaths);

  // [DONE] Living Blueprint seed moved to livingBlueprintService.ts (Rule 9 split)
  fireLivingBlueprintSeed(root, data.model, deps, routing, task, writtenPaths);

  const normalizedFiles = data.files.map((f: any) => ({ ...f, path: stripSlug(f.path) }));
  // [FIX] Carry two-phase attribution + cost through. The MULTI-FILE path (cloudBuildMultiFile) returns
  // this result directly, so any supervisor/worker/cost field NOT echoed here is silently dropped — that
  // is why multi-file builds showed a solo "primary builder" with no Supervisor row and an understated
  // total (the Opus/Sonnet planning spend vanished). The single-file path adds these after the call, so it
  // was unaffected. Echo them when present; undefined for single-file is harmless (it overwrites after).
  return {
    success: true, files: normalizedFiles, narration: data.narration, model: data.model,
    inputTokens: data.inputTokens, outputTokens: data.outputTokens, captureCount,
    supervisorRan: data.supervisorRan, supervisorModel: data.supervisorModel,
    supervisorProvider: data.supervisorProvider, supervisorInputTokens: data.supervisorInputTokens,
    supervisorOutputTokens: data.supervisorOutputTokens, workerProvider: data.workerProvider,
  };
}
