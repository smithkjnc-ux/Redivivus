// [SCOPE] Redivivus cloud API client -- routes AI calls through the Cloud Run backend.
// Keys: stored in settings.json on device only. Sent to backend as X-Provider-Keys header (not body).

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey, getDeepseekKey } from '../../shared/ai/infrastructure/routingKeys.js';

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
  const { selectSupervisorAndWorker } = require('../../shared/ai/infrastructure/routingServiceRoster.js');
  const { getGeminiKey: gk, getClaudeKey: ck, getOpenAIKey: ok, getGroqKey: gr, getXAIKey: xk, getKimiKey: km, getDeepseekKey: dk } = require('../../shared/ai/infrastructure/routingKeys.js');
  const keyMap: Record<string, () => string | null> = { gemini: gk, claude: ck, openai: ok, groq: gr, xai: xk, kimi: km, deepseek: dk };
  const { supervisor } = selectSupervisorAndWorker(keyMap);
  // [STICKY-SKIP] If the top-ranked supervisor is already flagged out-of-credits/bad-key this session, lead a
  // build with the next live provider instead — otherwise every build starts on the dead provider and only
  // fails over server-side, wasting a hop each time. Falls back to the top pick if ALL are flagged (recovery).
  let chosen = supervisor;
  try {
    const { isProviderUnavailable } = require('../../shared/ai/infrastructure/providerTierState.js');
    if (chosen && isProviderUnavailable(chosen)) {
      const { buildRoster } = require('../../shared/ai/infrastructure/routingServiceRoster.js');
      const roster = buildRoster(keyMap);
      const ranked = [roster.supervisor, ...roster.workers].filter(Boolean);
      chosen = ranked.find((p: string) => !isProviderUnavailable(p)) || chosen;
    }
  } catch { /* availability check is best-effort — never block provider selection */ }
  return chosen || vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || undefined;
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

// [DONE] logTelemetry, logSessionStart, logGotcha moved to apiClientTelemetry.ts (Rule 9 split)
// Callers import directly from apiClientTelemetry.ts to avoid circular ESM dependency.

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
