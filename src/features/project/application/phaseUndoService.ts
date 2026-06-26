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

  undoPhase(buildId: string, phaseNumber: number): boolean {
    const { undoPhaseImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return undoPhaseImpl(this, buildId, phaseNumber);
  }

  getUndoablePhases(buildId: string): PhaseSnapshot[] {
    const { getUndoablePhasesImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return getUndoablePhasesImpl(this, buildId);
  }

  getBuildHistory(buildId: string): PhaseHistory | null {
    const { getBuildHistoryImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return getBuildHistoryImpl(this, buildId);
  }

  listBuilds(): { buildId: string; task: string; phaseCount: number }[] {
    const { listBuildsImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return listBuildsImpl(this);
  }

  private addPhaseToHistory(buildId: string, snapshot: PhaseSnapshot): void {
    const { addPhaseToHistoryImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return addPhaseToHistoryImpl(this, buildId, snapshot);
  }

  private updateBuildHistory(history: PhaseHistory): void {
    const { updateBuildHistoryImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return updateBuildHistoryImpl(this, history);
  }

  private pruneOldHistories(): void {
    const { pruneOldHistoriesImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return pruneOldHistoriesImpl(this);
  }

  private deleteBuildHistory(buildId: string): void {
    const { deleteBuildHistoryImpl } = require('../../../services/phaseUndoServiceImpl.js');
    return deleteBuildHistoryImpl(this, buildId);
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
