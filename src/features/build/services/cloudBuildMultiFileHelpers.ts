// [SCOPE] Helper functions for cloudBuildMultiFile.ts (Rule 9 split).
// Contains: per-file fetch+drain helper, and post-loop Guardian summary + result assembly.

import type { BuildRequestDeps } from '../../../features/ai/logic/chatPanelIntent.js';
import type { CloudBuildResult } from './cloudBuildTypes.js';
import { calcCost } from '../../telemetry/data/usageTracker.js';
import { processBuildResults } from './cloudBuildResultProcessor.js';

export type SingleFileResult = {
  files: Array<{ path: string; content: string; isNew: boolean }>;
  model: string;
  workerProvider?: string;
  supervisorProvider?: string;
  inputTokens: number;
  outputTokens: number;
  requiresClientExecution?: boolean;
  guardianSplit?: boolean;
  guardianIssues?: string[];
  guardianNote?: string;
  guardianRetries?: number;
  guardianEscInputTokens?: number;
  guardianEscOutputTokens?: number;
};

/**
 * Fetch one file from the /build endpoint and drain the SSE stream.
 * Routes @@RDV_STEP@@ / @@RDV_CODE@@ / @@RDV_RESULT@@ frames; throws on auth or API errors.
 */
export async function buildSingleFileViaBuildEndpoint(
  base: string, token: string, keyHeaders: Record<string, string>,
  body: string, filePath: string,
  onStep?: (step: any) => void, onCode?: (text: string) => void,
): Promise<SingleFileResult> {
  const res = await fetch(`${base}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...keyHeaders },
    body,
  });
  if (res.status === 401) {
    const { clearAccountToken } = await import('../../../features/api/data/apiClient.js');
    await clearAccountToken();
    throw Object.assign(new Error('NOT_AUTHENTICATED'), { _authError: true });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    // err.error may be a nested object (Anthropic: {type, message}) — extract the string message
    const errDetail = typeof err.error === 'object'
      ? (err.error?.message || err.error?.type || JSON.stringify(err.error).slice(0, 200))
      : (err.error || res.statusText);
    throw Object.assign(new Error(`Failed on ${filePath}: ${errDetail}`), { _failureSource: 'cloud' });
  }
  if (!res.body) {
    throw Object.assign(new Error(`Failed on ${filePath}: No response body`), { _failureSource: 'cloud' });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuf = '';
  let payloadResult: any = null;
  const routeFrame = (t: string): boolean => {
    if (t.startsWith('@@RDV_STEP@@')) { try { onStep?.(JSON.parse(t.slice(12))); } catch {} return true; }
    if (t.startsWith('@@RDV_CODE@@')) { try { onCode?.(JSON.parse(t.slice(12)).text || ''); } catch {} return true; }
    if (t.startsWith('@@RDV_RESULT@@')) { try { payloadResult = JSON.parse(t.slice(14)); } catch {} return true; }
    return false;
  };
  const drain = (incoming: string, isFinal: boolean) => {
    lineBuf += incoming;
    let nl: number;
    while ((nl = lineBuf.indexOf('\n')) >= 0) { const line = lineBuf.slice(0, nl); lineBuf = lineBuf.slice(nl + 1); routeFrame(line.trimStart()); }
    if (isFinal && lineBuf) { routeFrame(lineBuf.trimStart()); lineBuf = ''; }
  };
  while (true) { const { done, value } = await reader.read(); if (done) { break; } drain(decoder.decode(value, { stream: true }), false); }
  drain('', true);
  if (!payloadResult) { throw Object.assign(new Error(`Failed on ${filePath}: Build stream ended without a result payload`), { _failureSource: 'cloud' }); }
  if (payloadResult.error) {
    // Server may forward raw Anthropic JSON — extract the human message so looksLikeQuotaError matches
    let _payErr = payloadResult.error;
    try { const j = typeof _payErr === 'string' ? _payErr.indexOf('{') : -1; if (j !== -1) { const p = JSON.parse(_payErr.slice(j)); _payErr = p?.error?.message || p?.message || _payErr; } } catch { /* keep raw */ }
    throw Object.assign(new Error(`Failed on ${filePath}: ${_payErr}`), { _failureSource: 'cloud' });
  }
  return payloadResult as SingleFileResult;
}

export function logGuardianStep(
  data: SingleFileResult,
  file: { path: string },
  normalised: Array<{ path: string; content: string }>,
  guardianLog: string[],
  onStep?: (step: any) => void,
  supervisorName?: string,
  planFilesLength?: number,
  i?: number,
  lastModel?: string
) {
  const _gd = data as any;
  const _gIssues = Array.isArray(_gd.guardianIssues) ? _gd.guardianIssues.filter(Boolean)
    : (typeof _gd.guardianNote === 'string' && _gd.guardianNote.trim() ? [_gd.guardianNote.trim()] : []);
  const _gRetries = typeof _gd.guardianRetries === 'number' ? _gd.guardianRetries : 0;
  if (_gd.guardianSplit && normalised.length >= 2) {
    guardianLog.push(`⚠ ${file.path} — too large/mixed concerns → split into ${normalised.map(f => f.path).join(', ')}`);
  } else if (_gIssues.length > 0) {
    guardianLog.push(`⚠ ${file.path} — fixed: ${_gIssues.join('; ')}${_gRetries ? ` (${_gRetries} retr${_gRetries === 1 ? 'y' : 'ies'})` : ''}`);
  } else if (_gRetries > 0) {
    guardianLog.push(`⚠ ${file.path} — auto-corrected after ${_gRetries} retr${_gRetries === 1 ? 'y' : 'ies'}`);
  } else {
    guardianLog.push(`✓ ${file.path} — passed all checks`);
  }
  if (_gd.guardianSplit && normalised.length >= 2) {
    const splitDetail = normalised.map(f => `// === ${f.path} ===\n${f.content}`).join('\n\n');
    onStep?.({ label: `Guardian: split → ${normalised.map(f => f.path.split('/').pop()).join(', ')}`, model: `${supervisorName} → Guardian`, status: 'success', detail: splitDetail, kind: 'code', index: i, total: planFilesLength, updateLatest: true });
  } else {
    const workerCode = normalised.map(f => f.content).join('\n\n');
    onStep?.({ label: `Built ${file.path}`, model: `${supervisorName} → ${lastModel}`, status: 'success', detail: workerCode, kind: 'code', index: i, total: planFilesLength, updateLatest: true });
  }
}

/**
 * Emit the final Guardian validation step, compute cost, and call processBuildResults.
 * Called after all per-file Workers have finished.
 */
export async function finalizeMultiFileBuild(
  allFiles: Array<{ path: string; content: string; isNew: boolean }>,
  guardianLog: string[],
  totalFiles: number,
  task: string, root: string, deps: BuildRequestDeps,
  supervisorModel: string | null, supervisorProvider: string | null,
  supervisorInputTokens: number, supervisorOutputTokens: number,
  workerInputTokens: number, workerOutputTokens: number,
  lastModel: string, lastWorkerProvider: string,
  onStep?: (step: any) => void,
): Promise<CloudBuildResult> {
  const _flagged = guardianLog.filter(l => l.startsWith('⚠')).length;
  const guardianDetail = [
    'The Guardian validates every file the Worker produced before the build completes.',
    '',
    'WHAT IT CHECKS FOR:',
    '• File size — flags oversized files and splits them into focused modules (FILE_TOO_LARGE)',
    '• ES module structure — imports/exports are valid and resolve to real sibling files (IMPORT_MISMATCH)',
    '• Element IDs — IDs referenced in JS exist in the HTML and are unique (ELEMENT_ID_MISMATCH)',
    '• Broken references — no calls to undefined functions or missing files',
    '',
    `FILES VALIDATED (${allFiles.length}):`,
    ...guardianLog.map(l => `  ${l}`),
  ].join('\n');
  const guardianLabel = _flagged > 0
    ? `Guardian: validated ${allFiles.length} files — ${_flagged} needed correction`
    : `Guardian: validated ${allFiles.length} files — all passed`;
  onStep?.({ label: guardianLabel, model: 'guardian', status: 'success', detail: guardianDetail, index: totalFiles, total: totalFiles });

  const narration = `Built ${allFiles.length} files for: ${task.slice(0, 60)}${task.length > 60 ? '...' : ''}`;
  const wCost = calcCost(lastWorkerProvider || lastModel, workerInputTokens, workerOutputTokens);
  const sCost = supervisorModel ? calcCost(supervisorModel, supervisorInputTokens, supervisorOutputTokens) : 0;

  return processBuildResults(
    { files: allFiles, narration, model: lastModel, inputTokens: workerInputTokens, outputTokens: workerOutputTokens, costUSD: wCost + sCost,
      supervisorRan: !!supervisorModel, supervisorModel: supervisorModel ?? undefined, supervisorProvider: supervisorProvider ?? undefined,
      supervisorInputTokens, supervisorOutputTokens, workerProvider: lastWorkerProvider },
    task, root, deps, { source: 'cloud' },
  );
}
