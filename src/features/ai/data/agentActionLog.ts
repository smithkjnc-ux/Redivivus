// [SCOPE] Durable per-run log of what the Autonomous Agent actually did — every tool call, its result,
// completion-guard decisions, and the final answer — written to <root>/.redivivus/logs/agent-<ts>.log.
// The fix-pipeline log stops at the handoff and chat_history.md isn't written during agent runs, so without
// this the agent loop is UNAUDITABLE (a run had to be reconstructed from a screenshot). Best-effort: a
// failed write never throws back into the loop.

import * as fs from 'fs';
import * as path from 'path';

export interface AgentLogger {
  log: (msg: string, data?: any) => void;
  done: (summary: string) => void;
}

/** Open a fresh agent run log. Returns a no-op logger if the file can't be created. */
export function createAgentLogger(root: string, task: string): AgentLogger {
  let file = '';
  try {
    const dir = path.join(root, '.redivivus', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, `agent-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    fs.writeFileSync(file, `=== Redivivus Agent Run ===\nStarted: ${new Date().toISOString()}\nRoot: ${root}\nTask: ${task}\n---\n\n`);
  } catch { file = ''; }
  const write = (line: string) => { if (file) { try { fs.appendFileSync(file, line); } catch { /* best-effort */ } } };
  return {
    log: (msg, data) => write(`[${new Date().toISOString()}] ${msg}` +
      (data !== undefined ? `\n  ${typeof data === 'string' ? data : JSON.stringify(data)}\n` : '\n')),
    done: (summary) => write(`\n=== Run Ended: ${new Date().toISOString()} — ${summary} ===\n`),
  };
}
