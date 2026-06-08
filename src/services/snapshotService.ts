// [SCOPE] Redivivus Snapshot Service — pre-build snapshots, initial-state capture, archive on overflow
// Active snapshots: .redivivus/snapshots/<id>/  |  Archive: .redivivus/snapshots/archive/<id>.json.gz
// init_ prefix = permanent baseline (first build), never pruned. archive/ = compressed history, always restorable.

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const SNAPSHOTS_DIR = '.redivivus/snapshots';
const MAX_SNAPSHOTS = 10; // keep 10 active; older ones go to archive, not deleted

export interface SnapshotMeta {
  id: string;
  timestamp: number;
  task: string;
  files: string[];
  preExisting: string[];
  newFiles: string[];
  isInitial?: boolean;
  isArchived?: boolean;
}

export class SnapshotService {
  private snapshotsRoot: string;

  constructor(private root: string) {
    this.snapshotsRoot = path.join(root, SNAPSHOTS_DIR);
  }

  prepare(task: string, filePaths: string[]): string {
    const id = Date.now().toString();
    const snapDir = path.join(this.snapshotsRoot, id);
    if (!fs.existsSync(snapDir)) { fs.mkdirSync(snapDir, { recursive: true }); }
    // [FIX] Snapshot ALL source files, not just the ones being changed.
    // Without this, reverting only restores changed files and leaves other files in a broken state.
    const allSourceFiles = this._getAllSourceFiles();
    const prescribedSet = new Set(filePaths);
    const preExisting: string[] = [];
    const newFiles: string[] = [];
    for (const rel of filePaths) {
      const abs = path.join(this.root, rel);
      if (!fs.existsSync(abs)) { newFiles.push(rel); }
    }
    for (const rel of allSourceFiles) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) {
        preExisting.push(rel);
        const dest = path.join(snapDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      }
    }
    const meta: SnapshotMeta = { id, timestamp: Date.now(), task, files: filePaths, preExisting, newFiles };
    fs.writeFileSync(path.join(snapDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    this._pruneOld();
    return id;
  }

  private _getAllSourceFiles(): string[] {
    const results: string[] = [];
    const ignored = new Set(['.redivivus', 'node_modules', '.git', 'dist', 'out', 'build']);
    const walk = (dir: string, base: string) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (ignored.has(entry)) { continue; }
          const full = path.join(dir, entry);
          const rel = base ? base + '/' + entry : entry;
          try {
            if (fs.statSync(full).isDirectory()) { walk(full, rel); }
            else { results.push(rel); }
          } catch {}
        }
      } catch {}
    };
    walk(this.root, '');
    return results;
  }

  /** Call AFTER writing a new file — saves the initial state as a permanent baseline that is never pruned. */
  captureInitial(task: string, filePaths: string[]): string {
    const id = `init_${Date.now()}`;
    const snapDir = path.join(this.snapshotsRoot, id);
    if (!fs.existsSync(snapDir)) { fs.mkdirSync(snapDir, { recursive: true }); }
    const preExisting: string[] = [];
    for (const rel of filePaths) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) {
        preExisting.push(rel);
        const dest = path.join(snapDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      }
    }
    const meta = { id, timestamp: Date.now(), task, files: filePaths, preExisting, newFiles: [], isInitial: true };
    fs.writeFileSync(path.join(snapDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    return id;
  }

  restore(snapshotId: string): { restored: number; deleted: number; error?: string } {
    const snapDir = path.join(this.snapshotsRoot, snapshotId);
    if (!fs.existsSync(snapDir)) { return this.restoreFromArchive(snapshotId); }
    let meta: SnapshotMeta;
    try { meta = JSON.parse(fs.readFileSync(path.join(snapDir, '_meta.json'), 'utf8')); }
    catch { return { restored: 0, deleted: 0, error: 'Snapshot metadata is corrupted' }; }
    let restored = 0, deleted = 0;
    for (const rel of meta.preExisting) {
      const src = path.join(snapDir, rel);
      const dest = path.join(this.root, rel);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); restored++; }
    }
    for (const rel of meta.newFiles) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted++; }
    }
    return { restored, deleted };
  }

  /** Returns the content of a specific file from a snapshot (active or archived). Null if not found. */
  getSnapshotFileContent(snapshotId: string, relPath: string): string | null {
    const snapDir = path.join(this.snapshotsRoot, snapshotId);
    if (fs.existsSync(snapDir)) {
      const p = path.join(snapDir, relPath);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    }
    const archivePath = path.join(this.snapshotsRoot, 'archive', snapshotId + '.json.gz');
    if (!fs.existsSync(archivePath)) { return null; }
    try {
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivePath)).toString('utf8')) as Record<string, string>;
      return bundle[relPath] ?? null;
    } catch { return null; }
  }

  restoreFromArchive(snapshotId: string): { restored: number; deleted: number; error?: string } {
    const archivePath = path.join(this.snapshotsRoot, 'archive', snapshotId + '.json.gz');
    if (!fs.existsSync(archivePath)) { return { restored: 0, deleted: 0, error: 'Snapshot not found in active or archive' }; }
    try {
      const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(archivePath)).toString('utf8')) as Record<string, string>;
      const meta = JSON.parse(bundle['_meta.json']) as SnapshotMeta;
      let restored = 0;
      for (const rel of meta.preExisting) {
        const content = bundle[rel];
        if (content !== undefined) {
          fs.mkdirSync(path.dirname(path.join(this.root, rel)), { recursive: true });
          fs.writeFileSync(path.join(this.root, rel), content, 'utf8');
          restored++;
        }
      }
      return { restored, deleted: 0 };
    } catch (e) { return { restored: 0, deleted: 0, error: String(e) }; }
  }

  listSnapshots(): SnapshotMeta[] {
    return [...this._listActive(), ...this.listArchivedSnapshots()].sort((a, b) => b.timestamp - a.timestamp);
  }

  listArchivedSnapshots(): SnapshotMeta[] {
    const archiveDir = path.join(this.snapshotsRoot, 'archive');
    if (!fs.existsSync(archiveDir)) { return []; }
    return fs.readdirSync(archiveDir).filter(f => f.endsWith('.json.gz')).map(f => {
      try {
        const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(archiveDir, f))).toString('utf8')) as Record<string, string>;
        return { ...JSON.parse(bundle['_meta.json']) as SnapshotMeta, isArchived: true };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => b!.timestamp - a!.timestamp) as SnapshotMeta[];
  }

  private _listActive(): SnapshotMeta[] {
    if (!fs.existsSync(this.snapshotsRoot)) { return []; }
    return fs.readdirSync(this.snapshotsRoot)
      .filter(d => d !== 'archive' && fs.existsSync(path.join(this.snapshotsRoot, d, '_meta.json')))
      .sort((a, b) => b.localeCompare(a))
      .map(d => { try { return JSON.parse(fs.readFileSync(path.join(this.snapshotsRoot, d, '_meta.json'), 'utf8')); } catch { return null; } })
      .filter(Boolean) as SnapshotMeta[];
  }

  private _archiveSnapshot(id: string): void {
    const snapDir = path.join(this.snapshotsRoot, id);
    const archiveDir = path.join(this.snapshotsRoot, 'archive');
    if (!fs.existsSync(archiveDir)) { fs.mkdirSync(archiveDir, { recursive: true }); }
    try {
      const bundle: Record<string, string> = {};
      const walk = (dir: string, base: string) => {
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry), rel = base ? base + '/' + entry : entry;
          fs.statSync(full).isDirectory() ? walk(full, rel) : (bundle[rel] = fs.readFileSync(full, 'utf8'));
        }
      };
      walk(snapDir, '');
      fs.writeFileSync(path.join(archiveDir, id + '.json.gz'), zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8')));
    } catch { /* archive failed — proceed to delete anyway */ }
    fs.rmSync(snapDir, { recursive: true, force: true });
  }

  private _pruneOld(): void {
    if (!fs.existsSync(this.snapshotsRoot)) { return; }
    const dirs = fs.readdirSync(this.snapshotsRoot)
      .filter(d => !d.startsWith('init_') && d !== 'archive' && fs.statSync(path.join(this.snapshotsRoot, d)).isDirectory())
      .sort((a, b) => b.localeCompare(a));
    for (const old of dirs.slice(MAX_SNAPSHOTS)) { this._archiveSnapshot(old); }
  }
}
