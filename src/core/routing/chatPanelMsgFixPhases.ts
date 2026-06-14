// [SCOPE] Phase 1 (Supervisor) and Phase 2 (Worker) — thin client wrappers.
// Extension sends raw context to backend endpoints; all prompt engineering is server-side.
// Phase 1 → /v1/fix-supervisor  |  Phase 2 → /v1/fix-worker

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { buildSupervisorNotes, buildWorkerRules } from './chatPanelMsgFixPatterns';

export async function runPhase1Supervisor(
  userText: string,
  filesBlock: string,
  buildContext: string,
  activePatterns: any[],
  projectDeadEnds: string,
  projectRules: string,
  deps: MessageHandlerDeps,
  root: string,
  imageBase64?: string,
  imageType?: string,
  isRetry = false
): Promise<{ diagnosis: string, subtasks: string[], executionMode?: 'parallel' | 'sequential', supervisorLabel: string, expandedFilesBlock: string } | null> {
  const _cfg = deps.redivivus?.loadConfig?.();
  const _bp = _cfg?.blueprint;

  // Parse structured files from filesBlock for the new endpoint
  const files: { path: string, content: string, size: number }[] = [];
  // [FIX] Split on the FILE marker at start-of-string OR after a newline, then drop empties. The old
  // `.split(/\n\/\/ === FILE: /).slice(1)` required a newline BEFORE the marker — but filesBlock starts with
  // "// === FILE: ..." (no leading newline), so the FIRST file was never a split point and slice(1) dropped it.
  // For a single-file project (e.g. a self-contained index.html) that left ZERO files -> the Supervisor saw no
  // source and refused ("no source files provided"). This captures every file, including the first.
  const fileBlocks = filesBlock.split(/(?:^|\n)\/\/ === FILE: /).filter(b => b.trim());
  for (const blk of fileBlocks) {
    const nl = blk.indexOf('\n');
    if (nl === -1) continue;
    const relPath = blk.slice(0, nl).replace(/\s*===\s*$/, '').trim();
    const content = blk.slice(nl + 1);
    files.push({ path: relPath, content, size: content.length });
  }
  // Calculate total size for format decision (FULL FILE vs surgical)
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const largestFile = files.reduce((max, f) => f.size > max.size ? f : max, files[0] || { path: '', size: 0 });

  // Build roadmap snippet for context
  let roadmapSnippet = '';
  try { const rp = path.join(root, 'REDIVIVUS_ROADMAP.md'); if (fs.existsSync(rp)) { roadmapSnippet = fs.readFileSync(rp, 'utf-8').slice(-700).trim(); } } catch {}

  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const fetchFn = (deps.routing as any).fetchWithTimeout;
  const keysPayload = require('../../services/api/apiClient.js').collectKeys();
  const { supervisor } = deps.routing.selectSupervisorAndWorker();
  const { bestModelForRole } = require('../../services/ai/modelRegistry.js');

  // [FIX][FAILOVER] Mirror the Worker's failover for the SUPERVISOR: if the chosen provider fails for ANY reason
  // (usage/quota limit, bad key, network), PROMOTE the next key-configured provider in rank order to Supervisor
  // and continue. A capped Claude must not kill the whole fix when Gemini/etc. are configured. Throw only when
  // EVERY provider fails. (PapaJoe: "it should have fallen back to the next-in-line AI and promoted it to supervisor.")
  const { AI_RANK } = require('../../services/ai/guardianAI.js');
  const _supKeyMap = deps.routing.getKeyMap();
  const _rankedSup: string[] = Object.entries(AI_RANK)
    .filter(([ai]: any) => _supKeyMap[ai]?.())
    .sort((a: any, b: any) => (b[1] as number) - (a[1] as number))
    .map(([ai]: any) => ai);
  // [ROUTING PANEL] If the user manually chose a Supervisor AI, force it (no failover); else adaptive order.
  const _supOverride = deps.routingOverrides?.supervisor;
  const supProviderOrder = _supOverride ? [_supOverride] : [supervisor, ..._rankedSup.filter((p) => p !== supervisor)];

  // [SUPERVISOR_TIER] Size the Supervisor's OWN diagnosis model to the request (symmetric to WORKER_TIER). The
  // tier was already classified by the chat pre-pass and stashed on deps — no extra call. Hard/architectural
  // requests (ultra) get the strongest reasoning model (e.g. Gemini 2.5 Pro); normal fixes stay mid. Default 'pro'
  // preserves prior behavior. (PapaJoe: "the plan could be made by a lower AI but better applied by a higher AI" —
  // diagnosis and execution are sized independently.)
  const supervisorTier: 'flash' | 'pro' | 'ultra' = deps.supervisorTierHint || 'pro';

  // [CAPABILITY-AWARE SUPERVISOR] Tell the Supervisor who its workers ACTUALLY are and what they can do, so it
  // sizes WORKER_TIER to real capability instead of guessing at an abstract label. Built from the model registry.
  const { buildCrewRoster } = require('../../services/ai/modelRegistry.js');
  const _supModelId = bestModelForRole(supervisor, supervisorTier)?.modelId;
  const workerRoster = buildCrewRoster(supervisor, _supModelId) || undefined;

  let diagRes: any; let supProviderUsed = supervisor; let supLastError = '';
  // [DIAG] Log provider order + key presence (masked) before the loop — exposes why all-fail 401.
  const _keyDiag = supProviderOrder.map(p => {
    const k = keysPayload[p];
    return `${p}=${k ? k.slice(0,4)+'…('+k.length+'ch)' : 'MISSING'}`;
  }).join(', ');
  require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
    `[SUP-KEYS] order=[${supProviderOrder.join(',')}] keys=${_keyDiag} tier=${supervisorTier}\n`);
  for (const provider of supProviderOrder) {
    // [SUPERVISOR_TIER] Was hardcoded 'pro' — now sized to the request's complexity (see supervisorTier above).
    const pModel = bestModelForRole(provider, supervisorTier)?.modelId || provider;
    // [FIX] Groq has a 12K TPM limit — skip it when file context is too large to avoid 413.
    if (provider === 'groq' && totalSize > 30_000) {
      require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
        `[SUP-SKIP] groq skipped: totalSize=${totalSize} > 30KB limit\n`);
      continue;
    }
    try {
      const res = await fetchFn(`${base}/fix-supervisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userText,
          files: files.map(f => ({ path: f.path, content: f.content, size: f.size })),
          context: {
            blueprint: _bp || undefined,
            // [CAPABILITY-AWARE SUPERVISOR] The real crew (models + capabilities) the Supervisor can assign work to.
            workerRoster,
            // [LIVING BLUEPRINT Phase 3] The trail of accepted changes (how the project got to its present state),
            // so the Supervisor can reason about recent history, not just the current HEAD contract.
            revisions: (() => { try { return require('../../services/blueprint/livingBlueprintService.js').recentRevisionsBlock(root) || undefined; } catch { return undefined; } })(),
            projectRules: projectRules || undefined,
            deadEnds: projectDeadEnds || undefined,
            roadmapSnippet: roadmapSnippet || undefined,
            patternNotes: buildSupervisorNotes(activePatterns) || undefined,
            fileMetrics: { totalSize, largestFile: { path: largestFile.path, size: largestFile.size }, fileCount: files.length }
          },
          supervisor: provider,
          supervisorModel: pModel,
          keys: keysPayload,
        })
      }, 120_000);
      const data = await res.json().catch(() => ({}));
      require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
        `[SUP-ATTEMPT] provider=${provider} model=${pModel} status=${res.status} ok=${res.ok} err=${data?.error||''}\n`);
      if (!res.ok) { supLastError = (data && data.error) || `Supervisor API ${res.status}`; continue; }
      if (!data || !data.diagnosis) {
        require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
          `[SUP-NO-DIAG] provider=${provider} keys=${Object.keys(data||{}).join(',')} success=${data?.success} diagnosis=${JSON.stringify(data?.diagnosis||'').slice(0,120)}\n`);
        supLastError = 'no diagnosis returned'; continue;
      }
      diagRes = data; supProviderUsed = provider; break; // success — this provider is the Supervisor for this fix
    } catch (err: any) {
      require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log',
        `[SUP-CATCH] provider=${provider} err=${err?.message||'unknown'}\n`);
      supLastError = err?.message || 'unknown'; continue;
    }
  }
  if (!diagRes) { throw new Error(`Every available AI failed to diagnose. Last error: ${supLastError || 'unknown'}`); }

  const { diagnosis, subtasks = [], executionMode = 'sequential', inputTokens, outputTokens } = diagRes;
  if (!diagnosis) throw new Error('Supervisor returned no diagnosis.');

  deps.usageTracker?.recordUsage(
    Math.ceil((diagnosis.length) / 4), 0, supProviderUsed,
    inputTokens, outputTokens, 'supervisor', path.basename(root)
  );

  return { diagnosis, subtasks, executionMode, supervisorLabel: modelLabel(supProviderUsed), expandedFilesBlock: filesBlock };
}

export async function runPhase2Worker(
  diagnosis: string,
  fileNames: string,
  filesBlock: string,
  activePatterns: any[],
  deps: MessageHandlerDeps,
  root: string,
  onChunk?: (chunk: string) => void,
  escalated?: boolean,
  forceSurgical?: boolean
): Promise<{ workerResponse: string, workerLabel: string } | null> {
  // Parse structured files from filesBlock
  const files: { path: string, content: string, size: number }[] = [];
  // [FIX] Split on the FILE marker at start-of-string OR after a newline, then drop empties. The old
  // `.split(/\n\/\/ === FILE: /).slice(1)` required a newline BEFORE the marker — but filesBlock starts with
  // "// === FILE: ..." (no leading newline), so the FIRST file was never a split point and slice(1) dropped it.
  // For a single-file project (e.g. a self-contained index.html) that left ZERO files -> the Supervisor saw no
  // source and refused ("no source files provided"). This captures every file, including the first.
  const fileBlocks = filesBlock.split(/(?:^|\n)\/\/ === FILE: /).filter(b => b.trim());
  for (const blk of fileBlocks) {
    const nl = blk.indexOf('\n');
    if (nl === -1) continue;
    const relPath = blk.slice(0, nl).replace(/\s*===\s*$/, '').trim();
    const content = blk.slice(nl + 1);
    files.push({ path: relPath, content, size: content.length });
  }
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const largestFile = files.reduce((max, f) => f.size > max.size ? f : max, files[0] || { path: '', size: 0 });

  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const keysPayload = require('../../services/api/apiClient.js').collectKeys();
  const { supervisor, worker } = deps.routing.selectSupervisorAndWorker();
  const workerAI = escalated ? supervisor : (worker || deps.routing.getAvailableAI().ai);
  const { bestModelForRole } = require('../../services/ai/modelRegistry.js');

  // [FIX][FAILOVER] When an AI fails for ANY reason (bad/expired key → 401/403, quota, empty response,
  // inline [ERROR] stream, network), drop to the NEXT key-configured provider in rank order. Only when
  // EVERY provider has failed do we throw — graceful fail. (PapaJoe's rule: "when an AI does not work it
  // falls to the next in line, unless there are no more AI to use, then it can fail gracefully.")
  // Order: the selected worker first, then all remaining providers that have a key, highest rank first.
  const { AI_RANK } = require('../../services/ai/guardianAI.js');
  const _keyMap = deps.routing.getKeyMap();
  const _ranked: string[] = Object.entries(AI_RANK)
    .filter(([ai]: any) => _keyMap[ai]?.())
    .sort((a: any, b: any) => b[1] - a[1])
    .map(([ai]: any) => ai);
  // [ROUTING PANEL] If the user manually chose a Worker AI, force it (no failover); else adaptive order.
  const _wkOverride = deps.routingOverrides?.worker;
  const providerOrder = _wkOverride ? [_wkOverride] : [workerAI, ..._ranked.filter((p) => p !== workerAI)];

  const _ErrTail = /\[ERROR:\s*([^\]]+)\]\s*$/;
  let workerResponse = '';
  let providerUsed = workerAI;
  let lastError = '';
  // [FIX] The Supervisor SIZES the Worker to the job — it emits WORKER_TIER in its diagnosis (flash for a
  // trivial/moderate fix, pro/ultra for substantial GENERATION like a full sprite/render rebuild). Honour it.
  // [CAPABILITY-AWARE] ultra is NO LONGER capped to pro. For many providers (e.g. Gemini) the 'pro' role resolves
  // to the cheaper mid model (Gemini 2.5 Flash) and only 'ultra' reaches the strongest (Gemini 2.5 Pro). Capping
  // the Worker at pro made the top model UNREACHABLE — so hard visual/generation work ran on a capability-7 model
  // it couldn't carry. The Supervisor now sees the real crew (workerRoster) and can assign ultra when warranted.
  const _wt = diagnosis.match(/WORKER_TIER:\s*(flash|pro|ultra)/i)?.[1]?.toLowerCase();
  const workerTier: 'flash' | 'pro' | 'ultra' = _wt === 'ultra' ? 'ultra' : _wt === 'pro' ? 'pro' : 'flash';
  for (const provider of providerOrder) {
    const pModel = bestModelForRole(provider, workerTier)?.modelId || provider;
    let attempt = '';
    try {
      const res = await fetch(`${base}/fix-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          diagnosis,
          files: files.map(f => ({ path: f.path, content: f.content, size: f.size })),
          context: {
            patternRules: buildWorkerRules(activePatterns, 9) || undefined,
            fileMetrics: { totalSize, largestFile: { path: largestFile.path, size: largestFile.size }, fileCount: files.length },
            forceSurgical: !!forceSurgical
          },
          worker: provider,
          workerModel: pModel,
          supervisorProvider: supervisor,
          escalated: !!escalated,
          keys: keysPayload,
          stream: true,
        })
      });
      if (!res.ok) { const err: any = await res.json().catch(() => ({})); lastError = err.error || `Worker API ${res.status}`; continue; }
      if (res.body) {
        const reader = res.body.getReader(); const decoder = new TextDecoder();
        while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); attempt += chunk; if (onChunk) onChunk(chunk); }
      }
    } catch (err: any) { lastError = err?.message || 'unknown'; continue; }

    // The backend appends "[ERROR: ...]" inline on provider failure (executor.ts executeAIStream).
    // Treat that — and an empty body — as a provider failure and fall over to the next.
    const em = attempt.match(_ErrTail);
    if (em) { lastError = em[1].trim(); continue; }
    if (!attempt.trim()) { lastError = 'empty response'; continue; }
    workerResponse = attempt; providerUsed = provider; break; // success
  }

  if (!workerResponse.trim()) {
    throw new Error(`Every available AI failed. Last error: ${lastError || 'unknown'}`);
  }
  // [COST] The streamed Worker response carries no token frame, so estimate from the ACTUAL bytes. The INPUT (the
  // whole file context — often the biggest cost on a large game) was hardcoded to 0, zeroing the input cost and
  // making the reported total a fraction of the real provider bill. Estimate input from diagnosis + every file's
  // content (~4 chars/token) + a system-prompt allowance; output from the streamed text.
  const _wkInTok = Math.ceil((diagnosis.length + files.reduce((s, f) => s + (f.content?.length || 0), 0)) / 4) + 600;
  const _wkOutTok = Math.ceil(workerResponse.length / 4);
  deps.usageTracker?.recordUsage(
    _wkInTok + _wkOutTok, 0, providerUsed,
    _wkInTok, _wkOutTok, 'worker', path.basename(root)
  );
  return { workerResponse: workerResponse.trim(), workerLabel: modelLabel(providerUsed) };
}
