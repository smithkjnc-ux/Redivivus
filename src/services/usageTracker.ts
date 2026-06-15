// [SCOPE] Redivivus Usage Tracker — tracks AI token usage and costs across sessions with persistent storage
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

export interface RoleBreakdown {
  role: string;
  tokens: number;
  cost: number;
  messages: number;
}

// Per-AI breakdown for a time period
export interface AIBreakdown {
  aiProvider: string;
  tokens: number;
  cost: number;
  messages: number;
  byRole: RoleBreakdown[];
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

export const STORAGE_KEY = 'redivivus_usage_history';
export const LIFETIME_KEY = 'redivivus_lifetime_total';
export const SESSION_START_KEY = 'redivivus_session_start';

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

  // One-time cleanup of legacy unattributed rows (stored as 'none' before the 'unknown' labeling fix).
  // Removes matching entries from history AND decrements the lifetime aggregate by the removed amounts
  // so the headline Total tokens/cost stay consistent. Returns the number of rows removed.
  async purgeUnattributedUsage(labels: string[] = ['none']): Promise<number> {
    const set = new Set(labels.map(l => l.toLowerCase()));
    const history = this.getHistory();
    let rmTokens = 0, rmCost = 0, rmMsgs = 0, rmCount = 0;
    const kept = history.filter(e => {
      if (set.has((e.aiProvider || '').toLowerCase())) {
        rmTokens += e.tokens; rmCost += e.cost; rmMsgs += e.messageCount; rmCount++;
        return false;
      }
      return true;
    });
    if (rmCount === 0) { return 0; }
    await this.context.globalState.update(STORAGE_KEY, kept);
    const lifetime = this.getLifetimeTotal();
    lifetime.tokens = Math.max(0, lifetime.tokens - rmTokens);
    lifetime.cost = Math.max(0, lifetime.cost - rmCost);
    lifetime.messages = Math.max(0, lifetime.messages - rmMsgs);
    await this.context.globalState.update(LIFETIME_KEY, lifetime);
    return rmCount;
  }

  // Runs purgeUnattributedUsage once per install (guarded by a globalState flag). Call at activation.
  async runOneTimeNonePurge(): Promise<void> {
    const FLAG = 'redivivus_usage_none_purged_v1';
    if (this.context.globalState.get<boolean>(FLAG)) { return; }
    try { await this.purgeUnattributedUsage(['none']); } catch { /* non-fatal */ }
    await this.context.globalState.update(FLAG, true);
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
  getReport(projectName?: string): UsageReport {
    const { buildUsageReport } = require('./usageTrackerReport.js');
    return buildUsageReport(this, projectName);
  }

  async reset(period: 'session' | 'day' | 'week' | 'month' | 'all-resettable'): Promise<void> {
    const { resetUsagePeriod } = require('./usageTrackerReport.js');
    return resetUsagePeriod(this, period);
  }

  getUsageSummary(projectName?: string): string {
    const report = this.getReport(projectName);
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
  // Unattributed: caller couldn't resolve who ran (empty or the 'none' sentinel). Surface as
  // 'unknown' — a deliberate, visible signal that a call site failed to record its provider, so
  // the gap can be found and fixed. Never silently bucket it as a real-looking 'none'.
  if (!m || m === 'none') { return 'unknown'; }
  return ai;
}

// Per-model pricing table. Rates: [$/1M input, $/1M output].
// [WARN] Update when Anthropic/Google/OpenAI change pricing.
export function calcCost(model: string, inTok: number, outTok: number): number {
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
