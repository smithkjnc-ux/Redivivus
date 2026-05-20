// [SCOPE] Inline Diff Preview -- shows proposed changes in a diff editor with accept/reject.
// Used after surgical edits or fix pipeline to let user review before committing.
// [WARN] Uses VS Code's built-in diff editor. Temp files stored in os.tmpdir().

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DiffPreviewOptions {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  title?: string;
}

interface PendingDiff {
  filePath: string;
  proposedContent: string;
  tempOrigPath: string;
  tempNewPath: string;
}

const _pendingDiffs = new Map<string, PendingDiff>();

/**
 * Show a diff preview for a proposed file change.
 * User can accept (write to disk) or reject (discard).
 * Returns a disposable for cleanup.
 */
export async function showDiffPreview(options: DiffPreviewOptions): Promise<void> {
  const { filePath, originalContent, proposedContent, title } = options;
  const baseName = path.basename(filePath);
  const tmpDir = path.join(os.tmpdir(), 'chassis-diff');
  if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }); }

  const ts = Date.now();
  const tempOrigPath = path.join(tmpDir, `orig-${ts}-${baseName}`);
  const tempNewPath = path.join(tmpDir, `new-${ts}-${baseName}`);

  fs.writeFileSync(tempOrigPath, originalContent, 'utf-8');
  fs.writeFileSync(tempNewPath, proposedContent, 'utf-8');

  _pendingDiffs.set(filePath, { filePath, proposedContent, tempOrigPath, tempNewPath });

  const diffTitle = title || `CHASSIS Edit: ${baseName}`;
  await vscode.commands.executeCommand('vscode.diff',
    vscode.Uri.file(tempOrigPath),
    vscode.Uri.file(tempNewPath),
    diffTitle
  );
}

/**
 * Accept a pending diff -- writes the proposed content to the actual file.
 */
export function acceptDiff(filePath: string): boolean {
  const pending = _pendingDiffs.get(filePath);
  if (!pending) { return false; }
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(filePath, pending.proposedContent, 'utf-8');
    cleanup(filePath);
    return true;
  } catch { return false; }
}

/**
 * Reject a pending diff -- discards the proposed change.
 */
export function rejectDiff(filePath: string): boolean {
  const pending = _pendingDiffs.get(filePath);
  if (!pending) { return false; }
  cleanup(filePath);
  return true;
}

/**
 * Check if there are any pending diffs waiting for user decision.
 */
export function hasPendingDiffs(): boolean {
  return _pendingDiffs.size > 0;
}

/**
 * Get list of files with pending diffs.
 */
export function getPendingDiffFiles(): string[] {
  return [..._pendingDiffs.keys()];
}

function cleanup(filePath: string): void {
  const pending = _pendingDiffs.get(filePath);
  if (pending) {
    try { fs.unlinkSync(pending.tempOrigPath); } catch {}
    try { fs.unlinkSync(pending.tempNewPath); } catch {}
    _pendingDiffs.delete(filePath);
  }
}
