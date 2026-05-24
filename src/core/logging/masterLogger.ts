// [SCOPE] CHASSIS Master Log Aggregator — manages all domain logs and log rotation
import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'ERROR';

let currentLogFile: string | null = null;
let projectRoot: string | null = null;
let logBuffer: string[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Global Configuration
const LOG_CONFIG = {
  DEBUG: false,
  INFO: true,
  ERROR: true
};

/** Initialize the master logger and perform log rotation */
export function initMasterLogger(root: string): void {
  projectRoot = root;
  const logsDir = path.join(root, '.chassis', 'logs', 'master');
  
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Log rotation: Keep last 3 runs
  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('chassis-master-') && f.endsWith('.log'))
    .sort()
    .reverse();

  // Delete everything older than the 2nd most recent (so we keep 3 total when we create the new one)
  if (files.length >= 3) {
    const toDelete = files.slice(2);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(logsDir, f));
      } catch (e) {
        console.error('[CHASSIS] Failed to delete old log:', e);
      }
    }
  }

  const dateStr = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  currentLogFile = path.join(logsDir, `chassis-master-${dateStr}.log`);

  const header = `=== CHASSIS MASTER LOG SESSION START ===\nTimestamp: ${new Date().toISOString()}\nProject: ${root}\n\n`;
  fs.writeFileSync(currentLogFile, header, 'utf-8');
}

/** Master log function used by domain loggers */
export function masterLog(level: LogLevel, domain: string, message: string, data?: unknown): void {
  if (!LOG_CONFIG[level]) {return;}

  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${level}] [${domain}] ${message}`;
  
  if (data !== undefined) {
    try {
      logLine += ` | Data: ${JSON.stringify(data)}`;
    } catch {
      logLine += ` | Data: [Unserializable Object]`;
    }
  }

  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'INFO') {
    console.log(logLine);
  }

  if (!currentLogFile) {return;}

  logBuffer.push(logLine);

  if (level === 'ERROR') {
    flushLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, 50);
  }
}

/** Flush buffered logs to disk */
function flushLogs(): void {
  if (!currentLogFile || logBuffer.length === 0) {return;}

  try {
    fs.appendFileSync(currentLogFile, logBuffer.join('\n') + '\n', 'utf-8');
    logBuffer = [];
  } catch (e) {
    console.error('[CHASSIS] Failed to write master log:', e);
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Enable or disable debug logging */
export function setDebugLogging(enabled: boolean): void {
  LOG_CONFIG.DEBUG = enabled;
}
