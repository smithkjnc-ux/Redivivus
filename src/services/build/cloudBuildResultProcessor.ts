// [SCOPE] Process cloud build results — write files to disk, record history, signal completion.
// Extracted from cloudBuildClient.ts (200-line split, Session 11DD).

import * as fs from 'fs';
import * as path from 'path';
import { writeBuiltFile, createSnapshot } from '../../core/build/chatPanelBuildWriter.js';
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
  meta: BuildMeta & { overrideResponseText?: string; supervisor?: any; workerProvider?: string } = { source: 'cloud' },
): Promise<CloudBuildResult> {
  // If the cloud streamed the raw text back, we must extract the files locally
  if (meta.overrideResponseText && data.files.length === 0) {
    // [FIX] Enhanced extraction — AIs use many formats for naming files in code blocks:
    //   1. ```html path: index.html        (rare)
    //   2. ```html:index.html              (Claude-style)
    //   3. ### index.html  ...  ```html    (header before fence)
    //   4. **index.html**  ...  ```html    (bold before fence)
    //   5. ```html filename="index.html"   (attribute-style)
    //   6. ```html                         (no filename — infer from language)
    const rawText = meta.overrideResponseText;
    const fenceRe = /```(\w+)?(?::([^\s`]+))?\s*(?:path:\s*([^\n]+?)\s*\n|filename="([^"]+)"\s*\n)?\n?([\s\S]*?)```/g;
    // Pre-scan for header-style filenames: look for ### filename or **filename** within 3 lines before a fence
    const headerMap = new Map<number, string>();
    const headerRe = /(?:^|\n)(?:#{1,4}\s+|(?:\*\*))([^\n*]+?)(?:\*\*)?[ \t]*\n(?:[ \t]*\n)?```/g;
    let hm;
    while ((hm = headerRe.exec(rawText)) !== null) {
      const fenceStart = rawText.indexOf('```', hm.index + hm[0].indexOf('\n'));
      if (fenceStart >= 0) { headerMap.set(fenceStart, hm[1].trim().replace(/^`|`$/g, '')); }
    }

    let match;
    const extMap: Record<string, string> = { javascript: 'js', typescript: 'ts', html: 'html', css: 'css', python: 'py', json: 'json', jsx: 'jsx', tsx: 'tsx', go: 'go', rust: 'rs', java: 'java', ruby: 'rb', shell: 'sh', bash: 'sh', sh: 'sh' };

    // [FIX] Two-pass so the single-file fallback recovers REAL filenames instead of file1.js/file2.js
    // (which break wiring — index.html references board.js but the block was saved as file2.js).
    // Pass 1: collect blocks + their explicit path (if any). Pass 2: infer names for the unnamed ones
    // from a first-line filename comment, then from the HTML's <script src>/<link href> refs by extension.
    const { extractHtmlAssetRefs, filenameFromFirstLine, nextRefForExt } = require('./cloudBuildFileNamer.js');
    interface Blk { language?: string; content: string; explicit: string; ext: string; }
    const blocks: Blk[] = [];
    while ((match = fenceRe.exec(rawText)) !== null) {
      const [, language, colonPath, inlinePath, attrPath, content] = match;
      if (!content?.trim()) { continue; }
      const explicit = inlinePath?.trim() || colonPath?.trim() || attrPath?.trim() || headerMap.get(match.index) || '';
      const ext = language ? (extMap[language.toLowerCase()] || language.toLowerCase()) : '';
      blocks.push({ language, content: content.trim(), explicit, ext });
    }

    // Gather asset references from any HTML block so unnamed js/css blocks can claim their real names.
    const htmlRefs: string[] = [];
    for (const b of blocks) {
      if (b.ext === 'html' || /^\s*<!doctype html|<html[\s>]/i.test(b.content)) {
        htmlRefs.push(...extractHtmlAssetRefs(b.content));
      }
    }
    const usedRefs = new Set<string>();
    const usedPaths = new Set<string>();
    let fileIndex = 0;
    for (const b of blocks) {
      let filePath = b.explicit || filenameFromFirstLine(b.content) || '';
      if (!filePath && b.ext && b.ext !== 'html') { filePath = nextRefForExt(htmlRefs, usedRefs, b.ext) || ''; }
      if (!filePath && b.ext === 'html') { filePath = 'index.html'; }
      if (!filePath && b.ext) { filePath = fileIndex === 0 ? `index.${b.ext}` : `file${fileIndex}.${b.ext}`; }
      if (!filePath) { filePath = fileIndex === 0 ? 'index.html' : `file${fileIndex}.txt`; }
      // Avoid collisions if inference produced a duplicate.
      if (usedPaths.has(filePath)) { const dot = filePath.lastIndexOf('.'); filePath = dot > 0 ? `${filePath.slice(0, dot)}-${fileIndex}${filePath.slice(dot)}` : `${filePath}-${fileIndex}`; }
      usedPaths.add(filePath);
      data.files.push({ path: filePath, content: b.content, isNew: true });
      fileIndex++;
    }
    // [FIX] blocks=0 means the worker produced output with NO code fences — DON'T leave the skeleton
    // files empty (blank preview, "Built 0 files"). Surface a streamed error, or recover raw code.
    if (data.files.length === 0 && rawText.trim()) {
      const errM = rawText.match(/\[ERROR:\s*([^\]]+)\]/);
      // Log what the worker actually sent so a no-fence failure can be diagnosed next time.
      try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] NO-FENCE worker output (first 500): ${rawText.trim().slice(0,500).replace(/\n/g,' ')}\n`); } catch {}
      if (errM) { throw new Error(`Build worker error: ${errM[1].trim()}`); }
      // The worker often OPENS a ```lang(:path) fence but never closes it (truncation), so the fence
      // regex matched nothing. Strip a leading fence line + any trailing ``` so the markers don't end
      // up rendered in the page (the "```html:tetris.html" text on screen + quirks mode).
      const t = rawText.trim()
        .replace(/^```[\w-]*(?::[^\n]*)?[ \t]*\n?/, '')
        .replace(/\n?```[ \t]*$/, '')
        .trim();
      // If it looks like a web doc / code, save it as index.html so something runs instead of nothing.
      if (/<!doctype html|<html[\s>]/i.test(t) || (/[<{]/.test(t) && t.length > 80)) {
        data.files.push({ path: 'index.html', content: t, isNew: true });
      }
    }
    // [trace] Final parsed filenames from the single-file fallback — shows whether the safety net
    // recovered real names (board.js…) or still fell back to file{N}. htmlRefs lists what the HTML expects.
    try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] single-file parse: blocks=${blocks.length} htmlRefs=[${htmlRefs.join(', ')}] -> files=[${data.files.map((f: any) => f.path).join(', ')}]\n`); } catch {}
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

  // [BUILD CONTRACT pillar 3] Record docs IN the scaffold — a deterministic docs/ARCHITECTURE.md built from each
  // file's [SCOPE] line (no AI call, free). This fills docs/ with a real file map so the folder is never an empty
  // shell, and gives a human a one-glance map of the project. Best-effort; never affects the build outcome.
  if (writtenPaths.length > 0) {
    try {
      const fs = require('fs');
      const codeFiles = writtenPaths.filter((p: string) => /\.(js|ts|jsx|tsx|css|html?|py|json)$/i.test(p));
      const lines = codeFiles.map((p: string) => {
        const rel = path.relative(root, p).replace(/\\/g, '/');
        let scope = '';
        try { const m = fs.readFileSync(p, 'utf-8').match(/\[SCOPE\]\s*(.+)/); scope = m ? m[1].replace(/\s*(-->|\*\/)\s*$/, '').trim() : ''; } catch { /* unreadable */ }
        return `- \`${rel}\`${scope ? ' — ' + scope : ''}`;
      });
      if (lines.length > 0) {
        const what = (deps as any).redivivus?.loadConfig?.()?.blueprint?.what || '';
        const md = `# Architecture — ${path.basename(root)}\n\n> Auto-generated by Redivivus from each file's [SCOPE]. Regenerated on every build.\n\n${what ? `**What:** ${what}\n\n` : ''}## Files\n${lines.join('\n')}\n`;
        fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'), md, 'utf-8');
      }
    } catch { /* docs generation is best-effort */ }
  }

  // [LIVING BLUEPRINT Phase 1] Seed the behavioral contract from this build (once) and log it as a revision. The
  // first build distills a full contract; later rebuilds just append a 'build' revision (no AI call). The fix path
  // keeps the contract current afterward. Fire-and-forget. See docs/REDIVIVUS_LIVING_BLUEPRINT.md.
  if (writtenPaths.length > 0 && routing && (deps as any).redivivus) {
    (async () => {
      try {
        const lb = await import('../blueprint/livingBlueprintService.js');
        const relFiles = writtenPaths.map(p => path.relative(root, p).replace(/\\/g, '/'));
        // [LIVING BLUEPRINT] Record the USER's prompt, not the engineered build instruction. The build pipeline
        // appends a blueprint/contract block to the task; keep only the human request (before the first blank line
        // or "Project Blueprint:"/"SUPERVISOR" marker) so REQUEST HISTORY shows what the user actually asked.
        const userPrompt = String(task).replace(/^Build:\s*/, '').split(/\n\s*\n|\n\s*Project Blueprint:|\n\s*SUPERVISOR/)[0].trim().slice(0, 400);
        if (!lb.getMechanics(deps)) {
          const { distillBuildMechanics } = await import('../blueprint/livingBlueprintDistill.js');
          // [BUILD CONTRACT] Distillation was silent fire-and-forget — when the AI call returned null the blueprint
          // stayed hollow and nobody knew (every flappy build had NO mechanics). Now: log the attempt, RETRY once,
          // and log success/failure so it is verifiable and a hollow blueprint becomes a visible failure.
          console.log(`[LIVING BLUEPRINT] Distilling mechanics contract from build (${relFiles.length} files)...`);
          let mech = await distillBuildMechanics(routing, task, relFiles);
          if (!mech) {
            console.warn('[LIVING BLUEPRINT] Distillation returned no mechanics — retrying once.');
            mech = await distillBuildMechanics(routing, task, relFiles);
          }
          if (mech) {
            lb.setMechanics(deps, mech);
            lb.appendRevision(root, { rev: lb.nextRev(root), ts: new Date().toISOString(), kind: 'build', request: userPrompt, summary: 'Initial build — behavioral contract seeded.', files: relFiles, by: data.model || 'AI' });
            console.log(`[LIVING BLUEPRINT] Mechanics contract seeded (${mech.length} chars) -> config.json + blueprint.md`);
          } else {
            console.warn(`[LIVING BLUEPRINT] FAILED to distill mechanics after retry — blueprint left WITHOUT a behavioral contract for: "${userPrompt.slice(0, 80)}"`);
          }
        } else {
          lb.appendRevision(root, { rev: lb.nextRev(root), ts: new Date().toISOString(), kind: 'build', request: userPrompt, summary: 'Rebuild / additional build.', files: relFiles, by: data.model || 'AI' });
        }
      } catch (e) { console.warn('[LIVING BLUEPRINT] Mechanics seeding error (build unaffected):', e instanceof Error ? e.message : String(e)); }
    })();
  }

  const normalizedFiles = data.files.map((f: any) => ({ ...f, path: stripSlug(f.path) }));
  return { success: true, files: normalizedFiles, narration: data.narration, model: data.model, inputTokens: data.inputTokens, outputTokens: data.outputTokens, captureCount };
}
