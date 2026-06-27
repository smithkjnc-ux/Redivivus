// [SCOPE] Cloud build client — thin orchestrator: context, /plan step, /build execution, result assembly.
// Backend provides secret sauce; client handles AI API calls with user keys.
// Rule 9 split: CloudBuildResult → cloudBuildTypes.ts, makeTimeout+/plan+skeleton → cloudBuildPlan.ts, SSE drain → cloudBuildStream.ts
// On error: surfaces a clean message — no local fallback (cloud is required for quality builds).

import * as vscode from 'vscode';
import { getAccountToken, getApiBase, collectKeyHeaders, getPreferred } from '../../../features/api/data/apiClient.js';
import { collectBuildContext, budgetContext } from './buildContextCollector.js';
import type { BuildRequestDeps } from '../../../features/ai/logic/chatPanelIntent.js';
import type { VaultService } from '../../vault/data/vaultService.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';
import { calcCost } from '../../telemetry/data/usageTracker.js';
import { runBuildPlanStep, applySkeletonMeta, makeTimeout } from './cloudBuildPlan.js';
import { drainBuildStream } from './cloudBuildStream.js';
import type { CloudBuildResult } from './cloudBuildTypes.js';
export type { CloudBuildResult } from './cloudBuildTypes.js';

export async function callCloudBuild(
  task: string,
  root: string,
  deps: BuildRequestDeps,
  opts: { targetFile?: string; isFix?: boolean; onProgress?: (msg: string) => void; onChunk?: (chunk: string) => void; onStep?: (step: any) => void; onCode?: (text: string) => void; onFileComplete?: (filePath: string, content: string) => void } = {},
): Promise<CloudBuildResult> {
  const token = await getAccountToken();
  if (!token) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }

  const vault = (deps as any).vault as VaultService | undefined;
  const sessionAiTemperature = deps.redivivus?.getSessionAiTemperature();
  const context = await collectBuildContext(root, task, vault, opts.targetFile, opts.isFix, deps.conversation, sessionAiTemperature);
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

  // [DONE] /plan step moved to cloudBuildPlan.ts (Rule 9 split)
  // Step 0: Get build plan (skip for fix requests — always single-file).
  // /plan reuses prescription in /build so the Supervisor doesn't run twice (~$0.25 → ~$0.12).
  let planPrescription: any[] | null = null;
  let planSupervisor: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number } = {};
  if (!opts.isFix && !opts.targetFile) {
    const planResult = await runBuildPlanStep(task, base, token, preferred ?? '', context, keyHeaders, root, deps, opts);
    if (planResult.early) { return planResult.early; }
    planPrescription = planResult.prescription ?? null;
    planSupervisor = planResult.supervisor ?? {};
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
      const { clearAccountToken } = await import('../../../features/api/data/apiClient.js');
      await clearAccountToken();
      vscode.commands.executeCommand('redivivus.refreshChat');
      return { success: false, error: 'NOT_AUTHENTICATED' };
    }

    if (!instructionRes.ok) {
      let errMsg = instructionRes.statusText;
      try {
        const errBody = await instructionRes.text();
        console.error(`[Redivivus] Build API ${instructionRes.status} body: ${errBody.slice(0, 500)}`);
        require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[build] /build failed status=${instructionRes.status} preferred=${preferred} body=${errBody.slice(0, 300)}\n`);
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

    // [DONE] SSE stream drain moved to cloudBuildStream.ts (Rule 9 split)
    const { fullText, workerInTok, workerOutTok, workerProviderFinal } = await drainBuildStream(instructionRes.body, { onStep: opts.onStep, onCode: opts.onCode, onChunk: opts.onChunk });

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

    // [DONE] Skeleton-first setup moved to cloudBuildPlan.ts (Rule 9 split)
    await applySkeletonMeta(skeletonMetaRaw, root, opts.onProgress);

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
