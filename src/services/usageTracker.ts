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

export interface UsageReport {
  // Breakdowns
  session: UsagePeriod;
  day: UsagePeriod;
  week: UsagePeriod;
  month: UsagePeriod;
  // Totals
  allTime: UsagePeriod;
  lifetimeUnresettable: UsagePeriod;
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

  // Generate comprehensive usage report
  getReport(): UsageReport {
    const now = Date.now();
    const history = this.getHistory();
    const sessionStart = this.currentSessionStart;
    
    // Calculate day start (midnight today)
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    
    // Calculate week start (Sunday midnight)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartMs = weekStart.getTime();
    
    // Calculate month start (1st of month)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();

    const session: UsagePeriod = { tokens: 0, cost: 0, messages: 0, startTime: sessionStart, endTime: now };
    const day: UsagePeriod = { tokens: 0, cost: 0, messages: 0, startTime: dayStartMs, endTime: now };
    const week: UsagePeriod = { tokens: 0, cost: 0, messages: 0, startTime: weekStartMs, endTime: now };
    const month: UsagePeriod = { tokens: 0, cost: 0, messages: 0, startTime: monthStartMs, endTime: now };

    // Aggregate data
    for (const entry of history) {
      // Session (only current session)
      if (entry.sessionId === this.currentSessionId) {
        session.tokens += entry.tokens;
        session.cost += entry.cost;
        session.messages += entry.messageCount;
      }
      
      // Day
      if (entry.timestamp >= dayStartMs) {
        day.tokens += entry.tokens;
        day.cost += entry.cost;
        day.messages += entry.messageCount;
      }
      
      // Week
      if (entry.timestamp >= weekStartMs) {
        week.tokens += entry.tokens;
        week.cost += entry.cost;
        week.messages += entry.messageCount;
      }
      
      // Month
      if (entry.timestamp >= monthStartMs) {
        month.tokens += entry.tokens;
        month.cost += entry.cost;
        month.messages += entry.messageCount;
      }
    }

    const lifetime = this.getLifetimeTotal();

    return {
      session,
      day,
      week,
      month,
      allTime: lifetime, // Resettable total
      lifetimeUnresettable: { ...lifetime }, // Permanent copy
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
