// [SCOPE] chassis.startRuntimeAnalysis command -- Runtime Analysis Engine phases 1-4.
// Reads runtime_profile.json, writes instrumentation files, spawns the entry point,
// observes for 30 seconds, cleans up, writes runtime_connections.json, posts report.
// [WARN] chassis_trace.py and chassis_hook.js are TEMPORARY -- always deleted in finally block.
// Helpers (types, parsing, report) -> startRuntimeAnalysisHelpers.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { loadRuntimeProfile } from '../services/runtimeProfiler.js';
import { buildPythonTraceScript } from '../runtime/pythonInstrumentor.js';
import { buildJsHookScript } from '../runtime/jsInstrumentor.js';

import { ChassisService } from '../services/chassisService.js';
import { RoutingService } from '../services/ai/routingService.js';
import { UsageTracker } from '../services/usageTracker.js';
import { VaultService } from '../services/vault/vaultService.js';
import { postToChat, deleteSafe, readTraceEntries, summariseEntries, buildConnections, buildPlainEnglishReport } from './startRuntimeAnalysisHelpers.js';

const DURATION_S  = 30;
const POLL_MS     = 5000;
const TRACE_FILE  = 'chassis_trace.py';
const HOOK_FILE   = 'chassis_hook.js';

async function runRuntimeAnalysis(root: string): Promise<void> {
  const chassisDir  = path.join(root, '.chassis');
  const tracePath   = path.join(chassisDir, 'runtime_trace.json');
  const connPath    = path.join(chassisDir, 'runtime_connections.json');
  const pyTracePath = path.join(root, TRACE_FILE);
  const jsHookPath  = path.join(root, HOOK_FILE);

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

  if (!fs.existsSync(chassisDir)) { fs.mkdirSync(chassisDir, { recursive: true }); }
  try { fs.writeFileSync(tracePath, '[]', 'utf8'); } catch { /* ok */ }

  if (isPython) { fs.writeFileSync(pyTracePath, buildPythonTraceScript(tracePath, DURATION_S), 'utf8'); }
  if (isJS)     { fs.writeFileSync(jsHookPath, buildJsHookScript(tracePath, DURATION_S), 'utf8'); }

  postToChat('Running your program with instrumentation for ' + DURATION_S + ' seconds...\n\nEntry point: `' + ep.file + '`');

  let proc: cp.ChildProcess | null = null;
  try {
    let cmd: string;
    let args: string[];
    let env = { ...process.env };

    if (isPython) {
      cmd  = 'python3';
      args = ['-c', `import chassis_trace\nimport runpy\nrunpy.run_path('${ep.file}', run_name='__main__')`];
      env['PYTHONPATH'] = root + (env['PYTHONPATH'] ? ':' + env['PYTHONPATH'] : '');
    } else {
      cmd  = 'node';
      args = ['--require', './chassis_hook.js', ep.file];
    }

    proc = cp.spawn(cmd, args, { cwd: root, env, stdio: 'ignore', detached: false });

    let elapsed = 0;
    await new Promise<void>((resolve) => {
      const pollTimer = setInterval(() => {
        elapsed += POLL_MS / 1000;
        const entries = readTraceEntries(tracePath);
        postToChat('Observed so far (' + elapsed + 's): ' + summariseEntries(entries));
        if (elapsed >= DURATION_S) { clearInterval(pollTimer); resolve(); }
      }, POLL_MS);
    });

  } finally {
    if (proc && !proc.killed) {
      try { proc.kill('SIGTERM'); } catch { /* ok */ }
      await new Promise(r => setTimeout(r, 500));
      try { if (!proc.killed) { proc.kill('SIGKILL'); } } catch { /* ok */ }
    }
    deleteSafe(pyTracePath);
    deleteSafe(jsHookPath);
  }

  const entries     = readTraceEntries(tracePath);
  const connections = buildConnections(entries, root);
  try { fs.writeFileSync(connPath, JSON.stringify({ connections }, null, 2), 'utf8'); } catch { /* best-effort */ }
  postToChat(buildPlainEnglishReport(connections, entries));
}

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
      if (!root) { vscode.window.showErrorMessage('CHASSIS: No workspace folder open.'); return; }
      const { ChatPanel } = await import('../ui/chat/chatPanel.js');
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
