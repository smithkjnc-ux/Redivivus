// [SCOPE] Key preview / export / import message handlers for the Redivivus wizard panel.
// Extracted from messageRouterCore.ts (Rule 9 split — was 203 lines).
// Handles: getKeyPreviews, exportKey, exportAllKeys, importKeys.

import * as vscode from 'vscode';
import { getKeyCached, storeKey, getConfiguredProviders } from '../services/ai/secretKeyStore.js';

const ENV_MAP_OUT: Record<string, string> = {
  gemini: 'GEMINI_API_KEY', claude: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY', xai: 'XAI_API_KEY', kimi: 'MOONSHOT_API_KEY',
};
const ENV_MAP_IN: Record<string, string> = {
  GEMINI_API_KEY: 'gemini', ANTHROPIC_API_KEY: 'claude', OPENAI_API_KEY: 'openai',
  GROQ_API_KEY: 'groq', XAI_API_KEY: 'xai', MOONSHOT_API_KEY: 'kimi',
};

export async function handleKeyMessage(
  msg: any,
  postToWebview?: (msg: any) => void,
  refresh?: () => void
): Promise<boolean> {
  switch (msg.type) {
    case 'getKeyPreviews': {
      const providers = getConfiguredProviders();
      const previews: Record<string, string> = {};
      for (const provider of providers) {
        const key = getKeyCached(provider);
        if (key) {
          const masked = key.length > 12 ? key.slice(0, 8) + '...' + key.slice(-4) : '***';
          previews[provider] = masked;
        }
      }
      postToWebview?.({ type: 'keyPreviews', previews });
      return true;
    }
    case 'exportKey': {
      const key = getKeyCached(msg.provider);
      if (key) {
        await vscode.env.clipboard.writeText(key);
        postToWebview?.({ type: 'keyExported', success: true });
      } else {
        postToWebview?.({ type: 'keyExported', success: false });
      }
      return true;
    }
    case 'exportAllKeys': {
      const providers = getConfiguredProviders();
      const lines: string[] = ['# Redivivus API Keys — ' + new Date().toISOString().split('T')[0]];
      for (const provider of providers) {
        const key = getKeyCached(provider);
        if (key && ENV_MAP_OUT[provider]) { lines.push(`${ENV_MAP_OUT[provider]}=${key}`); }
      }
      await vscode.env.clipboard.writeText(lines.join('\n'));
      postToWebview?.({ type: 'allKeysExported', success: true });
      return true;
    }
    case 'importKeys': {
      const imported: string[] = [];
      for (const line of (msg.text || '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) { continue; }
        const match = trimmed.match(/^([A-Z_]+)=(.+)$/);
        if (match) {
          const [, envName, keyValue] = match;
          const provider = ENV_MAP_IN[envName];
          if (provider && keyValue.trim()) { await storeKey(provider, keyValue.trim()); imported.push(provider); }
        }
      }
      postToWebview?.({ type: 'keysImported', imported });
      if (imported.length > 0) { refresh?.(); }
      return true;
    }
    default:
      return false;
  }
}
