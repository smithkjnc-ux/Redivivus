// [SCOPE] Knowledge store I/O -- structured JSON storage replacing the flat learned.md format.
// Schema serves two purposes: (1) real-time prompt injection, (2) LLM fine-tuning training pairs.
// File: .redivivus/knowledge.json  (replaces .redivivus/learned.md)

import * as fs from 'fs';
import * as path from 'path';

export type EntryType = 'never_do' | 'preference' | 'fact' | 'architecture';
export type Severity  = 'crash' | 'bug' | 'quality' | 'style';
export type Source    = 'guardian' | 'user' | 'session' | 'supervisor';

export interface KnowledgeEntry {
  id:           string;      // stable UUID -- used for dedup and backend aggregation
  type:         EntryType;
  pattern:      string;      // short canonical label (≤200 chars) -- aggregation key
  description:  string;      // full human-readable description
  context?:     string;      // 'game' | 'canvas' | 'html' | file extension | etc.
  severity?:    Severity;    // for never_do entries
  source:       Source;
  count:        number;      // times seen/reinforced
  permanent:    boolean;     // false = eligible for TTL pruning
  firstSeen:    string;      // YYYY-MM-DD
  lastSeen:     string;      // YYYY-MM-DD
  example?:     string;      // bad code snippet -- input side of fine-tuning pair
  fix?:         string;      // correct approach  -- output side of fine-tuning pair
}

export interface KnowledgeStore {
  version:  1;
  entries:  KnowledgeEntry[];
}

export const RECENT_TTL_DAYS = 30;
const KNOWLEDGE_FILE = '.redivivus/knowledge.json';
const LEGACY_FILE    = '.redivivus/learned.md';

function today(): string { return new Date().toISOString().slice(0, 10); }

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function knowledgePath(root: string): string {
  return path.join(root, KNOWLEDGE_FILE);
}

export function readKnowledge(root: string): KnowledgeStore {
  const kPath = path.join(root, KNOWLEDGE_FILE);
  // Try new JSON store first
  if (fs.existsSync(kPath)) {
    try {
      const raw = fs.readFileSync(kPath, 'utf8');
      return JSON.parse(raw) as KnowledgeStore;
    } catch { return { version: 1, entries: [] }; }
  }
  // Migrate from legacy learned.md if it exists
  const lPath = path.join(root, LEGACY_FILE);
  if (fs.existsSync(lPath)) { return migrateLegacy(lPath, kPath); }
  return { version: 1, entries: [] };
}

export function writeKnowledge(root: string, store: KnowledgeStore): void {
  const kPath = path.join(root, KNOWLEDGE_FILE);
  const dir = path.dirname(kPath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  fs.writeFileSync(kPath, JSON.stringify(store, null, 2), 'utf8');
}

export function makeEntry(fields: Omit<KnowledgeEntry, 'id' | 'count' | 'firstSeen' | 'lastSeen'> & Partial<Pick<KnowledgeEntry, 'count'>>): KnowledgeEntry {
  const d = today();
  return { id: makeId(), count: 1, firstSeen: d, lastSeen: d, ...fields };
}

// Migrate legacy learned.md to structured knowledge.json
function migrateLegacy(legacyPath: string, newPath: string): KnowledgeStore {
  const raw = fs.readFileSync(legacyPath, 'utf8');
  const entries: KnowledgeEntry[] = [];
  let section = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('## Permanent'))  { section = 'permanent'; continue; }
    if (line.startsWith('## Recent'))     { section = 'recent';    continue; }
    if (line.startsWith('## Never Do'))   { section = 'neverdo';   continue; }
    if (section === 'neverdo') {
      const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+?)(?:\s\|\scontext:([^|]+))?(?:\s\|\scount:(\d+))?$/);
      if (m) { entries.push(makeEntry({ type: 'never_do', pattern: m[2].trim().slice(0, 200), description: m[2].trim(), context: m[3]?.trim(), severity: 'bug', source: 'guardian', permanent: true, count: m[4] ? parseInt(m[4]) : 1 })); }
    } else {
      const m = line.match(/^- \[(\d{4}-\d{2}-\d{2})\] (.+)$/);
      if (m) { entries.push(makeEntry({ type: section === 'permanent' ? 'fact' : 'fact', pattern: m[2].slice(0, 200), description: m[2], source: 'user', permanent: section === 'permanent' })); }
    }
  }
  const store: KnowledgeStore = { version: 1, entries };
  try {
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(newPath, JSON.stringify(store, null, 2), 'utf8');
  } catch { /* non-fatal */ }
  return store;
}
