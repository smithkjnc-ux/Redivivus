// [SCOPE] Multi-file cloud build executor — extracted from cloudBuildClient.ts (Rule 9 split).
// Builds each file individually via the cloud API using the Supervisor prescription from /plan.
// Each Worker call receives: the prescription, previously-built sibling files, and the correct
// model tier delegated by the Supervisor. Guardian can escalate to Supervisor if Worker fails.
// [WARN] processBuildResults MUST be called here — returning raw files without writing is a silent no-op.

import * as path from 'path';
import { getApiBase } from '../../../features/api/data/apiClient.js';
import type { BuildRequestDeps } from '../../../features/ai/logic/chatPanelIntent.js';
import type { CloudBuildResult } from './cloudBuildTypes.js';
import { buildSingleFileViaBuildEndpoint, finalizeMultiFileBuild, logGuardianStep } from './cloudBuildMultiFileHelpers.js';
import { looksLikeQuotaError } from '../../../features/ai/data/providerTierState.js';
import { recordUnavailable } from '../../../features/ai/data/providerQuotaTracker.js';
import { AI_RANK } from '../../../features/ai/data/guardianAI.js';

import { nextAvailableProvider, filterKeyHeaders } from './cloudBuildProviderFallback.js';

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
  onCode?: (text: string) => void,
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

      // [FIX] Exclude unavailable providers (e.g. Claude out of credits) from keyHeaders so the
      // server cannot pick them — server ignores `preferred` and chooses from available keys.
      const activeKeyHeaders = filterKeyHeaders(keyHeaders);
      const body = JSON.stringify({
        task,
        context: contextWithBuilt,
        preferred,
        targetFile: { path: file.path, description: file.description, isNew: file.isNew, fileIndex: i, totalFiles: planFiles.length, siblings },
        prescription,
        supervisorProvider,
      });

      // [DONE] buildOnce moved to cloudBuildMultiFileHelpers.ts as buildSingleFileViaBuildEndpoint (Rule 9 split)
      const buildOnce = () => buildSingleFileViaBuildEndpoint(base, token, activeKeyHeaders, body, file.path, onStep, onCode);

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
      logGuardianStep(data, file, normalised, guardianLog, onStep, supervisorName, planFiles.length, i, lastModel);
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
      const errMsg = e?.message ?? 'Network error';
      // [PROVIDER-FALLBACK] If this file failed due to credit/quota error, detect which provider
      // actually failed (from the error text), mark it unavailable, and retry with filtered keys.
      if (looksLikeQuotaError(errMsg)) {
        // Identify the failed provider by scanning error text for known provider names
        const _failedProvider = ['claude', 'anthropic'].some(k => errMsg.toLowerCase().includes(k)) ? 'claude'
          : ['openai', 'gpt'].some(k => errMsg.toLowerCase().includes(k)) ? 'openai'
          : ['gemini', 'google'].some(k => errMsg.toLowerCase().includes(k)) ? 'gemini'
          : preferred;
        recordUnavailable(_failedProvider, errMsg.slice(0, 200));
        const fallback = nextAvailableProvider(_failedProvider, keyHeaders);
        if (fallback) {
          try {
            onStep?.({ label: `${_failedProvider} unavailable — retrying ${file.path} with ${fallback}`, model: fallback, status: 'running', index: i, total: planFiles.length, updateLatest: true });
            const retryKeyHeaders = filterKeyHeaders(keyHeaders); // exclude failed provider
            const retryBody = JSON.stringify({ task, context: { ...context, existingFiles: [...(context?.existingFiles ?? []), ...builtSoFar] }, preferred: fallback, targetFile: { path: file.path, description: file.description, isNew: file.isNew, fileIndex: i, totalFiles: planFiles.length, siblings }, prescription, supervisorProvider });
            const retryData = await buildSingleFileViaBuildEndpoint(base, token, retryKeyHeaders, retryBody, file.path, onStep, onCode);
            const normalised = (retryData.files ?? []).map(f => ({ ...f, path: f.path.startsWith(slug + '/') ? f.path.slice(slug.length + 1) : f.path }));
            allFiles.push(...normalised);
            builtSoFar.push(...normalised.map(f => ({ path: f.path, content: f.content })));
            workerInputTokens += retryData.inputTokens ?? 0;
            workerOutputTokens += retryData.outputTokens ?? 0;
            lastModel = retryData.model ?? lastModel;
            lastWorkerProvider = retryData.workerProvider ?? lastWorkerProvider;
            onStep?.({ label: `Built ${file.path} (via ${fallback})`, model: fallback, status: 'success', detail: normalised.map(f => f.content).join('\n\n'), kind: 'code', index: i, total: planFiles.length, updateLatest: true });
            for (const nf of normalised) { onFileComplete?.(nf.path, nf.content); }
            preferred = fallback; // use fallback for remaining files too
            keyHeaders = retryKeyHeaders; // keep failed provider excluded for remaining files
            continue;
          } catch (retryErr: any) {
            return { success: false, error: retryErr?.message ?? 'Fallback provider also failed', failureSource: 'cloud' };
          }
        }
      }
      return { success: false, error: errMsg, failureSource: 'cloud' };
    }
  }

  if (allFiles.length === 0) {
    return { success: false, error: 'Cloud build returned no files — nothing was written. Try a simpler request or build files individually.', failureSource: 'cloud' };
  }

  // [DONE] Guardian step emission + result assembly moved to cloudBuildMultiFileHelpers.ts (Rule 9 split)
  return finalizeMultiFileBuild(allFiles, guardianLog, planFiles.length, task, root, deps, supervisorModel, supervisorProvider, supervisorInputTokens, supervisorOutputTokens, workerInputTokens, workerOutputTokens, lastModel, lastWorkerProvider, onStep);
}
