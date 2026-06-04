// [SCOPE] Log listener registry — lets the UI layer subscribe to log events without a circular
// dependency. Services layer writes; UI layer reads via callbacks registered here.
// Zero VS Code dependencies — safe to import from any layer.

export type LayerName = 'commands' | 'ui' | 'core' | 'services' | 'system';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogEntry {
  ts: string;
  level: LogLevel;
  layer: LayerName;
  module: string;
  fn: string;
  buildId?: string;
  sessionId?: string;
  msg: string;
  data?: unknown;
}

type LogListener = (entry: StructuredLogEntry) => void;
const listeners: LogListener[] = [];

export function addLogListener(fn: LogListener): void {
  listeners.push(fn);
}

export function removeLogListener(fn: LogListener): void {
  const idx = listeners.indexOf(fn);
  if (idx !== -1) { listeners.splice(idx, 1); }
}

/** Called by redivivusLogger after each structured entry is written to disk. */
export function dispatchToListeners(entry: StructuredLogEntry): void {
  for (const fn of listeners) {
    try { fn(entry); } catch { /* listeners must never crash the logger */ }
  }
}
