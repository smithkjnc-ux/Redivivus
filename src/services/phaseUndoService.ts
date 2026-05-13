// [SCOPE] Phase-Level Undo Service — undo individual phases without rolling back entire build
// Each phase gets its own snapshot, allowing granular undo of just the Data Layer, just the UI, etc.

import * as fs from 'fs';
import * as path from 'path';

const PHASE_SNAPSHOTS_DIR = '.chassis/phase_snapshots';
const MAX_PHASE_HISTORY = 20;

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
  undoPhase(buildId: string, phaseNumber: number): boolean {
    const history = this.getBuildHistory(buildId);
    if (!history) {
      console.error(`[PhaseUndo] No history found for build ${buildId}`);
      return false;
    }

    const phase = history.phases.find(p => p.phaseNumber === phaseNumber);
    if (!phase) {
      console.error(`[PhaseUndo] Phase ${phaseNumber} not found in build ${buildId}`);
      return false;
    }

    const phaseDir = path.join(this.phaseSnapshotsRoot, phase.id);
    if (!fs.existsSync(phaseDir)) {
      console.error(`[PhaseUndo] Snapshot directory missing: ${phaseDir}`);
      return false;
    }

    console.log(`[PhaseUndo] Undoing phase ${phaseNumber}: ${phase.phaseName}`);

    // Restore pre-existing files
    for (const relPath of phase.preExisting) {
      const backupPath = path.join(phaseDir, relPath);
      const targetPath = path.join(this.root, relPath);

      if (fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(backupPath, targetPath);
        console.log(`[PhaseUndo] Restored: ${relPath}`);
      }
    }

    // Delete files that were created in this phase
    for (const relPath of phase.newFiles) {
      const targetPath = path.join(this.root, relPath);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log(`[PhaseUndo] Deleted: ${relPath}`);
      }
    }

    // Mark phase as undone in history
    phase.undone = true;
    this.updateBuildHistory(history);

    return true;
  }

  /**
   * Get list of phases that can be undone
   */
  getUndoablePhases(buildId: string): PhaseSnapshot[] {
    const history = this.getBuildHistory(buildId);
    if (!history) return [];

    // Return phases that haven't been undone, in reverse order (newest first)
    return history.phases
      .filter(p => !p.undone)
      .sort((a, b) => b.phaseNumber - a.phaseNumber);
  }

  /**
   * Get full build history
   */
  getBuildHistory(buildId: string): PhaseHistory | null {
    const historyPath = path.join(this.phaseSnapshotsRoot, `${buildId}.json`);
    if (!fs.existsSync(historyPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * List all builds with phase history
   */
  listBuilds(): { buildId: string; task: string; phaseCount: number }[] {
    if (!fs.existsSync(this.phaseSnapshotsRoot)) return [];

    const histories = fs.readdirSync(this.phaseSnapshotsRoot)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const historyPath = path.join(this.phaseSnapshotsRoot, f);
        try {
          const history: PhaseHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          return {
            buildId: history.buildId,
            task: history.task,
            phaseCount: history.phases.length,
          };
        } catch {
          return null;
        }
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);

    return histories.sort((a, b) => parseInt(b.buildId) - parseInt(a.buildId));
  }

  private addPhaseToHistory(buildId: string, snapshot: PhaseSnapshot): void {
    const history = this.getBuildHistory(buildId);
    if (!history) return;

    history.phases.push(snapshot);
    this.updateBuildHistory(history);
  }

  private updateBuildHistory(history: PhaseHistory): void {
    const historyPath = path.join(this.phaseSnapshotsRoot, `${history.buildId}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  private pruneOldHistories(): void {
    if (!fs.existsSync(this.phaseSnapshotsRoot)) return;

    const histories = this.listBuilds();
    if (histories.length > MAX_PHASE_HISTORY) {
      const toDelete = histories.slice(MAX_PHASE_HISTORY);
      for (const build of toDelete) {
        this.deleteBuildHistory(build.buildId);
      }
    }
  }

  private deleteBuildHistory(buildId: string): void {
    const historyPath = path.join(this.phaseSnapshotsRoot, `${buildId}.json`);
    
    // Delete all phase snapshots for this build
    const history = this.getBuildHistory(buildId);
    if (history) {
      for (const phase of history.phases) {
        const phaseDir = path.join(this.phaseSnapshotsRoot, phase.id);
        if (fs.existsSync(phaseDir)) {
          fs.rmSync(phaseDir, { recursive: true });
        }
      }
    }

    // Delete history file
    if (fs.existsSync(historyPath)) {
      fs.unlinkSync(historyPath);
    }

    console.log(`[PhaseUndo] Deleted old build history: ${buildId}`);
  }
}


// Singleton instance
let phaseUndoServiceInstance: PhaseUndoService | null = null;

export function getPhaseUndoService(root: string): PhaseUndoService {
  if (!phaseUndoServiceInstance || phaseUndoServiceInstance['root'] !== root) {
    phaseUndoServiceInstance = new PhaseUndoService(root);
  }
  return phaseUndoServiceInstance;
}
