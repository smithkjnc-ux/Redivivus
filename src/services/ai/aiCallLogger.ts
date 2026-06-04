// [SCOPE] AI Call Logger -- appends full prompt + response for every AI call to .redivivus/ai_calls.log
// Gives the project owner visibility into what each AI role (supervisor/worker/guardian/agent) sends and
// receives so quality gaps can be diagnosed. Import logAICall and call it after every callProvider result.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface AICallEntry {
  role: string;         // 'supervisor' | 'worker' | 'guardian' | 'agent' | 'chat' | 'classifier'
  model: string;
  prompt: string;
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

// [WARN] Rotate at 2 MB to prevent unbounded log growth -- keeps one .old backup
const MAX_LOG_BYTES = 2 * 1024 * 1024;

export function logAICall(entry: AICallEntry): void {
  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return; }
    const logDir = path.join(workspaceRoot, '.redivivus');
    if (!fs.existsSync(logDir)) { return; }
    const logPath = path.join(logDir, 'ai_calls.log');

    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
      fs.renameSync(logPath, logPath + '.old');
    }

    const ts = new Date().toISOString();
    const divider = '='.repeat(80);
    const tokLine = `in=${entry.inputTokens ?? '?'} out=${entry.outputTokens ?? '?'} tokens`;
    const durLine = entry.durationMs !== undefined ? ` | ${entry.durationMs}ms` : '';
    const header = `[${ts}] ROLE: ${entry.role.toUpperCase()} | MODEL: ${entry.model} | ${tokLine}${durLine}`;

    const block = `\n${divider}\n${header}\n--- PROMPT ---\n${entry.prompt}\n--- RESPONSE ---\n${entry.response}\n${divider}`;
    fs.appendFileSync(logPath, block, 'utf8');
  } catch { /* never crash the extension over a log write */ }
}
