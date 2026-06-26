// [SCOPE] Runtime Profiler — IPC pattern and external service detection
// Extracted from runtimeProfiler.ts

import * as fs from 'fs';
import * as path from 'path';
import type { IpcPattern } from './runtimeProfiler.js';
import { readSafe } from './runtimeProfilerScan.js';

// [WARN] Patterns are matched as substring/regex against raw file content.
//        Keep patterns specific enough to avoid false positives on comments.
const IPC_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  { type: 'websocket',    patterns: [/import\s+websocket/i, /websockets\./, /socket\.io/, /new WebSocket/, /ws\.Server/, /asyncio.*websocket/i] },
  { type: 'subprocess',   patterns: [/subprocess\.run/, /subprocess\.Popen/, /subprocess\.call/, /os\.system/, /os\.popen/] },
  { type: 'child_process',patterns: [/require\(['"]child_process/, /child_process\.spawn/, /child_process\.exec/, /\.spawn\(/, /\.fork\(/] },
  { type: 'zmq',          patterns: [/import\s+zmq/, /require\(['"]zmq/, /zmq\.Context/] },
  { type: 'redis',        patterns: [/import\s+redis/, /require\(['"]redis/, /Redis\(/] },
  { type: 'asyncio',      patterns: [/import\s+asyncio/, /asyncio\.run\(/, /asyncio\.create_task/] },
  { type: 'multiprocessing', patterns: [/from\s+multiprocessing/, /import\s+multiprocessing/, /Process\(/] },
  { type: 'ipc',          patterns: [/\.send\(/, /process\.on\(['"]message/, /parentPort\.postMessage/] },
];

export function detectIpcPatterns(root: string, allFiles: string[]): IpcPattern[] {
  const byType: Record<string, Set<string>> = {};
  const portsByType: Record<string, number[]> = {};

  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    if (!['.py', '.js', '.ts', '.jsx', '.tsx'].includes(ext)) { continue; }
    const content = readSafe(f);
    const rel = path.relative(root, f);
    for (const { type, patterns } of IPC_PATTERNS) {
      if (patterns.some(p => p.test(content))) {
        if (!byType[type]) { byType[type] = new Set(); }
        byType[type].add(rel);
        // Extract ALL port numbers near websocket bindings — accumulate with frequency count
        if (type === 'websocket') {
          const portMatch = content.match(/[:(,\s](\d{4,5})\b/g);
          if (portMatch) {
            for (const pm of portMatch) {
              const n = parseInt(pm.replace(/\D/g, ''), 10);
              if (n >= 1024 && n <= 65535) {
                if (!portsByType[type]) { portsByType[type] = []; }
                portsByType[type].push(n); // allow duplicates for frequency counting
              }
            }
          }
        }
      }
    }
  }

  return Object.entries(byType).map(([type, files]) => {
    const result: IpcPattern = { type, files: [...files] };
    if (portsByType[type]?.length) {
      // Count frequency of each port across all files
      const freq: Record<number, number> = {};
      for (const p of portsByType[type]) { freq[p] = (freq[p] || 0) + 1; }
      const sorted = Object.keys(freq).map(Number).sort((a, b) => freq[b] - freq[a]);
      result.port = sorted[0];  // most common
      if (sorted.length > 1) { result.ports = sorted; }  // all, if more than one
    }
    return result;
  });
}

// ── External services ─────────────────────────────────────────────────────────

const EXTERNAL_SERVICES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'openai',      patterns: [/openai/i, /gpt-[34]/i] },
  { name: 'gemini',      patterns: [/gemini/i, /generativeai/i] },
  { name: 'anthropic',   patterns: [/anthropic/i, /claude/i] },
  { name: 'elevenlabs',  patterns: [/elevenlabs/i, /eleven_labs/i] },
  { name: 'stripe',      patterns: [/stripe\./i, /from\s+stripe/i] },
  { name: 'aws',         patterns: [/boto3/i, /aws-sdk/i, /amazonaws\.com/i] },
  { name: 'firebase',    patterns: [/firebase/i, /firestore/i] },
  { name: 'supabase',    patterns: [/supabase/i] },
  { name: 'mongodb',     patterns: [/mongodb/i, /mongoose/i, /pymongo/i] },
  { name: 'postgres',    patterns: [/psycopg/i, /pg\.Pool/i, /postgresql/i] },
  { name: 'redis',       patterns: [/redis/i] },
  { name: 'twilio',      patterns: [/twilio/i] },
  { name: 'sendgrid',    patterns: [/sendgrid/i] },
  { name: 'discord',     patterns: [/discord\.py/i, /discord\.js/i, /discordapp/i] },
  { name: 'slack',       patterns: [/slack-sdk/i, /slack_bolt/i, /slack\.com\/api/i] },
];

export function detectExternalServices(allFiles: string[]): string[] {
  const found = new Set<string>();
  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    if (!['.py', '.js', '.ts', '.jsx', '.tsx', '.txt', '.toml', '.json', '.yaml', '.yml'].includes(ext)) { continue; }
    const content = readSafe(f);
    for (const { name, patterns } of EXTERNAL_SERVICES) {
      if (!found.has(name) && patterns.some(p => p.test(content))) { found.add(name); }
    }
  }
  return [...found].sort();
}
