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
