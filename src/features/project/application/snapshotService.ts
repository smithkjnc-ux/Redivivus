// [SCOPE] Redivivus Snapshot Service — pre-build/-fix undo snapshots, kept 100% INSIDE the project so they
// travel with it (move it, zip it, open it elsewhere — the history comes along). Each snapshot is ONE
// COMPRESSED bundle: .redivivus/snapshots/<id>.json.gz (a gzipped map of relPath -> file content, plus
// _meta.json). Compressed = opaque to every project tool (vitest, jest, tsc, eslint, webpack), so snapshot
// copies of *.test.js etc. are NEVER discovered and run. init_ prefix = permanent baseline (never pruned).
// [DEAD] Previously stored ACTIVE snapshots as uncompressed file TREES (.redivivus/snapshots/<id>/src/…). Vitest
// globbed those *.test.js copies and ran them against the real DB → phantom failures that derailed the agent.
// Replaced with bundles; _migrateLegacy() converts any old trees on construct and deletes them.

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const SNAPSHOTS_DIR = '.redivivus/snapshots';
const MAX_SNAPSHOTS = 25; // keep the 25 most recent non-init bundles; older are pruned (init_ kept forever)
// Skip binaries/huge files — snapshots are for source-code undo; utf8 bundles would corrupt binaries.
const SKIP_BINARY = /\.(db|sqlite3?|png|jpe?g|gif|ico|webp|bmp|pdf|zip|gz|tgz|tar|woff2?|ttf|eot|otf|mp[34]|mov|webm|wasm|node|class|jar|so|dylib|dll|exe)$/i;
const MAX_FILE_BYTES = 512 * 1024;

export interface SnapshotMeta {
  id: string; timestamp: number; task: string; files: string[];
  preExisting: string[]; newFiles: string[]; isInitial?: boolean; isArchived?: boolean;
}

export class SnapshotService {
  private snapshotsRoot: string;

  constructor(private root: string) {
    this.snapshotsRoot = path.join(root, SNAPSHOTS_DIR);
    this._migrateLegacy(); // heal old uncompressed tree snapshots → bundles (one-time, best-effort)
  }

  private bundlePath(id: string): string { return path.join(this.snapshotsRoot, `${id}.json.gz`); }

  private writeBundle(id: string, files: Record<string, string>, meta: SnapshotMeta): void {
    fs.mkdirSync(this.snapshotsRoot, { recursive: true });
    const bundle = { ...files, '_meta.json': JSON.stringify(meta) };
    fs.writeFileSync(this.bundlePath(id), zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8')));
  }

  private readBundle(id: string): Record<string, string> | null {
    const p = this.bundlePath(id);
    if (fs.existsSync(p)) {
      try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); } catch { return null; }
    }
    return this._readLegacy(id);
  }

  /** Snapshot the project's current source state before a change, so it can be undone. */
  prepare(task: string, filePaths: string[]): string {
    const id = Date.now().toString();
    const files: Record<string, string> = {};
    const preExisting: string[] = [];
    const newFiles: string[] = [];
    for (const rel of filePaths) { if (!fs.existsSync(path.join(this.root, rel))) { newFiles.push(rel); } }
    for (const rel of this._getAllSourceFiles()) {
      try { files[rel] = fs.readFileSync(path.join(this.root, rel), 'utf8'); preExisting.push(rel); } catch { /* skip */ }
    }
    this.writeBundle(id, files, { id, timestamp: Date.now(), task, files: filePaths, preExisting, newFiles });
    this._pruneOld();
    return id;
  }

  /** Call AFTER the first build — a permanent baseline (init_ prefix) that is never pruned. */
  captureInitial(task: string, filePaths: string[]): string {
    const id = `init_${Date.now()}`;
    const files: Record<string, string> = {};
    const preExisting: string[] = [];
    for (const rel of filePaths) {
      try { files[rel] = fs.readFileSync(path.join(this.root, rel), 'utf8'); preExisting.push(rel); } catch { /* skip */ }
    }
    this.writeBundle(id, files, { id, timestamp: Date.now(), task, files: filePaths, preExisting, newFiles: [], isInitial: true });
    return id;
  }

  restore(snapshotId: string): { restored: number; deleted: number; error?: string } {
    const bundle = this.readBundle(snapshotId);
    if (!bundle) { return { restored: 0, deleted: 0, error: 'Snapshot not found' }; }
    let meta: SnapshotMeta;
    try { meta = JSON.parse(bundle['_meta.json']); } catch { return { restored: 0, deleted: 0, error: 'Snapshot metadata is corrupted' }; }
    let restored = 0, deleted = 0;
    for (const rel of meta.preExisting || []) {
      const content = bundle[rel];
      if (content !== undefined) {
        const dest = path.join(this.root, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content, 'utf8'); restored++;
      }
    }
    for (const rel of meta.newFiles || []) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted++; }
    }
    return { restored, deleted };
  }

  getSnapshotFileContent(snapshotId: string, relPath: string): string | null {
    const bundle = this.readBundle(snapshotId);
    return bundle ? (bundle[relPath] ?? null) : null;
  }

  listSnapshots(): SnapshotMeta[] {
    if (!fs.existsSync(this.snapshotsRoot)) { return []; }
    return fs.readdirSync(this.snapshotsRoot)
      .filter(f => f.endsWith('.json.gz'))
      .map(f => { const b = this.readBundle(f.replace(/\.json\.gz$/, '')); try { return b ? JSON.parse(b['_meta.json']) as SnapshotMeta : null; } catch { return null; } })
      .filter((m): m is SnapshotMeta => !!m)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /** [COMPAT] Snapshots are no longer split into active/archive — all are equal compressed bundles. Kept so
   *  older callers don't break; returns [] (nothing is separately "archived"). */
  listArchivedSnapshots(): SnapshotMeta[] { return []; }

  private _getAllSourceFiles(): string[] {
    const results: string[] = [];
    const ignored = new Set(['.redivivus', 'node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage']);
    const walk = (dir: string, base: string) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (ignored.has(entry)) { continue; }
          const full = path.join(dir, entry);
          const rel = base ? base + '/' + entry : entry;
          try {
            const st = fs.statSync(full);
            if (st.isDirectory()) { walk(full, rel); }
            else if (!SKIP_BINARY.test(entry) && st.size <= MAX_FILE_BYTES) { results.push(rel); }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    };
    walk(this.root, '');
    return results;
  }

  private _pruneOld(): void {
    try {
      const bundles = fs.readdirSync(this.snapshotsRoot)
        .filter(f => f.endsWith('.json.gz') && !f.startsWith('init_'))
        .sort((a, b) => b.localeCompare(a)); // newest first (id = timestamp string)
      for (const old of bundles.slice(MAX_SNAPSHOTS)) { try { fs.unlinkSync(path.join(this.snapshotsRoot, old)); } catch { /* */ } }
    } catch { /* */ }
  }

  /** Read a legacy uncompressed tree snapshot (`<id>/…`) or an old `archive/<id>.json.gz` into a bundle map. */
  private _readLegacy(id: string): Record<string, string> | null {
    const dir = path.join(this.snapshotsRoot, id);
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const out: Record<string, string> = {};
        const walk = (d: string, base: string) => {
          for (const e of fs.readdirSync(d)) {
            const full = path.join(d, e), rel = base ? base + '/' + e : e;
            try { fs.statSync(full).isDirectory() ? walk(full, rel) : (out[rel] = fs.readFileSync(full, 'utf8')); } catch { /* */ }
          }
        };
        walk(dir, '');
        return out;
      }
    } catch { /* */ }
    const ar = path.join(this.snapshotsRoot, 'archive', `${id}.json.gz`);
    if (fs.existsSync(ar)) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(ar)).toString('utf8')); } catch { /* */ } }
    return null;
  }

  /** One-time heal: convert old uncompressed tree snapshots → .json.gz bundles and DELETE the trees (those
   *  were the files tools discovered). Also flatten the old archive/ dir. Best-effort; safe to re-run. */
  private _migrateLegacy(): void {
    try {
      if (!fs.existsSync(this.snapshotsRoot)) { return; }
      for (const entry of fs.readdirSync(this.snapshotsRoot)) {
        const full = path.join(this.snapshotsRoot, entry);
        try {
          if (entry !== 'archive' && fs.statSync(full).isDirectory()) {
            const bundle = this._readLegacy(entry);
            if (bundle) { fs.writeFileSync(this.bundlePath(entry), zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'))); }
            fs.rmSync(full, { recursive: true, force: true });
          }
        } catch { /* skip this entry */ }
      }
      const archiveDir = path.join(this.snapshotsRoot, 'archive');
      if (fs.existsSync(archiveDir)) {
        for (const f of fs.readdirSync(archiveDir)) {
          if (f.endsWith('.json.gz')) { try { fs.renameSync(path.join(archiveDir, f), path.join(this.snapshotsRoot, f)); } catch { /* */ } }
        }
        try { fs.rmSync(archiveDir, { recursive: true, force: true }); } catch { /* */ }
      }
    } catch { /* best-effort migration */ }
  }
}
