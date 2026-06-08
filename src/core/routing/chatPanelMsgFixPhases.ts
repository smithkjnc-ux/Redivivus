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
  const fileBlocks = filesBlock.split(/\n\/\/ === FILE: /).slice(1);
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
  const supervisorModel = bestModelForRole(supervisor, 'pro')?.modelId || supervisor;

  let diagRes: any;
  try {
    const res = await fetchFn(`${base}/fix-supervisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        userText,
        files: files.map(f => ({ path: f.path, content: f.content, size: f.size })),
        context: {
          blueprint: _bp || undefined,
          projectRules: projectRules || undefined,
          deadEnds: projectDeadEnds || undefined,
          roadmapSnippet: roadmapSnippet || undefined,
          patternNotes: buildSupervisorNotes(activePatterns) || undefined,
          fileMetrics: {
            totalSize,
            largestFile: { path: largestFile.path, size: largestFile.size },
            fileCount: files.length
          }
        },
        supervisor,
        supervisorModel,
        keys: keysPayload,
      })
    }, 120_000);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Supervisor API failed');
    diagRes = data;
  } catch (err: any) {
    throw new Error(err.message || 'Supervisor request failed');
  }

  const { diagnosis, subtasks = [], executionMode = 'sequential', inputTokens, outputTokens } = diagRes;
  if (!diagnosis) throw new Error('Supervisor returned no diagnosis.');

  deps.usageTracker?.recordUsage(
    Math.ceil((diagnosis.length) / 4), 0, supervisor,
    inputTokens, outputTokens, 'supervisor', path.basename(root)
  );

  return { diagnosis, subtasks, executionMode, supervisorLabel: modelLabel(supervisor), expandedFilesBlock: filesBlock };
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
  const fileBlocks = filesBlock.split(/\n\/\/ === FILE: /).slice(1);
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
  const workerModel = bestModelForRole(workerAI, 'flash')?.modelId || workerAI;

  let workerResponse = '';
  try {
    const res = await fetch(`${base}/fix-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        diagnosis,
        files: files.map(f => ({ path: f.path, content: f.content, size: f.size })),
        context: {
          patternRules: buildWorkerRules(activePatterns, 9) || undefined,
          fileMetrics: {
            totalSize,
            largestFile: { path: largestFile.path, size: largestFile.size },
            fileCount: files.length
          },
          forceSurgical: !!forceSurgical
        },
        worker: workerAI,
        workerModel,
        supervisorProvider: supervisor,
        escalated: !!escalated,
        keys: keysPayload,
        stream: true,
      })
    });
    if (!res.ok) { const err: any = await res.json().catch(() => ({})); throw new Error(err.error || 'Worker API failed'); }
    if (res.body) {
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); workerResponse += chunk; if (onChunk) onChunk(chunk); }
    }
  } catch (err: any) {
    throw new Error(`Worker failed: ${err.message || 'unknown'}`);
  }

  if (!workerResponse.trim()) throw new Error('Worker returned empty response.');
  deps.usageTracker?.recordUsage(
    Math.ceil((diagnosis.length + workerResponse.length) / 4), 0, workerAI,
    0, Math.ceil(workerResponse.length / 4), 'worker', path.basename(root)
  );
  return { workerResponse: workerResponse.trim(), workerLabel: modelLabel(workerAI) };
}
