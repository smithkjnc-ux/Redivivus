// [SCOPE] Unit tests for promptImpl failover (routingServicePrompt.ts). Uses a fake RoutingService
// whose getKeyMap() controls the provider chain and whose fetchWithTimeout stub simulates each
// provider's HTTP response — so the ranked failover, skip-blocked, and all-fail paths are exercised
// without real network. openai + deepseek are used because both parse the same OpenAI-compatible shape.

import * as assert from 'assert';
import { promptImpl } from '../../../features/ai/data/routingServicePrompt.js';
import { initQuotaTracker } from '../../../features/ai/data/providerQuotaTracker.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';

// Minimal in-memory ExtensionContext so the quota tracker has a store to read/write.
function makeCtx(store: Record<string, any> = {}): any {
  const g = new Map<string, any>([['redivivus.quotaStore', store]]);
  return { globalState: { get: (k: string, d?: any) => (g.has(k) ? g.get(k) : d), update: (k: string, v: any) => { g.set(k, v); return Promise.resolve(); } } };
}

type FetchStub = (url: string, opts: RequestInit, timeoutMs?: number) => Promise<any>;
function makeSvc(providers: string[], fetchStub: FetchStub): RoutingService {
  return {
    getKeyMap: () => Object.fromEntries(providers.map(p => [p, () => 'test-key'])),
    fetchWithTimeout: fetchStub,
  } as unknown as RoutingService;
}

const OK_BODY = { choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
const ERR_BODY = { error: { message: 'simulated failure' } };
const resp = (status: number, body: any) => ({
  ok: status >= 200 && status < 300, status, statusText: status === 200 ? 'OK' : 'ERR',
  headers: new Headers(), json: async () => body,
});

suite('promptImpl failover (fix #7c)', () => {
  setup(() => { initQuotaTracker(makeCtx()); }); // fresh empty store — no provider blocked

  test('first provider fails -> next succeeds, usingFallback set', async () => {
    const stub: FetchStub = async (url) => (url.includes('openai') ? resp(500, ERR_BODY) : resp(200, OK_BODY));
    const res = await promptImpl(makeSvc(['openai', 'deepseek'], stub), 'hi', 5_000);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.usingFallback, 'deepseek');
  });

  test('quota-blocked provider is skipped', async () => {
    initQuotaTracker(makeCtx({ openai: { unavailableUntilMs: Date.now() + 600_000, unavailableReason: 'test-block' } }));
    // Both would succeed if called — asserting deepseek served proves openai was skipped, not tried.
    const stub: FetchStub = async () => resp(200, OK_BODY);
    const res = await promptImpl(makeSvc(['openai', 'deepseek'], stub), 'hi', 5_000);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.usingFallback, 'deepseek');
  });

  test('all providers fail -> error result', async () => {
    const stub: FetchStub = async () => resp(500, ERR_BODY);
    const res = await promptImpl(makeSvc(['openai', 'deepseek'], stub), 'hi', 5_000);
    assert.strictEqual(res.success, false);
    assert.ok(/All AI providers failed/.test(res.error || ''), `expected all-failed error, got: ${res.error}`);
  });
});
