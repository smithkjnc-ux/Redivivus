// [SCOPE] Redivivus Usage Tracker — report generation and reset helpers.
// Extracted from usageTracker.ts to keep source files under 200 lines.

import type { UsageTracker, UsageReport, UsageEntry, UsagePeriod, UsagePeriodWithBreakdown, AIBreakdown } from './usageTracker.js';
import { STORAGE_KEY, SESSION_START_KEY } from './usageTracker.js';

export function buildUsageReport(tracker: UsageTracker, projectName?: string): UsageReport {
  const now = Date.now();
  let history = tracker.getHistory();
  
  if (projectName) {
    history = history.filter((e: UsageEntry) => e.project === projectName);
  }

  const sessionStart = (tracker as any).currentSessionStart;

  // Calculate time window boundaries
  const dayStartMs = new Date().setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartMs = weekStart.getTime();
  const monthStartMs = new Date().setDate(1);
  const monthStart = new Date(monthStartMs);
  monthStart.setHours(0, 0, 0, 0);

  // Helper to create fresh period with empty AI breakdown map
  const createPeriod = (startTime: number) => ({
    totals: { tokens: 0, cost: 0, messages: 0, startTime, endTime: now },
    aiMap: new Map<string, { tokens: number; cost: number; messages: number; byRole: Map<string, {tokens: number; cost: number; messages: number}> }>(),
  });

  const sessionData = createPeriod(sessionStart);
  const dayData = createPeriod(dayStartMs);
  const weekData = createPeriod(weekStartMs);
  const monthData = createPeriod(monthStart.getTime());
  const allTimeData = createPeriod(history[0]?.timestamp || now);

  // Helper to add entry to a period's totals and AI map
  const addToPeriod = (data: ReturnType<typeof createPeriod>, entry: UsageEntry) => {
    data.totals.tokens += entry.tokens;
    data.totals.cost += entry.cost;
    data.totals.messages += entry.messageCount;
    let ai = data.aiMap.get(entry.aiProvider);
    if (!ai) {
      ai = { tokens: 0, cost: 0, messages: 0, byRole: new Map() };
      data.aiMap.set(entry.aiProvider, ai);
    }
    ai.tokens += entry.tokens;
    ai.cost += entry.cost;
    ai.messages += entry.messageCount;
    const roleKey = entry.role || 'unknown';
    let r = ai.byRole.get(roleKey);
    if (!r) {
      r = { tokens: 0, cost: 0, messages: 0 };
      ai.byRole.set(roleKey, r);
    }
    r.tokens += entry.tokens;
    r.cost += entry.cost;
    r.messages += entry.messageCount;
  };

  // Aggregate data
  for (const entry of history) {
    // All time (all entries)
    addToPeriod(allTimeData, entry);

    // Session (only current session)
    if (entry.sessionId === (tracker as any).currentSessionId) {
      addToPeriod(sessionData, entry);
    }
    // Day
    if (entry.timestamp >= dayStartMs) {
      addToPeriod(dayData, entry);
    }
    // Week
    if (entry.timestamp >= weekStartMs) {
      addToPeriod(weekData, entry);
    }
    // Month
    if (entry.timestamp >= monthStart.getTime()) {
      addToPeriod(monthData, entry);
    }
  }

  // Helper to convert aggregated data to UsagePeriodWithBreakdown
  const toPeriodWithBreakdown = (data: ReturnType<typeof createPeriod>): UsagePeriodWithBreakdown => {
    const byAI: AIBreakdown[] = [...data.aiMap.entries()]
      .filter(([, stats]) => stats.tokens > 0) // Only show AIs with usage
      .map(([aiProvider, stats]) => ({
        aiProvider,
        tokens: stats.tokens,
        cost: stats.cost,
        messages: stats.messages,
        byRole: [...stats.byRole.entries()].map(([role, rstats]) => ({
          role,
          tokens: rstats.tokens,
          cost: rstats.cost,
          messages: rstats.messages,
        })).sort((a, b) => b.tokens - a.tokens),
      }))
      .sort((a, b) => b.tokens - a.tokens); // Sort by tokens descending

    return { ...data.totals, byAI };
  };

  // For project-scoped queries, we recalculate the lifetime based on the filtered history.
  // For global queries, we use the true unresettable lifetime total.
  let lifetime: UsagePeriod;
  if (projectName) {
    lifetime = { ...allTimeData.totals };
  } else {
    lifetime = tracker.getLifetimeTotal();
  }

  const lifetimeWithBreakdown: UsagePeriodWithBreakdown = {
    ...lifetime,
    startTime: history[0]?.timestamp || now,
    endTime: now,
    byAI: [...allTimeData.aiMap.entries()]
      .filter(([, stats]) => stats.tokens > 0)
      .map(([aiProvider, stats]) => ({
        aiProvider,
        tokens: stats.tokens,
        cost: stats.cost,
        messages: stats.messages,
        byRole: [...stats.byRole.entries()].map(([role, rstats]) => ({
          role,
          tokens: rstats.tokens,
          cost: rstats.cost,
          messages: rstats.messages,
        })).sort((a, b) => b.tokens - a.tokens),
      }))
      .sort((a, b) => b.tokens - a.tokens),
  };

  return {
    session: toPeriodWithBreakdown(sessionData),
    day: toPeriodWithBreakdown(dayData),
    week: toPeriodWithBreakdown(weekData),
    month: toPeriodWithBreakdown(monthData),
    allTime: lifetimeWithBreakdown,
    lifetimeUnresettable: lifetimeWithBreakdown,
  };
}

// Reset specific periods
export async function resetUsagePeriod(tracker: UsageTracker, period: string): Promise<void> {
  const now = Date.now();
  const history = tracker.getHistory();
  const context = (tracker as any).context;

  if (period === 'session') {
    // Start new session
    (tracker as any).currentSessionId = (tracker as any).generateSessionId();
    (tracker as any).currentSessionStart = now;
    await context.globalState.update(SESSION_START_KEY, (tracker as any).currentSessionStart);
  } else if (period === 'day') {
    // Remove today's entries from history
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const filtered = history.filter(e => e.timestamp < dayStart.getTime());
    await context.globalState.update(STORAGE_KEY, filtered);
  } else if (period === 'week') {
    // Remove this week's entries
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const filtered = history.filter(e => e.timestamp < weekStart.getTime());
    await context.globalState.update(STORAGE_KEY, filtered);
  } else if (period === 'month') {
    // Remove this month's entries
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const filtered = history.filter(e => e.timestamp < monthStart.getTime());
    await context.globalState.update(STORAGE_KEY, filtered);
  } else if (period === 'all-resettable') {
    // Clear all history but NOT lifetime total
    await context.globalState.update(STORAGE_KEY, []);
    // Reset session
    (tracker as any).currentSessionId = (tracker as any).generateSessionId();
    (tracker as any).currentSessionStart = now;
    await context.globalState.update(SESSION_START_KEY, (tracker as any).currentSessionStart);
  }
}
