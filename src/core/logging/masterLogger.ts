// [SCOPE] Redivivus Master Logger — thin bridge that routes domain logger calls to the unified
// redivivusLogger (services layer). All domain loggers (chatLogger, buildLogger, etc.) call masterLog()
// and automatically get structured JSON output, session IDs, and Output Channel dispatch.
// Log rotation (keep last 3 runs) still applies via the session-based log file naming.

import { log as structuredLog, getCurrentSession } from '../../services/logging/redivivusLogger.js';
import type { LayerName } from '../../services/logging/logListeners.js';
import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Map domain names (used by existing domain loggers) to onion layer names
const DOMAIN_TO_LAYER: Record<string, LayerName> = {
  CHAT: 'ui', RENDER: 'ui', SIDEBAR: 'ui', WIZARD: 'ui', ANALYZER: 'ui', MAP: 'ui',
  BUILD: 'core', ROUTING: 'core', RETROFIT: 'core', RUNTIME: 'core', DIAGNOSTICS: 'core', INSPECTOR: 'core',
  AI: 'services', GUARDIAN: 'services', VAULT: 'services', BLUEPRINT: 'services',
  PROJECT: 'services', WORKSPACE: 'services',
  COMMANDS: 'commands', SESSION: 'commands',
};

const LEVEL_MAP: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error',
};

let _debugEnabled = false;

/** Called by all domain loggers (chatLogger, buildLogger, routingLogger, etc.) */
export function masterLog(level: LogLevel, domain: string, message: string, data?: unknown): void {
  if (level === 'DEBUG' && !_debugEnabled) { return; }
  const layer = DOMAIN_TO_LAYER[domain.toUpperCase()] ?? 'services';
  const structLevel = LEVEL_MAP[level];
  structuredLog(structLevel, layer, domain.toLowerCase(), 'masterLog', message, data !== undefined ? { detail: data } as any : undefined);
  // Mirror errors to console so they appear in Extension Host log too
  if (level === 'ERROR') { console.error(`[Redivivus:${domain}] ${message}`, data ?? ''); }
}

export function setDebugLogging(enabled: boolean): void {
  _debugEnabled = enabled;
}

/** Initialize master logger storage (called from extension.ts alongside initRedivivusLogger). */
export function initMasterLogger(root: string): void {
  // Keep last 3 session log files — delete older ones
  const logsDir = path.join(root, '.redivivus', 'logs');
  if (!fs.existsSync(logsDir)) { return; }
  const sessionFiles = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.log'))
    .sort().reverse();
  if (sessionFiles.length > 3) {
    sessionFiles.slice(3).forEach(f => { try { fs.unlinkSync(path.join(logsDir, f)); } catch {} });
  }
}

/** Get the current session ID (for correlation in multi-service traces). */
export function getMasterSessionId(): string | null {
  return getCurrentSession().sessionId;
}
