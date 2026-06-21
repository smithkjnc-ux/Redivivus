// [SCOPE] SecretStorage-backed AI provider key store. Keys encrypted in OS keychain (local device only).
// Key source order: SecretStorage → redivivus.* settings.json (promoted into SecretStorage on first read) → env.
// Use getKeyCached() for sync read.
// [WARN] getKeyCached() returns null before init completes — always call after activation.

import * as vscode from 'vscode';

const PROVIDERS = ['gemini', 'claude', 'openai', 'groq', 'xai', 'kimi', 'deepseek'] as const;
type Provider = typeof PROVIDERS[number];

const SECRET_PREFIX = 'redivivus.apikey.';
const SETTINGS_MAP: Record<Provider, string> = {
  gemini: 'geminiApiKey', claude: 'claudeApiKey', openai: 'openaiApiKey',
  groq: 'groqApiKey', xai: 'xaiApiKey', kimi: 'kimiApiKey', deepseek: 'deepseekApiKey',
};
export const ENV_MAP: Record<Provider, string> = {
  gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', kimi: 'MOONSHOT_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
};

let _ctx: vscode.ExtensionContext | null = null;
const _cache: Partial<Record<Provider, string | null>> = {};
let _initialized = false;
// [FIX] Post-init callbacks — fired once after all SecretStorage reads complete so callers that
// ran before init (e.g. panel auto-open at 500ms) can re-render with the real key set.
const _readyCallbacks: Array<() => void> = [];

/** Register a callback to run once (and immediately if already initialized) after keys load. */
export function onSecretKeyStoreReady(cb: () => void): void {
  if (_initialized) { cb(); return; }
  _readyCallbacks.push(cb);
}

/** Synchronous "have keys finished loading from SecretStorage yet?" — used to suppress the alarming
 *  "No AI is set up" banner during the brief pre-load window (the panel renders before keys load). */
export function isSecretKeyStoreReady(): boolean { return _initialized; }

/** Call once at extension activation. Loads keys from SecretStorage, migrates from settings.json. */
export async function initSecretKeyStore(ctx: vscode.ExtensionContext): Promise<void> {
  _ctx = ctx;
  const cfg = vscode.workspace.getConfiguration('redivivus');
  for (const p of PROVIDERS) {
    let key: string | null = null;
    try { key = (await Promise.resolve(ctx.secrets.get(SECRET_PREFIX + p))) ?? null; } catch { key = null; }
    if (!key) {
      // One-time promotion: a key set in redivivus.* settings.json → SecretStorage (OS keychain).
      const legacy = cfg.get<string>(SETTINGS_MAP[p]) || null;
      if (legacy?.trim()) {
        try {
          await Promise.resolve(ctx.secrets.store(SECRET_PREFIX + p, legacy.trim()));
          try { await cfg.update(SETTINGS_MAP[p], undefined, vscode.ConfigurationTarget.Global); } catch { }
          key = legacy.trim();
        } catch { key = legacy.trim(); }
      }
    }
    _cache[p] = key || null;
  }
  _initialized = true;
  // Notify all callers that were waiting for keys to be available
  for (const cb of _readyCallbacks.splice(0)) { try { cb(); } catch { /* non-blocking */ } }
}

/** Sync read — in-memory cache after init, env var / settings.json fallback before init. */
export function getKeyCached(provider: string): string | null {
  const p = provider as Provider;
  if (_initialized) { return _cache[p] || process.env[ENV_MAP[p]] || null; }
  // Pre-init fallback: env var wins, then settings.json
  const env = ENV_MAP[p] ? process.env[ENV_MAP[p]] : null;
  if (env) { return env; }
  return vscode.workspace.getConfiguration('redivivus').get<string>(SETTINGS_MAP[p]) || null;
}

/** Store a key in SecretStorage and update the in-memory cache. */
export async function storeKey(provider: string, key: string): Promise<void> {
  const p = provider as Provider;
  if (!_ctx) { throw new Error('SecretKeyStore not initialized'); }
  const trimmed = key.trim();
  await _ctx.secrets.store(SECRET_PREFIX + p, trimmed);
  _cache[p] = trimmed || null;
}

/** Remove a key from SecretStorage and cache. */
export async function deleteKey(provider: string): Promise<void> {
  const p = provider as Provider;
  if (!_ctx) { return; }
  try { await Promise.resolve(_ctx.secrets.delete(SECRET_PREFIX + p)); } catch { }
  _cache[p] = null;
}

/** Returns true if at least one provider has a configured key. */
export function hasAnyKey(): boolean {
  return PROVIDERS.some(p => getKeyCached(p));
}

/** Returns list of providers that currently have a key configured. */
export function getConfiguredProviders(): string[] {
  return PROVIDERS.filter(p => getKeyCached(p));
}
