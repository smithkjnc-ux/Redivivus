// [SCOPE] Redivivus Unified Logger — tracks ALL AI operations, file changes, and system events
// Logs are written to .redivivus/logs/ with session-based files and daily rotation

import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  sessionId: string;
  operation: 'build' | 'fix' | 'analyze' | 'chat' | 'edit' | 'guardian' | 'supervisor' | 'worker' | 'system';
  aiModel?: string;
  aiRole?: 'supervisor' | 'worker' | 'guardian' | 'builder' | 'analyzer';
  phase?: string;
  message: string;
  data?: Record<string, unknown>;
  files?: string[];
  durationMs?: number;
  success?: boolean;
  error?: string;
}

let currentSessionId: string | null = null;
let currentLogFile: string | null = null;
let logBuffer: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let projectRoot: string | null = null;

/** Initialize logging for a Redivivus session */
export function initRedivivusLogger(root: string): string {
  projectRoot = root;
  currentSessionId = generateSessionId();
  
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const dateStr = new Date().toISOString().split('T')[0];
  currentLogFile = path.join(logsDir, `redivivus-session-${dateStr}-${currentSessionId}.log`);
  
  // Write header
  const header = {
    type: 'session_start',
    sessionId: currentSessionId,
    timestamp: new Date().toISOString(),
    project: root,
    redivivusVersion: '0.3.6'
  };
  
  fs.writeFileSync(currentLogFile, JSON.stringify(header) + '\n', 'utf-8');
  
  // Don't call redivivusLog here - it would be a circular call during init
  console.log('[Redivivus] Logging initialized:', currentLogFile);
  
  return currentSessionId;
}

/** Main logging function - use this for all Redivivus operations */
export function redivivusLog(entry: Omit<LogEntry, 'timestamp' | 'sessionId'>): void {
  if (!currentSessionId || !currentLogFile) {
    // Fallback: try to log to console if file logging not initialized
    console.log('[Redivivus LOG]', entry);
    return;
  }
  
  const fullEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId,
    ...entry
  };
  
  logBuffer.push(JSON.stringify(fullEntry));
  
  // Flush immediately for errors, otherwise batch
  if (entry.error || entry.success === false || entry.operation === 'system') {
    flushRedivivusLog();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushRedivivusLog, 50);
  }
}

/** Flush buffered logs to disk */
function flushRedivivusLog(): void {
  if (!currentLogFile || logBuffer.length === 0) {return;}
  
  try {
    fs.appendFileSync(currentLogFile, logBuffer.map(l => l + '\n').join(''), 'utf-8');
    logBuffer = [];
  } catch (e) {
    console.error('[Redivivus] Failed to write log:', e);
  }
  
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Log an AI prompt/response interaction */
export function logAIInteraction(
  operation: LogEntry['operation'],
  role: LogEntry['aiRole'],
  model: string,
  phase: string,
  promptPreview: string,
  responsePreview: string,
  data?: Record<string, unknown>
): void {
  redivivusLog({
    operation,
    aiRole: role,
    aiModel: model,
    phase,
    message: `${role} AI (${model}) - ${phase}`,
    data: {
      promptPreview: promptPreview.substring(0, 500),
      responsePreview: responsePreview.substring(0, 500),
      promptLength: promptPreview.length,
      responseLength: responsePreview.length,
      ...data
    }
  });
}

/** Log file changes (create, modify, delete) */
export function logFileChange(
  operation: 'create' | 'modify' | 'delete',
  filePath: string,
  aiRole?: string,
  data?: Record<string, unknown>
): void {
  redivivusLog({
    operation: 'edit',
    aiRole: aiRole as LogEntry['aiRole'],
    message: `File ${operation}: ${path.basename(filePath)}`,
    files: [filePath],
    data: { changeType: operation, fullPath: filePath, ...data }
  });
}

/** Finalize the current logging session */
export function finalizeRedivivusLogger(success: boolean = true): void {
  redivivusLog({
    operation: 'system',
    message: success ? 'Redivivus session completed successfully' : 'Redivivus session ended with errors',
    success
  });
  
  flushRedivivusLog();
  
  // Write footer
  if (currentLogFile) {
    try {
      const footer = {
        type: 'session_end',
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        success
      };
      fs.appendFileSync(currentLogFile, JSON.stringify(footer) + '\n', 'utf-8');
    } catch { /* ignore */ }
  }
  
  currentSessionId = null;
  currentLogFile = null;
  projectRoot = null;
}

/** Get current session info */
export function getCurrentSession(): { sessionId: string | null; logFile: string | null; projectRoot: string | null } {
  return { sessionId: currentSessionId, logFile: currentLogFile, projectRoot };
}

/** Generate unique session ID */
function generateSessionId(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}-${Math.random().toString(36).substr(2, 9)}`;
}

export { listRedivivusLogs, readLogFile, logBuildOperation, logFixOperation, logAnalysisOperation, logChatOperation } from './redivivusLoggerOps.js';
