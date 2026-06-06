// [SCOPE] Phase 1 (Supervisor) and Phase 2 (Worker) LLM invocations for the fix pipeline.

import * as fs from 'fs';
import * as path from 'path';
import type { MessageHandlerDeps } from './chatPanelMessages';
import { modelLabel } from './chatPanelMsgFixUtils';
import { buildSupervisorNotes, buildWorkerRules } from './chatPanelMsgFixPatterns';
import { Redivivus_WORKER_RULES } from '../../services/ai/redivivusWorkerRules';
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
): Promise<{ diagnosis: string, supervisorLabel: string, expandedFilesBlock: string } | null> {
  // Blueprint context (who/what/where/when/why) — tells Supervisor what the project is
  const _cfg = deps.redivivus?.loadConfig?.();
  const _bp = _cfg?.blueprint;
  const _bpBlock = _bp
    ? `PROJECT BLUEPRINT:\n- What: ${_bp.what}\n- Who: ${_bp.who}\n- Platform/Where: ${_bp.where}\n- Timeline: ${_bp.when}\n- Goal: ${_bp.why}\n\n`
    : '';

  // Recent roadmap entries — tells Supervisor what changed recently
  let _roadmapBlock = '';
  try { const _rp = path.join(root, 'REDIVIVUS_ROADMAP.md'); if (fs.existsSync(_rp)) { const _recent = fs.readFileSync(_rp, 'utf-8').slice(-700).trim(); if (_recent) { _roadmapBlock = `RECENT PROJECT CHANGES:\n${_recent}\n\n`; } } } catch {}

  // File skeleton — architecture overview from [SCOPE] annotations without full file content
  const _skelLines: string[] = [];
  for (const blk of filesBlock.split(/\n\/\/ === FILE: /).slice(1)) {
    const nl = blk.indexOf('\n'); if (nl === -1) { continue; }
    const rel = blk.slice(0, nl).replace(/\s*===\s*$/, '').trim();
    const scopeLine = blk.slice(nl + 1).split('\n').slice(0, 4).find(l => /\[SCOPE\]|\[NARRATOR\]/.test(l));
    if (scopeLine) { _skelLines.push(`  ${rel}: ${scopeLine.replace(/\/\/\s*\[(?:SCOPE|NARRATOR)\]\s*/i, '').trim()}`); }
  }
  const _skelBlock = _skelLines.length > 0 ? `FILE ARCHITECTURE (role of each file):\n${_skelLines.join('\n')}\n\n` : '';

  const diagPrompt = `${_bpBlock}${_roadmapBlock}${_skelBlock}${buildContext ? buildContext + '\n\n' : ''}User reports: "${userText}"

Source files:
${filesBlock}${projectDeadEnds ? `\n\nPREVIOUSLY FAILED APPROACHES (DO NOT suggest these again):\n${projectDeadEnds}` : ''}${projectRules ? `\n\nPROJECT RULES (your fix must not violate these):\n${projectRules}` : ''}
${buildSupervisorNotes(activePatterns)}`;

  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const fetchFn = (deps.routing as any).fetchWithTimeout;
  const keyMap = deps.routing.getKeyMap();
  const { supervisor } = deps.routing.selectSupervisorAndWorker();

  let diagRes: any;
  try {
    const res = await fetchFn(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: supervisor,
        model: supervisor,
        keys: keyMap,
        promptType: 'fix-supervisor',
        prompt: diagPrompt,
        maxTokens: 4000,
        temperature: 0.1
      })
    }, 60_000);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Supervisor API failed');
    diagRes = { success: true, text: data.text, model: supervisor, inputTokens: data.inputTokens, outputTokens: data.outputTokens };
  } catch (err: any) {
    diagRes = { success: false, error: err.message };
  }

  if (!diagRes.success || !diagRes.text?.trim()) {
    throw new Error(`Supervisor returned no response. Error: ${diagRes.error || 'unknown'}. Check your API key in Settings.`);
  }
  let diagnosis = diagRes.text.trim();
  const supervisorLabel = modelLabel(diagRes.model);
  deps.usageTracker?.recordUsage(Math.ceil((diagPrompt.length+diagnosis.length)/4), 0, diagRes.model||'claude', diagRes.inputTokens, diagRes.outputTokens, 'supervisor', require('path').basename(root));
  if (!isRetry) { // Expand context if Supervisor identified missing files (one round-trip only)
    const reqd = (diagnosis.match(/NEEDS_FILES:\n([\s\S]*?)(?=\n\n|$)/)?.[1] || '').trim().split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.includes('..') && !l.startsWith('/'));
    const extra = reqd.slice(0, 8).flatMap((rel: string) => { try { return [{ rel, content: fs.readFileSync(path.join(root, rel), 'utf-8') }]; } catch { return []; } });
    if (extra.length > 0) {
      const expanded = filesBlock + '\n\n' + extra.map((f: any) => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');
      return runPhase1Supervisor(userText, expanded, buildContext, activePatterns, projectDeadEnds, projectRules, deps, root, imageBase64, imageType, true);
    }
  }
  diagnosis = diagnosis.replace(/\nNEEDS_FILES:\n[\s\S]*$/, '').trim();
  return { diagnosis, supervisorLabel, expandedFilesBlock: filesBlock };
}

export async function runPhase2Worker(
  diagnosis: string,
  fileNames: string,
  filesBlock: string,
  activePatterns: any[],
  deps: MessageHandlerDeps,
  root: string,
  onChunk?: (chunk: string) => void
): Promise<{ workerResponse: string, workerLabel: string } | null> {
  const fixPrompt = `SUPERVISOR ANALYSIS:
${diagnosis}

PROJECT SOURCE FILES:
${fileNames}

${filesBlock}
${buildWorkerRules(activePatterns, 9)}`;

  const workerAI = deps.routing.selectSupervisorAndWorker().worker || deps.routing.getAvailableAI().ai;
  const base = require('../../services/api/apiClient.js').getApiBase();
  const token = await require('../../services/api/apiClient.js').getAccountToken();
  const keyMap = deps.routing.getKeyMap();
  
  let workerResponse = '';
  const workerLabel = modelLabel(workerAI);

  try {
    const res = await fetch(`${base}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        provider: workerAI,
        model: workerAI,
        keys: keyMap,
        promptType: 'fix-worker',
        prompt: fixPrompt,
        maxTokens: 4000,
        temperature: 0.1,
        stream: true
      })
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Worker API failed');
    }

    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        workerResponse += chunk;
        if (onChunk) onChunk(chunk);
      }
    }
  } catch (err: any) {
    throw new Error(`Worker returned no response. Error: ${err.message || 'unknown'}.`);
  }

  if (!workerResponse.trim()) {
    throw new Error(`Worker returned empty response.`);
  }

  deps.usageTracker?.recordUsage(Math.ceil((fixPrompt.length+workerResponse.length)/4), 0, workerAI, 0, Math.ceil(workerResponse.length/4), 'worker', require('path').basename(root));
  return { workerResponse: workerResponse.trim(), workerLabel };
}

