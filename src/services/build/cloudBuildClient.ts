// [SCOPE] Cloud build client — sends task + context to /api/v1/build, applies returned file ops locally.
// This is the only build path. No account token = no build.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeys, getPreferred } from '../api/apiClient.js';
import { collectBuildContext } from './buildContextCollector.js';
import { writeBuiltFile, createSnapshot, openBuiltFile } from '../../core/build/chatPanelBuildWriter.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { VaultService } from '../vault/vaultService';

export interface CloudBuildResult {
  success: boolean
  files?: Array<{ path: string; content: string; isNew: boolean }>
  narration?: string
  error?: string
}

export async function callCloudBuild(
  task: string,
  root: string,
  deps: BuildRequestDeps,
  opts: { targetFile?: string; isFix?: boolean } = {},
): Promise<CloudBuildResult> {
  const token = await getAccountToken();
  if (!token) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }

  const vault = (deps as any).vault as VaultService | undefined;
  const context = await collectBuildContext(root, task, vault, opts.targetFile, opts.isFix);

  const body = {
    task,
    keys: collectKeys(),
    preferred: getPreferred(),
    tier: 'pro' as const,
    context,
  };

  try {
    const res = await fetch(`${getApiBase()}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 401) return { success: false, error: 'NOT_AUTHENTICATED' };
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as any;
      return { success: false, error: err.error || `Build API ${res.status}` };
    }

    const data = await res.json() as {
      files: Array<{ path: string; content: string; isNew: boolean }>
      narration: string
      model: string
      inputTokens: number
      outputTokens: number
    };

    // Write returned files to disk
    const writtenPaths: string[] = [];
    for (const file of data.files) {
      const absPath = path.join(root, file.path);
      const snapshotId = createSnapshot(root, task, file.path);
      writeBuiltFile(absPath, file.content, { root, task });
      writtenPaths.push(absPath);
      // Open the file beside current editor
      openBuiltFile(absPath).catch(() => {});
      // Track snapshot for undo
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

    // Record usage
    if (deps.usageTracker) {
      deps.usageTracker.recordUsage(0, 0, data.model, data.inputTokens, data.outputTokens, 'solo',
        path.basename(root));
    }

    // Signal build finished (opens workspace, captures vault, etc.)
    const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
    ChatPanel.onBuildFinished?.(task, writtenPaths, root);

    return { success: true, files: data.files, narration: data.narration };
  } catch (err: any) {
    if (err?.name === 'TimeoutError') return { success: false, error: 'Build timed out — try a simpler request.' };
    return { success: false, error: err?.message ?? 'Network error' };
  }
}
