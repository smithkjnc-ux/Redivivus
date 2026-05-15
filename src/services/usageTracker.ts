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

export const STORAGE_KEY = 'chassis_usage_history';
export const LIFETIME_KEY = 'chassis_lifetime_total';
export const SESSION_START_KEY = 'chassis_session_start';

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
    const { buildUsageReport } = require('./usageTrackerReport.js');
    return buildUsageReport(this);
  }

  async reset(period: 'session' | 'day' | 'week' | 'month' | 'all-resettable'): Promise<void> {
    const { resetUsagePeriod } = require('./usageTrackerReport.js');
    return resetUsagePeriod(this, period);
  }

  getUsageSummary(): string {
    const report = this.getReport();
    return `Session: ${report.session.tokens.toLocaleString()} tokens · $${report.session.cost.toFixed(4)} · ${report.session.messages} msgs`;
  }

  exportData(): { history: UsageEntry[]; lifetime: UsagePeriod; report: UsageReport } {
    return {
      history: this.getHistory(),
      lifetime: this.getLifetimeTotal(),
      report: this.getReport(),
    };
  }
}
