// [SCOPE] Provider balance checker — queries each AI provider's billing API for remaining credit.
// Best-effort: every check is wrapped in try/catch; 'unavailable' is the safe fallback.
// Called from collectHealthData() in chatPanelHealthCheck.ts.

export interface ProviderBalance {
  provider: string;
  label: string;
  balance?: number;
  status: 'ok' | 'unavailable' | 'error';
  detail?: string;
}

async function safeFetch(url: string, headers: Record<string,string>): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
  return res.json();
}

async function checkAnthropic(key: string): Promise<ProviderBalance> {
  try {
    // Step 1: discover org ID
    const orgs = await safeFetch('https://api.anthropic.com/v1/organizations', {
      'x-api-key': key, 'anthropic-version': '2023-06-01',
    });
    const orgId = orgs?.data?.[0]?.id ?? orgs?.[0]?.id;
    if (!orgId) { return { provider:'claude', label:'Claude', status:'unavailable', detail:'org ID not returned' }; }
    // Step 2: get balance
    const bal = await safeFetch(`https://api.anthropic.com/v1/organizations/${orgId}/balances`, {
      'x-api-key': key, 'anthropic-version': '2023-06-01',
    });
    const amount = bal?.balance?.amount ?? bal?.amount ?? bal?.data?.[0]?.amount;
    if (amount !== undefined) {
      return { provider:'claude', label:'Claude', balance: parseFloat(amount), status:'ok' };
    }
    return { provider:'claude', label:'Claude', status:'unavailable', detail:'unexpected response' };
  } catch (e: any) {
    return { provider:'claude', label:'Claude', status:'unavailable', detail: e?.message };
  }
}

async function checkOpenAI(key: string): Promise<ProviderBalance> {
  try {
    const sub = await safeFetch('https://api.openai.com/v1/dashboard/billing/subscription',
      { 'Authorization': `Bearer ${key}` });
    const limit = sub?.hard_limit_usd ?? sub?.system_hard_limit_usd;
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const end   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const usage = await safeFetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${start}&end_date=${end}`,
      { 'Authorization': `Bearer ${key}` });
    const used = (usage?.total_usage ?? 0) / 100;
    if (limit !== undefined) {
      return { provider:'openai', label:'OpenAI', balance: parseFloat(limit) - used, status:'ok',
               detail:`$${used.toFixed(2)} used of $${parseFloat(limit).toFixed(2)}` };
    }
    return { provider:'openai', label:'OpenAI', status:'unavailable', detail:'limit not in response' };
  } catch (e: any) {
    return { provider:'openai', label:'OpenAI', status:'unavailable', detail: e?.message };
  }
}

export async function checkProviderBalances(keys: Record<string,string>): Promise<ProviderBalance[]> {
  const checks: Promise<ProviderBalance>[] = [];
  if (keys.claude)  { checks.push(checkAnthropic(keys.claude)); }
  if (keys.openai)  { checks.push(checkOpenAI(keys.openai)); }
  if (keys.gemini)  { checks.push(Promise.resolve({ provider:'gemini', label:'Gemini', status:'unavailable', detail:'requires GCP billing API' })); }
  if (keys.groq)    { checks.push(Promise.resolve({ provider:'groq',   label:'Groq',   status:'unavailable', detail:'no public balance endpoint' })); }
  if (keys.xai)     { checks.push(Promise.resolve({ provider:'xai',    label:'xAI',    status:'unavailable', detail:'no public balance endpoint' })); }
  if (keys.kimi)    { checks.push(Promise.resolve({ provider:'kimi',   label:'Kimi',   status:'unavailable', detail:'no public balance endpoint' })); }
  return Promise.all(checks);
}
