// [SCOPE] Redivivus Logger convenience wrappers, log reader, and session snapshot builder.
// Operation-specific helpers + filesystem reader + report bundling. Core init/flush in redivivusLogger.ts.

import * as fs from 'fs';
import * as path from 'path';
import type { LogEntry } from './redivivusLogger.js';
import { redivivusLog, getCurrentSession } from './redivivusLogger.js';

export function logBuildOperation(phase: string, message: string, files?: string[], data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'build', phase, message, files, data });
}

export function logFixOperation(phase: string, message: string, aiModel?: string, aiRole?: LogEntry['aiRole'], data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'fix', phase, aiRole, aiModel, message, data });
}

export function logAnalysisOperation(phase: string, message: string, files?: string[], data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'analyze', phase, message, files, data });
}

export function logChatOperation(message: string, data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'chat', message, data });
}

export function logAIInteraction(operation: LogEntry['operation'], role: LogEntry['aiRole'], model: string, phase: string, promptPreview: string, responsePreview: string, data?: Record<string, unknown>): void {
  redivivusLog({ operation, aiRole: role, aiModel: model, phase, message: `${role} AI (${model}) - ${phase}`,
    data: { promptPreview: promptPreview.substring(0, 500), responsePreview: responsePreview.substring(0, 500), promptLength: promptPreview.length, responseLength: responsePreview.length, ...data }
  });
}

export function logFileChange(operation: 'create' | 'modify' | 'delete', filePath: string, aiRole?: string, data?: Record<string, unknown>): void {
  redivivusLog({ operation: 'edit', aiRole: aiRole as LogEntry['aiRole'], message: `File ${operation}: ${path.basename(filePath)}`, files: [filePath], data: { changeType: operation, fullPath: filePath, ...data } });
}

/** List all session log files for a project root, newest first. */
export function listRedivivusLogs(root: string): { date: string; sessionId: string; path: string; size: number }[] {
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) { return []; }
  return fs.readdirSync(logsDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.log'))
    .map(f => {
      const parts = f.replace('session-', '').replace('.log', '').split('-');
      const date = parts.slice(0, 3).join('-');
      const sessionId = parts.slice(3).join('-');
      const filePath = path.join(logsDir, f);
      return { date, sessionId, path: filePath, size: fs.statSync(filePath).size };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.sessionId.localeCompare(a.sessionId));
}

/** Read and parse a log file. */
export function readLogFile(logPath: string): LogEntry[] {
  if (!fs.existsSync(logPath)) { return []; }
  return fs.readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim())
    .map(line => { try { return JSON.parse(line) as LogEntry; } catch { return null; } })
    .filter((e): e is LogEntry => e !== null);
}

/**
 * Return the last N log entries from the current session as formatted plain text.
 * Used by the Report Issue panel to include diagnostic context with every submission.
 */
export function getSessionSnapshot(maxEntries = 150): string {
  const { logFile, sessionId, projectRoot } = getCurrentSession();
  if (!logFile || !fs.existsSync(logFile)) { return '(No session log available — open a project first)'; }
  const rawLines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
  const tail = rawLines.slice(-maxEntries);
  const formatted = tail.map(line => {
    try {
      const e = JSON.parse(line) as any;
      if (e.type === 'session_start' || e.type === 'session_end') { return null; }
      const time = (e.timestamp || e.ts || '').split('T')[1]?.split('.')[0] ?? '?';
      const level = (e.level || e.operation || 'info').toUpperCase().slice(0,5).padEnd(5);
      const layer = e.layer ? `[${e.layer.toUpperCase().padEnd(8)}]` : '[LEGACY  ]';
      const loc = e.module && e.fn ? `${e.module}/${e.fn}` : e.phase ? e.phase : '';
      const buildTag = e.buildId ? ` <${String(e.buildId).slice(-6)}>` : '';
      const dataStr = e.data ? ` | ${JSON.stringify(e.data).slice(0, 100)}` : '';
      const errStr = e.error ? ` !! ${e.error}` : '';
      return `[${time}] ${level} ${layer} ${loc}${buildTag}: ${e.message || e.msg || ''}${dataStr}${errStr}`;
    } catch { return line.slice(0, 120); }
  }).filter(Boolean).join('\n');
  return `=== REDIVIVUS SESSION LOG (last ${tail.length} of ${rawLines.length} entries) ===\nSession: ${sessionId} | Project: ${projectRoot ?? 'unknown'}\n\n${formatted}`;
}
