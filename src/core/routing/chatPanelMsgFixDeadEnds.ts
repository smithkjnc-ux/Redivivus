// [SCOPE] Fix pipeline dead-ends handling.
// Dead-end helpers read/write <project>/.redivivus/dead_ends.md so the Supervisor never repeats
// approaches that have already been tried and failed in this project.
import * as fs from 'fs';
import * as path from 'path';

const DEAD_ENDS_PATH = (root: string) => path.join(root, '.redivivus', 'dead_ends.md');
const DEAD_ENDS_HEADER = '# Dead End Log\nApproaches tried and failed in this project. Read before suggesting a fix.\n\n---\n\n';
const MAX_DEAD_ENDS_BYTES = 8_000;

/** Returns the project's dead_ends.md content (truncated), or empty string if absent. */
export function readProjectDeadEnds(root: string): string {
  try {
    const p = DEAD_ENDS_PATH(root);
    if (!fs.existsSync(p)) { return ''; }
    let text = fs.readFileSync(p, 'utf-8');
    if (text.length > MAX_DEAD_ENDS_BYTES) { text = text.slice(0, MAX_DEAD_ENDS_BYTES) + '\n// (truncated)'; }
    return text;
  } catch { return ''; }
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
