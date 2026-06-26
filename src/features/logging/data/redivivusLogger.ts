// [SCOPE] Redivivus Unified Logger — single source of truth for all log writes.
// Writes structured JSON to .redivivus/logs/ and dispatches to registered listeners (Output Channels).
// Import log() for new code. Legacy redivivusLog() still works for backward compat.

import * as fs from 'fs';
import * as path from 'path';
import type { LayerName, LogLevel, StructuredLogEntry } from './logListeners.js';
import { dispatchToListeners } from './logListeners.js';

export type { LayerName, LogLevel, StructuredLogEntry };

export interface LogEntry {
  timestamp: string;
  sessionId: string;
  level: LogLevel;
  layer: LayerName;
  module: string;
  fn: string;
  buildId?: string;
  operation?: string;
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

let _sessionId: string | null = null;
let _logFile: string | null = null;
let _projectRoot: string | null = null;
let _buffer: string[] = [];
let _flushTimer: NodeJS.Timeout | null = null;

export function initRedivivusLogger(root: string): string {
  _projectRoot = root;
  _sessionId = _makeId();
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) { fs.mkdirSync(logsDir, { recursive: true }); }
  const date = new Date().toISOString().split('T')[0];
  _logFile = path.join(logsDir, `session-${date}-${_sessionId}.log`);
  fs.writeFileSync(_logFile, JSON.stringify({ type: 'session_start', sessionId: _sessionId, ts: new Date().toISOString(), project: root }) + '\n', 'utf-8');
  return _sessionId;
}

/** Canonical log function — use this for all new code. */
export function log(level: LogLevel, layer: LayerName, module: string, fn: string, msg: string, data?: Record<string, unknown>, buildId?: string): void {
  const ts = new Date().toISOString();
  const entry: LogEntry = { timestamp: ts, sessionId: _sessionId ?? 'none', level, layer, module, fn, buildId, message: msg, data };
  _write(entry);
  dispatchToListeners({ ts, level, layer, module, fn, buildId, sessionId: _sessionId ?? undefined, msg, data });
}

/** Legacy compat — existing callers continue to work. */
export function redivivusLog(entry: Omit<LogEntry, 'timestamp' | 'sessionId' | 'level' | 'layer' | 'module' | 'fn'>): void {
  const ts = new Date().toISOString();
  const full: LogEntry = {
    timestamp: ts, sessionId: _sessionId ?? 'none',
    level: entry.error || entry.success === false ? 'error' : 'info',
    layer: 'services', module: entry.phase ?? entry.operation ?? 'legacy', fn: 'redivivusLog',
    ...entry,
  };
  _write(full);
}

function _write(entry: LogEntry): void {
  _buffer.push(JSON.stringify(entry));
  if (entry.level === 'error' || entry.level === 'warn') { _flush(); }
  else if (!_flushTimer) { _flushTimer = setTimeout(_flush, 50); }
}

function _flush(): void {
  if (!_logFile || _buffer.length === 0) { return; }
  try { fs.appendFileSync(_logFile, _buffer.map(l => l + '\n').join(''), 'utf-8'); _buffer = []; }
  catch (e) { console.error('[Redivivus] Log write failed:', e); }
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
}

export function finalizeRedivivusLogger(success = true): void {
  redivivusLog({ operation: 'system', message: success ? 'Session ended OK' : 'Session ended with errors', success });
  _flush();
  if (_logFile) { try { fs.appendFileSync(_logFile, JSON.stringify({ type: 'session_end', sessionId: _sessionId, ts: new Date().toISOString(), success }) + '\n', 'utf-8'); } catch {} }
  _sessionId = null; _logFile = null; _projectRoot = null;
}

export function getCurrentSession(): { sessionId: string | null; logFile: string | null; projectRoot: string | null } {
  return { sessionId: _sessionId, logFile: _logFile, projectRoot: _projectRoot };
}

function _makeId(): string {
  const n = new Date();
  return `${n.getHours().toString().padStart(2,'0')}${n.getMinutes().toString().padStart(2,'0')}${n.getSeconds().toString().padStart(2,'0')}-${Math.random().toString(36).slice(2,11)}`;
}

export { listRedivivusLogs, readLogFile, logBuildOperation, logFixOperation, logAnalysisOperation, logChatOperation, getSessionSnapshot, logAIInteraction, logFileChange } from './redivivusLoggerOps.js';
