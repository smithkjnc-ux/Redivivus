// [SCOPE] CHASSIS Build History Service — persists every successful build to
// .chassis/build_history.json. Provides read/write/prune API used by the
// Build History panel and the ChatPanel restart-restore flow.
// Max 50 entries — oldest pruned automatically on record().

import * as fs from 'fs';
import * as path from 'path';
import { buildResultCard } from '../../ui/chat/chatPanelStory.js';

const HISTORY_FILE = '.chassis/build_history.json';
const MAX_ENTRIES = 50;

export interface BuildHistoryEntry {
  id: string;                    // same as snapshotId (timestamp string)
  timestamp: string;             // ISO string
  task: string;                  // original user prompt
  files: string[];               // relative paths created/modified
  tokensUsed: number;
  costUSD: number;
  source: 'ai' | 'vault';
  supervisor: string;            // e.g. 'gemini'
  worker: string | null;         // e.g. 'kimi' or null
  resultCardToken: string;       // raw buildResultCard() output — used to restore chat cards
  undone?: boolean;              // set true after undo
}

export class BuildHistoryService {
  private historyPath: string;

  constructor(private root: string) {
    this.historyPath = path.join(root, HISTORY_FILE);
  }

  /** Read all history entries, newest first. Orphan snapshots are NOT included here. */
  list(): BuildHistoryEntry[] {
    try {
      if (!fs.existsSync(this.historyPath)) { return []; }
      const raw = fs.readFileSync(this.historyPath, 'utf8');
      const entries: BuildHistoryEntry[] = JSON.parse(raw);
      return entries.sort((a, b) => b.id.localeCompare(a.id));
    } catch { return []; }
  }

  /** Append a new entry and prune to MAX_ENTRIES. Never throws. */
  record(entry: BuildHistoryEntry): void {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      const existing = this.list();
      const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
      fs.writeFileSync(this.historyPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch { /* never block a build */ }
  }

  /** Mark an entry as undone. */
  markUndone(id: string): void {
    try {
      const entries = this.list();
      const idx = entries.findIndex(e => e.id === id);
      if (idx === -1) { return; }
      entries[idx].undone = true;
      fs.writeFileSync(this.historyPath, JSON.stringify(entries, null, 2), 'utf8');
    } catch { /* never throw */ }
  }

  /** Returns the last N result card tokens for chat restore on extension reload. */
  getLastResultCards(n = 3): Array<{ resultCardToken: string; files: string[]; id: string }> {
    return this.list()
      .filter(e => !e.undone && e.resultCardToken)
      .slice(0, n)
      .map(e => ({ resultCardToken: e.resultCardToken, files: e.files, id: e.id }));
  }
}

/** Build a BuildHistoryEntry ready to pass to record(). */
export function makeBuildHistoryEntry(opts: {
  snapshotId: string;
  task: string;
  files: string[];
  tokensUsed: number;
  costUSD: number;
  source: 'ai' | 'vault';
  supervisor: string;
  worker: string | null;
  resultCardToken: string;
}): BuildHistoryEntry {
  return {
    id: opts.snapshotId,
    timestamp: new Date().toISOString(),
    task: opts.task,
    files: opts.files,
    tokensUsed: opts.tokensUsed,
    costUSD: opts.costUSD,
    source: opts.source,
    supervisor: opts.supervisor,
    worker: opts.worker,
    resultCardToken: opts.resultCardToken,
  };
}
