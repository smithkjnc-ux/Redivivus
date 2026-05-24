// [SCOPE] CHASSIS Usage Tracker — tracks AI token usage and costs across sessions with persistent storage
// Provides breakdowns by session, day, week, month with reset capability while preserving lifetime totals.
// Tracks: timestamp, tokens, cost, AI provider, message count per interaction

import type * as vscode from 'vscode';

export interface UsageEntry {
  timestamp: number;
  tokens: number;       // total = inputTokens + outputTokens
  inputTokens: number;  // tokens sent (prompt) — cheaper rate
  outputTokens: number; // tokens received (completion) — more expensive rate
  cost: number;
  aiProvider: string;
  messageCount: number;
  sessionId: string;
  role?: 'supervisor' | 'worker' | 'guardian' | 'qa' | 'solo'; // what this call was doing
  project?: string; // project name (workspace folder basename)
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

  // Record a new usage entry — pass actual inputTokens/outputTokens from API response when available
  // [FIX] cost param ignored — computed from model+tokens using accurate per-model pricing (callers passed 0 or flat $0.30/1M)
  async recordUsage(tokens: number, _cost: number, aiProvider: string, inputTokens?: number, outputTokens?: number, role?: UsageEntry['role'], project?: string): Promise<void> {
    const actualIn  = inputTokens  ?? Math.ceil(tokens * 0.6);  // estimate 60/40 split if not provided
    const actualOut = outputTokens ?? Math.ceil(tokens * 0.4);
    const cost = calcCost(aiProvider, actualIn, actualOut);
    const entry: UsageEntry = {
      timestamp: Date.now(),
      tokens: actualIn + actualOut,
      inputTokens: actualIn,
      outputTokens: actualOut,
      cost,
      aiProvider: normalizeAI(aiProvider),
      messageCount: 1,
      sessionId: this.currentSessionId,
      role,
      project,
    };

    // Get current history
    const history = this.getHistory();
    history.push(entry);

    // Save to storage
    await this.context.globalState.update(STORAGE_KEY, history);

    // Update lifetime total (never reset)
    const lifetime = this.getLifetimeTotal();
    lifetime.tokens += entry.tokens;
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

// Normalize full model IDs (e.g. 'claude-haiku-4-5-20251001') → short roster keys ('claude', 'gemini', etc.)
// so the usage report's roster lookup always finds a match.
function normalizeAI(ai: string): string {
  const m = (ai || '').toLowerCase();
  if (m.includes('claude'))                       { return 'claude'; }
  if (m.includes('gemini'))                       { return 'gemini'; }
  if (m.includes('gpt') || m.includes('openai'))  { return 'openai'; }
  if (m.includes('groq') || m.includes('llama'))  { return 'groq'; }
  if (m.includes('grok') || m.includes('xai'))    { return 'xai'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'kimi'; }
  return ai;
}

// Per-model pricing table. Rates: [$/1M input, $/1M output].
// [WARN] Update when Anthropic/Google/OpenAI change pricing.
function calcCost(model: string, inTok: number, outTok: number): number {
  const m = (model || '').toLowerCase();
  let inRate = 0.30, outRate = 0.30; // fallback flat rate
  if (m.includes('claude-haiku-4'))    { inRate = 0.80; outRate = 4.00; }  // Haiku 4.x (4-5 label or 4 label)
  else if (m.includes('claude-haiku')) { inRate = 0.25; outRate = 1.25; }  // Haiku 3.x legacy
  else if (m.includes('claude-sonnet'))   { inRate = 3.00;  outRate = 15.00; }
  else if (m.includes('claude-opus'))     { inRate = 15.00; outRate = 75.00; }
  else if (m.includes('claude'))          { inRate = 3.00;  outRate = 15.00; }
  else if (m.includes('gemini-1.5-pro'))  { inRate = 1.25;  outRate = 5.00; }
  else if (m.includes('gemini-2.5'))      { inRate = 1.25;  outRate = 10.00; }
  else if (m.includes('gemini'))          { inRate = 0.075; outRate = 0.30; }
  else if (m.includes('gpt-4o-mini'))     { inRate = 0.15;  outRate = 0.60; }
  else if (m.includes('gpt-4o'))          { inRate = 5.00;  outRate = 15.00; }
  else if (m.includes('groq') || m.includes('llama')) { inRate = 0.09; outRate = 0.09; }
  else if (m.includes('grok') || m.includes('xai'))   { inRate = 5.00; outRate = 15.00; }
  else if (m.includes('kimi') || m.includes('moonshot')) { inRate = 0.15; outRate = 0.60; }
  return (inTok * inRate + outTok * outRate) / 1_000_000;
}
