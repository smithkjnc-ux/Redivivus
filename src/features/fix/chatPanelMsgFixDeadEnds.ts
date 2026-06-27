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

/** True if Python can import `mod` right now. Strict identifier only, else false (never false-retire). */
function moduleAvailable(mod: string): boolean {
  if (!/^[A-Za-z0-9_]+$/.test(mod)) { return false; }
  try { require('child_process').execSync(`python3 -c "import ${mod}"`, { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Auto-revalidate the mechanically-checkable dead ends. A `tool-unavailable: <exe>` now on PATH, or a
 *  `python-module: <mod>` now importable, is marked [FIXED] with a verified-on date. Logic dead ends
 *  (guardian-rejected / fix-failed) are judgment calls — left untouched. Writes back only if changed. */
export function revalidateProjectDeadEnds(root: string): void {
  try {
    const p = DEAD_ENDS_PATH(root);
    if (!fs.existsSync(p)) { return; }
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    let text = fs.readFileSync(p, 'utf-8');
    text = text.replace(/^## \[DEAD\] tool-unavailable: (\S+)(.*)$/gim, (line, exe, rest) => {
      if (!toolAvailable(exe)) { return line; }
      changed = true; return `## [FIXED] tool-unavailable: ${exe}${rest}  — verified available ${today}`;
    });
    text = text.replace(/^## \[DEAD\] python-module: (\S+)(.*)$/gim, (line, mod, rest) => {
      if (!moduleAvailable(mod)) { return line; }
      changed = true; return `## [FIXED] python-module: ${mod}${rest}  — verified available ${today}`;
    });
    if (changed) { fs.writeFileSync(p, text, 'utf-8'); }
  } catch { /* best-effort */ }
}

/** Queries the global (community) dead-end vault for patterns matching this user request. Returns context string or empty. */
export async function queryGlobalDeadEnds(userText: string): Promise<string> {
  try {
    const base = require('../api/data/apiClient.js').getApiBase();
    const token = await require('../api/data/apiClient.js').getAccountToken();
    const keywords = userText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3).slice(0, 10);
    const dqRes = await fetch(`${base}/dead-end-query/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ keywords }),
    });
    if (dqRes.ok) {
      const dqData = await dqRes.json() as { patterns?: any[] };
      if (dqData.patterns && dqData.patterns.length > 0) {
        return '\n\nGLOBAL DEAD END VAULT (community-verified patterns):\n' +
          dqData.patterns.map((p: any) => `- ${p.symptom}: ${p.supervisor_note}`).join('\n');
      }
    }
  } catch { /* non-blocking */ }
  return '';
}

/** Appends a dead-end entry to the project's .redivivus/dead_ends.md. Best-effort. */
export function appendProjectDeadEnd(root: string, patternName: string, triedWhat: string, whyFails: string, doInstead: string): void {
  try {
    const p = DEAD_ENDS_PATH(root);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : DEAD_ENDS_HEADER;
    // Dedup: don't re-log a live [DEAD] for the same pattern (e.g. the same missing tool across retries or
    // runs). Keeps each distinct failure separate without piling up identical entries.
    const esc = patternName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^## \\[DEAD\\] ${esc}(\\s|\\(|$)`, 'm').test(existing)) { return; }
    const date = new Date().toISOString().slice(0, 10);
    const entry = `## [DEAD] ${patternName} (logged ${date})\n- **What was tried:** ${triedWhat}\n- **Why it fails:** ${whyFails}\n- **Do this instead:** ${doInstead}\n\n---\n\n`;
    fs.writeFileSync(p, existing + entry, 'utf-8');
  } catch { /* best-effort */ }
}
