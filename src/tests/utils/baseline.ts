// [SCOPE] Redivivus Test Utility - Strict Baseline Validation
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

const baselinesDir = path.join(process.cwd(), 'src', 'tests', '__baselines__');

export function assertMatchesBaseline(testName: string, actualOutput: unknown): void {
  const safeName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const baselinePath = path.join(baselinesDir, `${safeName}.json`);
  const actualStr = JSON.stringify(actualOutput, null, 2);

  if (!fs.existsSync(baselinesDir)) {
    fs.mkdirSync(baselinesDir, { recursive: true });
  }

  if (!fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, actualStr, 'utf-8');
    console.log(`[BASELINE] Created new baseline for ${testName}`);
    return; // Pass on first run
  }

  const expectedStr = fs.readFileSync(baselinePath, 'utf-8');
  assert.strictEqual(actualStr, expectedStr, `Output diverges from baseline for ${testName}`);
}
