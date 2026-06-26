// [SCOPE] Fix pipeline progress message formatter — dual mode: plain English vs technical.
// redivivus.progressStyle: 'plain' (default) | 'technical'
// Plain = novice-friendly narration. Technical = existing Supervisor/Worker/Guardian labels.
// The chat panel webview also has a toggle button that flips this setting live.

import * as vscode from 'vscode';

export type ProgressStyle = 'plain' | 'technical';

export function getProgressStyle(): ProgressStyle {
  return vscode.workspace.getConfiguration('redivivus').get<ProgressStyle>('progressStyle', 'plain');
}

export interface FixProgressParams {
  fileCount?: number;
  supervisorLabel?: string;
  workerLabel?: string;
  guardianLabel?: string;
  targetFiles?: string;
  retryCount?: number;
  critique?: string;
}

/** Phase 1 start: reading files, diagnosing */
export function progressScanning(p: FixProgressParams): string {
  if (getProgressStyle() === 'technical') {
    return `Scanning ${p.fileCount ?? 0} file${(p.fileCount ?? 0) !== 1 ? 's' : ''}...`;
  }
  return `Reading your code${p.fileCount ? ` (${p.fileCount} file${p.fileCount !== 1 ? 's' : ''})` : ''}... figuring out what needs to change.`;
}

/** Phase 2/3: fix written, guardian approved, writing files */
export function progressApplying(p: FixProgressParams): string {
  if (getProgressStyle() === 'technical') {
    return `${p.supervisorLabel ?? 'Supervisor'}: diagnosis done\nWorker: fix written\nVerify: done\nGuardian: approved\nWriting ${p.targetFiles ?? 'files'}...`;
  }
  return `Plan done ✓  Fix written ✓  Reviewed ✓\nWriting changes to ${p.targetFiles ?? 'your files'}...`;
}

/** Escalation: worker retries exhausted, escalating to smarter model */
export function progressEscalating(p: FixProgressParams): string {
  if (getProgressStyle() === 'technical') {
    return `Supervisor (${p.supervisorLabel ?? 'AI'}): done\nWorker: retries exhausted — escalating to best model...\nVerify: pending\nGuardian: pending`;
  }
  return `First attempt didn't pass review — trying with a more capable AI...`;
}

/** Retry: guardian rejected, re-trying worker */
export function progressRetrying(p: FixProgressParams): string {
  const attempt = p.retryCount ?? 1;
  if (getProgressStyle() === 'technical') {
    return `Supervisor (${p.supervisorLabel ?? 'AI'}): done\nWorker: rejected — "${(p.critique ?? '').slice(0, 80)}" — retrying...\nVerify: pending\nGuardian: pending`;
  }
  return `Review found an issue — fixing and trying again (attempt ${attempt + 1})...`;
}
