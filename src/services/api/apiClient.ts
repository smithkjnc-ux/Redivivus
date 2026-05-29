// [SCOPE] Redivivus cloud API client -- routes AI calls through redivivus.dev instead of calling providers directly
// Account token stored in VS Code SecretStorage. Keys sent per-request, never persisted server-side.

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from '../ai/routingKeys.js';

const SECRET_KEY = 'redivivus.account.token';
const API_BASE_DEFAULT = 'https://redivivus.dev/api/v1';
export function getApiBase(): string {
  // [WARN] Never hardcode or rewrite to internal backend domains.
  // The extension always hits the public redivivus.dev domain.
  // Cloudflare proxies /api/v1 to the backend — internal URLs stay internal.
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
  return keys;
}

export function getPreferred(): string | undefined {
  return vscode.workspace.getConfiguration('redivivus').get<string>('defaultAI') || undefined;
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
export function logTelemetry(event: 'ai_prompt' | 'classify_intent', data: {
  model?: string; provider?: string; input_tokens?: number; output_tokens?: number;
  success?: boolean; intent?: string; project_name?: string;
}): void {
  getAccountToken().then(token => {
    if (!token) return;
    fetch(`${getApiBase()}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, ...data }),
    }).then(res => {
      if (res.status === 401) {
        clearAccountToken().then(() => vscode.commands.executeCommand('redivivus.refreshChat'));
      }
    }).catch(() => {});
  }).catch(() => {});
}

export async function cloudClassify(
  message: string,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string }
): Promise<IntentResult> {
  // [FIX] Let failures throw — classifyIntent's catch runs fallbackClassify(text) on error.
  // Previous catch returning { type: 'question' } swallowed all API failures silently,
  // routing every build request to Q&A when the classify endpoint was unreachable.
  return post<IntentResult>('/classify', {
    message,
    context,
    keys: collectKeys(),
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
