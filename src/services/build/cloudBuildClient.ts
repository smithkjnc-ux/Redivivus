// [SCOPE] Cloud build client — thin client: gets routing instructions from backend, executes AI calls client-side, sends results back.
// Backend provides secret sauce, client handles AI API calls with user keys.
// On 5xx: falls back to runLocalBuild() using user's own AI keys directly.

import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeys, getPreferred } from '../api/apiClient.js';
import { collectBuildContext } from './buildContextCollector.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { VaultService } from '../vault/vaultService';
import { callProvider } from '../../core/ai/providers/providerFactory.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import { runLocalBuild } from './cloudBuildLocalFallback.js';

export interface CloudBuildResult {
  success: boolean
  files?: Array<{ path: string; content: string; isNew: boolean }>
  narration?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
  // Carries failure origin through the call stack so the runner can log it accurately.
  failureSource?: 'cloud' | 'local-fallback'
}

export async function callCloudBuild(
  task: string,
  root: string,
  deps: BuildRequestDeps,
  opts: { targetFile?: string; isFix?: boolean; onProgress?: (msg: string) => void } = {},
): Promise<CloudBuildResult> {
  const token = await getAccountToken();
  if (!token) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }

  const vault = (deps as any).vault as VaultService | undefined;
  const context = await collectBuildContext(root, task, vault, opts.targetFile, opts.isFix);
  const keys = collectKeys();
  const base = getApiBase();
  const preferred = getPreferred();

  // ── Step 0: Get build plan (skip for fix requests — always single-file) ──
  if (!opts.isFix && !opts.targetFile) {
    try {
      opts.onProgress?.('Planning your build...');
      const planRes = await fetch(`${base}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ task, keys, preferred, context: { blueprint: context.blueprint, existingFiles: context.existingFiles } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (planRes.ok) {
        const plan = await planRes.json() as { files: Array<{ path: string; description: string; isNew: boolean }> };
        if (plan.files && plan.files.length > 1) {
          return await executeMultiFileBuild(task, root, context, keys, token, base, preferred ?? '', plan.files, opts.onProgress);
        }
      }
    } catch { /* plan failed — fall through to single-file build */ }
  }

  try {
    // Step 1: Get routing instructions from backend (SECRET SAUCE)
    // [FIX] Removed hardcoded tier:'pro' — server determines tier from the account token.
    const requestBody = JSON.stringify({ task, context, keys, preferred });
    console.log(`[Redivivus] Build request: taskLen=${task.length}, bodyLen=${requestBody.length}, vaultItems=${context.vaultItems?.length ?? 0}, hasRules=${!!context.projectRules}`);
    const instructionRes = await fetch(`${base}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: requestBody,
      signal: AbortSignal.timeout(120_000),
    });

    if (instructionRes.status === 401) {
      const { clearAccountToken } = await import('../api/apiClient.js');
      await clearAccountToken();
      vscode.commands.executeCommand('redivivus.refreshChat');
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    if (!instructionRes.ok) {
      let errMsg = instructionRes.statusText;
      try {
        const errBody = await instructionRes.text();
        console.error(`[Redivivus] Build API ${instructionRes.status} body: ${errBody.slice(0, 500)}`);
        try { errMsg = (JSON.parse(errBody) as any).error || errMsg; } catch { errMsg = errBody.slice(0, 120) || errMsg; }
      } catch {}
      console.error(`[Redivivus] Build API failed: status=${instructionRes.status}, bodyLen=${requestBody.length}`);

      // [FIX] 5xx = server-side crash — fall back to local build using user's own AI keys.
      // 4xx = client error (bad request, auth, etc.) — don't fall back, surface the error.
      if (instructionRes.status >= 500) {
        console.log('[Redivivus] Cloud 5xx — activating local build fallback');
        return await runLocalBuild(task, root, context, deps);
      }
      return { success: false, error: errMsg, failureSource: 'cloud' };
    }

    const instructions = await instructionRes.json() as {
      instructions: {
        routing: {
          selectedProvider: string;
          fallbackProviders: string[];
          systemMessage: string;
          temperature: number;
          maxTokens: number;
          model: string;
        };
        prompt: string;
        context: any;
      };
      requiresClientExecution: boolean;
      files?: Array<{ path: string; content: string; isNew: boolean }>;
      narration?: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
    };

    if (!instructions.requiresClientExecution) {
      // [FIX] Legacy path — body already consumed by .json() above; pass parsed data directly
      return await processBuildResults(instructions as any, task, root, deps,
        { source: 'cloud', vaultItemNames: context.vaultItems?.map(v => v.name) });
    }

    // Step 2: Execute AI call client-side using backend routing instructions
    const aiResponse = await executeClientAI(instructions.instructions.routing, instructions.instructions.prompt, keys);
    if (!aiResponse.success) {
      return { success: false, error: aiResponse.error || 'AI call failed', failureSource: 'cloud' };
    }

    // Step 3: Send AI response back to backend for processing
    const completionRes = await fetch(`${base}/build/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, aiResponse: aiResponse.text, model: aiResponse.model, context: instructions.instructions.context }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!completionRes.ok) {
      if (completionRes.status === 401) {
        const { clearAccountToken } = await import('../api/apiClient.js');
        await clearAccountToken();
        vscode.commands.executeCommand('redivivus.refreshChat');
      }
      const err = await completionRes.json().catch(() => ({ error: completionRes.statusText })) as any;
      return { success: false, error: err.error || `Build completion API ${completionRes.status}`, failureSource: 'cloud' };
    }

    const data = await completionRes.json() as {
      files: Array<{ path: string; content: string; isNew: boolean }>
      narration: string; model: string; inputTokens: number; outputTokens: number;
    };

    return await processBuildResults(data, task, root, deps,
      { source: 'cloud', vaultItemNames: context.vaultItems?.map(v => v.name) });

  } catch (err: any) {
    if (err?.name === 'TimeoutError') return { success: false, error: 'Build timed out — try a simpler request.', failureSource: 'cloud' };
    return { success: false, error: err?.message ?? 'Network error', failureSource: 'cloud' };
  }
}

async function executeClientAI(
  routing: any,
  prompt: string,
  keys: Record<string, string>
): Promise<{ success: boolean; text: string; model: string; error?: string }> {
  const fetchFn = createFetchWithTimeout();
  try {
    const response = await callProvider(routing.selectedProvider, prompt, fetchFn, undefined, undefined, undefined, routing.systemMessage);
    return { success: true, text: response.text, model: response.model || routing.model };
  } catch (error: any) {
    for (const fallbackProvider of routing.fallbackProviders) {
      if (!keys[fallbackProvider]) { continue; }
      try {
        const response = await callProvider(fallbackProvider, prompt, fetchFn, undefined, undefined, undefined, routing.systemMessage);
        return { success: true, text: response.text, model: response.model || fallbackProvider };
      } catch { continue; }
    }
    return { success: false, text: '', model: '', error: error?.message || 'All AI providers failed' };
  }
}

function createFetchWithTimeout() {
  return async (url: string, options: RequestInit, timeoutMs?: number) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs || 120000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) { clearTimeout(id); throw e; }
  };
}

async function executeMultiFileBuild(
  task: string,
  root: string,
  context: any,
  keys: any,
  token: string,
  base: string,
  preferred: string,
  planFiles: Array<{ path: string; description: string; isNew: boolean }>,
  onProgress?: (msg: string) => void,
): Promise<CloudBuildResult> {
  const allFiles: Array<{ path: string; content: string; isNew: boolean }> = [];
  const siblings = planFiles.map(f => ({ path: f.path, description: f.description }));
  let totalTokens = 0;
  let lastModel = '';

  for (let i = 0; i < planFiles.length; i++) {
    const file = planFiles[i];
    onProgress?.(`Building ${file.path} (${i + 1}/${planFiles.length})...`);

    try {
      const body = JSON.stringify({
        task,
        context,
        keys,
        preferred,
        targetFile: { path: file.path, description: file.description, isNew: file.isNew, fileIndex: i, totalFiles: planFiles.length, siblings },
      });
      const res = await fetch(`${base}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(120_000),
      });

      if (res.status === 401) {
        const { clearAccountToken } = await import('../api/apiClient.js');
        await clearAccountToken();
        return { success: false, error: 'NOT_AUTHENTICATED' };
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as any;
        return { success: false, error: `Failed on ${file.path}: ${err.error || res.statusText}`, failureSource: 'cloud' };
      }

      const data = await res.json() as { files: typeof allFiles; model: string; inputTokens: number; outputTokens: number };
      allFiles.push(...(data.files ?? []));
      totalTokens += (data.inputTokens ?? 0) + (data.outputTokens ?? 0);
      lastModel = data.model ?? lastModel;
    } catch (e: any) {
      if (e?.name === 'TimeoutError') return { success: false, error: `Timed out on ${file.path} — try a simpler request.`, failureSource: 'cloud' };
      return { success: false, error: e?.message ?? 'Network error', failureSource: 'cloud' };
    }
  }

  return {
    success: true,
    files: allFiles,
    narration: `Built ${allFiles.length} files for: ${task.slice(0, 60)}${task.length > 60 ? '...' : ''}`,
    model: lastModel,
    inputTokens: Math.round(totalTokens * 0.6),
    outputTokens: Math.round(totalTokens * 0.4),
  };
}
