// [SCOPE] Report diagnostics collector — gathers everything a debugger needs to fix a reported bug:
// build identity (version + commit), environment, workspace state, and recent build history.
// Appended verbatim to the report body. Never throws — each section degrades to a note on failure.

import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { BuildHistoryService } from '../../chat/build/services/buildHistoryService.js';

/** Read the deployed build-info.json (version, build timestamp, commit). */
function readBuildInfo(): { version?: string; timestamp?: string; commit?: string } {
  // __dirname at runtime is out/commands; build-info is out/data/build-info.json
  try {
    const p = path.join(__dirname, '..', 'data', 'build-info.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { return {}; }
}

/** Light project-kind sniff from top-level marker files. */
function detectKind(root: string): string {
  const has = (f: string) => { try { return fs.existsSync(path.join(root, f)); } catch { return false; } };
  if (has('package.json')) { return has('index.html') ? 'node + web' : 'node'; }
  if (has('requirements.txt') || has('pyproject.toml')) { return 'python'; }
  if (has('go.mod')) { return 'go'; }
  if (has('Cargo.toml')) { return 'rust'; }
  if (has('index.html')) { return 'static web'; }
  return 'unknown';
}

function workspaceSection(): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) { return '- No workspace folder open at report time'; }
  const root = folders[0].uri.fsPath;
  const initialized = (() => { try { return fs.existsSync(path.join(root, '.redivivus', 'config.json')); } catch { return false; } })();
  let projectName = folders[0].name;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.redivivus', 'config.json'), 'utf8'));
    if (cfg.projectName) { projectName = cfg.projectName; }
  } catch { /* no config */ }
  return [
    `- Project: ${projectName} (initialized: ${initialized ? 'yes' : 'no'})`,
    `- Open folders: ${folders.length}`,
    `- Kind: ${detectKind(root)}`,
  ].join('\n');
}

/** Last N build-history entries — per Rule 17, the most recent build is the prime suspect. */
function recentBuildsSection(): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) { return '- (no workspace — no build history)'; }
  try {
    const entries = new BuildHistoryService(folders[0].uri.fsPath).list().slice(0, 3);
    if (entries.length === 0) { return '- (no builds recorded yet)'; }
    return entries.map((e, i) => {
      const when = (e.timestamp || '').replace('T', ' ').slice(0, 16);
      const files = (e.files ?? []).slice(0, 8).join(', ');
      const undone = e.undone ? ' [UNDONE]' : '';
      return `${i + 1}. ${when} -- "${(e.task || '').slice(0, 80)}"${undone}\n   files: ${files || '(none)'}`;
    }).join('\n');
  } catch { return '- (build history unavailable)'; }
}

/** Build the full diagnostics block appended to a report. `version` is the extension's package version. */
export function collectDiagnostics(version: string): string {
  const bi = readBuildInfo();
  const env = [
    `- OS: ${os.platform()} ${os.release()} (${os.arch()})`,
    `- VSCodium: ${vscode.version}`,
    `- Electron: ${process.versions.electron ?? '?'} | Node: ${process.versions.node} | V8: ${process.versions.v8}`,
    `- Redivivus: v${bi.version ?? version} (build ${bi.timestamp ?? '?'}, commit ${bi.commit ?? 'unknown'})`,
  ].join('\n');

  return [
    `\n\n**Environment:**\n${env}`,
    `\n\n**Workspace:**\n${workspaceSection()}`,
    `\n\n**Recent builds (newest first):**\n${recentBuildsSection()}`,
  ].join('');
}
