// [SCOPE] Redivivus Learned Memory Service — reads/writes .redivivus/learned.md
// Manages two memory tiers:
//   Permanent — architectural decisions, user preferences, file facts. Never deleted.
//   Recent    — session observations. Auto-pruned after 30 days.
// [WARN] Keep entries plain English — must be readable by any AI model (Gemini, Claude, local LLMs)
// I/O helpers (read/write/append) -> learnedMemoryServiceIO.ts

import * as path from 'path';
import type { RoutingService } from './ai/routingService.js';
import {
  LearnedEntry, RECENT_TTL_DAYS,
  readLearnedEntries, writeLearnedEntries, appendLearnedEntry,
} from './learnedMemoryServiceIO.js';
export { LearnedEntry };

const LEARNED_FILE = '.redivivus/learned.md';

export class LearnedMemoryService {
  private filePath: string;

  constructor(root: string) {
    this.filePath = path.join(root, LEARNED_FILE);
  }

  // [DONE] Called from chatPanelMessages.ts when PREFERENCE_RE matches a user message mid-chat
  addPermanent(text: string): void {
    appendLearnedEntry(this.filePath, '## Permanent', text, true);
  }

  // [DONE] Called from sessionService.ts endSession() with AI-extracted session observations
  addRecent(text: string): void {
    appendLearnedEntry(this.filePath, '## Recent', text, false);
  }

  /** Record a mistake caught by Guardian or flagged by the user. Increments count if pattern already known. */
  addNeverDo(text: string, context?: string): void {
    const entries = readLearnedEntries(this.filePath);
    const existing = entries.find(e => e.neverDo && e.text.toLowerCase() === text.toLowerCase());
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.date = new Date().toISOString().slice(0, 10);
      writeLearnedEntries(this.filePath, entries);
    } else {
      const date = new Date().toISOString().slice(0, 10);
      entries.push({ date, text, permanent: true, neverDo: true, count: 1, context });
      writeLearnedEntries(this.filePath, entries);
    }
  }

  /** Returns Never-Do list for injection into Supervisor prompt — sorted by frequency */
  getNeverDoForPrompt(): string {
    const entries = readLearnedEntries(this.filePath).filter(e => e.neverDo);
    if (entries.length === 0) { return ''; }
    const sorted = entries.sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, 10);
    let out = '\n--- NEVER DO (learned from past mistakes) ---\n';
    out += sorted.map(e => {
      const times = (e.count || 1) > 1 ? ` [seen ${e.count}x]` : '';
      const ctx = e.context ? ` (${e.context})` : '';
      return `- DO NOT: ${e.text}${ctx}${times}`;
    }).join('\n');
    out += '\n---\n';
    return out;
  }

  /** Returns a compact string to inject into AI prompts — max ~300 tokens */
  getSummaryForPrompt(): string {
    const entries = readLearnedEntries(this.filePath);
    if (entries.length === 0) { return ''; }

    const permanent = entries.filter(e => e.permanent);
    const recent = entries.filter(e => !e.permanent);

    let out = '\n--- LEARNED ABOUT THIS PROJECT ---\n';
    if (permanent.length > 0) {
      out += permanent.map(e => '• ' + e.text).join('\n') + '\n';
    }
    if (recent.length > 0) {
      const latest = recent.slice(-5);
      out += 'Recently: ' + latest.map(e => e.text).join(' | ') + '\n';
    }
    out += '---\n';
    return out;
  }

  /** Prune Recent entries older than RECENT_TTL_DAYS. Call at session start. */
  pruneRecent(): void {
    const entries = readLearnedEntries(this.filePath);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_TTL_DAYS);
    const kept = entries.filter(e => e.permanent || new Date(e.date) >= cutoff);
    writeLearnedEntries(this.filePath, kept);
  }

  /** AI-powered fact extraction — call at session end with user-only messages.
   *  Falls back to empty arrays if AI call fails — never blocks session end. */
  static async extractFacts(
    userMessages: string[],
    routing: RoutingService
  ): Promise<{ permanent: string[]; recent: string[] }> {
    if (userMessages.length === 0) { return { permanent: [], recent: [] }; }

    const capped = userMessages.slice(-20).join('\n').slice(0, 2000);
    const prompt =
      'You are analyzing a coding session to extract memory facts for a developer AI assistant.\n' +
      'Read the session messages below and return ONLY a JSON object — no explanation, no markdown.\n\n' +
      'Rules:\n' +
      '- permanent: architectural decisions, explicit preferences ("I prefer X", "use X not Y"). Max 5 items.\n' +
      '- recent: what the developer was working on this session (topics, files, features). Max 5 items.\n' +
      '- Each item must be a single plain-English sentence under 120 characters.\n' +
      '- If nothing qualifies for a category, return an empty array for it.\n\n' +
      'Return format (strict JSON, nothing else):\n' +
      '{"permanent":["..."],"recent":["..."]}\n\n' +
      'Session messages:\n' + capped;

    try {
      const result = await routing.prompt(prompt, 15_000);
      const raw = result.text.trim();
      const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      return {
        permanent: Array.isArray(parsed.permanent) ? parsed.permanent.slice(0, 5) : [],
        recent:    Array.isArray(parsed.recent)    ? parsed.recent.slice(0, 5)    : [],
      };
    } catch {
      // [DEAD] Regex heuristic fallback removed — AI extraction is reliable enough with the strict prompt
      return { permanent: [], recent: [] };
    }
  }
}
