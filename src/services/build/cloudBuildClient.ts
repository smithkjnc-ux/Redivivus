// [SCOPE] Cloud build client — thin client: gets routing instructions from backend, executes AI calls client-side, sends results back.
// Backend provides secret sauce, client handles AI API calls with user keys.
// On error: surfaces a clean message — no local fallback (cloud is required for quality builds).

import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeys, collectKeyHeaders, getPreferred } from '../api/apiClient.js';
import { collectBuildContext, budgetContext } from './buildContextCollector.js';
import type { BuildRequestDeps } from '../../core/ai/chatPanelIntent';
import type { VaultService } from '../vault/vaultService';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import { executeMultiFileBuild } from './cloudBuildMultiFile.js';

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
  // Smart model-switching: why this model was chosen (strategy + difficulty + tier).
  modelRationale?: string
  modelStrategy?: string
  modelTier?: string
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
  const keyHeaders = collectKeyHeaders();
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
  // [WARN] If /plan returns <=1 file (or fails), a multi-file project like a game falls through to the
  // single-file path, whose parser splits the blob into generic file1.js/file2.js names. The plan
  // failure used to be silently swallowed — now logged so we can see WHY a build went single-file.
  if (!opts.isFix && !opts.targetFile) {
    const _planLog = (m: string) => { try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[plan] ${m}\n`); } catch {} };
    try {
      opts.onProgress?.('Planning your build...');
      const planBody = JSON.stringify({ task, preferred, context: { blueprint: context.blueprint, existingFiles: context.existingFiles } });
      // [FIX] Promise.race instead of AbortSignal.timeout — AbortSignal.timeout unreliable in Electron
      const planRes = await Promise.race([
        fetch(`${base}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...keyHeaders }, body: planBody }),
        makeTimeout(30_000, 'Plan'),
      ]);
      if (planRes.ok) {
        const plan = await planRes.json() as { files: Array<{ path: string; description: string; isNew: boolean }> };
        _planLog(`ok status=${planRes.status} files=${plan.files?.length ?? 0} paths=${(plan.files ?? []).map(f => f.path).join(', ')}`);
        if (plan.files && plan.files.length > 1) {
          _planLog(`-> multi-file path (executeMultiFileBuild)`);
          return await executeMultiFileBuild(task, root, context, keyHeaders, token, base, preferred ?? '', plan.files, deps, opts.onProgress);
        }
        _planLog(`-> single-file path (plan returned <=1 file)`);
      } else {
        _planLog(`NOT ok status=${planRes.status} -> single-file path`);
      }
    } catch (e) {
      _planLog(`THREW: ${e instanceof Error ? e.message : String(e)} -> single-file path`);
    }
  }

  opts.onProgress?.('Building your project...');

  try {
    // Step 1: Get routing instructions from backend (SECRET SAUCE)
    // [FIX] Send workerModel = preferred so the server uses the user's chosen AI for the Worker role,
    // not a cheaper fallback. Without this the server was using GPT-4o as Worker even when Claude
    // was selected, producing incomplete output while Supervisor/Guardian ran on Claude.
    // User's cost/quality preference — backend combines it with task difficulty to pick the model tier.
    const strategy = vscode.workspace.getConfiguration('redivivus').get<string>('modelStrategy') || 'balanced';
    const requestBody = JSON.stringify({ task, context, preferred, workerModel: preferred, strategy });
    console.log(`[Redivivus] Build request: taskLen=${task.length}, bodyLen=${requestBody.length}, vaultItems=${context.vaultItems?.length ?? 0}, hasRules=${!!context.projectRules}`);
    // [FIX] Promise.race instead of AbortSignal.timeout — AbortSignal.timeout unreliable in Electron
    const instructionRes = await Promise.race([
      fetch(`${base}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...keyHeaders }, body: requestBody }),
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

    // Step 2: Read SSE Stream directly from backend
    // The backend now executes the AI securely to protect proprietary prompts.
    if (!instructionRes.body) {
      throw new Error('No response body from build API');
    }

    const reader = instructionRes.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      opts.onChunk?.(chunk);
    }

    const supervisorMetaRaw = instructionRes.headers.get('X-Supervisor-Meta');
    const workerProvider = instructionRes.headers.get('X-Worker-Provider') || preferred || 'claude';
    const skeletonMetaRaw = instructionRes.headers.get('X-Skeleton-Meta');
    const modelDecisionRaw = instructionRes.headers.get('X-Model-Decision');

    let supervisor: any = { ran: false, error: '' };
    if (supervisorMetaRaw) {
      try { supervisor = JSON.parse(supervisorMetaRaw); } catch {}
    }
    // Smart model-switching decision (strategy + difficulty + chosen model + rationale).
    let modelDecision: any = null;
    if (modelDecisionRaw) {
      try { modelDecision = JSON.parse(modelDecisionRaw); } catch {}
    }

    // [FIX] Skeleton-first workflow: create folder/file structure BEFORE code arrives
    // This shows the project architecture in Explorer immediately, following proper engineering practices.
    if (skeletonMetaRaw && root) {
      try {
        const skeleton = JSON.parse(skeletonMetaRaw) as { filesToCreate: string[]; foldersToCreate: string[] };
        const fs = await import('fs');
        const path = await import('path');
        
        opts.onProgress?.(`Creating project structure: ${skeleton.foldersToCreate?.length || 0} folders, ${skeleton.filesToCreate?.length || 0} files...`);
        
        // Create folders first
        if (skeleton.foldersToCreate && skeleton.foldersToCreate.length > 0) {
          for (const folderPath of skeleton.foldersToCreate) {
            const fullPath = path.join(root, folderPath);
            try {
              if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
              }
            } catch (e) {
              console.warn(`[Redivivus] Could not create folder ${folderPath}:`, e);
            }
          }
        }
        
        // Create empty files (will be filled in by code processor)
        if (skeleton.filesToCreate && skeleton.filesToCreate.length > 0) {
          for (const filePath of skeleton.filesToCreate) {
            const fullPath = path.join(root, filePath);
            try {
              const dir = path.dirname(fullPath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              if (!fs.existsSync(fullPath)) {
                fs.writeFileSync(fullPath, '', 'utf-8');
              }
            } catch (e) {
              console.warn(`[Redivivus] Could not create file ${filePath}:`, e);
            }
          }
        }
        
        // Refresh explorer to show skeleton
        await vscode.commands.executeCommand('redivivus.refreshProjectMap');
        opts.onProgress?.('Project structure created. Generating code...');
      } catch (e) {
        console.warn('[Redivivus] Skeleton creation failed:', e);
        // Continue anyway - code will still be written
      }
    }

    // Step 3: Parse the streamed code blocks into files locally
    const aiResponse = { text: fullText, model: workerProvider, success: true };
    const data = {
      files: [], // Extracted by processBuildResults
      narration: '',
      model: workerProvider,
      inputTokens: 0,
      outputTokens: Math.ceil(fullText.length / 4)
    };

    const built = await processBuildResults(data, task, root, deps, {
      source: 'cloud',
      vaultItemNames: context.vaultItems?.map((v: any) => v.name),
      supervisor,
      workerProvider,
      overrideResponseText: fullText
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
      workerProvider: workerProvider,
      modelRationale: modelDecision?.rationale,
      modelStrategy: modelDecision?.strategy,
      modelTier: modelDecision?.tier,
    };

  } catch (err: any) {
    if (err?.name === 'TimeoutError') return { success: false, error: 'Build timed out — the AI is taking longer than expected. Please try again.', failureSource: 'cloud' };
    return { success: false, error: err?.message ?? 'Network error', failureSource: 'cloud' };
  }
}

// [DEAD] executeMultiFileBuild moved to cloudBuildMultiFile.ts (Rule 9 split + bug fix: was returning files without writing to disk)
// [DEAD] executeClientAI and createFetchWithTimeout moved to cloudBuildClientAI.ts (Rule 9 split)
