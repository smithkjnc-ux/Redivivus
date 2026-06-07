// [SCOPE] Multi-file cloud build executor — extracted from cloudBuildClient.ts (Rule 9 split).
// Builds each file individually via the cloud API, then writes all files to disk via processBuildResults.
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
  onProgress?: (msg: string) => void,
): Promise<CloudBuildResult> {
  const allFiles: Array<{ path: string; content: string; isNew: boolean }> = [];
  const siblings = planFiles.map(f => ({ path: f.path, description: f.description }));
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModel = '';
  const slug = path.basename(root);

  // Track files built so far so each new file can see the APIs of previously built files
  const builtSoFar: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < planFiles.length; i++) {
    const file = planFiles[i];
    onProgress?.(`Building ${file.path} (${i + 1}/${planFiles.length})...`);

    try {
      // Merge pre-existing files with files built so far in this session so the Worker
      // knows the exact APIs of every sibling when writing coordinator/entry-point files.
      const contextWithBuilt = {
        ...context,
        existingFiles: [
          ...(context?.existingFiles ?? []),
          ...builtSoFar,
        ],
      };
      const body = JSON.stringify({
        task, context: contextWithBuilt, preferred,
        targetFile: { path: file.path, description: file.description, isNew: file.isNew, fileIndex: i, totalFiles: planFiles.length, siblings },
      });
      // [FIX] Use Promise.race for reliable timeout — AbortController does not abort res.json() in Electron's fetch
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
        return res.json() as Promise<{ files: typeof allFiles; model: string; inputTokens: number; outputTokens: number; requiresClientExecution?: boolean }>;
      };
      // [FIX] Tag the error as TimeoutError so the catch branch below actually matches it (it checks
      // err.name === 'TimeoutError'). Mirrors cloudBuildClient.makeTimeout.
      const buildTimeout = new Promise<never>((_, reject) => setTimeout(() => {
        const err = new Error(`Timed out on ${file.path} — try a simpler request.`);
        err.name = 'TimeoutError';
        reject(err);
      }, 120_000));
      const data = await Promise.race([buildOnce(), buildTimeout]);
      // [WARN] Multi-file does NOT run the client-side AI step that the single-file path does.
      // If the server asks for client execution here, we'd silently write nothing — fail loudly instead.
      if (data.requiresClientExecution) {
        return { success: false, error: `Multi-file build can't run client-side AI execution yet (needed for ${file.path}). Build files one at a time, or retry.`, failureSource: 'cloud' };
      }
      // [FIX] Strip project-name prefix from cloud-returned paths (e.g. "react-todo-app/src/App.js" -> "src/App.js")
      const normalised = (data.files ?? []).map(f => ({
        ...f,
        path: f.path.startsWith(slug + '/') ? f.path.slice(slug.length + 1) : f.path,
      }));
      allFiles.push(...normalised);
      // Accumulate for next file's context so it sees sibling APIs
      builtSoFar.push(...normalised.map(f => ({ path: f.path, content: f.content })));
      totalInputTokens += data.inputTokens ?? 0;
      totalOutputTokens += data.outputTokens ?? 0;
      lastModel = data.model ?? lastModel;
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return { success: false, error: `Timed out on ${file.path} — try a simpler request.`, failureSource: 'cloud' };
      return { success: false, error: e?.message ?? 'Network error', failureSource: 'cloud' };
    }
  }

  // [FIX] Safety net — never report success when nothing was actually built. Without this, an empty
  // server response (e.g. requiresClientExecution shape, or all files returning no content) produced a
  // misleading "Built 0 files" success card while writing nothing to disk.
  if (allFiles.length === 0) {
    return { success: false, error: 'Cloud build returned no files — nothing was written. Try a simpler request or build files individually.', failureSource: 'cloud' };
  }

  // [FIX] Was returning raw files without writing — processBuildResults writes to disk, records history, adds to workspace.
  const narration = `Built ${allFiles.length} files for: ${task.slice(0, 60)}${task.length > 60 ? '...' : ''}`;
  return processBuildResults(
    { files: allFiles, narration, model: lastModel, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    task, root, deps,
    { source: 'cloud' },
  );
}
