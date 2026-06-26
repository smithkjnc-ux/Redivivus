// [SCOPE] Redivivus Build Ledger — tracks per-AI token usage and actions during a single build.
// Instantiated once per build, passed through the pipeline, summarised for the result card.
// Imports cost rates from costEstimatorService to avoid duplication.

import { tokenCostForAI } from '../../../features/ai/logic/costEstimatorService.js';

export type LedgerAction = 'planned' | 'built' | 'reviewed' | 'corrected' | 'fallback';
export type LedgerRole = 'supervisor' | 'worker' | 'solo';

export interface LedgerEntry {
  ai: string;
  role: LedgerRole;
  action: LedgerAction;
  tokens: number;
  reason?: string;  // why this AI was chosen for this role
}

export interface LedgerSummaryLine {
  ai: string;
  role: LedgerRole;
  actions: LedgerAction[];
  tokens: number;
  costUSD: number;
  reason: string;   // why this AI was chosen for this role
  /** True if any action was 'fallback' — supervisor took over from worker */
  hasFallback: boolean;
}

export class BuildLedger {
  private entries: LedgerEntry[] = [];

  /** Record a single AI action with its token count and optional routing reason. */
  record(ai: string, role: LedgerRole, action: LedgerAction, tokens: number, reason?: string): void {
    this.entries.push({ ai, role, action, tokens, reason });
  }

  /** Returns one summary line per AI that participated. */
  getSummary(): LedgerSummaryLine[] {
    // [WARN] Key by 'ai|role' not just 'ai' — supervisor and worker may be the same AI
    //        (e.g. Gemini as both supervisor and worker when only one key is configured).
    //        Keying by ai alone would collapse both entries into one line, hiding the supervisor.
    const map = new Map<string, LedgerSummaryLine>();
    for (const e of this.entries) {
      const mapKey = e.ai + '|' + e.role;
      const existing = map.get(mapKey);
      const rate = tokenCostForAI(e.ai);
      if (existing) {
        if (!existing.actions.includes(e.action)) { existing.actions.push(e.action); }
        existing.tokens += e.tokens;
        existing.costUSD += e.tokens * rate;
        if (e.action === 'fallback') { existing.hasFallback = true; }
      } else {
        map.set(mapKey, {
          ai: e.ai,
          role: e.role,
          actions: [e.action],
          tokens: e.tokens,
          costUSD: e.tokens * rate,
          reason: e.reason || '',
          hasFallback: e.action === 'fallback',
        });
      }
    }
    // Sort: supervisor first, then worker, then solo
    const roleOrder: Record<LedgerRole, number> = { supervisor: 0, worker: 1, solo: 2 };
    return [...map.values()].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
  }

  /** True if any entries were recorded. */
  hasData(): boolean { return this.entries.length > 0; }
}
