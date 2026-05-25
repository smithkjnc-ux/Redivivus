// [SCOPE] Redivivus Logger convenience wrappers and log reader — extracted from redivivusLogger.ts (Rule 9 split)
// All operation-specific log helpers + filesystem reader live here. Core init/flush stays in redivivusLogger.ts.

import * as fs from 'fs';
import * as path from 'path';
import type { LogEntry } from './redivivusLogger.js';
import { redivivusLog } from './redivivusLogger.js';

/** Log build operation */
export function logBuildOperation(
  phase: string,
  message: string,
  files?: string[],
  data?: Record<string, unknown>
): void {
  redivivusLog({ operation: 'build', phase, message, files, data });
}

/** Log fix operation */
export function logFixOperation(
  phase: string,
  message: string,
  aiModel?: string,
  aiRole?: LogEntry['aiRole'],
  data?: Record<string, unknown>
): void {
  redivivusLog({ operation: 'fix', phase, aiRole, aiModel, message, data });
}

/** Log analysis operation */
export function logAnalysisOperation(
  phase: string,
  message: string,
  files?: string[],
  data?: Record<string, unknown>
): void {
  redivivusLog({ operation: 'analyze', phase, message, files, data });
}

/** Log chat interaction */
export function logChatOperation(message: string, data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'chat', message, data });
}

/** List all Redivivus logs for a project */
export function listRedivivusLogs(root: string): { date: string; sessionId: string; path: string; size: number }[] {
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) { return []; }
  return fs.readdirSync(logsDir)
    .filter(f => f.startsWith('redivivus-session-') && f.endsWith('.log'))
    .map(f => {
      const parts = f.replace('redivivus-session-', '').replace('.log', '').split('-');
      const date = parts.slice(0, 3).join('-');
      const sessionId = parts.slice(3).join('-');
      const filePath = path.join(logsDir, f);
      const stats = fs.statSync(filePath);
      return { date, sessionId, path: filePath, size: stats.size };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId.localeCompare(a.sessionId));
}

/** Read and parse a log file */
export function readLogFile(logPath: string): LogEntry[] {
  if (!fs.existsSync(logPath)) { return []; }
  const content = fs.readFileSync(logPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => { try { return JSON.parse(line) as LogEntry; } catch { return null; } })
    .filter((entry): entry is LogEntry => entry !== null);
}
