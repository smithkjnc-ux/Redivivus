// [SCOPE] Learned memory I/O helpers — file read/write/append for learnedMemoryService.ts
// Extracted to keep learnedMemoryService.ts under 200 lines.

import * as fs from 'fs';
import * as path from 'path';

export interface LearnedEntry {
  date: string;   // ISO date string YYYY-MM-DD
  text: string;
  permanent: boolean;
  neverDo?: boolean;  // Guardian-caught mistake or user-flagged failure
  count?: number;     // how many times this mistake has been seen
  context?: string;   // e.g. 'canvas animation', 'react', 'api'
}

export const RECENT_TTL_DAYS = 30;

export function appendLearnedEntry(filePath: string, _section: string, text: string, permanent: boolean): void {
  const date = new Date().toISOString().slice(0, 10);
  const entries = readLearnedEntries(filePath);
  entries.push({ date, text, permanent });
  writeLearnedEntries(filePath, entries);
}

export function readLearnedEntries(filePath: string): LearnedEntry[] {
  if (!fs.existsSync(filePath)) { return []; }
  const raw = fs.readFileSync(filePath, 'utf8');
  const entries: LearnedEntry[] = [];
  let currentSection = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('## Permanent')) { currentSection = 'permanent'; continue; }
    if (line.startsWith('## Recent')) { currentSection = 'recent'; continue; }
    if (line.startsWith('## Never Do')) { currentSection = 'neverdo'; continue; }
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

export function writeLearnedEntries(filePath: string, entries: LearnedEntry[]): void {
  const dir = path.dirname(filePath);
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
  fs.writeFileSync(filePath, out, 'utf8');
}
