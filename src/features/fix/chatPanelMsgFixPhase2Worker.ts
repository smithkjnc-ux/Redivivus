// [SCOPE] Fix pipeline Phase 2 Worker — sends fix request to backend /fix-worker endpoint.
// Extracted from chatPanelMsgFixPhases.ts (Rule 9 split — was 280 lines).
// Implements provider failover: tries all configured providers in rank order before throwing.
// Worker is sized by the Supervisor's WORKER_TIER directive (flash/pro/ultra) in the diagnosis.

import * as path from 'path';
import type { MessageHandlerDeps } from '../chat/logic/chatPanelMessages.js';
import { buildWorkerRules } from './chatPanelMsgFixPatterns.js';
import { modelLabel } from './chatPanelMsgFixUtils.js';

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
  const files: { path: string, content: string, size: number }[] = [];
  // [FIX] Split on the FILE marker at start-of-string OR after a newline, then drop empties. The old
  // `.split(/\n\/\/ === FILE: /).slice(1)` dropped the first file when filesBlock starts with the marker.
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

  const base = require('../api/data/apiClient.js').getApiBase();
  const token = await require('../api/data/apiClient.js').getAccountToken();
  const keysPayload = require('../api/data/apiClient.js').collectKeys();
  const { supervisor, worker } = deps.routing.selectSupervisorAndWorker();
  const workerAI = escalated ? supervisor : (worker || deps.routing.getAvailableAI().ai);
  const { bestModelForRole } = require('../ai/data/modelRegistry.js');

  // [FIX][FAILOVER] When an AI fails (bad key, quota, empty response, network), drop to the NEXT
  // key-configured provider in rank order. Only throw when EVERY provider has failed.
  const { AI_RANK } = require('../ai/data/guardianAI.js');
  const _keyMap = deps.routing.getKeyMap();
  const _ranked: string[] = Object.entries(AI_RANK)
    .filter(([ai]: any) => _keyMap[ai]?.())
    .sort((a: any, b: any) => b[1] - a[1])
    .map(([ai]: any) => ai);
  // [ROUTING PANEL] If the user manually chose a Worker AI, force it (no failover); else adaptive order.
  const _wkOverride = deps.routingOverrides?.worker;
  const providerOrder = _wkOverride ? [_wkOverride] : [workerAI, ..._ranked.filter((p) => p !== workerAI)];
  // [MANUAL MODEL PICKER] Exact model locked by user → run that model, no failover.
  const _manualModel = deps.manualModel;
  const _manualModelProvider = _manualModel
    ? (require('../ai/data/modelRegistry.js').MODEL_REGISTRY.find((m: { modelId: string }) => m.modelId === _manualModel)?.provider)
    : undefined;
  const _effProviderOrder = (_manualModel && _manualModelProvider) ? [_manualModelProvider] : providerOrder;

  const _ErrTail = /\[ERROR:\s*([^\]]+)\]\s*$/;
  let workerResponse = '';
  let providerUsed = workerAI;
  let lastError = '';
  // [FIX] Deterministic Tiering — Worker complexity is evaluated based on the files being fixed.
  function determineFixWorkerTier(fixFiles: { path: string, content: string }[]): 'flash' | 'pro' | 'ultra' {
    let hasLogic = false;
    let needsUltra = false;
    const complexKeywords = /physics|engine|state|game|algorithm|canvas|core|manager|router|auth|store|database/i;

    for (const f of fixFiles) {
      if (/\.(js|ts|jsx|tsx|py|go|rs|java|c|cpp|cs|php|rb)$/i.test(f.path)) {
        hasLogic = true;
        // Upgrade to ultra if the file is large (>150 lines) or has complex keywords
        if (f.content.split('\n').length > 150 || complexKeywords.test(f.path)) {
          needsUltra = true;
        }
      }
    }
    
    if (!hasLogic) return 'flash'; // pure CSS/HTML/Markdown
    return needsUltra ? 'ultra' : 'pro';
  }
  
  const workerTier = determineFixWorkerTier(files);
  const fixLog = require('../logging/data/fixPipelineLogger.js').fixLog;
  fixLog(`[WORKER_TIER_ROUTING] Fix Worker | Assigned Tier: ${workerTier.toUpperCase()}`);

  // [FIX] For small projects (largest file < 5000 chars / ~100 lines), instruct the Worker to
  // use FULL FILE format instead of surgical search/replace. Surgical edits are brittle against
  // files that have been through multiple AI passes — exact search text drifts. Full file
  // rewrites always succeed and are safe for files small enough to output in their entirety.
  const _isSmallProject = largestFile.size < 5000 && !forceSurgical;
  const _formatHint = _isSmallProject
    ? `\nFORMAT REQUIREMENT: All files in this project are small (under 100 lines). You MUST write FULL FILE content for every change — do NOT use <search>/<replace> or surgical edit blocks. Write the complete corrected file from top to bottom.`
    : '';
  const _patternRules = ((buildWorkerRules(activePatterns, 9) || '') + _formatHint).trim() || undefined;

  for (const provider of _effProviderOrder) {
    const pModel = (_manualModel && provider === _manualModelProvider) ? _manualModel : (bestModelForRole(provider, workerTier)?.modelId || provider);
    let attempt = '';
    try {
      const res = await fetch(`${base}/fix-worker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          diagnosis,
          files: files.map(f => ({ path: f.path, content: f.content, size: f.size })),
          context: {
            patternRules: _patternRules,
            fileMetrics: { totalSize, largestFile: { path: largestFile.path, size: largestFile.size }, fileCount: files.length },
            forceSurgical: !!forceSurgical,
            preferFullFile: _isSmallProject,
          },
          worker: provider, workerModel: pModel, supervisorProvider: supervisor,
          escalated: !!escalated, keys: keysPayload, stream: true,
        })
      });
      if (!res.ok) { const err: any = await res.json().catch(() => ({})); lastError = err.error || `Worker API ${res.status}`; continue; }
      if (res.body) {
        const reader = res.body.getReader(); const decoder = new TextDecoder();
        while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); attempt += chunk; if (onChunk) onChunk(chunk); }
      }
    } catch (err: any) { lastError = err?.message || 'unknown'; continue; }
    const em = attempt.match(_ErrTail);
    if (em) { lastError = em[1].trim(); continue; }
    if (!attempt.trim()) { lastError = 'empty response'; continue; }
    workerResponse = attempt; providerUsed = provider; break;
  }

  if (!workerResponse.trim()) {
    throw new Error(`Every available AI failed. Last error: ${lastError || 'unknown'}`);
  }
  // [COST] Estimate Worker tokens from actual bytes — streamed response carries no token frame.
  const _wkInTok = Math.ceil((diagnosis.length + files.reduce((s, f) => s + (f.content?.length || 0), 0)) / 4) + 600;
  const _wkOutTok = Math.ceil(workerResponse.length / 4);
  deps.usageTracker?.recordUsage(_wkInTok + _wkOutTok, 0, providerUsed, _wkInTok, _wkOutTok, 'worker', path.basename(root));
  return { workerResponse: workerResponse.trim(), workerLabel: modelLabel(providerUsed) };
}
