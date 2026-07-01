// [SCOPE] Unit tests for JobSizer fast-path tiers (jobSizer.ts). Fast-path cases must resolve WITHOUT
// any AI call — the injected routing throws if consulted, proving the regex fast-path short-circuits.

import * as assert from 'assert';
import { sizeJob, tierToMaxQuestions } from '../../../features/ai/logic/jobSizer.js';
import type { RoutingService } from '../../../features/ai/data/routingService.js';

// A routing stub whose promptCheap throws — any fast-path hit must never reach it.
const throwingRouting = {
  promptCheap: async () => { throw new Error('AI classifier must not be called on a fast-path'); },
} as unknown as RoutingService;

suite('JobSizer fast-path tiers (fix #7d)', () => {
  const cases: Array<[string, string]> = [
    ['fix the typo', 'tell-them'],
    ['rename foo', 'tell-them'],
    ['delete the old file', 'tell-them'],
    ['what is the port', 'look-it-up'],
    ['what color is the button', 'look-it-up'],
    ['which version is the api', 'look-it-up'],
  ];
  for (const [text, tier] of cases) {
    test(`"${text}" -> ${tier} (no AI call)`, async () => {
      const res = await sizeJob(text, throwingRouting);
      assert.strictEqual(res.tier, tier);
    });
  }

  test('tierToMaxQuestions maps each tier', () => {
    assert.strictEqual(tierToMaxQuestions('tell-them'), 0);
    assert.strictEqual(tierToMaxQuestions('look-it-up'), 1);
    assert.strictEqual(tierToMaxQuestions('offer-choices'), 3);
    assert.strictEqual(tierToMaxQuestions('explore-with-them'), 5);
  });
});
