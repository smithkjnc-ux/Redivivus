// [SCOPE] Project Runtime Profiler — static scan that determines a project's runtime architecture
// before any instrumentation is attempted. Answers: entry points, language mix, IPC patterns,
// process topology, and external services. Writes .chassis/runtime_profile.json.
// No vscode dependency — pure Node/fs so it can be used from any context.

import * as fs from 'fs';
import * as path from 'path';

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

// ── Internal helpers ──────────────────────────────────────────────────────────

// [WARN] Rule 3 exact exclusion set — checked before recursing into any subdirectory.
const SKIP_EXACT_DIRS = new Set([
  '__pycache__', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.cache', 'coverage', '.pytest_cache', '.mypy_cache',
  'eggs', '.eggs', '.tox', 'htmlcov',
]);

function walkDir(
  dir: string,
  projectRoot: string,
  depth: number,
  visited: Set<string>,
): string[] {
  // Rule 6 — max depth guard
  if (depth > 15) {
    console.warn('[Profiler] Max depth reached at ' + dir);
    return [];
  }

  // Symlink cycle protection — resolve real path and skip if already visited
  let realDir: string;
  try { realDir = fs.realpathSync(dir); } catch { return []; }
  if (visited.has(realDir)) { return []; }
  visited.add(realDir);

  // Rule 5 — skip recursing INTO .chassis of the current project (write ops are separate)
  if (dir === path.join(projectRoot, '.chassis')) { return []; }

  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  let results: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);

    if (e.isDirectory()) {
      // Rule 1 — virtual environment: presence of pyvenv.cfg inside the dir
      if (fs.existsSync(path.join(full, 'pyvenv.cfg'))) {
        console.warn('[Profiler] Skipping virtual environment: ' + full);
        continue;
      }
      // Rule 2 — node_modules at any depth
      if (e.name === 'node_modules') { continue; }
      // Rule 3 — standard build/cache dirs
      if (SKIP_EXACT_DIRS.has(e.name)) { continue; }
      // Rule 4 — external project boundary: a .chassis dir whose parent is NOT projectRoot
      if (e.name === '.chassis' && dir !== projectRoot) {
        console.warn('[Profiler] Found external project boundary at ' + full + ' -- excluded from scan');
        continue;
      }
      results = results.concat(walkDir(full, projectRoot, depth + 1, visited));
    } else if (e.isFile()) {
      // Skip hidden files
      if (e.name.startsWith('.')) { continue; }
      results.push(full);
    }
  }
  return results;
}

function readSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

// ── Entry point detection ─────────────────────────────────────────────────────

function detectEntryPoints(root: string, allFiles: string[]): EntryPoint[] {
  const entries: EntryPoint[] = [];

  // package.json scripts.start
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readSafe(pkgPath));
      if (pkg.main) { entries.push({ file: pkg.main, type: 'javascript', confidence: 0.9 }); }
      if (pkg.scripts?.start) {
        const m = pkg.scripts.start.match(/node\s+([\w./\\-]+)/);
        if (m) { entries.push({ file: m[1], type: 'javascript', confidence: 0.85 }); }
      }
    } catch { /* ignore malformed package.json */ }
  }

  // Procfile
  const procfilePath = path.join(root, 'Procfile');
  if (fs.existsSync(procfilePath)) {
    const lines = readSafe(procfilePath).split('\n').filter(l => l.trim());
    for (const line of lines) {
      const m = line.match(/^web:\s+.*?([\w./\\-]+\.(?:py|js|ts|sh))/);
      if (m) { entries.push({ file: m[1], type: m[1].endsWith('.py') ? 'python' : 'javascript', confidence: 0.9 }); }
    }
  }

  // Python __main__ and main() calls
  for (const f of allFiles) {
    if (!f.endsWith('.py')) { continue; }
    const content = readSafe(f);
    const rel = path.relative(root, f);
    if (content.includes('if __name__') && content.includes('__main__')) {
      entries.push({ file: rel, type: 'python', confidence: 0.95 });
    } else if (/^def main\(\)/m.test(content) && /^main\(\)/m.test(content)) {
      entries.push({ file: rel, type: 'python', confidence: 0.8 });
    }
  }

  // Shell launcher scripts
  for (const f of allFiles) {
    if (!f.endsWith('.sh')) { continue; }
    const content = readSafe(f);
    const rel = path.relative(root, f);
    if (/python|node|npm start/i.test(content)) {
      entries.push({ file: rel, type: 'shell', confidence: 0.75 });
    }
  }

  // Makefile run targets
  const makefilePath = path.join(root, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    const mk = readSafe(makefilePath);
    if (/^run:/m.test(mk)) {
      entries.push({ file: 'Makefile', type: 'makefile', confidence: 0.7 });
    }
  }

  // Confidence scoring — deprioritize external deps, boost root/src files
  const EXTERNAL_DEP_DIRS = /^(LivePortrait|vendor|third_party|extern|deps|lib)[/\\]/;
  for (const e of entries) {
    if (EXTERNAL_DEP_DIRS.test(e.file)) { e.confidence = Math.max(0, e.confidence - 0.4); }
    if (!e.file.includes('/') || e.file.startsWith('src/')) { e.confidence = Math.min(1, e.confidence + 0.2); }
  }

  // Deduplicate by file, sort by confidence descending, keep top 3
  const seen = new Set<string>();
  return entries.filter(e => { if (seen.has(e.file)) { return false; } seen.add(e.file); return true; })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

// ── Language mix ──────────────────────────────────────────────────────────────

function detectLanguageMix(root: string, allFiles: string[]): string[] {
  const counts: Record<string, number> = {};
  const extMap: Record<string, string> = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
    '.jsx': 'javascript', '.tsx': 'typescript', '.rs': 'rust',
    '.go': 'go', '.java': 'java', '.rb': 'ruby', '.php': 'php',
    '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c', '.swift': 'swift',
    '.kt': 'kotlin',
  };
  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    const lang = extMap[ext];
    if (lang) { counts[lang] = (counts[lang] || 0) + 1; }
  }
  // Manifest-based detection (confirms languages even with few files)
  if (fs.existsSync(path.join(root, 'requirements.txt')) || fs.existsSync(path.join(root, 'setup.py')) || fs.existsSync(path.join(root, 'pyproject.toml'))) { counts['python'] = (counts['python'] || 0) + 1; }
  if (fs.existsSync(path.join(root, 'package.json'))) { counts['javascript'] = (counts['javascript'] || 0) + 1; }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) { counts['rust'] = (counts['rust'] || 0) + 1; }
  if (fs.existsSync(path.join(root, 'pom.xml')) || fs.existsSync(path.join(root, 'build.gradle'))) { counts['java'] = (counts['java'] || 0) + 1; }
  if (fs.existsSync(path.join(root, 'go.mod'))) { counts['go'] = (counts['go'] || 0) + 1; }
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([lang]) => lang);
}

// ── IPC pattern detection ─────────────────────────────────────────────────────

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

function detectIpcPatterns(root: string, allFiles: string[]): IpcPattern[] {
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

// ── Process topology ──────────────────────────────────────────────────────────

function detectTopology(root: string, ipcPatterns: IpcPattern[]): RuntimeProfile['processTopology'] {
  if (fs.existsSync(path.join(root, 'docker-compose.yml')) || fs.existsSync(path.join(root, 'docker-compose.yaml')) || fs.existsSync(path.join(root, 'Procfile'))) {
    return 'multi-service';
  }
  const multiProcessTypes = ['subprocess', 'child_process', 'zmq', 'multiprocessing'];
  if (ipcPatterns.some(p => multiProcessTypes.includes(p.type))) {
    return 'multi-process';
  }
  return 'single-process';
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

function detectExternalServices(allFiles: string[]): string[] {
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

  // Write to .chassis/runtime_profile.json
  try {
    const chassisDir = path.join(root, '.chassis');
    if (!fs.existsSync(chassisDir)) { fs.mkdirSync(chassisDir, { recursive: true }); }
    fs.writeFileSync(path.join(chassisDir, 'runtime_profile.json'), JSON.stringify(profile, null, 2), 'utf8');
  } catch { /* best-effort write */ }

  return profile;
}

/** Load existing profile from disk, or return null if not present. */
export function loadRuntimeProfile(root: string): RuntimeProfile | null {
  try {
    const raw = fs.readFileSync(path.join(root, '.chassis', 'runtime_profile.json'), 'utf8');
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
