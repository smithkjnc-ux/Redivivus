// [SCOPE] Build audit logger — appends one JSONL entry per build to .redivivus/build_log.jsonl.
// Records: AI source (cloud vs local), provider, model, vault items sent, files written, token counts.
// One line per build — grep-friendly, spreadsheet-importable, never blocks the build pipeline.

import * as fs from 'fs';
import * as path from 'path';

export interface BuildLogEntry {
  timestamp: string;
  task: string;
  project: string;
  source: 'cloud' | 'local-fallback';
  provider?: string;
  model?: string;
  vaultItemsUsed?: string[];
  files: Array<{ path: string; isNew: boolean; sizeBytes: number }>;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  error?: string;  // present only on failed builds
}

export interface BuildMeta {
  source: 'cloud' | 'local-fallback';
  provider?: string;
  vaultItemNames?: string[];
  // Two-phase attribution — when a Supervisor (pro-tier, e.g. Claude) wrote the prescription.
  // Lets the usage tracker record Supervisor + Worker separately instead of one hardcoded "solo" row.
  supervisor?: { ran: boolean; provider?: string; model?: string; inputTokens?: number; outputTokens?: number; error?: string };
  workerProvider?: string;
}

export function appendBuildLog(root: string, entry: BuildLogEntry): void {
  try {
    const logPath = path.join(root, '.redivivus', 'build_log.jsonl');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* non-fatal — never block a build for logging */ }
}
