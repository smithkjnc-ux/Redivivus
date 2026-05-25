const fs = require('fs');
const path = require('path');

const masterLoggerContent = `// [SCOPE] Redivivus Master Log Aggregator — manages all domain logs and log rotation
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
  const logsDir = path.join(root, '.redivivus', 'logs', 'master');
  
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Log rotation: Keep last 3 runs
  const files = fs.readdirSync(logsDir)
    .filter(f => f.startsWith('redivivus-master-') && f.endsWith('.log'))
    .sort()
    .reverse();

  // Delete everything older than the 2nd most recent (so we keep 3 total when we create the new one)
  if (files.length >= 3) {
    const toDelete = files.slice(2);
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(logsDir, f));
      } catch (e) {
        console.error('[Redivivus] Failed to delete old log:', e);
      }
    }
  }

  const dateStr = new Date().toISOString().replace(/:/g, '-').replace(/\\..+/, '');
  currentLogFile = path.join(logsDir, \`redivivus-master-\${dateStr}.log\`);

  const header = \`=== Redivivus MASTER LOG SESSION START ===\\nTimestamp: \${new Date().toISOString()}\\nProject: \${root}\\n\\n\`;
  fs.writeFileSync(currentLogFile, header, 'utf-8');
}

/** Master log function used by domain loggers */
export function masterLog(level: LogLevel, domain: string, message: string, data?: unknown): void {
  if (!LOG_CONFIG[level]) return;

  const timestamp = new Date().toISOString();
  let logLine = \`[\${timestamp}] [\${level}] [\${domain}] \${message}\`;
  
  if (data !== undefined) {
    try {
      logLine += \` | Data: \${JSON.stringify(data)}\`;
    } catch {
      logLine += \` | Data: [Unserializable Object]\`;
    }
  }

  if (level === 'ERROR') {
    console.error(logLine);
  } else if (level === 'INFO') {
    console.log(logLine);
  }

  if (!currentLogFile) return;

  logBuffer.push(logLine);

  if (level === 'ERROR') {
    flushLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, 50);
  }
}

/** Flush buffered logs to disk */
function flushLogs(): void {
  if (!currentLogFile || logBuffer.length === 0) return;

  try {
    fs.appendFileSync(currentLogFile, logBuffer.join('\\n') + '\\n', 'utf-8');
    logBuffer = [];
  } catch (e) {
    console.error('[Redivivus] Failed to write master log:', e);
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
`;

const domains = [
  { path: 'src/core/ai/aiLogger.ts', domain: 'AI', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/build/buildLogger.ts', domain: 'BUILD', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/diagnostics/diagnosticsLogger.ts', domain: 'DIAGNOSTICS', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/inspector/inspectorLogger.ts', domain: 'INSPECTOR', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/project/projectLogger.ts', domain: 'PROJECT', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/retrofit/retrofitLogger.ts', domain: 'RETROFIT', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/routing/routingLogger.ts', domain: 'ROUTING', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/core/runtime/runtimeLogger.ts', domain: 'RUNTIME', rel: '../../core/logging/masterLogger.js' },
  { path: 'src/ui/panels/analyzer/analyzerLogger.ts', domain: 'ANALYZER', rel: '../../../core/logging/masterLogger.js' },
  { path: 'src/ui/panels/chat/chatLogger.ts', domain: 'CHAT', rel: '../../../core/logging/masterLogger.js' },
  { path: 'src/ui/panels/wizard/wizardLogger.ts', domain: 'WIZARD', rel: '../../../core/logging/masterLogger.js' }
];

// Create logging directory and master logger
const masterLoggerDir = path.join(process.cwd(), 'src/core/logging');
if (!fs.existsSync(masterLoggerDir)) fs.mkdirSync(masterLoggerDir, { recursive: true });
fs.writeFileSync(path.join(masterLoggerDir, 'masterLogger.ts'), masterLoggerContent, 'utf8');

// Generate domain loggers
for (const entry of domains) {
  const fileContent = `// [SCOPE] Redivivus ${entry.domain} Domain Logger
import { masterLog } from '${entry.rel}';

const DOMAIN = '${entry.domain}';

export const ${path.basename(entry.path, '.ts')} = {
  debug: (message: string, data?: unknown) => masterLog('DEBUG', DOMAIN, message, data),
  info: (message: string, data?: unknown) => masterLog('INFO', DOMAIN, message, data),
  error: (message: string, data?: unknown) => masterLog('ERROR', DOMAIN, message, data)
};
`;
  const fullPath = path.join(process.cwd(), entry.path);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, fileContent, 'utf8');
}

console.log('Successfully generated master logger and 11 domain loggers.');
