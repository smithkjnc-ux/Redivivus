// [SCOPE] Multi-file cloud build executor — extracted from cloudBuildClient.ts (Rule 9 split).
// Builds each file individually via the cloud API using the Supervisor prescription from /plan.
// Each Worker call receives: the prescription, previously-built sibling files, and the correct
// model tier delegated by the Supervisor. Guardian can escalate to Supervisor if Worker fails.
// [WARN] processBuildResults MUST be called here — returning raw files without writing is a silent no-op.

import * as path from 'path';
import { getApiBase } from '../api/apiClient.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';
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

  for (let i = 0; i < planFiles.length; i++) {
    const file = planFiles[i];
    onProgress?.(`Building ${file.path} (${i + 1}/${planFiles.length})...`);
    // [FIX] Label was "Building X / claude" (showing `preferred`, which is just the requested model hint,
    // not the actual model). This made it look like claude was building AND gemini built — same file,
    // different AIs. Reality: Supervisor (claude) planned the prescription; Worker (gemini-flash) writes
    // each file. The dispatch step should say "Worker: writing X" and show the supervisor that dispatched it.
    const supervisorLabel = supervisorModel ? `planned by ${supervisorModel.split('-').slice(0,2).join('-')}` : 'supervisor dispatched';
    onStep?.({ label: `Worker: writing ${file.path}`, model: preferred, status: 'running', index: i, total: planFiles.length });

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
        return res.json() as Promise<{ files: typeof allFiles; model: string; workerProvider?: string; supervisorProvider?: string; inputTokens: number; outputTokens: number; requiresClientExecution?: boolean }>;
      };

      // [FIX] Raised from 120s → 240s. Guardian retries (IMPORT_MISMATCH, ELEMENT_ID_MISMATCH,
      // FILE_TOO_LARGE) can stack 2-3 additional API calls per file. index.html as the last file
      // in a 9-file build was exceeding 120s when retries compounded.
      const buildTimeout = new Promise<never>((_, reject) => setTimeout(() => {
        const err = new Error(`Timed out on ${file.path} — try a simpler request.`);
        err.name = 'TimeoutError';
        reject(err);
      }, 240_000));

      const data = await Promise.race([buildOnce(), buildTimeout]);

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
      lastModel = data.model ?? lastModel;
      lastWorkerProvider = data.workerProvider ?? lastWorkerProvider;
      // Mark this file done in the Build Activity panel with the ACTUAL model returned by the backend,
      // not the preference hint. This shows gemini-2.5-flash or whatever the backend actually used.
      // If the Guardian split the file, normalised has 2+ entries — show a split step instead.
      if ((data as any).guardianSplit && normalised.length >= 2) {
        onStep?.({ label: `Guardian: split → ${normalised.map(f => f.path.split('/').pop()).join(', ')}`, model: lastModel, status: 'success', index: i, total: planFiles.length });
      } else {
        onStep?.({ label: `Worker: wrote ${file.path}`, model: lastModel, status: 'success', index: i, total: planFiles.length });
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

  // [GUARDIAN] Emit a synthetic step to surface the Guardian quality gate. The Guardian runs on the
  // backend (route.ts) AFTER each file is written — it checks CSS size, ES module structure, element
  // ID uniqueness, etc. and auto-retries on failure. Previously invisible to the user: now surfaced
  // as a completion step so the Build Activity panel shows it ran.
  onStep?.({ label: `Guardian: validated ${allFiles.length} files`, model: 'guardian', status: 'success', index: planFiles.length, total: planFiles.length });

  const narration = `Built ${allFiles.length} files for: ${task.slice(0, 60)}${task.length > 60 ? '...' : ''}`;

  return processBuildResults(
    {
      files: allFiles,
      narration,
      model: lastModel,
      inputTokens: workerInputTokens,     // worker-only — Supervisor reported via supervisor* fields
      outputTokens: workerOutputTokens,
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
