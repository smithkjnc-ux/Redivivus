// [SCOPE] Phase 1 (Supervisor) and Phase 2 (Worker) LLM invocations for the fix pipeline.
// [PHASE-1-HARDENING] Prompts are intentionally minimal — orchestration logic lives server-side.
// The extension sends context; the backend handles prompt engineering.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { buildSupervisorNotes, buildWorkerRules } from './chatPanelMsgFixPatterns';
import { streamProvider } from '../../services/ai/streamingProviders';

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
  const _bpBlock = _bp
    ? `PROJECT CONTEXT: ${_bp.what || ''}${_bp.where ? ` for ${_bp.where}` : ''}\n\n`
    : '';

  const diagPrompt = `${_bpBlock}${buildContext ? buildContext + '\n\n' : ''}User request: "${userText}"

${filesBlock}${projectDeadEnds ? `\n\nPreviously tried (do not suggest): ${projectDeadEnds}` : ''}${projectRules ? `\n\nProject rules:\n${projectRules}` : ''}
${buildSupervisorNotes(activePatterns)}`;

  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const fetchFn = (deps.routing as any).fetchWithTimeout;
  const keysPayload = require('../../services/api/apiClient.js').collectKeys();
  const { supervisor } = deps.routing.selectSupervisorAndWorker();
  const { bestModelForRole } = require('../../services/ai/modelRegistry.js');
  const actualSupervisorModel = bestModelForRole(supervisor, 'pro')?.modelId || supervisor;

  let diagRes: any;
  try {
    const res = await fetchFn(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: supervisor,
        model: actualSupervisorModel,
        keys: keysPayload,
        promptType: 'fix-supervisor',
        prompt: diagPrompt,
        maxTokens: 4000,
        temperature: 0.1
      })
    }, 120_000);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Supervisor API failed');
    diagRes = { success: true, text: data.text, model: supervisor, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
  } catch (err: any) {
    diagRes = { success: false, error: err.message };
  }

  if (!diagRes.success || !diagRes.text?.trim()) {
    throw new Error(`Supervisor returned no response. Error: ${diagRes.error || 'unknown'}.`);
  }
  let diagnosis = diagRes.text.trim();
  let subtasks: string[] = [];
  let executionMode: 'parallel' | 'sequential' = 'sequential';

  try {
    let cleanJson = '';
    const jsonBlockMatch = diagnosis.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) { cleanJson = jsonBlockMatch[1].trim(); }
    else { const m = diagnosis.match(/\{[\s\S]*"subtasks"[\s\S]*\}/); if (m) cleanJson = m[0]; }
    if (cleanJson) {
      const parsed = JSON.parse(cleanJson);
      if (parsed.diagnosis && Array.isArray(parsed.subtasks)) {
        diagnosis = parsed.diagnosis;
        subtasks = parsed.subtasks;
        if (parsed.executionMode === 'parallel') executionMode = 'parallel';
      }
    }
  } catch { /* treat as plain text */ }

  const supervisorLabel = modelLabel(diagRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((diagPrompt.length + diagnosis.length) / 4), 0, diagRes.model || 'claude', diagRes.inputTokens, diagRes.outputTokens, 'supervisor', require('path').basename(root));

  if (!isRetry) {
    const reqd = (diagnosis.match(/NEEDS_FILES:\n([\s\S]*?)(?=\n\n|$)/)?.[1] || '').trim().split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.includes('..') && !l.startsWith('/'));
    const extra = reqd.slice(0, 8).flatMap((rel: string) => { try { return [{ rel, content: fs.readFileSync(path.join(root, rel), 'utf-8') }]; } catch { return []; } });
    if (extra.length > 0) {
      const expanded = filesBlock + '\n\n' + extra.map((f: any) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      return runPhase1Supervisor(userText, expanded, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType, true);
    }
  }
  diagnosis = diagnosis.replace(/\nNEEDS_FILES:\n[\s\S]*$/, '').trim();
  return { diagnosis, subtasks, executionMode, supervisorLabel, expandedFilesBlock: filesBlock };
}

export async function runPhase2Worker(
  diagnosis: string,
  fileNames: string,
  filesBlock: string,
  activePatterns: any[],
  deps: MessageHandlerDeps,
  root: string,
  onChunk?: (chunk: string) => void,
  escalated?: boolean
): Promise<{ workerResponse: string, workerLabel: string } | null> {
  const fixPrompt = `${diagnosis}

Files: ${fileNames}

${filesBlock}
${buildWorkerRules(activePatterns, 9)}`;

  let workerAI = deps.routing.selectSupervisorAndWorker().worker || deps.routing.getAvailableAI().ai;
  if (escalated) { workerAI = deps.routing.selectSupervisorAndWorker().supervisor || workerAI; }
  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const keysPayload = require('../../services/api/apiClient.js').collectKeys();
  const { bestModelForRole } = require('../../services/ai/modelRegistry.js');
  const actualWorkerModel = bestModelForRole(workerAI, 'flash')?.modelId || workerAI;
  let workerResponse = '';
  const workerLabel = modelLabel(workerAI);

  try {
    const res = await fetch(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: workerAI, model: actualWorkerModel, keys: keysPayload,
        promptType: 'fix-worker', prompt: fixPrompt, maxTokens: 4000, temperature: 0.1, stream: true
      })
    });
    if (!res.ok) { const err: any = await res.json().catch(() => ({})); throw new Error(err.error || 'Worker API failed'); }
    if (res.body) {
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); workerResponse += chunk; if (onChunk) onChunk(chunk); }
    }
  } catch (err: any) {
    throw new Error(`Worker returned no response. Error: ${err.message || 'unknown'}.`);
  }

  if (!workerResponse.trim()) { throw new Error('Worker returned empty response.'); }
  deps.usageTracker?.recordUsage(Math.ceil((fixPrompt.length + workerResponse.length) / 4), 0, workerAI, 0, Math.ceil(workerResponse.length / 4), 'worker', require('path').basename(root));
  return { workerResponse: workerResponse.trim(), workerLabel };
}
