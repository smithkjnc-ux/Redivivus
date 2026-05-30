// [SCOPE] Provider balance checker — validates each AI provider key via models endpoint.
// Balance APIs are mostly unavailable publicly; key validation is the reliable fallback.
// Called from collectHealthData() in chatPanelHealthCheck.ts.

export interface ProviderBalance {
  provider: string;
  label: string;
  balance?: number;
  status: 'ok' | 'unavailable' | 'error';
  detail?: string;
}

async function validateKey(
  provider: string, label: string,
  url: string, headers: Record<string,string>,
): Promise<ProviderBalance> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      return { provider, label, status: 'ok', detail: 'key valid' };
    }
    if (res.status === 401) { return { provider, label, status: 'error', detail: 'invalid key' }; }
    if (res.status === 429) { return { provider, label, status: 'ok', detail: 'key valid (rate limited)' }; }
    return { provider, label, status: 'unavailable', detail: `HTTP ${res.status}` };
  } catch (e: any) {
    return { provider, label, status: 'unavailable', detail: e?.message ?? 'timeout' };
  }
}

export async function checkProviderBalances(keys: Record<string,string>): Promise<ProviderBalance[]> {
  const checks: Promise<ProviderBalance>[] = [];

  if (keys.claude) {
    checks.push(validateKey('claude', 'Claude',
      'https://api.anthropic.com/v1/models',
      { 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01' }
    ));
  }
  if (keys.openai) {
    checks.push(validateKey('openai', 'OpenAI',
      'https://api.openai.com/v1/models',
      { 'Authorization': `Bearer ${keys.openai}` }
    ));
  }
  if (keys.gemini) {
    checks.push(validateKey('gemini', 'Gemini',
      `https://generativelanguage.googleapis.com/v1/models?key=${keys.gemini}`,
      {}
    ));
  }
  if (keys.groq) {
    checks.push(validateKey('groq', 'Groq',
      'https://api.groq.com/openai/v1/models',
      { 'Authorization': `Bearer ${keys.groq}` }
    ));
  }
  if (keys.xai) {
    checks.push(validateKey('xai', 'xAI',
      'https://api.x.ai/v1/models',
      { 'Authorization': `Bearer ${keys.xai}` }
    ));
  }
  if (keys.kimi) {
    checks.push(validateKey('kimi', 'Kimi',
      'https://api.moonshot.cn/v1/models',
      { 'Authorization': `Bearer ${keys.kimi}` }
    ));
  }

  return Promise.all(checks);
}
