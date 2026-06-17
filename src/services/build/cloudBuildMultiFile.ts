// [SCOPE] Multi-file cloud build executor — extracted from cloudBuildClient.ts (Rule 9 split).
// Builds each file individually via the cloud API using the Supervisor prescription from /plan.
// Each Worker call receives: the prescription, previously-built sibling files, and the correct
// model tier delegated by the Supervisor. Guardian can escalate to Supervisor if Worker fails.
// [WARN] processBuildResults MUST be called here — returning raw files without writing is a silent no-op.

import * as path from 'path';
import { getApiBase } from '../api/apiClient.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import { calcCost } from '../../services/usageTracker.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { CloudBuildResult } from './cloudBuildClient.js';

export async function executeMultiFileBuild(
  task: string,
  root: string,
  context: any,
  keyHeaders: Record<string, string>,
  token: string,
  base: string,
  preferred: string,
  planFiles: Array<{ path: string; description: string; isNew: boolean }>,
  deps: BuildRequestDeps,
  prescription: any[] | null,
  supervisorModel: string | null,
  supervisorProvider: string | null,
  supervisorInputTokens: number,
  supervisorOutputTokens: number,
  onProgress?: (msg: string) => void,
  onStep?: (step: any) => void,
  onFileComplete?: (filePath: string, content: string) => void,
): Promise<CloudBuildResult> {
  const allFiles: Array<{ path: string; content: string; isNew: boolean }> = [];
  const siblings = planFiles.map(f => ({ path: f.path, description: f.description }));
  // [FIX] Worker tokens ONLY — do NOT seed with the Supervisor's. result.inputTokens/outputTokens must be
  // worker-only (matching the single-file path), with the Supervisor reported separately via the supervisor*
  // fields. Seeding here folded Supervisor tokens into the worker row, so once the card shows a Supervisor
  // row too, the planning spend was counted twice (once at Opus rate, once at the cheap worker rate).
  let workerInputTokens = 0;
  let workerOutputTokens = 0;
  let lastModel = '';
  let lastWorkerProvider = '';
  const slug = path.basename(root);

  // Track files built so far so each new file sees the APIs of previously built siblings
  const builtSoFar: Array<{ path: string; content: string }> = [];

  // [GUARDIAN] Per-file validation outcome, surfaced as the expandable detail on the Guardian step so the
  // user can SEE what the Guardian did to each file — and immediately spot any file it had to fix/split.
  const guardianLog: string[] = [];

  for (let i = 0; i < planFiles.length; i++) {
    const file = planFiles[i];
    onProgress?.(`Building ${file.path} (${i + 1}/${planFiles.length})...`);
    // [FIX] Supervisor and Worker steps are now combined. Emits a single "Building..." step
    // that updates to "Built..." when the worker finishes, reducing timeline clutter.
    const supervisorName = supervisorModel || supervisorProvider || preferred || 'supervisor';
    onStep?.({ label: `Building ${file.path}...`, model: `${supervisorName} → Worker`, status: 'running', index: i, total: planFiles.length });

    try {
      // Merge pre-existing files with files built so far in this session
      const contextWithBuilt = {
        ...context,
        existingFiles: [
          ...(context?.existingFiles ?? []),
          ...builtSoFar,
        ],
      };

      const body = JSON.stringify({
        task,
        context: contextWithBuilt,
        preferred,
        targetFile: { path: file.path, description: file.description, isNew: file.isNew, fileIndex: i, totalFiles: planFiles.length, siblings },
        prescription,
        supervisorProvider,
      });

      const buildOnce = async () => {
        const res = await fetch(`${base}/build`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...keyHeaders },
          body,
        });
        if (res.status === 401) {
          const { clearAccountToken } = await import('../api/apiClient.js');
          await clearAccountToken();
          throw Object.assign(new Error('NOT_AUTHENTICATED'), { _authError: true });
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText })) as any;
          throw Object.assign(new Error(`Failed on ${file.path}: ${err.error || res.statusText}`), { _failureSource: 'cloud' });
        }
        return res.json() as Promise<{ files: typeof allFiles; model: string; workerProvider?: string; supervisorProvider?: string; inputTokens: number; outputTokens: number; requiresClientExecution?: boolean; guardianEscInputTokens?: number; guardianEscOutputTokens?: number }>;
      };

      // [FIX] Raised from 240s → 600s. Guardian retries and Supervisor splits on oversized files (like index.html
      // generated as a flat 700-line monolith) can take up to 4 sequential AI calls, which easily exceeds 4 minutes.
      // 10 minutes gives the backend plenty of headroom before the frontend unilaterally abandons the build.
      let timeoutId: NodeJS.Timeout;
      const buildTimeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error(`Timed out on ${file.path} — try a simpler request.`);
          err.name = 'TimeoutError';
          reject(err);
        }, 600_000);
      });

      const data = await Promise.race([buildOnce(), buildTimeout]).finally(() => clearTimeout(timeoutId));

      if (data.requiresClientExecution) {
        return { success: false, error: `Multi-file build needs client-side AI execution (${file.path}). Build files one at a time, or retry.`, failureSource: 'cloud' };
      }

      // Strip project-name prefix from paths if present
      const normalised = (data.files ?? []).map(f => ({
        ...f,
        path: f.path.startsWith(slug + '/') ? f.path.slice(slug.length + 1) : f.path,
      }));
      allFiles.push(...normalised);
      builtSoFar.push(...normalised.map(f => ({ path: f.path, content: f.content })));
      workerInputTokens += data.inputTokens ?? 0;
      workerOutputTokens += data.outputTokens ?? 0;
      supervisorInputTokens += data.guardianEscInputTokens ?? 0;
      supervisorOutputTokens += data.guardianEscOutputTokens ?? 0;
      lastModel = data.model ?? lastModel;
      lastWorkerProvider = data.workerProvider ?? lastWorkerProvider;
      // Mark this file done in the Build Activity panel with the ACTUAL model returned by the backend,
      // not the preference hint. This shows gemini-2.5-flash or whatever the backend actually used.
      // [FIX] Attach the Worker's ACTUAL output as expandable `detail` (kind:'code') so the Worker row
      // SHOWS its real work — the code it wrote — the same way the Supervisor row shows its plan. Multi-file
      // builds are non-streaming JSON per file, so there's no live stream; the finished content is all we have.
      // If the Guardian split the file, normalised has 2+ entries — show a split step with all parts.
      // [GUARDIAN] Capture what the Guardian did to THIS file. The backend may return structured signals
      // (guardianSplit, guardianRetries, guardianIssues/guardianNote) — surface whatever it gives us, else
      // record a clean pass. This feeds the expandable Guardian step so a non-passing file is visible at a glance.
      const _gd = data as any;
      const _gIssues = Array.isArray(_gd.guardianIssues) ? _gd.guardianIssues.filter(Boolean)
        : (typeof _gd.guardianNote === 'string' && _gd.guardianNote.trim() ? [_gd.guardianNote.trim()] : []);
      const _gRetries = typeof _gd.guardianRetries === 'number' ? _gd.guardianRetries : 0;
      if (_gd.guardianSplit && normalised.length >= 2) {
        guardianLog.push(`⚠ ${file.path} — too large/mixed concerns → split into ${normalised.map(f => f.path).join(', ')}`);
      } else if (_gIssues.length > 0) {
        guardianLog.push(`⚠ ${file.path} — fixed: ${_gIssues.join('; ')}${_gRetries ? ` (${_gRetries} retr${_gRetries === 1 ? 'y' : 'ies'})` : ''}`);
      } else if (_gRetries > 0) {
        guardianLog.push(`⚠ ${file.path} — auto-corrected after ${_gRetries} retr${_gRetries === 1 ? 'y' : 'ies'}`);
      } else {
        guardianLog.push(`✓ ${file.path} — passed all checks`);
      }
      if (_gd.guardianSplit && normalised.length >= 2) {
        const splitDetail = normalised.map(f => `// === ${f.path} ===\n${f.content}`).join('\n\n');
        onStep?.({ label: `Guardian: split → ${normalised.map(f => f.path.split('/').pop()).join(', ')}`, model: `${supervisorName} → Guardian`, status: 'success', detail: splitDetail, kind: 'code', index: i, total: planFiles.length, updateLatest: true });
      } else {
        const workerCode = normalised.map(f => f.content).join('\n\n');
        onStep?.({ label: `Built ${file.path}`, model: `${supervisorName} → ${lastModel}`, status: 'success', detail: workerCode, kind: 'code', index: i, total: planFiles.length, updateLatest: true });
      }
      // [FIX] Emit completed file content so the chat bubble can show it for review.
      // Multi-file builds use non-streaming JSON per file, so onChunk never fires — this is the hook
      // that lets the user see the code that was written without waiting for the full build to finish.
      for (const nf of normalised) {
        onFileComplete?.(nf.path, nf.content);
      }

    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        return { success: false, error: `Timed out on ${file.path} — try a simpler request.`, failureSource: 'cloud' };
      }
      if (e?._authError) return { success: false, error: 'NOT_AUTHENTICATED' };
      return { success: false, error: e?.message ?? 'Network error', failureSource: 'cloud' };
    }
  }

  if (allFiles.length === 0) {
    return { success: false, error: 'Cloud build returned no files — nothing was written. Try a simpler request or build files individually.', failureSource: 'cloud' };
  }

  // [GUARDIAN] Emit a step that SHOWS the Guardian's work — what it checks for and the per-file result —
  // as expandable detail, the same way the Supervisor shows its plan and the Worker shows its code. The
  // Guardian runs on the backend (route.ts) AFTER each file is written and auto-retries on failure, so any
  // file it had to fix or split is flagged with ⚠ in the list below — letting the user spot a problem file
  // instantly instead of guessing why a build looks off.
  const _flagged = guardianLog.filter(l => l.startsWith('⚠')).length;
  const guardianDetail = [
    'The Guardian validates every file the Worker produced before the build completes.',
    '',
    'WHAT IT CHECKS FOR:',
    '• File size — flags oversized files and splits them into focused modules (FILE_TOO_LARGE)',
    '• ES module structure — imports/exports are valid and resolve to real sibling files (IMPORT_MISMATCH)',
    '• Element IDs — IDs referenced in JS exist in the HTML and are unique (ELEMENT_ID_MISMATCH)',
    '• Broken references — no calls to undefined functions or missing files',
    '',
    `FILES VALIDATED (${allFiles.length}):`,
    ...guardianLog.map(l => `  ${l}`),
  ].join('\n');
  const guardianLabel = _flagged > 0
    ? `Guardian: validated ${allFiles.length} files — ${_flagged} needed correction`
    : `Guardian: validated ${allFiles.length} files — all passed`;
  onStep?.({ label: guardianLabel, model: 'guardian', status: 'success', detail: guardianDetail, index: planFiles.length, total: planFiles.length });

  const narration = `Built ${allFiles.length} files for: ${task.slice(0, 60)}${task.length > 60 ? '...' : ''}`;

  const wCost = calcCost(lastWorkerProvider || lastModel, workerInputTokens, workerOutputTokens);
  const sCost = supervisorModel ? calcCost(supervisorModel, supervisorInputTokens, supervisorOutputTokens) : 0;
  const totalCostUSD = wCost + sCost;

  return processBuildResults(
    {
      files: allFiles,
      narration,
      model: lastModel,
      inputTokens: workerInputTokens,     // worker-only — Supervisor reported via supervisor* fields
      outputTokens: workerOutputTokens,
      costUSD: totalCostUSD,
      // Supervisor attribution — shows [S] Supervisor + [W] Worker in the result card
      supervisorRan: !!supervisorModel,
      supervisorModel: supervisorModel ?? undefined,
      supervisorProvider: supervisorProvider ?? undefined,
      supervisorInputTokens,
      supervisorOutputTokens,
      workerProvider: lastWorkerProvider,
    },
    task, root, deps,
    { source: 'cloud' },
  );
}
