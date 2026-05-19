// [SCOPE] CHASSIS Phase Undo Service — implementation helpers.
// Extracted from phaseUndoService.ts to keep source files under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import { PhaseUndoService, PhaseSnapshot, PhaseHistory, MAX_PHASE_HISTORY } from './phaseUndoService.js';

  export function undoPhaseImpl(service: PhaseUndoService, buildId: string, phaseNumber: number): boolean {
    const history = (service as any).getBuildHistory(buildId);
    if (!history) {
      console.error(`[PhaseUndo] No history found for build ${buildId}`);
      return false;
    }

    const phase = history.phases.find((p: PhaseSnapshot) => p.phaseNumber === phaseNumber);
    if (!phase) {
      console.error(`[PhaseUndo] Phase ${phaseNumber} not found in build ${buildId}`);
      return false;
    }

    const phaseDir = path.join((service as any).phaseSnapshotsRoot, phase.id);
    if (!fs.existsSync(phaseDir)) {
      console.error(`[PhaseUndo] Snapshot directory missing: ${phaseDir}`);
      return false;
    }

    console.log(`[PhaseUndo] Undoing phase ${phaseNumber}: ${phase.phaseName}`);

    // Restore pre-existing files
    for (const relPath of phase.preExisting) {
      const backupPath = path.join(phaseDir, relPath);
      const targetPath = path.join((service as any).root, relPath);

      if (fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(backupPath, targetPath);
        console.log(`[PhaseUndo] Restored: ${relPath}`);
      }
    }

    // Delete files that were created in this phase
    for (const relPath of phase.newFiles) {
      const targetPath = path.join((service as any).root, relPath);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log(`[PhaseUndo] Deleted: ${relPath}`);
      }
    }

    // Mark phase as undone in history
    phase.undone = true;
    (service as any).updateBuildHistory(history);

    return true;
  }

  /**
   * Get list of phases that can be undone
   */
  export function getUndoablePhasesImpl(service: PhaseUndoService, buildId: string): PhaseSnapshot[] {
    const history = (service as any).getBuildHistory(buildId);
    if (!history) return [];

    // Return phases that haven't been undone, in reverse order (newest first)
    return history.phases
      .filter((p: PhaseSnapshot) => !p.undone)
      .sort((a: PhaseSnapshot, b: PhaseSnapshot) => b.phaseNumber - a.phaseNumber);
  }

  /**
   * Get full build history
   */
  export function getBuildHistoryImpl(service: PhaseUndoService, buildId: string): PhaseHistory | null {
    const historyPath = path.join((service as any).phaseSnapshotsRoot, `${buildId}.json`);
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
  export function listBuildsImpl(service: PhaseUndoService): { buildId: string; task: string; phaseCount: number }[] {
    if (!fs.existsSync((service as any).phaseSnapshotsRoot)) return [];

    const histories = fs.readdirSync((service as any).phaseSnapshotsRoot)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const historyPath = path.join((service as any).phaseSnapshotsRoot, f);
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

  export function addPhaseToHistoryImpl(service: PhaseUndoService, buildId: string, snapshot: PhaseSnapshot): void {
    const history = (service as any).getBuildHistory(buildId);
    if (!history) return;

    history.phases.push(snapshot);
    (service as any).updateBuildHistory(history);
  }

  export function updateBuildHistoryImpl(service: PhaseUndoService, history: PhaseHistory): void {
    const historyPath = path.join((service as any).phaseSnapshotsRoot, `${history.buildId}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  export function pruneOldHistoriesImpl(service: PhaseUndoService): void {
    if (!fs.existsSync((service as any).phaseSnapshotsRoot)) return;

    const histories = (service as any).listBuilds();
    if (histories.length > MAX_PHASE_HISTORY) {
      const toDelete = histories.slice(MAX_PHASE_HISTORY);
      for (const build of toDelete) {
        (service as any).deleteBuildHistory(build.buildId);
      }
    }
  }

  export function deleteBuildHistoryImpl(service: PhaseUndoService, buildId: string): void {
    const historyPath = path.join((service as any).phaseSnapshotsRoot, `${buildId}.json`);
    
    // Delete all phase snapshots for this build
    const history = (service as any).getBuildHistory(buildId);
    if (history) {
      for (const phase of history.phases) {
        const phaseDir = path.join((service as any).phaseSnapshotsRoot, phase.id);
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