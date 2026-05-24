// [SCOPE] Fix Pipeline Logger — writes structured logs to disk for debugging
// Logs are written to .chassis/logs/fix-pipeline-YYYY-MM-DD-HHMMSS.log

import * as fs from 'fs';
import * as path from 'path';

let currentLogFile: string | null = null;
let logBuffer: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;

/** Initialize a new log file for this fix session */
export function initFixLogger(root: string): void {
  const logsDir = path.join(root, '.chassis', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  currentLogFile = path.join(logsDir, `fix-pipeline-${timestamp}.log`);
  
  logBuffer = [`=== CHASSIS Fix Pipeline Log ===\n`, `Started: ${new Date().toISOString()}\n`, `Project: ${root}\n`, `---\n\n`];
  flushLog();
}

/** Log a message to the current fix session log */
export function fixLog(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const dataStr = data !== undefined ? `\n  DATA: ${JSON.stringify(data, null, 2).replace(/\n/g, '\n  ')}` : '';
  logBuffer.push(`[${timestamp}] ${message}${dataStr}\n`);
  
  // Flush immediately for important messages, otherwise batch
  if (message.includes('FAIL') || message.includes('ERROR') || message.includes('CRITICAL')) {
    flushLog();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushLog, 100);
  }
}

/** Flush buffered logs to disk */
function flushLog(): void {
  if (!currentLogFile || logBuffer.length === 0) {return;}
  
  try {
    fs.appendFileSync(currentLogFile, logBuffer.join(''), 'utf-8');
    logBuffer = [];
  } catch (e) {
    console.error('[CHASSIS] Failed to write fix log:', e);
  }
  
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Finalize and close the log file */
export function finalizeFixLogger(): void {
  flushLog();
  if (currentLogFile) {
    try {
      fs.appendFileSync(currentLogFile, `\n=== Log Ended: ${new Date().toISOString()} ===\n`, 'utf-8');
    } catch { /* ignore */ }
    currentLogFile = null;
  }
}

/** Get the path to the current log file */
export function getCurrentLogPath(): string | null {
  return currentLogFile;
}

/** List all fix pipeline logs for this project */
export function listFixLogs(root: string): string[] {
  const logsDir = path.join(root, '.chassis', 'logs');
  if (!fs.existsSync(logsDir)) {return [];}
  
  return fs.readdirSync(logsDir)
    .filter(f => f.startsWith('fix-pipeline-') && f.endsWith('.log'))
    .sort()
    .reverse();
}
