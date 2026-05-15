// [SCOPE] CHASSIS Diagnostic Logger — writes timestamped debug entries to .chassis/debug.log
// Activated automatically when CHASSIS_DEBUG=1 env var is set, or always in dev builds.
// Solves the problem of AI guessing at bugs instead of reading actual trace logs.

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = '.chassis/debug.log';
const MAX_LINES = 500;

/** Writes a timestamped line to .chassis/debug.log. Always active — file is pruned to MAX_LINES. */
export function debugLog(root: string | undefined, tag: string, message: string): void {
  if (!root) { return; }
  try {
    const logPath = path.join(root, LOG_FILE);
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    const line = `[${new Date().toISOString()}] [${tag}] ${message}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
    _pruneLog(logPath);
  } catch { /* never surface logging errors */ }
}

/** Keeps log file under MAX_LINES to avoid unbounded growth. */
function _pruneLog(logPath: string): void {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) {
      fs.writeFileSync(logPath, lines.slice(-MAX_LINES).join('\n') + '\n', 'utf8');
    }
  } catch { /* ignore */ }
}
