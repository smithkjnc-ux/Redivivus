// [SCOPE] CHASSIS Usage Tracker — tracks AI token usage and costs across sessions with persistent storage
// Provides breakdowns by session, day, week, month with reset capability while preserving lifetime totals.
// Tracks: timestamp, tokens, cost, AI provider, message count per interaction

import * as vscode from 'vscode';

export interface UsageEntry {
  timestamp: number;
  tokens: number;
  cost: number;
  aiProvider: string;
  messageCount: number;
  sessionId: string;
}

export interface UsagePeriod {
  tokens: number;
  cost: number;
  messages: number;
  startTime: number;
  endTime: number;
}

// Per-AI breakdown for a time period
export interface AIBreakdown {
  aiProvider: string;
  tokens: number;
  cost: number;
  messages: number;
}

// Extended period with AI breakdowns
export interface UsagePeriodWithBreakdown extends UsagePeriod {
  byAI: AIBreakdown[];
}

export interface UsageReport {
  // Breakdowns
  session: UsagePeriodWithBreakdown;
  day: UsagePeriodWithBreakdown;
  week: UsagePeriodWithBreakdown;
  month: UsagePeriodWithBreakdown;
  // Totals
  allTime: UsagePeriodWithBreakdown;
  lifetimeUnresettable: UsagePeriodWithBreakdown;
}

const STORAGE_KEY = 'chassis_usage_history';
const LIFETIME_KEY = 'chassis_lifetime_total';
const SESSION_START_KEY = 'chassis_session_start';

export class UsageTracker {
  private context: vscode.ExtensionContext;
  private currentSessionId: string;
  private currentSessionStart: number;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.currentSessionId = this.generateSessionId();
    this.currentSessionStart = Date.now();
    
    // Store session start time
    this.context.globalState.update(SESSION_START_KEY, this.currentSessionStart);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Record a new usage entry
  async recordUsage(tokens: number, cost: number, aiProvider: string): Promise<void> {
    const entry: UsageEntry = {
      timestamp: Date.now(),
      tokens,
      cost,
      aiProvider,
      messageCount: 1,
      sessionId: this.currentSessionId,
    };

    // Get current history
    const history = this.getHistory();
    history.push(entry);
    
    // Save to storage
    await this.context.globalState.update(STORAGE_KEY, history);

    // Update lifetime total (never reset)
    const lifetime = this.getLifetimeTotal();
    lifetime.tokens += tokens;
    lifetime.cost += cost;
    lifetime.messages += 1;
    lifetime.endTime = Date.now();
    await this.context.globalState.update(LIFETIME_KEY, lifetime);
  }

  // Get all usage history
  getHistory(): UsageEntry[] {
    return this.context.globalState.get<UsageEntry[]>(STORAGE_KEY, []);
  }

  // Get lifetime total (never reset)
  getLifetimeTotal(): UsagePeriod {
    return this.context.globalState.get<UsagePeriod>(LIFETIME_KEY, {
      tokens: 0,
      cost: 0,
      messages: 0,
      startTime: Date.now(),
      endTime: Date.now(),
    });
  }

  // Get current session start time
  getSessionStart(): number {
    return this.currentSessionStart;
  }

  // Generate comprehensive usage report with per-AI breakdowns
  getReport(): UsageReport {
    const now = Date.now();
    const history = this.getHistory();
    const sessionStart = this.currentSessionStart;

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
      aiMap: new Map<string, { tokens: number; cost: number; messages: number }>(),
    });

    const sessionData = createPeriod(sessionStart);
    const dayData = createPeriod(dayStartMs);
    const weekData = createPeriod(weekStartMs);
    const monthData = createPeriod(monthStart.getTime());
    const allTimeData = createPeriod(history[0]?.timestamp || now);

    // Helper to add entry to a period's totals and AI map
    const addToPeriod = (
      data: typeof sessionData,
      entry: UsageEntry,
    ) => {
      data.totals.tokens += entry.tokens;
      data.totals.cost += entry.cost;
      data.totals.messages += entry.messageCount;

      const ai = data.aiMap.get(entry.aiProvider);
      if (ai) {
        ai.tokens += entry.tokens;
        ai.cost += entry.cost;
        ai.messages += entry.messageCount;
      } else {
        data.aiMap.set(entry.aiProvider, {
          tokens: entry.tokens,
          cost: entry.cost,
          messages: entry.messageCount,
        });
      }
    };

    // Aggregate data
    for (const entry of history) {
      // All time (all entries)
      addToPeriod(allTimeData, entry);

      // Session (only current session)
      if (entry.sessionId === this.currentSessionId) {
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
    const toPeriodWithBreakdown = (data: typeof sessionData): UsagePeriodWithBreakdown => {
      const byAI: AIBreakdown[] = [...data.aiMap.entries()]
        .filter(([, stats]) => stats.tokens > 0) // Only show AIs with usage
        .map(([aiProvider, stats]) => ({
          aiProvider,
          tokens: stats.tokens,
          cost: stats.cost,
          messages: stats.messages,
        }))
        .sort((a, b) => b.tokens - a.tokens); // Sort by tokens descending

      return { ...data.totals, byAI };
    };

    const lifetime = this.getLifetimeTotal();
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
  async reset(period: 'session' | 'day' | 'week' | 'month' | 'all-resettable'): Promise<void> {
    const now = Date.now();
    const history = this.getHistory();
    
    if (period === 'session') {
      // Start new session
      this.currentSessionId = this.generateSessionId();
      this.currentSessionStart = now;
      await this.context.globalState.update(SESSION_START_KEY, this.currentSessionStart);
    } else if (period === 'day') {
      // Remove today's entries from history
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const filtered = history.filter(e => e.timestamp < dayStart.getTime());
      await this.context.globalState.update(STORAGE_KEY, filtered);
    } else if (period === 'week') {
      // Remove this week's entries
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const filtered = history.filter(e => e.timestamp < weekStart.getTime());
      await this.context.globalState.update(STORAGE_KEY, filtered);
    } else if (period === 'month') {
      // Remove this month's entries
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const filtered = history.filter(e => e.timestamp < monthStart.getTime());
      await this.context.globalState.update(STORAGE_KEY, filtered);
    } else if (period === 'all-resettable') {
      // Clear all history but NOT lifetime total
      await this.context.globalState.update(STORAGE_KEY, []);
      // Reset session
      this.currentSessionId = this.generateSessionId();
      this.currentSessionStart = now;
      await this.context.globalState.update(SESSION_START_KEY, this.currentSessionStart);
    }
  }

  // Get formatted usage string for display
  getUsageSummary(): string {
    const report = this.getReport();
    return `Session: ${report.session.tokens.toLocaleString()} tokens · $${report.session.cost.toFixed(4)} · ${report.session.messages} msgs`;
  }

  // Export data for reports
  exportData(): { history: UsageEntry[]; lifetime: UsagePeriod; report: UsageReport } {
    return {
      history: this.getHistory(),
      lifetime: this.getLifetimeTotal(),
      report: this.getReport(),
    };
  }
}
