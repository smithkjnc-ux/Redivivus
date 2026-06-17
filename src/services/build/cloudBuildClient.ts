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
import { calcCost } from '../usageTracker.js';

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
  opts: { targetFile?: string; isFix?: boolean; onProgress?: (msg: string) => void; onChunk?: (chunk: string) => void; onStep?: (step: any) => void; onCode?: (text: string) => void } = {},
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

  // [FIX] /plan runs the full Supervisor (Sonnet) and returns its prescription + token cost. For
  // single-file builds we forward these to /build so it REUSES the prescription instead of running the
  // Supervisor a second time — halving the top-tier cost (~$0.25 -> ~$0.12) and making the card honest.
  let planPrescription: any[] | null = null;
  let planSupervisor: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number } = {};

  // ── Step 0: Get build plan (skip for fix requests — always single-file) ──
  // [WARN] If /plan returns <=1 file (or fails), a multi-file project like a game falls through to the
  // single-file path, whose parser splits the blob into generic file1.js/file2.js names. The plan
  // failure used to be silently swallowed — now logged so we can see WHY a build went single-file.
  if (!opts.isFix && !opts.targetFile) {
    const _planLog = (m: string) => { try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[plan] ${m}\n`); } catch {} };
    try {
      opts.onProgress?.('Planning your build...');
      const planBody = JSON.stringify({ task, preferred, context: { blueprint: context.blueprint, existingFiles: context.existingFiles } });
      // [FIX] /plan now STREAMS (Phase 0). Keep-alive means the long Supervisor call can't falsely time
      // out at ANY build size, and the prescription streams to the Build Activity panel LIVE (so the user
      // watches the plan being written, never a frozen screen). Read the stream: @@RDV_STEP@@/@@RDV_CODE@@
      // frames -> panel; the final @@RDV_RESULT@@ frame -> the file list + prescription /build reuses. The
      // 300s ceiling only guards a genuinely dead stream — keep-alive keeps a live one from tripping it.
      const planRes = await Promise.race([
        fetch(`${base}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...keyHeaders }, body: planBody }),
        makeTimeout(300_000, 'Plan'),
      ]);
      if (planRes.ok && planRes.body) {
        const pReader = planRes.body.getReader();
        const pDec = new TextDecoder('utf-8');
        let pBuf = '';
        let planResult: any = null;
        const onPlanLine = (t: string) => {
          if (t.startsWith('@@RDV_STEP@@')) { try { opts.onStep?.(JSON.parse(t.slice(12))); } catch {} }
          else if (t.startsWith('@@RDV_CODE@@')) { try { opts.onCode?.(JSON.parse(t.slice(12)).text || ''); } catch {} }
          else if (t.startsWith('@@RDV_RESULT@@')) { try { planResult = JSON.parse(t.slice(14)); } catch {} }
        };
        while (true) {
          const { done, value } = await pReader.read();
          if (done) break;
          pBuf += pDec.decode(value, { stream: true });
          let nl: number;
          while ((nl = pBuf.indexOf('\n')) >= 0) { onPlanLine(pBuf.slice(0, nl).trimStart()); pBuf = pBuf.slice(nl + 1); }
        }
        if (pBuf.trim()) { onPlanLine(pBuf.trimStart()); }

        const plan = (planResult ?? { files: [] }) as {
          files: Array<{ path: string; description: string; isNew: boolean }>;
          prescription?: any[];
          supervisorModel?: string;
          supervisorProvider?: string;
          supervisorInputTokens?: number;
          supervisorOutputTokens?: number;
        };
        _planLog(`ok (stream) files=${plan.files?.length ?? 0} supervisor=${plan.supervisorModel ?? 'none'} paths=${(plan.files ?? []).map(f => f.path).join(', ')}`);
        // Capture the prescription + Supervisor cost so /build reuses them (no second Supervisor call).
        planPrescription = plan.prescription ?? null;
        planSupervisor = { provider: plan.supervisorProvider, model: plan.supervisorModel, inputTokens: plan.supervisorInputTokens, outputTokens: plan.supervisorOutputTokens };
        if (plan.files && plan.files.length > 1) {
          _planLog(`-> multi-file path (executeMultiFileBuild) with prescription=${!!plan.prescription}`);
          return await executeMultiFileBuild(
            task, root, context, keyHeaders, token, base, preferred ?? '',
            plan.files, deps,
            plan.prescription ?? null,
            plan.supervisorModel ?? null,
            plan.supervisorProvider ?? null,
            plan.supervisorInputTokens ?? 0,
            plan.supervisorOutputTokens ?? 0,
            opts.onProgress,
            opts.onStep,
          );
        }
        _planLog(`-> single-file path (plan returned <=1 file)`);
      } else {
        _planLog(`NOT ok status=${planRes?.status} -> single-file path`);
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
    // Forward /plan's prescription + Supervisor token cost so /build reuses it instead of re-running
    // the Supervisor (Sonnet) a second time. Only set for single-file builds that ran /plan above.
    const requestBody = JSON.stringify({
      // [MANUAL MODEL PICKER] When the user locked an exact model, send it as the worker model so the build
      // runs THAT model (e.g. put Opus on a game build) — model shown = model used. Else the provider default.
      task, context, preferred, workerModel: (deps as any).manualModel || preferred, strategy,
      ...(planPrescription ? {
        prescription: planPrescription,
        supervisorProvider: planSupervisor.provider,
        supervisorModel: planSupervisor.model,
        supervisorInputTokens: planSupervisor.inputTokens,
        supervisorOutputTokens: planSupervisor.outputTokens,
      } : {}),
    });
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

    // [FIX] Build Activity panel — the backend interleaves milestone frames (`@@RDV_STEP@@{json}`) with
    // the code stream. Split them line-by-line: frames go to onStep (the panel), code goes to fullText.
    // trimStart() absorbs any keep-alive spaces that prefix a frame line; real code keeps its indentation.
    const STEP_PREFIX = '@@RDV_STEP@@';
    const CODE_PREFIX = '@@RDV_CODE@@';  // live worker-code chunk (Phase 2) — panel-only, stripped from disk code
    let lineBuf = '';
    // [FIX #3] The backend's final `done` frame carries the worker's real token spend (initial + any
    // failover + retry). Capture it here so we report actual usage/cost instead of inputTokens:0.
    let workerInTok: number | undefined;
    let workerOutTok: number | undefined;
    // [FIX] The done frame carries the ACTUAL winning worker provider/model (after any failover). The
    // X-Worker-Provider header is frozen to the originally-selected provider, so on a failover it credits
    // and bills the model that FAILED. Prefer this done-frame value for the card label + cost. (Jun 16, 2026.)
    let workerProviderFinal: string | undefined;
    const handleStep = (step: any) => {
      if (step && step.phase === 'done') {
        if (typeof step.inputTokens === 'number') workerInTok = step.inputTokens;
        if (typeof step.outputTokens === 'number') workerOutTok = step.outputTokens;
        if (typeof step.provider === 'string' && step.provider) workerProviderFinal = step.provider;
      }
      opts.onStep?.(step);
    };
    // Route a single line: a @@RDV_STEP@@ frame to the panel, a @@RDV_CODE@@ chunk to live code, else it
    // is real file code. Returns true if the line was a frame (so it is stripped from the disk code).
    const routeFrame = (t: string): boolean => {
      if (t.startsWith(STEP_PREFIX)) { try { handleStep(JSON.parse(t.slice(STEP_PREFIX.length))); } catch {} return true; }
      if (t.startsWith(CODE_PREFIX)) { try { opts.onCode?.(JSON.parse(t.slice(CODE_PREFIX.length)).text || ''); } catch {} return true; }
      return false;
    };
    const drain = (incoming: string, isFinal: boolean) => {
      lineBuf += incoming;
      let code = '';
      let nl: number;
      while ((nl = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, nl);
        lineBuf = lineBuf.slice(nl + 1);
        if (!routeFrame(line.trimStart())) { code += line + '\n'; }
      }
      if (isFinal && lineBuf) {
        if (!routeFrame(lineBuf.trimStart())) { code += lineBuf; }
        lineBuf = '';
      }
      if (code) { fullText += code; opts.onChunk?.(code); }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      drain(decoder.decode(value, { stream: true }), false);
    }
    drain('', true);

    const supervisorMetaRaw = instructionRes.headers.get('X-Supervisor-Meta');
    // [FIX] Prefer the done-frame provider (the real failover winner) over the X-Worker-Provider header,
    // which is frozen to the originally-selected provider before the worker body runs.
    const workerProvider = workerProviderFinal || instructionRes.headers.get('X-Worker-Provider') || preferred || 'claude';
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
        
        opts.onProgress?.(`Creating project structure: ${skeleton.filesToCreate?.length || 0} files...`);

        // [BUILD CONTRACT] Do NOT pre-create standalone folders — that was a source of empty folders when a
        // planned folder had no file in it. A folder must exist only because a file lives in it; the file loop
        // below creates each file's parent dir (path.dirname) on demand. NO EMPTY FOLDERS.
        // [DEAD] Removed: standalone mkdir of skeleton.foldersToCreate.

        // [BUILD CONTRACT] Do NOT pre-create empty placeholder files. A planned path can be slug-prefixed
        // (digital-clock/index.html) while the real file lands slug-stripped (index.html) -> the placeholder is
        // orphaned as a stray 0-byte file (same hollow-shell bug as the empty folders, for FILES). The code
        // processor writes each real file (with content, parent dir on demand). A file exists only when it has
        // content. [DEAD] Removed: writeFileSync('') placeholder loop over skeleton.filesToCreate.

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
    // [FIX #3] Real worker tokens come from the backend's `done` frame (covers initial + failover +
    // retry). Fall back to a length/4 estimate only if the frame is missing (old backend). costUSD is
    // worker (estimated) + supervisor (REAL, expensive model) -> dollar-accurate total per build.
    const wIn = workerInTok ?? 0;
    const wOut = workerOutTok ?? Math.ceil(fullText.length / 4);
    const supCost = supervisor?.ran && supervisor?.model
      ? calcCost(supervisor.model, supervisor.inputTokens ?? 0, supervisor.outputTokens ?? 0)
      : 0;
    const costUSD = calcCost(workerProvider, wIn, wOut) + supCost;
    const data = {
      files: [], // Extracted by processBuildResults
      narration: '',
      model: workerProvider,
      inputTokens: wIn,   // worker-only — processBuildResults records the supervisor as its own usage row
      outputTokens: wOut,
      costUSD,
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
