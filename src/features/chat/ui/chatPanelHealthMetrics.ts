// [SCOPE] Health panel data readers — build-log stats (per project) and AI usage totals (global).
// Pure reads, no rendering. Split from chatPanelHealthCheck.ts (Rule 9).

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import { STORAGE_KEY, LIFETIME_KEY } from '../../telemetry/data/usageTracker.js';

export interface BuildStats {
  total: number; success: number; failed: number; cloud: number; local: number; tokens: number; lastDate: string;
}

export interface UsageSnapshot {
  lifetimeTokens: number;
  lifetimeCost: number;
  byProvider: Array<{ provider: string; tokens: number; cost: number }>;
}

/** Per-project build stats from .redivivus/build_log.jsonl. */
export function readBuildStats(root: string): BuildStats | null {
  try {
    const lines = fs.readFileSync(path.join(root, '.redivivus', 'build_log.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean);
    if (lines.length === 0) { return null; }
    let success = 0, failed = 0, cloud = 0, local = 0, tokens = 0, lastDate = '';
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.error) { failed++; } else { success++; }
        if (e.source === 'cloud') { cloud++; } else { local++; }
        tokens += e.totalTokens ?? 0;
        if (e.timestamp > lastDate) { lastDate = e.timestamp; }
      } catch {}
    }
    return { total: lines.length, success, failed, cloud, local, tokens,
             lastDate: lastDate.slice(0, 16).replace('T', ' ') };
  } catch { return null; }
}

/** Global AI usage (lifetime total + per-provider breakdown) from the UsageTracker's globalState. */
export function readUsage(ctx: vscode.ExtensionContext | undefined): UsageSnapshot | null {
  if (!ctx) { return null; }
  try {
    const history = ctx.globalState.get<Array<{ tokens: number; cost: number; aiProvider: string }>>(STORAGE_KEY, []);
    const lifetime = ctx.globalState.get<{ tokens: number; cost: number }>(LIFETIME_KEY, { tokens: 0, cost: 0 });
    const map = new Map<string, { tokens: number; cost: number }>();
    for (const e of history) {
      const p = e.aiProvider || 'unknown';
      const cur = map.get(p) ?? { tokens: 0, cost: 0 };
      cur.tokens += e.tokens || 0;
      cur.cost += e.cost || 0;
      map.set(p, cur);
    }
    const byProvider = [...map.entries()]
      .map(([provider, v]) => ({ provider, tokens: v.tokens, cost: v.cost }))
      .sort((a, b) => b.tokens - a.tokens);
    return { lifetimeTokens: lifetime.tokens || 0, lifetimeCost: lifetime.cost || 0, byProvider };
  } catch { return null; }
}
