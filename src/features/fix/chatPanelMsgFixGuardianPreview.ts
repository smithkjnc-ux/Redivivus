// [SCOPE] Guardian Pre-Apply Capture — applies the Worker's fix to disk before Guardian reviews it,
// runs the preview to collect runtime evidence, and provides a rollback function if Guardian rejects.
// This gives the Guardian real execution evidence (did the app break?) rather than code text alone.
// Only runs for static web projects where verifyPreviewRuns is applicable. Non-blocking: any failure
// returns null and the caller falls back to text-only Guardian review.

import * as fs from 'fs';
import * as path from 'path';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';

export interface PreApplyResult {
  runtimeSummary: string;   // plain-English description of app state after fix is applied
  appliedFiles: string[];   // relative paths of files written to disk
  rollback: () => void;     // restores all files to their pre-apply state
  snapId?: string;          // snapshot ID from takeSnapshot — passed to Phase23 so history entry gets a real ID
}

/** Applies `workerResponse` to disk, runs the preview, and returns a rollback function.
 *  Returns null if not applicable (not a static web project, apply wrote nothing, etc.). */
export async function runPreApplyCapture(
  workerResponse: string,
  root: string,
  allowedRels: Set<string>,
  userText: string,
): Promise<PreApplyResult | null> {
  // Only meaningful for static web projects (Vite, plain HTML/CSS/JS)
  try {
    const { detectDevServer } = await import('../chat/ui/chatPanelPreview.js');
    const info = detectDevServer(root);
    if (!info || info.type !== 'static') { return null; }
  } catch { return null; }

  // Build in-memory snapshot of files the Worker intends to touch (for rollback)
  const { detectResponseFormat, parseSurgicalEdits } = await import('../build/services/surgicalEditService.js');
  const format = detectResponseFormat(workerResponse);
  const targetRels: string[] = [];
  if (format === 'surgical') {
    parseSurgicalEdits(workerResponse)
      .map(e => e.filePath)
      .filter(r => allowedRels.has(r))
      .forEach(r => { if (!targetRels.includes(r)) targetRels.push(r); });
  } else {
    // Full-file format: parse // === FILE: path === markers and <file path="..."> XML markers
    [...workerResponse.matchAll(/\/\/\s*===\s*FILE:\s*(.+?)\s*===/g),
     ...workerResponse.matchAll(/<file\s+path=["']([^"']+)["']/g)]
      .map(m => m[1].trim())
      .filter(r => allowedRels.has(r))
      .forEach(r => { if (!targetRels.includes(r)) targetRels.push(r); });
  }

  const snapshots = new Map<string, string | null>(); // abs path → original content (null = new file)
  for (const rel of targetRels) {
    const abs = path.join(root, rel);
    snapshots.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
  }

  // Apply fix to disk
  const { applyFixContent } = await import('./chatPanelMsgFixApply.js');
  let applyRes: Awaited<ReturnType<typeof applyFixContent>>;
  try {
    applyRes = await applyFixContent(workerResponse, root, allowedRels, userText, { disableLastResort: false });
  } catch (e) {
    fixLog(`[PRE-APPLY] applyFixContent threw (non-blocking): ${String(e).slice(0, 100)}`);
    return null;
  }
  if (applyRes.written.length === 0) {
    fixLog('[PRE-APPLY] Apply wrote nothing — skipping preview capture');
    return null;
  }
  fixLog(`[PRE-APPLY] Applied ${applyRes.written.length} file(s) before Guardian review`);

  const rollback = () => {
    for (const [abs, original] of snapshots) {
      try {
        if (original === null) { if (fs.existsSync(abs)) { fs.unlinkSync(abs); } }
        else { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, original, 'utf8'); }
      } catch (e) { fixLog(`[PRE-APPLY-ROLLBACK] Failed to restore ${path.relative(root, abs)}: ${String(e).slice(0, 60)}`); }
    }
    fixLog(`[PRE-APPLY-ROLLBACK] Restored ${snapshots.size} file(s) to pre-apply state`);
  };

  // Run preview — short wait (1500ms) since Guardian doesn't need a full render, just error signals
  let runtimeSummary = '';
  try {
    const { verifyPreviewRuns } = await import('../chat/ui/chatPanelPreviewVerify.js');
    const result = await verifyPreviewRuns(root, 1500);
    if (result.applicable) { runtimeSummary = result.summary; }
  } catch { /* preview check is best-effort — never block the pipeline */ }

  return { runtimeSummary, appliedFiles: applyRes.written, rollback, snapId: applyRes.fixSnapId || undefined };
}
