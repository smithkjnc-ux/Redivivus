// [SCOPE] Phase-Level Undo Service — undo individual phases without rolling back entire build
// Each phase gets its own snapshot, allowing granular undo of just the Data Layer, just the UI, etc.

import * as fs from 'fs';
import * as path from 'path';

const PHASE_SNAPSHOTS_DIR = '.redivivus/phase_snapshots';
export const MAX_PHASE_HISTORY = 20;

export interface PhaseSnapshot {
  id: string;
  phaseName: string;
  phaseNumber: number;
  buildId: string;
  timestamp: number;
  files: string[];
  preExisting: string[];
  newFiles: string[];
  description: string;
  undone?: boolean; // [NEXT] Marked as undone when phase is rolled back
}

export interface PhaseHistory {
  phases: PhaseSnapshot[];
  buildId: string;
  task: string;
}

/**
 * PhaseUndoService manages snapshots at the phase level
 * Allows undoing just one phase without affecting other phases
 */
export class PhaseUndoService {
  private root: string;
  private phaseSnapshotsRoot: string;
  private currentBuildId: string | null = null;
  private phaseCounter: number = 0;

  constructor(root: string) {
    this.root = root;
    this.phaseSnapshotsRoot = path.join(root, PHASE_SNAPSHOTS_DIR);
  }

  /**
   * Start a new phased build
   */
  startPhasedBuild(task: string): string {
    const buildId = Date.now().toString();
    this.currentBuildId = buildId;
    this.phaseCounter = 0;

    // Create build history file
    const history: PhaseHistory = {
      phases: [],
      buildId,
      task,
    };

    const historyPath = path.join(this.phaseSnapshotsRoot, `${buildId}.json`);
    if (!fs.existsSync(this.phaseSnapshotsRoot)) {
      fs.mkdirSync(this.phaseSnapshotsRoot, { recursive: true });
    }
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

    // Clean old phase histories
    this.pruneOldHistories();

    return buildId;
  }

  /**
   * Take a snapshot before executing a phase
   */
  snapshotBeforePhase(
    buildId: string,
    phaseName: string,
    filesToModify: string[],
    description: string
  ): string {
    if (buildId !== this.currentBuildId) {
      throw new Error(`Build ID mismatch: ${buildId} vs ${this.currentBuildId}`);
    }

    this.phaseCounter++;
    const phaseId = `${buildId}_${this.phaseCounter}`;
    const phaseDir = path.join(this.phaseSnapshotsRoot, phaseId);

    if (!fs.existsSync(phaseDir)) {
      fs.mkdirSync(phaseDir, { recursive: true });
    }

    const preExisting: string[] = [];
    const newFiles: string[] = [];

    // Snapshot files that will be modified in this phase
    for (const relPath of filesToModify) {
      const absPath = path.join(this.root, relPath);
      if (fs.existsSync(absPath)) {
        preExisting.push(relPath);
        const dest = path.join(phaseDir, relPath);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(absPath, dest);
      } else {
        newFiles.push(relPath);
      }
    }

    // Create phase snapshot record
    const snapshot: PhaseSnapshot = {
      id: phaseId,
      phaseName,
      phaseNumber: this.phaseCounter,
      buildId,
      timestamp: Date.now(),
      files: filesToModify,
      preExisting,
      newFiles,
      description,
    };

    // Update build history
    this.addPhaseToHistory(buildId, snapshot);

    console.log(`[PhaseUndo] Snapshotted phase ${this.phaseCounter}: ${phaseName} (${filesToModify.length} files)`);
    return phaseId;
  }

  /**
   * Undo a specific phase — restore files to state before that phase
   */

  // [DONE] phaseUndoServiceImpl.js no longer exists after cc93f25 refactor — inlined here
  undoPhase(buildId: string, phaseNumber: number): boolean {
    const history = this.getBuildHistory(buildId);
    if (!history) { return false; }
    const snapshot = history.phases.find(p => p.phaseNumber === phaseNumber && !p.undone);
    if (!snapshot) { return false; }
    const phaseDir = path.join(this.phaseSnapshotsRoot, snapshot.id);
    for (const relPath of snapshot.preExisting) {
      const src = path.join(phaseDir, relPath);
      const dest = path.join(this.root, relPath);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    }
    for (const relPath of snapshot.newFiles) {
      const dest = path.join(this.root, relPath);
      if (fs.existsSync(dest)) { fs.unlinkSync(dest); }
    }
    snapshot.undone = true;
    this.updateBuildHistory(history);
    return true;
  }

  getUndoablePhases(buildId: string): PhaseSnapshot[] {
    const history = this.getBuildHistory(buildId);
    return history ? history.phases.filter(p => !p.undone) : [];
  }

  getBuildHistory(buildId: string): PhaseHistory | null {
    const histPath = path.join(this.phaseSnapshotsRoot, `${buildId}.json`);
    if (!fs.existsSync(histPath)) { return null; }
    try { return JSON.parse(fs.readFileSync(histPath, 'utf-8')); } catch { return null; }
  }

  listBuilds(): { buildId: string; task: string; phaseCount: number }[] {
    if (!fs.existsSync(this.phaseSnapshotsRoot)) { return []; }
    return fs.readdirSync(this.phaseSnapshotsRoot)
      .filter(f => f.endsWith('.json'))
      .map(f => { try { const h: PhaseHistory = JSON.parse(fs.readFileSync(path.join(this.phaseSnapshotsRoot, f), 'utf-8')); return { buildId: h.buildId, task: h.task, phaseCount: h.phases.length }; } catch { return null; } })
      .filter(Boolean) as { buildId: string; task: string; phaseCount: number }[];
  }

  private addPhaseToHistory(buildId: string, snapshot: PhaseSnapshot): void {
    const history = this.getBuildHistory(buildId);
    if (!history) { return; }
    history.phases.push(snapshot);
    this.updateBuildHistory(history);
  }

  private updateBuildHistory(history: PhaseHistory): void {
    fs.writeFileSync(path.join(this.phaseSnapshotsRoot, `${history.buildId}.json`), JSON.stringify(history, null, 2));
  }

  private pruneOldHistories(): void {
    if (!fs.existsSync(this.phaseSnapshotsRoot)) { return; }
    const files = fs.readdirSync(this.phaseSnapshotsRoot).filter(f => f.endsWith('.json'));
    if (files.length <= MAX_PHASE_HISTORY) { return; }
    const sorted = files.map(f => ({ f, mtime: fs.statSync(path.join(this.phaseSnapshotsRoot, f)).mtimeMs })).sort((a, b) => a.mtime - b.mtime);
    for (const { f } of sorted.slice(0, files.length - MAX_PHASE_HISTORY)) { this.deleteBuildHistory(f.replace('.json', '')); }
  }

  private deleteBuildHistory(buildId: string): void {
    const histPath = path.join(this.phaseSnapshotsRoot, `${buildId}.json`);
    if (fs.existsSync(histPath)) { fs.unlinkSync(histPath); }
    if (!fs.existsSync(this.phaseSnapshotsRoot)) { return; }
    for (const d of fs.readdirSync(this.phaseSnapshotsRoot).filter(d => d.startsWith(`${buildId}_`))) {
      fs.rmSync(path.join(this.phaseSnapshotsRoot, d), { recursive: true, force: true });
    }
  }
}

// Singleton instance
let phaseUndoServiceInstance: PhaseUndoService | null = null;

export function getPhaseUndoService(root: string): PhaseUndoService {
  if (!phaseUndoServiceInstance || (phaseUndoServiceInstance as any).root !== root) {
    phaseUndoServiceInstance = new PhaseUndoService(root);
  }
  return phaseUndoServiceInstance;
}
