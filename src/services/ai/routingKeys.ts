// [SCOPE] Routing API key getters — retrieves AI provider keys from SecretStorage (via secretKeyStore).
// SecretStorage = OS keychain = encrypted, local device only, never synced.
// Falls back to redivivus.* settings, then chassis.* settings (legacy namespace), then env vars.
// [WARN] Returns null until initSecretKeyStore() completes — always call after extension activation.

import * as vscode from 'vscode';
import { getKeyCached } from './secretKeyStore.js';

function isDisabled(providerId: string): boolean {
  const disabled = vscode.workspace.getConfiguration('redivivus').get<string[]>('disabledProviders') || [];
  return disabled.includes(providerId);
}

export function getGeminiKey(): string | null {
  if (isDisabled('gemini')) { return null; }
  return getKeyCached('gemini');
}

export function getClaudeKey(): string | null {
  if (isDisabled('claude')) { return null; }
  return getKeyCached('claude');
}

export function getOpenAIKey(): string | null {
  if (isDisabled('openai')) { return null; }
  return getKeyCached('openai');
}

export function getGroqKey(): string | null {
  if (isDisabled('groq')) { return null; }
  return getKeyCached('groq');
}

export function getXAIKey(): string | null {
  if (isDisabled('xai')) { return null; }
  return getKeyCached('xai');
}

export function getKimiKey(): string | null {
  if (isDisabled('kimi')) { return null; }
  return getKeyCached('kimi');
}

export function getDeepseekKey(): string | null {
  if (isDisabled('deepseek')) { return null; }
  return getKeyCached('deepseek');
}
