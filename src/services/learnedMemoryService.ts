// [SCOPE] CHASSIS Learned Memory Service — reads/writes .chassis/learned.md
// Manages two memory tiers:
//   Permanent — architectural decisions, user preferences, file facts. Never deleted.
//   Recent    — session observations. Auto-pruned after 30 days.
// [WARN] Keep entries plain English — must be readable by any AI model (Gemini, Claude, local LLMs)

import * as fs from 'fs';
import * as path from 'path';
import { RoutingService } from './ai/routingService.js';

const LEARNED_FILE = '.chassis/learned.md';
const RECENT_TTL_DAYS = 30;

export interface LearnedEntry {
  date: string;   // ISO date string YYYY-MM-DD
  text: string;
  permanent: boolean;
  neverDo?: boolean;  // Guardian-caught mistake or user-flagged failure
  count?: number;     // how many times this mistake has been seen
  context?: string;   // e.g. 'canvas animation', 'react', 'api'
}

export class LearnedMemoryService {
  private filePath: string;

  constructor(root: string) {
    this.filePath = path.join(root, LEARNED_FILE);
  }

  // [DONE] Called from chatPanelMessages.ts when PREFERENCE_RE matches a user message mid-chat
  addPermanent(text: string): void {
    this._append('## Permanent', text, true);
  }

  // [DONE] Called from sessionService.ts endSession() with AI-extracted session observations
  addRecent(text: string): void {
    this._append('## Recent', text, false);
  }

  /** Record a mistake caught by Guardian or flagged by the user. Increments count if pattern already known. */
  addNeverDo(text: string, context?: string): void {
    const entries = this._read();
    const existing = entries.find(e => e.neverDo && e.text.toLowerCase() === text.toLowerCase());
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.date = new Date().toISOString().slice(0, 10);
      this._write(entries);
    } else {
      const date = new Date().toISOString().slice(0, 10);
      entries.push({ date, text, permanent: true, neverDo: true, count: 1, context });
      this._write(entries);
    }
  }

  /** Returns Never-Do list for injection into Supervisor prompt — sorted by frequency */
  getNeverDoForPrompt(): string {
    const entries = this._read().filter(e => e.neverDo);
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
    const entries = this._read();
    if (entries.length === 0) { return ''; }

    const permanent = entries.filter(e => e.permanent);
    const recent = entries.filter(e => !e.permanent);

    let out = '\n--- LEARNED ABOUT THIS PROJECT ---\n';
    if (permanent.length > 0) {
      out += permanent.map(e => '• ' + e.text).join('\n') + '\n';
    }
    if (recent.length > 0) {
      // Only inject last 5 recent entries to cap tokens
      const latest = recent.slice(-5);
      out += 'Recently: ' + latest.map(e => e.text).join(' | ') + '\n';
    }
    out += '---\n';
    return out;
  }

  /** Prune Recent entries older than RECENT_TTL_DAYS. Call at session start. */
  pruneRecent(): void {
    if (!fs.existsSync(this.filePath)) { return; }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_TTL_DAYS);

    const entries = this._read();
    const kept = entries.filter(e => {
      if (e.permanent) { return true; }
      return new Date(e.date) >= cutoff;
    });

    this._write(kept);
  }

  /** AI-powered fact extraction — call at session end with user-only messages.
   *  Uses the routing service to ask the AI to classify and summarise what was learned.
   *  Falls back to empty arrays if AI call fails — never blocks session end. */
  static async extractFacts(
    userMessages: string[],
    routing: RoutingService
  ): Promise<{ permanent: string[]; recent: string[] }> {
    if (userMessages.length === 0) { return { permanent: [], recent: [] }; }

    // Cap input to last 20 messages and 2000 chars total to keep prompt cheap
    const capped = userMessages.slice(-20).join('\n').slice(0, 2000);

    const prompt =
      'You are analyzing a coding session to extract memory facts for a developer AI assistant.\n' +
      'Read the session messages below and return ONLY a JSON object — no explanation, no markdown.\n\n' +
      'Rules:\n' +
      '- permanent: architectural decisions, explicit preferences ("I prefer X", "use X not Y", "entry point is X", "we decided X"). Max 5 items.\n' +
      '- recent: what the developer was working on this session (topics, files, features). Max 5 items.\n' +
      '- Each item must be a single plain-English sentence under 120 characters.\n' +
      '- If nothing qualifies for a category, return an empty array for it.\n\n' +
      'Return format (strict JSON, nothing else):\n' +
      '{"permanent":["..."],"recent":["..."]}\n\n' +
      'Session messages:\n' + capped;

    try {
      const result = await routing.prompt(prompt, 15_000);
      const raw = result.text.trim();
      // Strip markdown code fences if present
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

  private _append(section: string, text: string, permanent: boolean): void {
    const date = new Date().toISOString().slice(0, 10);
    const entry: LearnedEntry = { date, text, permanent };
    const entries = this._read();
    entries.push(entry);
    this._write(entries);
  }

  private _read(): LearnedEntry[] {
    if (!fs.existsSync(this.filePath)) { return []; }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const entries: LearnedEntry[] = [];
    let currentSection = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('## Permanent')) { currentSection = 'permanent'; continue; }
      if (line.startsWith('## Recent')) { currentSection = 'recent'; continue; }
      if (line.startsWith('## Never Do')) { currentSection = 'neverdo'; continue; }
      // NeverDo format: - [date] text | context:X | count:N
      if (currentSection === 'neverdo') {
        const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+?)(?:\s\|\scontext:([^|]+))?(?:\s\|\scount:(\d+))?$/);
        if (m) {
          entries.push({ date: m[1], text: m[2].trim(), permanent: true, neverDo: true, context: m[3]?.trim(), count: m[4] ? parseInt(m[4]) : 1 });
        }
        continue;
      }
      const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+)$/);
      if (m) {
        entries.push({ date: m[1], text: m[2], permanent: currentSection === 'permanent' });
      }
    }
    return entries;
  }

  private _write(entries: LearnedEntry[]): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

    const permanent = entries.filter(e => e.permanent && !e.neverDo);
    const recent = entries.filter(e => !e.permanent && !e.neverDo);
    const neverDo = entries.filter(e => e.neverDo);

    let out = '# CHASSIS Learned Memory\n';
    out += '> Auto-managed by CHASSIS. Do not edit manually.\n\n';
    out += '## Permanent\n';
    out += '> Architectural decisions, user preferences, project facts. Never deleted.\n';
    permanent.forEach(e => { out += `- [${e.date}] ${e.text}\n`; });
    out += '\n## Recent\n';
    out += `> Session observations. Auto-pruned after ${RECENT_TTL_DAYS} days.\n`;
    recent.forEach(e => { out += `- [${e.date}] ${e.text}\n`; });
    out += '\n## Never Do\n';
    out += '> Mistakes caught by Guardian or flagged by user. Injected into every build prompt.\n';
    neverDo.forEach(e => {
      let line = `- [${e.date}] ${e.text}`;
      if (e.context) { line += ` | context:${e.context}`; }
      if (e.count && e.count > 1) { line += ` | count:${e.count}`; }
      out += line + '\n';
    });
    fs.writeFileSync(this.filePath, out, 'utf8');
  }
}
