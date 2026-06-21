// [SCOPE] One agent-loop turn against the secure /execute endpoint, WITH provider failover. The agent loop
// previously used a SINGLE provider and halted on any error — so a Claude quota outage mid-run killed the
// whole task (it should have continued on the next provider, like the cloud-build path does). This walks the
// configured provider chain in rank order and is STICKY: once a provider answers, the caller stays on it, so
// an exhausted/erroring primary fails over to the next instead of stopping. No VS Code deps → testable.

export interface ProviderSlot { provider: string; model: string; }
export interface ExecTurn {
  text: string; success: boolean; error?: string;
  model?: string; provider?: string; inputTokens?: number; outputTokens?: number;
}

export interface ExecOpts {
  base: string;
  token: string | null;
  keys: Record<string, string>;
  prompt: string;
  chain: ProviderSlot[];
  startAt: number;
  fetchFn: (url: string, init: any, timeoutMs: number) => Promise<{ ok: boolean; json: () => Promise<any> }>;
  onFailover?: (from: string, to: string, reason: string) => void;
  // Fired for EVERY provider that errors (even the last in the chain, where onFailover wouldn't fire). Lets
  // the caller record a sustained outage (out of credits / bad key) so the provider is skipped next time.
  onProviderError?: (provider: string, reason: string) => void;
}

/** Try the provider at `startAt`, then each later one in the chain, until one answers. Returns the turn plus
 *  `usedIndex` so the caller can stick to the provider that worked. Fails only when the whole chain errors. */
export async function callExecuteWithFailover(opts: ExecOpts): Promise<{ turn: ExecTurn; usedIndex: number }> {
  let lastErr = 'Agent execute failed';
  for (let i = Math.max(0, opts.startAt); i < opts.chain.length; i++) {
    const { provider, model } = opts.chain[i];
    try {
      const apiRes = await opts.fetchFn(`${opts.base}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.token}` },
        body: JSON.stringify({
          provider, model, keys: opts.keys, promptType: 'agent-orchestrator',
          prompt: opts.prompt, maxTokens: 4000, temperature: 0.1,
        }),
      }, 120_000);
      const data = await apiRes.json();
      if (!apiRes.ok) { throw new Error(data?.error || 'Agent execute failed'); }
      return {
        turn: { text: data.text, success: true, model: data.model || model, provider, inputTokens: data.inputTokens, outputTokens: data.outputTokens },
        usedIndex: i,
      };
    } catch (e: any) {
      lastErr = e?.message || String(e);
      if (opts.onProviderError) { opts.onProviderError(provider, lastErr); }
      const next = opts.chain[i + 1];
      if (next && opts.onFailover) { opts.onFailover(provider, next.provider, lastErr); }
    }
  }
  return { turn: { text: '', success: false, error: lastErr }, usedIndex: Math.max(0, opts.chain.length - 1) };
}
