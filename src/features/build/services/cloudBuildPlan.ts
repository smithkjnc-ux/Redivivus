// [SCOPE] /plan streaming step and skeleton-meta setup for the cloud build pipeline.
// Extracted from cloudBuildClient.ts (Rule 9 split).
// Runs the Supervisor /plan endpoint, streams its output, and either routes to multi-file build or
// returns the prescription + supervisor meta for reuse by the single-file /build call.

import * as vscode from 'vscode';
import type { BuildRequestDeps } from '../../../features/ai/logic/chatPanelIntent.js';
import type { CloudBuildResult } from './cloudBuildTypes.js';
import { executeMultiFileBuild } from './cloudBuildMultiFile.js';

export interface PlanSupervisorMeta {
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface PlanStepResult {
  early?: CloudBuildResult;     // set when /plan returned >1 file → multi-file path already executed
  prescription?: any[];         // set when /plan returned <=1 file → reuse in /build
  supervisor?: PlanSupervisorMeta;
}

export type BuildCallOpts = {
  targetFile?: string;
  isFix?: boolean;
  onProgress?: (msg: string) => void;
  onChunk?: (chunk: string) => void;
  onStep?: (step: any) => void;
  onCode?: (text: string) => void;
  onFileComplete?: (filePath: string, content: string) => void;
};

/** Promise.race timeout — AbortSignal.timeout is unreliable in Electron's fetch. */
export function makeTimeout(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => {
    const err = new Error(`${label} timed out — try a simpler request.`);
    err.name = 'TimeoutError';
    reject(err);
  }, ms));
}

/**
 * Run the /plan streaming endpoint. Routes to multi-file build when the plan returns >1 file.
 * Otherwise returns prescription + supervisor meta for the single-file /build call.
 * [WARN] /plan failing or returning <=1 file silently falls through to the single-file path — logged.
 */
export async function runBuildPlanStep(
  task: string, base: string, token: string, preferred: string,
  context: { blueprint?: any; existingFiles?: any },
  keyHeaders: Record<string, string>, root: string, deps: BuildRequestDeps, opts: BuildCallOpts,
): Promise<PlanStepResult> {
  const _planLog = (m: string) => { try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[plan] ${m}\n`); } catch {} };
  try {
    opts.onProgress?.('Planning your build...');
    const planBody = JSON.stringify({ task, preferred, context: { blueprint: context.blueprint, existingFiles: context.existingFiles } });
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
        if (done) { break; }
        pBuf += pDec.decode(value, { stream: true });
        let nl: number;
        while ((nl = pBuf.indexOf('\n')) >= 0) { onPlanLine(pBuf.slice(0, nl).trimStart()); pBuf = pBuf.slice(nl + 1); }
      }
      if (pBuf.trim()) { onPlanLine(pBuf.trimStart()); }
      const plan = (planResult ?? { files: [] }) as { files: Array<{ path: string; description: string; isNew: boolean }>; prescription?: any[]; supervisorModel?: string; supervisorProvider?: string; supervisorInputTokens?: number; supervisorOutputTokens?: number };
      _planLog(`ok files=${plan.files?.length ?? 0} supervisor=${plan.supervisorModel ?? 'none'}`);
      const supervisor: PlanSupervisorMeta = { provider: plan.supervisorProvider, model: plan.supervisorModel, inputTokens: plan.supervisorInputTokens, outputTokens: plan.supervisorOutputTokens };
      // [FIX] If the Supervisor fell back to a different provider, use that provider for Worker files too.
      // Otherwise preferred='claude' goes in the /build body and the server retries the failed provider.
      const effectivePreferred = plan.supervisorProvider || preferred || '';
      if (plan.files && plan.files.length > 1) {
        _planLog(`-> multi-file path (executeMultiFileBuild) preferred=${effectivePreferred}`);
        const early = await executeMultiFileBuild(task, root, context, keyHeaders, token, base, effectivePreferred, plan.files, deps, plan.prescription ?? null, plan.supervisorModel ?? null, plan.supervisorProvider ?? null, plan.supervisorInputTokens ?? 0, plan.supervisorOutputTokens ?? 0, opts.onProgress, opts.onStep, opts.onCode, opts.onFileComplete);
        return { early };
      }
      _planLog(`-> single-file path (plan returned <=1 file)`);
      return { prescription: plan.prescription ?? undefined, supervisor };
    } else {
      _planLog(`NOT ok status=${planRes?.status} -> single-file path`);
    }
  } catch (e) {
    _planLog(`THREW: ${e instanceof Error ? e.message : String(e)} -> single-file path`);
  }
  return {};
}

/** Apply X-Skeleton-Meta header: refresh the Explorer to show the project structure before code arrives. */
export async function applySkeletonMeta(skeletonMetaRaw: string | null, root: string, onProgress?: (msg: string) => void): Promise<void> {
  if (!skeletonMetaRaw || !root) { return; }
  try {
    const skeleton = JSON.parse(skeletonMetaRaw) as { filesToCreate: string[]; foldersToCreate: string[] };
    onProgress?.(`Creating project structure: ${skeleton.filesToCreate?.length || 0} files...`);
    // [BUILD CONTRACT] Do NOT pre-create empty folders or placeholder files — they orphan when the
    // AI uses a different path, causing stray 0-byte files. Files are written with content only.
    // [DEAD] Removed: standalone mkdir for foldersToCreate, writeFileSync('') placeholder loop.
    await vscode.commands.executeCommand('redivivus.refreshProjectMap');
    onProgress?.('Project structure created. Generating code...');
  } catch (e) {
    console.warn('[Redivivus] Skeleton creation failed:', e);
  }
}
