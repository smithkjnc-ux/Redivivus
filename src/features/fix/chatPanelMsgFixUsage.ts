// [SCOPE] Fix pipeline -- shared cost byline. Every fix attempt (success OR failure) burns AI calls;
// the cost must show on the result message (small, inconspicuous) and is already recorded in usageTracker.
// The success result already prints a full Pipeline Usage block; these helpers cover the FAILURE/early-return
// messages, which exit before that block. costBefore lets us report THIS fix's cost (session delta), not the
// cumulative session total -- honest per-fix accounting.
import * as path from 'path';

// Snapshot the cumulative session cost at the start of a fix so we can compute the delta later.
export function fixSessionCostBefore(deps: any, root: string): number {
  try { return deps.usageTracker?.getReport(path.basename(root))?.session?.cost ?? 0; } catch { return 0; }
}

// Build a compact, inconspicuous cost line for a fix result message. delta = (cost now) - costBefore.
export function fixCostByline(deps: any, root: string, costBefore: number): string {
  try {
    const report = deps.usageTracker?.getReport(path.basename(root));
    if (!report?.session) { return ''; }
    const delta = Math.max(0, (report.session.cost ?? 0) - (costBefore ?? 0));
    const costStr = delta < 0.00005 ? '<$0.0001' : '$' + delta.toFixed(delta < 0.01 ? 4 : 2);
    return `\n\n_AI cost this fix: ${costStr}_`;
  } catch { return ''; }
}

// Classify a fix-pipeline failure into a plain-English user hint.
// Distinguishes a usage/quota limit (retry won't help) from an auth error from a transient network hiccup.
export function fixErrorHint(errMsg: string): string {
  if (/usage limit|rate.?limit|\bquota\b|insufficient.{0,12}(credit|balance|fund|quota)|reached your specified|regain access|\b429\b|too many requests|billing|payment required|\b402\b/i.test(errMsg)) {
    return 'Your AI provider has hit its usage limit or run out of credit. Add credit / raise the limit in your provider account, or switch to another configured AI from the picker below. Retrying will hit the same limit.';
  }
  if (/401|403|invalid.{0,10}(api.)?key|api.key.{0,10}(invalid|missing|expired)|unauthorized/i.test(errMsg)) {
    return 'This looks like an API key issue — check **Setup → AI API Keys**.';
  }
  return 'This is usually a temporary network hiccup — try again.';
}
