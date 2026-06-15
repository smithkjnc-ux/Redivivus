// [SCOPE] Provider balance checker — validates each AI provider key via models endpoint.
// Balance APIs are mostly unavailable publicly; key validation is the reliable fallback.
// Called from collectHealthData() in chatPanelHealthCheck.ts.

export interface ProviderBalance {
  provider: string;
  label: string;
  balance?: number;
  currency?: string; // HTML entity: '$' default, '&yen;' for Moonshot/Kimi (billed in CNY)
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

// Most providers expose no balance API (Anthropic, OpenAI, Gemini, Groq, xAI) — key validation is the
// best signal. Moonshot/Kimi is the exception: it has /v1/users/me/balance. Returns the live balance
// when available, else falls back to key validation.
async function fetchKimiBalance(key: string): Promise<ProviderBalance> {
  const headers = { 'Authorization': `Bearer ${key}` };
  try {
    const res = await fetch('https://api.moonshot.ai/v1/users/me/balance', { headers, signal: AbortSignal.timeout(6000) });
    if (res.status === 401) { return { provider: 'kimi', label: 'Kimi', status: 'error', detail: 'invalid key' }; }
    if (res.ok) {
      const j = await res.json() as { data?: { available_balance?: number } };
      const bal = j?.data?.available_balance;
      if (typeof bal === 'number') {
        return { provider: 'kimi', label: 'Kimi', status: 'ok', balance: bal, currency: '&yen;', detail: 'live balance (CNY)' };
      }
    }
  } catch { /* fall through to key validation */ }
  return validateKey('kimi', 'Kimi', 'https://api.moonshot.ai/v1/models', headers);
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
    // Kimi/Moonshot exposes a real balance endpoint — fetch it (falls back to key validation).
    checks.push(fetchKimiBalance(keys.kimi));
  }

  return Promise.all(checks);
}
