// [SCOPE] Cloud build client — thin client: gets routing instructions from backend, executes AI calls client-side, sends results back.
// Backend provides secret sauce, client handles AI API calls with user keys.
// On error: surfaces a clean message — no local fallback (cloud is required for quality builds).

import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeys, getPreferred } from '../api/apiClient.js';
import { collectBuildContext, budgetContext } from './buildContextCollector.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { VaultService } from '../vault/vaultService';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import { executeMultiFileBuild } from './cloudBuildMultiFile.js';
import { runTwoPhaseBuild } from './cloudBuildClientAI.js';

export interface CloudBuildResult {
  success: boolean
  files?: Array<{ path: string; content: string; isNew: boolean }>
  narration?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  error?: string
  captureCount?: number   // vault items saved after this build
  failureSource?: 'cloud' | 'local-fallback'
  // Two-phase attribution — lets the byline/dashboard show the Supervisor (e.g. Claude) truthfully.
  supervisorRan?: boolean
  supervisorModel?: string
  supervisorProvider?: string
  supervisorInputTokens?: number
  supervisorOutputTokens?: number
  supervisorError?: string
  workerProvider?: string
}

// [WARN] AbortSignal.timeout() does not reliably abort in Electron's fetch — use Promise.race instead.
function makeTimeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => {
    const err = new Error(`${label} timed out — try a simpler request.`);
    err.name = 'TimeoutError'; // must match catch check: err?.name === 'TimeoutError'
    reject(err);
  }, ms));
}

export async function callCloudBuild(
  task: string,
  root: string,
  deps: BuildRequestDeps,
  opts: { targetFile?: string; isFix?: boolean; onProgress?: (msg: string) => void; onChunk?: (chunk: string) => void } = {},
): Promise<CloudBuildResult> {
  const token = await getAccountToken();
  if (!token) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }

  const vault = (deps as any).vault as VaultService | undefined;
  const context = await collectBuildContext(root, task, vault, opts.targetFile, opts.isFix, deps.conversation);
  const keys = collectKeys();
  const base = getApiBase();
  const preferred = getPreferred();

  // [FIX] Token-budget the context packet to the chosen model before sending — converts silent
  // context overflow into a bounded packet plus a visible "trimmed to fit" signal. (Unknown model
  // falls back to a conservative window, so trimming only kicks in when context is genuinely large.)
  const { dropped, trimmed } = budgetContext(context, preferred ?? '');
  if (dropped.length || trimmed.length) {
    opts.onProgress?.(`Context trimmed to fit ${preferred || 'model'} window -- dropped: ${dropped.join(', ') || 'none'}, trimmed: ${trimmed.join(', ') || 'none'}`);
  }

  // ── Step 0: Get build plan (skip for fix requests — always single-file) ──
  if (!opts.isFix && !opts.targetFile) {
    try {
      opts.onProgress?.('Planning your build...');
      const planBody = JSON.stringify({ task, keys, preferred, context: { blueprint: context.blueprint, existingFiles: context.existingFiles } });
      // [FIX] Promise.race instead of AbortSignal.timeout — AbortSignal.timeout unreliable in Electron
      const planRes = await Promise.race([
        fetch(`${base}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: planBody }),
        makeTimeout(30_000, 'Plan'),
      ]);
      if (planRes.ok) {
        const plan = await planRes.json() as { files: Array<{ path: string; description: string; isNew: boolean }> };
        if (plan.files && plan.files.length > 1) {
          return await executeMultiFileBuild(task, root, context, keys, token, base, preferred ?? '', plan.files, deps, opts.onProgress);
        }
      }
    } catch { /* plan failed — fall through to single-file build */ }
  }

  opts.onProgress?.('Building your project...');

  try {
    // Step 1: Get routing instructions from backend (SECRET SAUCE)
    // [FIX] Send workerModel = preferred so the server uses the user's chosen AI for the Worker role,
    // not a cheaper fallback. Without this the server was using GPT-4o as Worker even when Claude
    // was selected, producing incomplete output while Supervisor/Guardian ran on Claude.
    const requestBody = JSON.stringify({ task, context, keys, preferred, workerModel: preferred });
    console.log(`[Redivivus] Build request: taskLen=${task.length}, bodyLen=${requestBody.length}, vaultItems=${context.vaultItems?.length ?? 0}, hasRules=${!!context.projectRules}`);
    // [FIX] Promise.race instead of AbortSignal.timeout — AbortSignal.timeout unreliable in Electron
    const instructionRes = await Promise.race([
      fetch(`${base}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: requestBody }),
      makeTimeout(240_000, 'Build instruction'),
    ]);

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

      if (instructionRes.status >= 500) {
        return { success: false, error: 'Redivivus is temporarily unavailable — please try again in a moment.', failureSource: 'cloud' };
      }
      return { success: false, error: errMsg, failureSource: 'cloud' };
    }

    const instructions = await instructionRes.json() as {
      supervisorInstructions: {
        selectedProvider: string; model: string; prompt: string; systemMessage: string; maxTokens: number;
      } | null;
      workerInstructions: {
        selectedProvider: string; fallbackProviders: string[]; model: string; promptTemplate: string;
        systemMessage: string; maxTokens: number; temperature: number;
      };
      context: any;
      requiresClientExecution: boolean;
    };

    // Step 2: Two-phase execution — supervisor writes prescription, worker builds from it.
    // [FIX] Capture the Supervisor outcome (model, tokens, success/error) so it can be attributed
    // downstream. Previously this block ran the Supervisor but threw its identity and tokens away,
    // so Claude always showed 0 tokens and the byline always said "solo / primary builder".
    const { aiResponse, supervisor } = await runTwoPhaseBuild(instructions, keys, opts.onProgress, opts.onChunk);
    if (!aiResponse.success) {
      return { success: false, error: aiResponse.error || 'AI call failed', failureSource: 'cloud' };
    }

    // Step 3: Send AI response back to backend for processing
    // [FIX] Promise.race instead of AbortSignal.timeout — AbortSignal.timeout unreliable in Electron
    const completionRes = await Promise.race([
      fetch(`${base}/build/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ task, aiResponse: aiResponse.text, model: aiResponse.model, context: instructions.context }) }),
      makeTimeout(120_000, 'Build completion'),
    ]);

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

    const built = await processBuildResults(data, task, root, deps, {
      source: 'cloud',
      vaultItemNames: context.vaultItems?.map(v => v.name),
      supervisor,
      workerProvider: instructions.workerInstructions.selectedProvider,
    });
    // Attach two-phase attribution so the build runner can render an honest Supervisor + Worker byline.
    return {
      ...built,
      supervisorRan: supervisor.ran,
      supervisorModel: supervisor.model,
      supervisorProvider: supervisor.provider,
      supervisorInputTokens: supervisor.inputTokens,
      supervisorOutputTokens: supervisor.outputTokens,
      supervisorError: supervisor.error,
      workerProvider: instructions.workerInstructions.selectedProvider,
    };

  } catch (err: any) {
    if (err?.name === 'TimeoutError') return { success: false, error: 'Build timed out — the AI is taking longer than expected. Please try again.', failureSource: 'cloud' };
    return { success: false, error: err?.message ?? 'Network error', failureSource: 'cloud' };
  }
}

// [DEAD] executeMultiFileBuild moved to cloudBuildMultiFile.ts (Rule 9 split + bug fix: was returning files without writing to disk)
// [DEAD] executeClientAI and createFetchWithTimeout moved to cloudBuildClientAI.ts (Rule 9 split)
