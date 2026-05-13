// [SCOPE] CHASSIS Snapshot Service — takes file snapshots before builds, restores on Undo Everything
// Snapshots stored in .chassis/snapshots/<snapshotId>/
// Only files that ALREADY EXIST before a build are snapshotted — new files are simply deleted on undo.
// [WARN] snapshotId is a timestamp string — do not assume numeric ordering beyond string sort.

import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOTS_DIR = '.chassis/snapshots';
// Keep last 10 snapshots max — prune oldest on write
const MAX_SNAPSHOTS = 10;

export interface SnapshotMeta {
  id: string;
  timestamp: number;
  task: string;
  files: string[];          // relative paths that were written
  preExisting: string[];    // subset that existed before build (backed up)
  newFiles: string[];       // subset that did NOT exist (will be deleted on undo)
}

export class SnapshotService {
  private snapshotsRoot: string;

  constructor(private root: string) {
    this.snapshotsRoot = path.join(root, SNAPSHOTS_DIR);
  }

  /** Call BEFORE writing any build files. Returns a snapshotId to pass to finalize(). */
  prepare(task: string, filePaths: string[]): string {
    const id = Date.now().toString();
    const snapDir = path.join(this.snapshotsRoot, id);
    if (!fs.existsSync(snapDir)) { fs.mkdirSync(snapDir, { recursive: true }); }

    const preExisting: string[] = [];
    const newFiles: string[] = [];

    for (const rel of filePaths) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) {
        // Back up the existing file
        preExisting.push(rel);
        const dest = path.join(snapDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      } else {
        newFiles.push(rel);
      }
    }

    const meta: SnapshotMeta = { id, timestamp: Date.now(), task, files: filePaths, preExisting, newFiles };
    fs.writeFileSync(path.join(snapDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    this._pruneOld();
    return id;
  }

  /** Restore a snapshot — overwrites files that existed, deletes files that were new. */
  restore(snapshotId: string): { restored: number; deleted: number; error?: string } {
    const snapDir = path.join(this.snapshotsRoot, snapshotId);
    const metaPath = path.join(snapDir, '_meta.json');
    if (!fs.existsSync(metaPath)) { return { restored: 0, deleted: 0, error: 'Snapshot not found' }; }

    let meta: SnapshotMeta;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
    catch { return { restored: 0, deleted: 0, error: 'Snapshot metadata is corrupted' }; }

    let restored = 0;
    let deleted = 0;

    // Restore pre-existing files from backup
    for (const rel of meta.preExisting) {
      const src = path.join(snapDir, rel);
      const dest = path.join(this.root, rel);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        restored++;
      }
    }

    // Delete new files that didn't exist before
    for (const rel of meta.newFiles) {
      const abs = path.join(this.root, rel);
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted++; }
    }

    return { restored, deleted };
  }

  /** Returns all snapshots sorted newest first */
  listSnapshots(): SnapshotMeta[] {
    if (!fs.existsSync(this.snapshotsRoot)) { return []; }
    return fs.readdirSync(this.snapshotsRoot)
      .filter(d => fs.existsSync(path.join(this.snapshotsRoot, d, '_meta.json')))
      .sort((a, b) => b.localeCompare(a))
      .map(d => {
        try { return JSON.parse(fs.readFileSync(path.join(this.snapshotsRoot, d, '_meta.json'), 'utf8')); }
        catch { return null; }
      })
      .filter(Boolean) as SnapshotMeta[];
  }

  /** Removes oldest snapshot directories beyond MAX_SNAPSHOTS to keep disk usage bounded. */
  private _pruneOld(): void {
    if (!fs.existsSync(this.snapshotsRoot)) { return; }
    const dirs = fs.readdirSync(this.snapshotsRoot).sort((a, b) => b.localeCompare(a));
    for (const old of dirs.slice(MAX_SNAPSHOTS)) {
      const oldPath = path.join(this.snapshotsRoot, old);
      fs.rmSync(oldPath, { recursive: true, force: true });
    }
  }
}
