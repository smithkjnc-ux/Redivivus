// [SCOPE] Fix pipeline dead-ends handling.
// Dead-end helpers read/write <project>/.redivivus/dead_ends.md so the Supervisor never repeats
// approaches that have already been tried and failed in this project.
import * as fs from 'fs';
import * as path from 'path';

const DEAD_ENDS_PATH = (root: string) => path.join(root, '.redivivus', 'dead_ends.md');
const DEAD_ENDS_HEADER = '# Dead End Log\nApproaches tried and failed in this project. Read before suggesting a fix.\n\n---\n\n';
const MAX_DEAD_ENDS_BYTES = 8_000;

/** Returns the project's STILL-ACTIVE dead_ends (truncated), or empty string if absent.
 *  First auto-revalidates: a `tool-unavailable` entry whose tool is now installed is retired to [FIXED]
 *  (kept in the file for audit) and excluded here so the Supervisor never sees a stale dead end. */
export function readProjectDeadEnds(root: string): string {
  try {
    const p = DEAD_ENDS_PATH(root);
    if (!fs.existsSync(p)) { return ''; }
    revalidateProjectDeadEnds(root); // self-heal mechanically-checkable entries before the Supervisor reads
    let text = stripFixedEntries(fs.readFileSync(p, 'utf-8'));
    if (text.length > MAX_DEAD_ENDS_BYTES) { text = text.slice(0, MAX_DEAD_ENDS_BYTES) + '\n// (truncated)'; }
    return text;
  } catch { return ''; }
}

/** True if `exe` resolves on PATH right now. Only a strict executable token is checkable; anything else
 *  (a phrase, odd characters) returns false so we never falsely retire a dead end. */
function toolAvailable(exe: string): boolean {
  if (!/^[a-zA-Z0-9._+-]+$/.test(exe)) { return false; }
  try {
    require('child_process').execSync(
      process.platform === 'win32' ? `where ${exe}` : `command -v ${exe}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/** Strips [FIXED] blocks from the returned text (heading through the trailing `---`), leaving them in the
 *  file. So the Supervisor only ever sees live [DEAD] entries, but the audit trail is preserved. */
function stripFixedEntries(text: string): string {
  return text.replace(/^## \[FIXED\][\s\S]*?(?:\n---\n+|$)/gim, '');
}

/** Auto-revalidate the mechanically-checkable dead ends. A `tool-unavailable: <exe>` whose tool is now on
 *  PATH is marked [FIXED] with a verified-on date. Logic dead ends (guardian-rejected / fix-failed) are
 *  judgment calls — left untouched for human review. Best-effort; writes back only if something changed. */
export function revalidateProjectDeadEnds(root: string): void {
  try {
    const p = DEAD_ENDS_PATH(root);
    if (!fs.existsSync(p)) { return; }
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    const next = fs.readFileSync(p, 'utf-8').replace(
      /^## \[DEAD\] tool-unavailable: (\S+)(.*)$/gim,
      (line, exe, rest) => {
        if (!toolAvailable(exe)) { return line; }
        changed = true;
        return `## [FIXED] tool-unavailable: ${exe}${rest}  — verified available ${today}`;
      });
    if (changed) { fs.writeFileSync(p, next, 'utf-8'); }
  } catch { /* best-effort */ }
}

/** Appends a dead-end entry to the project's .redivivus/dead_ends.md. Best-effort. */
export function appendProjectDeadEnd(root: string, patternName: string, triedWhat: string, whyFails: string, doInstead: string): void {
  try {
    const p = DEAD_ENDS_PATH(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : DEAD_ENDS_HEADER;
    const date = new Date().toISOString().slice(0, 10);
    const entry = `## [DEAD] ${patternName} (logged ${date})\n- **What was tried:** ${triedWhat}\n- **Why it fails:** ${whyFails}\n- **Do this instead:** ${doInstead}\n\n---\n\n`;
    fs.writeFileSync(p, existing + entry, 'utf-8');
  } catch { /* best-effort */ }
}
