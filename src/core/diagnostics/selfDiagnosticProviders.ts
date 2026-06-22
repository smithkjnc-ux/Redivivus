// [SCOPE] Provider reachability check for Redivivus Self-Diagnostic.
// Extracted from selfDiagnosticChecks.ts (Rule 9 split — was 203 lines).
// Pings each provider's models endpoint with the stored API key to confirm it's reachable.

import * as https from 'https';
import * as http from 'http';
import type { DiagResult } from './selfDiagnosticChecks';

const PROVIDER_PING: Record<string, { configKey: string; url: (k: string) => string; headers: (k: string) => Record<string, string> }> = {
  Gemini:  { configKey: 'redivivus.geminiApiKey',  url: k => `https://generativelanguage.googleapis.com/v1beta/models?key=${k}&pageSize=1`, headers: () => ({}) },
  OpenAI:  { configKey: 'redivivus.openaiApiKey',  url: () => 'https://api.openai.com/v1/models',    headers: k => ({ Authorization: `Bearer ${k}` }) },
  Claude:  { configKey: 'redivivus.claudeApiKey',  url: () => 'https://api.anthropic.com/v1/models', headers: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }) },
  Groq:    { configKey: 'redivivus.groqApiKey',    url: () => 'https://api.groq.com/openai/v1/models', headers: k => ({ Authorization: `Bearer ${k}` }) },
  xAI:     { configKey: 'redivivus.xaiApiKey',     url: () => 'https://api.x.ai/v1/models',          headers: k => ({ Authorization: `Bearer ${k}` }) },
  Kimi:    { configKey: 'redivivus.kimiApiKey',    url: () => 'https://api.moonshot.ai/v1/models',   headers: k => ({ Authorization: `Bearer ${k}` }) },
  DeepSeek:{ configKey: 'redivivus.deepseekApiKey',url: () => 'https://api.deepseek.com/v1/models',   headers: k => ({ Authorization: `Bearer ${k}` }) },
};

function extractProviderError(body?: string): string | null {
  if (!body) { return null; }
  try {
    const j = JSON.parse(body);
    const msg = (typeof j?.error === 'string' ? j.error : null) || j?.error?.message || j?.message || null;
    if (typeof msg === 'string' && msg.trim()) { return msg.trim().substring(0, 160); }
  } catch { /* not JSON */ }
  return null;
}

export async function checkProviderReachable(providerName: string): Promise<DiagResult> {
  const cfg = PROVIDER_PING[providerName];
  if (!cfg) { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'skip', message: 'Unknown provider' }; }
  const { getKeyCached } = await import('../../services/ai/secretKeyStore.js');
  const key = (getKeyCached(providerName.toLowerCase()) || '').trim();
  if (!key) { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'skip', message: 'No API key -- skipping ping' }; }
  try {
    let url = cfg.url(key);
    const headers = cfg.headers(key);
    if (providerName === 'Kimi') {
      const { detectKimiBase } = await import('../../services/ai/kimiEndpoint.js');
      url = (await detectKimiBase(key)) + '/v1/models';
    }
    const result = await new Promise<{ status: number; data?: string }>((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(url, { method: 'GET', headers, timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode || 0, data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
    if (result.status === 200) { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'pass', message: `Reachable (${result.status})` }; }
    if (result.status === 401 || result.status === 403) {
      const detail = extractProviderError(result.data);
      return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Auth error ${result.status}${detail ? ` -- ${detail}` : ' -- API key invalid or missing permissions'}` };
    }
    if (result.status === 400) {
      const detail = extractProviderError(result.data) || (result.data || 'Invalid request').substring(0, 120);
      return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Bad request (400) - ${detail}` };
    }
    return { name: `${providerName} reachable`, category: 'AI Providers', status: 'warn', message: `Unexpected HTTP ${result.status} from ${providerName}` };
  } catch (e: any) {
    if (e.message === 'Timeout') { return { name: `${providerName} reachable`, category: 'AI Providers', status: 'warn', message: 'Ping timed out (5s) -- network may be slow or blocked' }; }
    return { name: `${providerName} reachable`, category: 'AI Providers', status: 'fail', message: `Network error: ${e.message}` };
  }
}
