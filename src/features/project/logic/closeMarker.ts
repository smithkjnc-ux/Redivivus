// [SCOPE] Synchronous "user just closed the project" signal that survives the window reload.
// Removing the last workspace folder converts the window to an Untitled Workspace and re-activates
// the extension host. globalState.update() is async and loses the race against that reload (see the
// _suppressNextFolderAdd note in extension.ts), so on re-activation the flag is gone and the auto-open
// timer creates a DUPLICATE panel while the serializer restores the orphaned one. fs.writeFileSync is
// synchronous and flushes before the reload, so a marker file is a reliable cross-reload signal.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const MARKER_PATH = path.join(os.tmpdir(), 'redivivus-userclosed.marker');
// Only treat the marker as live for the immediate post-close re-activation (which happens in <2s).
// After this window it is ignored, so a stale marker can never suppress a legitimate startup auto-open.
const RECENT_MS = 15_000;

/** Record that the user just closed the project. Call synchronously before the folder is removed. */
export function markProjectClosed(): void {
  try { fs.writeFileSync(MARKER_PATH, String(Date.now())); } catch { /* non-fatal */ }
}

/** True if the user closed a project within the recency window (survives the reload). Read-only — the
 *  marker self-expires by timestamp and is overwritten on the next close, so neither consumer deletes
 *  it (deleting would re-open the deserialize/auto-open race this exists to close). */
export function wasProjectClosedRecently(): boolean {
  try {
    if (!fs.existsSync(MARKER_PATH)) { return false; }
    const ts = Number(fs.readFileSync(MARKER_PATH, 'utf-8')) || 0;
    return Date.now() - ts < RECENT_MS;
  } catch { return false; }
}
