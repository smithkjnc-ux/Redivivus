// One-off: clear stale/poisoned chat history from the Redivivus globalState blob so the chat panel
// starts clean. The app MUST be fully closed first (globalState is held in memory and flushed on exit,
// which would overwrite a live edit). Backs up the DB before writing.
// Run with: node scripts/clear-stuck-chat.mjs

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DB = path.join(os.homedir(), '.config', 'Redivivus', 'User', 'globalStorage', 'state.vscdb');
const KEY = 'papajoe.redivivus';

if (!fs.existsSync(DB)) { console.error('state.vscdb not found:', DB); process.exit(1); }

// Refuse to run if the app is still holding the DB (a running app would clobber our write on exit).
try {
  const running = execFileSync('bash', ['-lc', "pgrep -f '\\.local/opt/redivivus/redivivus' || true"]).toString().trim();
  if (running) { console.error('❌ Redivivus appears to be RUNNING (pids: ' + running.replace(/\n/g, ',') + '). Fully quit it first, then re-run.'); process.exit(2); }
} catch { /* pgrep best-effort */ }

const backup = DB + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
fs.copyFileSync(DB, backup);
console.log('🔖 Backup:', backup);

const raw = execFileSync('sqlite3', [DB, `SELECT value FROM ItemTable WHERE key='${KEY}';`]).toString();
const blob = JSON.parse(raw);

const before = Object.keys(blob).length;
const removed = [];
for (const k of Object.keys(blob)) {
  if (k.startsWith('redivivus.chatHistory.')
      || k === 'redivivus.pendingRescueConversation'
      || k === 'redivivus.skipConversationRestore'
      || k === 'redivivus.suppressConversationClear') {
    removed.push(k); delete blob[k];
  }
}
console.log(`🧹 Removing ${removed.length} stale keys (of ${before} total).`);

// Write back via a parameterized statement to avoid quoting issues with the JSON blob.
const tmp = path.join(os.tmpdir(), 'redivivus-blob-' + Date.now() + '.json');
fs.writeFileSync(tmp, JSON.stringify(blob));
execFileSync('sqlite3', [DB, `UPDATE ItemTable SET value=readfile('${tmp}') WHERE key='${KEY}';`]);
fs.unlinkSync(tmp);

const after = JSON.parse(execFileSync('sqlite3', [DB, `SELECT value FROM ItemTable WHERE key='${KEY}';`]).toString());
const leftover = Object.keys(after).filter(k => k.startsWith('redivivus.chatHistory.'));
console.log(`✅ Done. chatHistory keys remaining: ${leftover.length}. Reopen Redivivus — the chat will be empty.`);
