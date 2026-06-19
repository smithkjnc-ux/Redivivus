// [SCOPE] Redivivus cloud API client -- routes AI calls through the Cloud Run backend.
// Keys: stored in settings.json on device only. Sent to backend as X-Provider-Keys header (not body).

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from '../ai/routingKeys.js';

const SECRET_KEY = 'redivivus.account.token';
// [FIX] Default to PRODUCTION (Cloud Run), like any shipped client — so dev builds test the real deployed
// backend, not a local server. Pointing at localhost gave inaccurate tests (different code, latency,
// cold-start behavior). To develop against a local backend, explicitly set `redivivus.apiBase` to
// http://localhost:3000/api/v1 — it's now opt-IN, never the default.
const API_BASE_DEFAULT = 'https://redivivus-backend-1017737301468.us-east4.run.app/api/v1';
export function getApiBase(): string {
  // [WARN] Never hardcode or rewrite to stale Cloudflare/legacy domains.
  // The extension hits the Cloud Run backend (…us-east4.run.app) directly — redivivus.dev is no
  // longer the API origin. A legacy Fly.io deployment (redivivus-backend.fly.dev) still runs in
  // parallel but no shipped client points to it; do not switch the default back to Fly.
  return vscode.workspace.getConfiguration('redivivus').get<string>('apiBase') || API_BASE_DEFAULT;
}

let _ctx: vscode.ExtensionContext | null = null;

export function initApiClient(ctx: vscode.ExtensionContext): void {
  _ctx = ctx;
}

let _cachedToken: string | null = null;

export async function getAccountToken(): Promise<string | null> {
  if (_ctx && _ctx.globalState.get('redivivus.signedOut') === true) {
    _cachedToken = null;
    return null;
  }
  if (_cachedToken) return _cachedToken;
  const token = _ctx ? (await _ctx.secrets.get(SECRET_KEY) ?? null) : null;
  if (token && token.trim() !== '') {
    _cachedToken = token;
    return token;
  }
  return null;
}

export async function setAccountToken(token: string): Promise<void> {
  if (_ctx) { 
    await _ctx.globalState.update('redivivus.signedOut', false);
    _cachedToken = token.trim();
    try { await _ctx.secrets.store(SECRET_KEY, token.trim()); } catch (e) { console.error('Failed to store secret:', e); }
  }
}

export async function clearAccountToken(): Promise<void> {
  if (_ctx) { 
    await _ctx.globalState.update('redivivus.signedOut', true); // Bulletproof override
    _cachedToken = null;
    try { await _ctx.secrets.store(SECRET_KEY, ''); } catch {}
    try { await _ctx.secrets.delete(SECRET_KEY); } catch {}
  }
}

export function collectKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  const g = getGeminiKey(); if (g) { keys.gemini = g; }
  const c = getClaudeKey(); if (c) { keys.claude = c; }
  const o = getOpenAIKey(); if (o) { keys.openai = o; }
  const gr = getGroqKey(); if (gr) { keys.groq = gr; }
  const x = getXAIKey(); if (x) { keys.xai = x; }
  const k = getKimiKey(); if (k) { keys.kimi = k; }
  const d = getDeepseekKey(); if (d) { keys.deepseek = d; }
  return keys;
}

/** Returns AI provider keys as an HTTP header record.
 *  Use this instead of putting keys in the request body -- headers are excluded from most log configs. */
export function collectKeyHeaders(): Record<string, string> {
  const keys = collectKeys();
  if (Object.keys(keys).length === 0) { return {}; }
  return { 'X-Provider-Keys': JSON.stringify(keys) };
}

export function getPreferred(): string | undefined {
  // Use the top-ranked available AI (supervisor), not the manually-set defaultAI preference.
  // defaultAI is the user's chat default — it doesn't reflect which AI should be supervisor.
  const { selectSupervisorAndWorker } = require('../ai/routingServiceRoster.js');
  const { getGeminiKey: gk, getClaudeKey: ck, getOpenAIKey: ok, getGroqKey: gr, getXAIKey: xk, getKimiKey: km, getDeepseekKey: dk } = require('../ai/routingKeys.js');
  const keyMap: Record<string, () => string | null> = { gemini: gk, claude: ck, openai: ok, groq: gr, xai: xk, kimi: km, deepseek: dk };
  const { supervisor } = selectSupervisorAndWorker(keyMap);
  return supervisor || vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || undefined;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccountToken();
  // [WARN] Falls back to unauthenticated if no token — server returns 401, caller must handle.
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      // Auto-logout: if server rejected our token, we are signed out.
      await clearAccountToken();
      vscode.commands.executeCommand('redivivus.refreshChat');
    }
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    throw new Error(err.error || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}



export interface IntentResult {
  type: 'build' | 'fix' | 'convert' | 'run' | 'scaffold' | 'service' | 'question' | 'command' | 'offtopic';
  command?: string;
}

// Fire-and-forget telemetry after direct AI calls — never blocks, never throws
// [FIX] Reliable extension version for telemetry. The old inline code read
// `(await import('../../extension.js')).default.packageJSON.version`, which NEVER resolves — extension.js
// exports activate/deactivate, not a `default` with packageJSON — so ide_version was effectively never sent
// and the rigops admin dashboard showed "—". Read the extension's own package.json, with a vscode.extensions
// fallback, cached after the first successful resolve.
let _ideVersionCache: string | undefined;
function getIdeVersion(): string {
  if (_ideVersionCache) { return _ideVersionCache; }
  let v = '';
  try { v = String(require('../../../package.json').version || ''); } catch { /* not found at this path */ }
  if (!v) {
    try { v = String((vscode.extensions.all.find(e => e.id.toLowerCase().endsWith('.redivivus')) as any)?.packageJSON?.version || ''); } catch { /* no vscode */ }
  }
  _ideVersionCache = v || 'unknown';
  return _ideVersionCache;
}

// [FIX] Resolve the user id from the IDE's auth token and send it as an x-redivivus-user-id telemetry
// header. The IDE issues `existing-user-token-{uuid}` tokens (NOT JWTs) which the backend's
// supabase.auth.getUser() can't parse — so every telemetry row landed with user_id: null and the admin
// dashboard could never attribute ide_version. Telemetry is not security-sensitive (the route is
// intentionally anonymous-tolerant), so the header attribution is acceptable. (Backend also has the cleaner
// resolveUserFromToken fix.)
function userIdFromToken(token: string): string | null {
  try {
    // [FIX] The IDE's token is `existing-user-token-{uuid}` — NOT a JWT (this is why JWT decoding gave null).
    // Extract the uuid directly. (Standard-JWT path kept as a fallback for any future JWT-based auth.)
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

export function logTelemetry(event: 'ai_prompt' | 'classify_intent', data: {
  model?: string; provider?: string; input_tokens?: number; output_tokens?: number;
  success?: boolean; intent?: string; project_name?: string;
}): void {
  getAccountToken().then(async token => {
    if (!token) return;
    const uid = userIdFromToken(token);
    fetch(`${getApiBase()}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(uid ? { 'x-redivivus-user-id': uid } : {}) },
      body: JSON.stringify({
        event,
        ...data,
        ide_version: getIdeVersion(),
        configured_providers: (() => { try { return require('../ai/secretKeyStore.js').getConfiguredProviders(); } catch { return []; } })(),
      }),
    }).then(res => {
      if (res.status === 401) {
        clearAccountToken().then(() => vscode.commands.executeCommand('redivivus.refreshChat'));
      }
    }).catch(() => {});
  }).catch(() => {});
}

/** [FIX] Session heartbeat — records the IDE version + configured providers on activation, so the admin
 *  dashboard (rigops) reliably shows each user's IDE Version. Without this, ide_version only rode on the
 *  occasional client-side ai_prompt call; normal usage (chat/build go through backend endpoints) never
 *  carried it, so the dashboard showed "—". Stored in activity_logs (event 'session_start') like any event. */
export function logSessionStart(): void {
  getAccountToken().then(token => {
    if (!token) { return; }
    const uid = userIdFromToken(token);
    fetch(`${getApiBase()}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(uid ? { 'x-redivivus-user-id': uid } : {}) },
      body: JSON.stringify({
        event: 'session_start',
        ide_version: getIdeVersion(),
        configured_providers: (() => { try { return require('../ai/secretKeyStore.js').getConfiguredProviders(); } catch { return []; } })(),
      }),
    }).catch(() => {});
  }).catch(() => {});
}

/** Fire-and-forget: send a Guardian-caught issue to backend for collective learning.
 *  Stored in guardian_catches table → aggregated into community_gotchas view →
 *  fetched by all extension users → injected into every Worker + Guardian prompt.
 *  Also feeds training_pairs view for future Redivivus-specific LLM fine-tuning. */
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



export async function cloudClassify(
  message: string,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string }
): Promise<IntentResult> {
  // [FIX] Keys removed from classify body — the classify endpoint only needs account token + message.
  // Keys belong in X-Provider-Keys header on build/guardian calls only.
  return post<IntentResult>('/classify', {
    message,
    context,
    preferred: getPreferred(),
  });
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await fetch(`${getApiBase()}/announcements`);
    if (res.ok) {
      const data = await res.json() as { announcements: Announcement[] };
      return data.announcements ?? [];
    }
    return [];
  } catch {
    return [];
  }
}
