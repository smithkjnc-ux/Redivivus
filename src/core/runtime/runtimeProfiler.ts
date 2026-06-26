// [SCOPE] Project Runtime Profiler — static scan that determines a project's runtime architecture
// before any instrumentation is attempted. Answers: entry points, language mix, IPC patterns,
// process topology, and external services. Writes .redivivus/runtime_profile.json.
// No vscode dependency — pure Node/fs so it can be used from any context.

import * as fs from 'fs';
import * as path from 'path';
import { walkDir } from './runtimeProfilerScan.js';
import { detectEntryPoints, detectLanguageMix, detectTopology } from './runtimeProfilerDetect.js';
import { detectIpcPatterns, detectExternalServices } from './runtimeProfilerIpc.js';

// [SCOPE] Shape of the output JSON
export interface EntryPoint {
  file: string;
  type: string;
  confidence: number;
}

export interface IpcPattern {
  type: string;
  files: string[];
  port?: number;     // primary port (most common across all files)
  ports?: number[];  // all detected ports, sorted by frequency
  targets?: string[];
}

export interface RuntimeProfile {
  scannedAt: string;
  entryPoints: EntryPoint[];
  languageMix: string[];
  processTopology: 'single-process' | 'multi-process' | 'multi-service';
  ipcPatterns: IpcPattern[];
  externalServices: string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Run the full project runtime profile scan. Returns the profile and writes it to disk. */
export function runRuntimeProfiler(root: string): RuntimeProfile {
  const allFiles = walkDir(root, root, 0, new Set<string>());

  const entryPoints = detectEntryPoints(root, allFiles);
  const languageMix = detectLanguageMix(root, allFiles);
  const ipcPatterns = detectIpcPatterns(root, allFiles);
  const processTopology = detectTopology(root, ipcPatterns);
  const externalServices = detectExternalServices(allFiles);

  const profile: RuntimeProfile = {
    scannedAt: new Date().toISOString(),
    entryPoints,
    languageMix,
    processTopology,
    ipcPatterns,
    externalServices,
  };

  // Write to .redivivus/runtime_profile.json
  try {
    const redivivusDir = path.join(root, '.redivivus');
    if (!fs.existsSync(redivivusDir)) { fs.mkdirSync(redivivusDir, { recursive: true }); }
    fs.writeFileSync(path.join(redivivusDir, 'runtime_profile.json'), JSON.stringify(profile, null, 2), 'utf8');
  } catch { /* best-effort write */ }

  return profile;
}

/** Load existing profile from disk, or return null if not present. */
export function loadRuntimeProfile(root: string): RuntimeProfile | null {
  try {
    const raw = fs.readFileSync(path.join(root, '.redivivus', 'runtime_profile.json'), 'utf8');
    return JSON.parse(raw) as RuntimeProfile;
  } catch { return null; }
}

/** Build the plain-English summary shown in the chat panel after profiling. */
export function buildProfileSummary(profile: RuntimeProfile): string {
  const ep = profile.entryPoints[0];
  const entryStr = ep ? ep.file : 'unknown';
  const langStr = profile.languageMix.length > 1
    ? profile.languageMix.slice(0, 3).join(' + ') + ' project'
    : (profile.languageMix[0] || 'unknown') + ' project';
  const topologyStr = profile.processTopology === 'multi-service'
    ? 'multiple services'
    : profile.processTopology === 'multi-process'
    ? 'multiple processes'
    : 'a single process';

  const ipcStr = profile.ipcPatterns.length > 0
    ? profile.ipcPatterns.map(p => {
      if (p.type === 'websocket' && p.port) { return 'WebSocket on port ' + p.port; }
      if (p.type === 'subprocess' || p.type === 'child_process') { return 'subprocess calls'; }
      return p.type;
    }).join(' and ')
    : 'direct imports only (no IPC detected)';

  const extStr = profile.externalServices.length > 0
    ? profile.externalServices.join(', ')
    : 'none detected';

  const instrumentPlan = buildInstrumentationPlan(profile);

  return 'I scanned your project and here\'s what I found:\n'
    + '- Your program starts from **' + entryStr + '**\n'
    + '- It\'s a **' + langStr + '**\n'
    + '- The pieces communicate via **' + ipcStr + '**\n'
    + '- It runs as **' + topologyStr + '**\n'
    + '- External services: **' + extStr + '**\n\n'
    + 'Based on this, here\'s how I\'ll instrument it for Runtime Analysis:\n'
    + instrumentPlan + '\n\n'
    + 'Ready to start Runtime Analysis?  __ARCH_PROFILE_ACTIONS__END_PROFILE_ACTIONS__';
}

function buildInstrumentationPlan(profile: RuntimeProfile): string {
  const adapters: string[] = [];
  if (profile.languageMix.includes('python')) { adapters.push('PythonRuntimeAdapter (sys.settrace)'); }
  if (profile.languageMix.includes('javascript') || profile.languageMix.includes('typescript')) { adapters.push('JavaScriptRuntimeAdapter (require hooks)'); }
  if (profile.languageMix.length >= 2) { adapters.push('HybridAdapter (cross-process correlation)'); }
  const wsPatterns = profile.ipcPatterns.filter(p => p.type === 'websocket');
  const spPatterns = profile.ipcPatterns.filter(p => p.type === 'subprocess' || p.type === 'child_process');
  const lines: string[] = [];
  if (adapters.length) { lines.push('- Adapters: ' + adapters.join(', ')); }
  if (wsPatterns.length) { lines.push('- Monitor WebSocket traffic' + (wsPatterns[0].port ? ' on port ' + wsPatterns[0].port : '')); }
  if (spPatterns.length) { lines.push('- Trace subprocess/child_process calls'); }
  if (profile.processTopology === 'multi-service') { lines.push('- Instrument each service independently'); }
  return lines.length ? lines.join('\n') : '- Standard static analysis (no runtime IPC detected)';
}
