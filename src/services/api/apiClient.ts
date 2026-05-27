// [SCOPE] Redivivus cloud API client -- routes AI calls through redivivus.dev instead of calling providers directly
// Account token stored in VS Code SecretStorage. Keys sent per-request, never persisted server-side.

import * as vscode from 'vscode';
import { getGeminiKey, getClaudeKey, getOpenAIKey, getGroqKey, getXAIKey, getKimiKey } from '../ai/routingKeys.js';

const SECRET_KEY = 'redivivus.account.token';
const API_BASE_DEFAULT = 'https://redivivus.dev/api/v1';
export function getApiBase(): string {
  const base = vscode.workspace.getConfiguration('redivivus').get<string>('apiBase') || API_BASE_DEFAULT;
  return base.replace('redivivus.dev', 'redivivus-backend.pages.dev');
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
    const err = await res.json().catch(() => ({ error: res.statusText })) as any;
    throw new Error(err.error || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface AIResponse {
  text: string;
  model: string;
  success: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  usingFallback?: string;
}

export async function cloudPrompt(
  text: string,
  opts: { systemMessage?: string; tier?: 'flash' | 'pro' } = {}
): Promise<AIResponse> {
  try {
    // Step 1: Get routing instructions from backend (SECRET SAUCE)
    const instructions = await post<any>('/prompt', {
      text,
      keys: collectKeys(),
      preferred: getPreferred(),
      systemMessage: opts.systemMessage,
      tier: opts.tier ?? 'flash',
    });

    if (instructions.requiresClientExecution) {
      // Step 2: Execute AI call client-side using backend routing instructions
      const { callProvider } = await import('../../core/ai/providers/providerFactory.js');
      
      const response = await callProvider(
        instructions.instructions.routing.selectedProvider,
        instructions.instructions.prompt,
        createFetchWithTimeout(),
        undefined, // geminiModel
        undefined, // imageBase64
        undefined, // imageType
        instructions.instructions.systemMessage
      );

      return {
        text: response.text,
        model: response.model || instructions.instructions.routing.model,
        success: response.success,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        usingFallback: response.usingFallback
      };
    } else {
      // Fallback to legacy behavior
      return instructions as AIResponse;
    }
  } catch (err: any) {
    return { text: '', model: 'none', success: false, error: err.message };
  }
}

// Helper: Create fetch with timeout for AI calls
function createFetchWithTimeout() {
  return async (url: string, options: RequestInit, timeoutMs?: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 60000);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
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
    }).catch(() => {});
  }).catch(() => {});
}

export async function cloudClassify(
  message: string,
  context?: { projectName?: string; workspacePath?: string; blueprintStatus?: string }
): Promise<IntentResult> {
  try {
    return await post<IntentResult>('/classify', {
      message,
      context,
      keys: collectKeys(),
      preferred: getPreferred(),
    });
  } catch {
    return { type: 'question' };
  }
}
