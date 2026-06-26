// [SCOPE] Redivivus Knowledge Service -- reads/writes .redivivus/knowledge.json
// Structured storage replacing the flat learned.md format.
// Two tiers: permanent (never deleted) and recent (pruned after 30 days).
// Public API is unchanged -- callers do not need to update.

import * as path from 'path';
import type { RoutingService } from '../../../features/ai/data/routingService.js';
import {
  KnowledgeEntry, KnowledgeStore, RECENT_TTL_DAYS,
  readKnowledge, writeKnowledge, makeEntry,
} from './learnedMemoryServiceIO.js';
export { KnowledgeEntry };

export class LearnedMemoryService {
  private root: string;

  constructor(root: string) { this.root = root; }

  private read(): KnowledgeStore { return readKnowledge(this.root); }
  private write(store: KnowledgeStore): void { writeKnowledge(this.root, store); }

  addPermanent(text: string): void {
    const store = this.read();
    if (store.entries.some(e => e.pattern === text.slice(0, 200))) { return; }
    store.entries.push(makeEntry({ type: 'preference', pattern: text.slice(0, 200), description: text, source: 'user', permanent: true }));
    this.write(store);
  }

  addRecent(text: string): void {
    const store = this.read();
    store.entries.push(makeEntry({ type: 'fact', pattern: text.slice(0, 200), description: text, source: 'session', permanent: false }));
    this.write(store);
  }

  /** Record a Guardian-caught or user-reported mistake. Increments count if already known. */
  addNeverDo(text: string, context?: string): void {
    const store = this.read();
    const pattern = text.slice(0, 200).toLowerCase();
    const existing = store.entries.find(e => e.type === 'never_do' && e.pattern.toLowerCase() === pattern);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString().slice(0, 10);
      if (context && !existing.context) { existing.context = context; }
    } else {
      store.entries.push(makeEntry({ type: 'never_do', pattern: text.slice(0, 200), description: text, context, severity: 'bug', source: 'guardian', permanent: true }));
    }
    this.write(store);
  }

  /** Add or update a never_do entry with example/fix pair for fine-tuning. */
  addNeverDoWithPair(text: string, context: string, example: string, fix: string): void {
    const store = this.read();
    const pattern = text.slice(0, 200).toLowerCase();
    const existing = store.entries.find(e => e.type === 'never_do' && e.pattern.toLowerCase() === pattern);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString().slice(0, 10);
      if (!existing.example) { existing.example = example.slice(0, 500); }
      if (!existing.fix)     { existing.fix = fix.slice(0, 500); }
    } else {
      store.entries.push(makeEntry({ type: 'never_do', pattern: text.slice(0, 200), description: text, context, severity: 'bug', source: 'guardian', permanent: true, example: example.slice(0, 500), fix: fix.slice(0, 500) }));
    }
    this.write(store);
  }

  private formatNeverDo(entries: KnowledgeEntry[]): string {
    const lines = entries.map(e => {
      const times = (e.count || 1) > 1 ? ` [seen ${e.count}x]` : '';
      const ctx   = e.context ? ` (${e.context})` : '';
      const fix   = e.fix ? ` -> ${e.fix.slice(0, 80)}` : '';
      return `- DO NOT: ${e.description}${ctx}${times}${fix}`;
    });
    return '\n--- NEVER DO (learned from past mistakes) ---\n' + lines.join('\n') + '\n---\n';
  }

  getNeverDoForPrompt(): string {
    const entries = this.read().entries.filter(e => e.type === 'never_do');
    if (entries.length === 0) { return ''; }
    const sorted = [...entries].sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, 10);
    return this.formatNeverDo(sorted);
  }

  async getNeverDoForTask(task: string, routing: RoutingService): Promise<string> {
    const entries = this.read().entries.filter(e => e.type === 'never_do');
    if (entries.length === 0) { return ''; }
    if (entries.length <= 3) { return this.formatNeverDo(entries); }
    const numbered = entries.map((e, i) => `${i + 1}. ${e.description}`).join('\n');
    const prompt = `Task: "${task.slice(0, 200)}"\n\nPast mistakes:\n${numbered}\n\nReply ONLY with comma-separated numbers of mistakes that could recur in this task. If none: NONE`;
    try {
      const result = await routing.promptCheap(prompt, 8_000);
      const raw = result.text.trim().toUpperCase();
      if (!raw || raw === 'NONE') { return ''; }
      const indices = raw.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= entries.length);
      const relevant = indices.map(i => entries[i - 1]).filter(Boolean);
      return relevant.length > 0 ? this.formatNeverDo(relevant) : '';
    } catch {
      return this.formatNeverDo([...entries].sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, 10));
    }
  }

  getSummaryForPrompt(): string {
    const store = this.read();
    if (store.entries.length === 0) { return ''; }
    const permanent = store.entries.filter(e => e.permanent && e.type !== 'never_do');
    const recent    = store.entries.filter(e => !e.permanent).slice(-5);
    let out = '\n--- LEARNED ABOUT THIS PROJECT ---\n';
    if (permanent.length > 0) { out += permanent.map(e => '• ' + e.description).join('\n') + '\n'; }
    if (recent.length > 0) { out += 'Recently: ' + recent.map(e => e.description).join(' | ') + '\n'; }
    return out + '---\n';
  }

  /** Returns structured training pairs for fine-tuning. Only entries with example+fix. */
  getTrainingPairs(): Array<{ input: string; output: string; context?: string; count: number }> {
    return this.read().entries
      .filter(e => e.type === 'never_do' && e.example && e.fix)
      .map(e => ({ input: e.example!, output: e.fix!, context: e.context, count: e.count }));
  }

  pruneRecent(): void {
    const store = this.read();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_TTL_DAYS);
    store.entries = store.entries.filter(e => e.permanent || new Date(e.firstSeen) >= cutoff);
    this.write(store);
  }

  static async extractBuildDecisions(
    conversation: Array<{ role: string; content: string }>,
    task: string,
    routing: RoutingService,
  ): Promise<{ permanent: string[]; recent: string[] }> {
    if (conversation.length === 0) { return { permanent: [], recent: [] }; }
    const turns = conversation.slice(-20).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');
    const prompt = `A developer just finished a coding task. Extract memory facts.\n\nTASK: "${task.slice(0, 200)}"\n\nCONVERSATION:\n${turns}\n\nReturn strict JSON only:\n- permanent: tech choices, naming decisions, constraints. Max 5.\n- recent: what was built this session. Max 3.\n\nFormat: {"permanent":["..."],"recent":["..."]}\nIf nothing: {"permanent":[],"recent":[]}`;
    try {
      const result = await routing.promptCheap(prompt, 10_000);
      const raw = result.text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(raw);
      return { permanent: Array.isArray(parsed.permanent) ? parsed.permanent.slice(0, 5) : [], recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 3) : [] };
    } catch { return { permanent: [], recent: [] }; }
  }

  static async extractFacts(userMessages: string[], routing: RoutingService): Promise<{ permanent: string[]; recent: string[] }> {
    if (userMessages.length === 0) { return { permanent: [], recent: [] }; }
    const capped = userMessages.slice(-20).join('\n').slice(0, 2000);
    const prompt = `Analyze this coding session. Return ONLY JSON.\n- permanent: architectural decisions, explicit preferences. Max 5.\n- recent: what was worked on. Max 5.\nFormat: {"permanent":["..."],"recent":["..."]}\nSession:\n${capped}`;
    try {
      const result = await routing.prompt(prompt, 15_000);
      const raw = result.text.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(raw);
      return { permanent: Array.isArray(parsed.permanent) ? parsed.permanent.slice(0, 5) : [], recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 5) : [] };
    } catch { return { permanent: [], recent: [] }; }
  }
}
