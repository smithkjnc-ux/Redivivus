// [SCOPE] Runtime Analysis helpers — types, trace parsing, connection building, report formatting
// Imported by startRuntimeAnalysis.ts. Not exported directly by the extension.

import * as fs from 'fs';
import * as path from 'path';


export interface TraceEntry {
  type: string;
  file?: string;
  func?: string;
  cmd?: string | string[];
  host?: string;
  port?: number;
  module?: string;
  from?: string;
  name?: string;
  ts: number;
}

export interface Connection {
  from: string;
  to: string;
  type: string;
  observed: number;
}

export function postToChat(text: string): void {
  import('../features/chat/ui/chatPanel.js').then(({ ChatPanel }) => {
    ChatPanel.currentPanel?.handleMessage({ type: 'assistant-message', text });
  });
}

export function deleteSafe(filePath: string): void {
  try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } } catch { /* best-effort */ }
}

export function readTraceEntries(tracePath: string): TraceEntry[] {
  try {
    if (!fs.existsSync(tracePath)) { return []; }
    return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as TraceEntry[];
  } catch { return []; }
}

export function summariseEntries(entries: TraceEntry[]): string {
  const calls   = entries.filter(e => e.type === 'call').length;
  const subs    = entries.filter(e => e.type === 'subprocess').length;
  const sockets = entries.filter(e => e.type === 'socket_connect').length;
  const events  = entries.filter(e => e.type === 'event').length;
  const reqs    = entries.filter(e => e.type === 'require').length;
  const parts: string[] = [];
  if (calls)   { parts.push(calls   + ' function calls'); }
  if (reqs)    { parts.push(reqs    + ' dynamic requires'); }
  if (sockets) { parts.push(sockets + ' socket connections'); }
  if (subs)    { parts.push(subs    + ' subprocess spawns'); }
  if (events)  { parts.push(events  + ' events emitted'); }
  return parts.length ? parts.join(', ') : 'no activity yet';
}

export function buildConnections(entries: TraceEntry[], root: string): Connection[] {
  const map = new Map<string, Connection>();
  const key = (from: string, to: string, type: string) => from + '|' + to + '|' + type;

  for (const e of entries) {
    if (e.type !== 'subprocess' || !e.file) { continue; }
    const cmd = Array.isArray(e.cmd) ? e.cmd[0] : String(e.cmd || '');
    const target = path.basename(cmd);
    const from = path.relative(root, e.file).replace(/\\/g, '/');
    const k = key(from, target, 'subprocess');
    const existing = map.get(k);
    if (existing) { existing.observed++; } else { map.set(k, { from, to: target, type: 'subprocess', observed: 1 }); }
  }

  for (const e of entries) {
    if (e.type !== 'socket_connect' || !e.file) { continue; }
    const to = 'port:' + (e.port || '?');
    const from = path.relative(root, e.file).replace(/\\/g, '/');
    const k = key(from, to, 'websocket');
    const existing = map.get(k);
    if (existing) { existing.observed++; } else { map.set(k, { from, to, type: 'websocket', observed: 1 }); }
  }

  const requiresByFile = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.type !== 'require' || !e.from) { continue; }
    const fromRel = path.relative(root, e.from).replace(/\\/g, '/');
    if (!requiresByFile.has(fromRel)) { requiresByFile.set(fromRel, new Set()); }
    requiresByFile.get(fromRel)!.add(e.module || '');
  }
  for (const [from, mods] of requiresByFile) {
    for (const mod of mods) {
      if (!mod.startsWith('.')) { continue; }
      const k = key(from, mod, 'require');
      if (!map.has(k)) { map.set(k, { from, to: mod, type: 'require', observed: 1 }); }
    }
  }

  return [...map.values()].filter(c => c.type !== 'require' || c.observed > 1);
}

export function buildPlainEnglishReport(connections: Connection[], entries: TraceEntry[]): string {
  const calls   = entries.filter(e => e.type === 'call').length;
  const subs    = connections.filter(c => c.type === 'subprocess');
  const sockets = connections.filter(c => c.type === 'websocket');
  const lines: string[] = ['Runtime Analysis complete. Here\'s what I observed in 30 seconds:\n'];
  lines.push('- **' + calls + ' function calls** traced across project files');
  if (subs.length) {
    lines.push('- **Subprocess connections:** ' + subs.map(c => '`' + c.from + '` -> `' + c.to + '` (' + c.observed + 'x)').join(', '));
  }
  if (sockets.length) {
    lines.push('- **WebSocket/socket connections:** ' + sockets.map(c => '`' + c.from + '` -> ' + c.to + ' (' + c.observed + 'x)').join(', '));
  }
  if (!subs.length && !sockets.length) {
    lines.push('- No inter-process connections observed during this run');
    lines.push('  (program may not have reached connection code in 30 seconds)');
  }
  lines.push('\nArchitecture Map updated with dashed runtime connection edges.  __RUNTIME_MAP_UPDATE__END_RUNTIME_MAP_UPDATE__');
  return lines.join('\n');
}
