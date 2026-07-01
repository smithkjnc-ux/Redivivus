// [SCOPE] Fire-and-forget telemetry helpers — logTelemetry, logSessionStart, logGotcha.
// Extracted from apiClient.ts (Rule 9 split). No circular dep: imports auth/base from apiClient but is not re-exported by it.

import * as vscode from 'vscode';
import { getAccountToken, clearAccountToken, getApiBase } from './apiClient.js';

// [FIX] Reliable extension version for telemetry — cached after first resolve.
let _ideVersionCache: string | undefined;
function getIdeVersion(): string {
  if (_ideVersionCache) { return _ideVersionCache; }
  let v = '';
  try { v = String(require('../../../../package.json').version || ''); } catch { /* not found at this path */ }
  if (!v) {
    try { v = String((vscode.extensions.all.find(e => e.id.toLowerCase().endsWith('.redivivus')) as any)?.packageJSON?.version || ''); } catch { /* no vscode */ }
  }
  _ideVersionCache = v || 'unknown';
  return _ideVersionCache;
}

// [FIX] Resolve user id from `existing-user-token-{uuid}` token format (NOT a JWT).
function userIdFromToken(token: string): string | null {
  try {
    if (token.startsWith('existing-user-token-')) {
      const id = token.replace('existing-user-token-', '');
      return /^[0-9a-f-]{32,40}$/i.test(id) ? id : null;
    }
    let b64 = (token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) { b64 += '='; }
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch { return null; }
}

/** Fire-and-forget telemetry after direct AI calls — never blocks, never throws. */
export function logTelemetry(event: 'ai_prompt' | 'classify_intent', data: {
  model?: string; provider?: string; input_tokens?: number; output_tokens?: number;
  success?: boolean; intent?: string; project_name?: string;
}): void {
  getAccountToken().then(async token => {
    if (!token) { return; }
    const uid = userIdFromToken(token);
    fetch(`${getApiBase()}/telemetry/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(uid ? { 'x-redivivus-user-id': uid } : {}) },
      body: JSON.stringify({
        event, ...data,
        ide_version: getIdeVersion(),
        configured_providers: (() => { try { return require('../../ai/data/secretKeyStore.js').getConfiguredProviders(); } catch { return []; } })(),
      }),
    }).then(res => {
      if (res.status === 401) { clearAccountToken().then(() => vscode.commands.executeCommand('redivivus.refreshChat')); }
      // [WARN] Log non-200 so backend outages don't silently drop all activity tracking.
      if (!res.ok && res.status !== 401) {
        res.text().then(body => {
          try { require('../../logging/data/fixPipelineLogger.js').fixLog(`[TELEMETRY] POST /telemetry/ → ${res.status}: ${body.slice(0, 200)}`); } catch { /* non-blocking */ }
        }).catch(() => {});
      }
    }).catch(() => {});
  }).catch(() => {});
}

/** Session heartbeat — records IDE version + configured providers on activation. */
export function logSessionStart(): void {
  getAccountToken().then(token => {
    if (!token) { return; }
    const uid = userIdFromToken(token);
    fetch(`${getApiBase()}/telemetry/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(uid ? { 'x-redivivus-user-id': uid } : {}) },
      body: JSON.stringify({
        event: 'session_start',
        ide_version: getIdeVersion(),
        configured_providers: (() => { try { return require('../../ai/data/secretKeyStore.js').getConfiguredProviders(); } catch { return []; } })(),
      }),
    }).catch(() => {});
  }).catch(() => {});
}

/** Fire-and-forget: send a Guardian-caught issue to backend for collective learning. */
export function logGotcha(opts: {
  pattern: string;
  issueText: string;
  buildContext?: string;
  taskSummary?: string;
  workerModel?: string;
  guardianModel?: string;
}): void {
  getAccountToken().then(token => {
    if (!token) { return; }
    fetch(`${getApiBase()}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event: 'guardian_catch', ...opts }),
    }).catch(() => {});
  }).catch(() => {});
}
