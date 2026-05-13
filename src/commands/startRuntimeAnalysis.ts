// [SCOPE] chassis.startRuntimeAnalysis command -- Runtime Analysis Engine phases 1-4.
// Reads runtime_profile.json, writes instrumentation files, spawns the entry point,
// observes for 30 seconds, cleans up, writes runtime_connections.json, posts report.
// [WARN] chassis_trace.py and chassis_hook.js are TEMPORARY -- always deleted in finally block.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { loadRuntimeProfile } from '../services/runtimeProfiler.js';
import { buildPythonTraceScript } from '../runtime/pythonInstrumentor.js';
import { buildJsHookScript } from '../runtime/jsInstrumentor.js';
import { ChatPanel } from '../ui/chatPanel.js';
import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vaultService.js';

const DURATION_S  = 30;
const POLL_MS     = 5000;
const TRACE_FILE  = 'chassis_trace.py';
const HOOK_FILE   = 'chassis_hook.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface TraceEntry {
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

interface Connection {
  from: string;
  to: string;
  type: string;
  observed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function postToChat(text: string): void {
  ChatPanel.currentPanel?.handleMessage({ type: 'assistant-message', text });
}

function deleteSafe(filePath: string): void {
  try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } } catch { /* best-effort */ }
}

function readTraceEntries(tracePath: string): TraceEntry[] {
  try {
    if (!fs.existsSync(tracePath)) { return []; }
    return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as TraceEntry[];
  } catch { return []; }
}

function summariseEntries(entries: TraceEntry[]): string {
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

function buildConnections(entries: TraceEntry[], root: string): Connection[] {
  const map = new Map<string, Connection>();

  const key = (from: string, to: string, type: string) => from + '|' + to + '|' + type;

  // Subprocess calls — source file -> target command
  for (const e of entries) {
    if (e.type !== 'subprocess' || !e.file) { continue; }
    const cmd = Array.isArray(e.cmd) ? e.cmd[0] : String(e.cmd || '');
    const target = path.basename(cmd);
    const from = path.relative(root, e.file).replace(/\\/g, '/');
    const k = key(from, target, 'subprocess');
    const existing = map.get(k);
    if (existing) { existing.observed++; } else { map.set(k, { from, to: target, type: 'subprocess', observed: 1 }); }
  }

  // Socket connections — source file -> host:port
  for (const e of entries) {
    if (e.type !== 'socket_connect' || !e.file) { continue; }
    const to = 'port:' + (e.port || '?');
    const from = path.relative(root, e.file).replace(/\\/g, '/');
    const k = key(from, to, 'websocket');
    const existing = map.get(k);
    if (existing) { existing.observed++; } else { map.set(k, { from, to, type: 'websocket', observed: 1 }); }
  }

  // JS require calls — capture cross-file dependencies
  const requiresByFile = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.type !== 'require' || !e.from) { continue; }
    const fromRel = path.relative(root, e.from).replace(/\\/g, '/');
    if (!requiresByFile.has(fromRel)) { requiresByFile.set(fromRel, new Set()); }
    requiresByFile.get(fromRel)!.add(e.module || '');
  }
  for (const [from, mods] of requiresByFile) {
    for (const mod of mods) {
      if (!mod.startsWith('.')) { continue; } // only local requires
      const k = key(from, mod, 'require');
      if (!map.has(k)) { map.set(k, { from, to: mod, type: 'require', observed: 1 }); }
    }
  }

  return [...map.values()].filter(c => c.type !== 'require' || c.observed > 1);
}

function buildPlainEnglishReport(connections: Connection[], entries: TraceEntry[]): string {
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

// ── Main orchestrator ─────────────────────────────────────────────────────────

async function runRuntimeAnalysis(root: string): Promise<void> {
  const chassisDir  = path.join(root, '.chassis');
  const tracePath   = path.join(chassisDir, 'runtime_trace.json');
  const connPath    = path.join(chassisDir, 'runtime_connections.json');
  const pyTracePath = path.join(root, TRACE_FILE);
  const jsHookPath  = path.join(root, HOOK_FILE);

  // Load profile
  const profile = loadRuntimeProfile(root);
  if (!profile) {
    postToChat('No runtime profile found. Run **Profile This Project** first.');
    return;
  }

  const ep = profile.entryPoints[0];
  if (!ep) {
    postToChat('No entry point detected in the runtime profile. Cannot launch instrumented run.');
    return;
  }

  const isPython = ep.type === 'python';
  const isJS     = ep.type === 'javascript' || ep.type === 'typescript';

  if (!isPython && !isJS) {
    postToChat('Entry point type `' + ep.type + '` is not supported for runtime instrumentation yet. Supported: Python, JavaScript/TypeScript.');
    return;
  }

  // Reset trace file
  if (!fs.existsSync(chassisDir)) { fs.mkdirSync(chassisDir, { recursive: true }); }
  try { fs.writeFileSync(tracePath, '[]', 'utf8'); } catch { /* ok */ }

  // Write instrumentation files
  if (isPython) {
    fs.writeFileSync(pyTracePath, buildPythonTraceScript(tracePath, DURATION_S), 'utf8');
  }
  if (isJS) {
    fs.writeFileSync(jsHookPath, buildJsHookScript(tracePath, DURATION_S), 'utf8');
  }

  postToChat('Running your program with instrumentation for ' + DURATION_S + ' seconds...\n\nEntry point: `' + ep.file + '`');

  let proc: cp.ChildProcess | null = null;

  try {
    // Build launch command
    let cmd: string;
    let args: string[];
    let env = { ...process.env };

    if (isPython) {
      // python -c "import chassis_trace; exec(open('entrypoint.py').read())"
      // Safer: PYTHONSTARTUP doesn't always work for all entry points.
      // Use: python entrypoint.py with PYTHONINSPECT=0 and inject via -c wrapper
      cmd  = 'python3';
      args = ['-c', `import chassis_trace\nimport runpy\nrunpy.run_path('${ep.file}', run_name='__main__')`];
      env['PYTHONPATH'] = root + (env['PYTHONPATH'] ? ':' + env['PYTHONPATH'] : '');
    } else {
      cmd  = 'node';
      args = ['--require', './chassis_hook.js', ep.file];
    }

    proc = cp.spawn(cmd, args, {
      cwd: root,
      env,
      stdio: 'ignore',
      detached: false,
    });

    // Progress polling
    let elapsed = 0;
    await new Promise<void>((resolve) => {
      const pollTimer = setInterval(() => {
        elapsed += POLL_MS / 1000;
        const entries = readTraceEntries(tracePath);
        postToChat('Observed so far (' + elapsed + 's): ' + summariseEntries(entries));
        if (elapsed >= DURATION_S) {
          clearInterval(pollTimer);
          resolve();
        }
      }, POLL_MS);
    });

  } finally {
    // Always kill process and clean up instrumentation files
    if (proc && !proc.killed) {
      try { proc.kill('SIGTERM'); } catch { /* ok */ }
      await new Promise(r => setTimeout(r, 500));
      try { if (!proc.killed) { proc.kill('SIGKILL'); } } catch { /* ok */ }
    }
    deleteSafe(pyTracePath);
    deleteSafe(jsHookPath);
  }

  // Phase 4 — build connections and write report
  const entries     = readTraceEntries(tracePath);
  const connections = buildConnections(entries, root);

  try {
    fs.writeFileSync(connPath, JSON.stringify({ connections }, null, 2), 'utf8');
  } catch { /* best-effort */ }

  postToChat(buildPlainEnglishReport(connections, entries));
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerStartRuntimeAnalysisCommand(
  context: vscode.ExtensionContext,
  chassis: ChassisService,
  routing: RoutingService,
  usageTracker?: UsageTracker,
  vault?: VaultService,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('chassis.startRuntimeAnalysis', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage('CHASSIS: No workspace folder open.');
        return;
      }
      ChatPanel.show(chassis, routing, usageTracker, vault);
      await new Promise(r => setTimeout(r, 300));
      try {
        await runRuntimeAnalysis(root);
      } catch (err) {
        postToChat('Runtime Analysis failed: ' + (err instanceof Error ? err.message : String(err)));
      }
    })
  );
}
