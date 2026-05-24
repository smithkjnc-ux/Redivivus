// [SCOPE] Runtime Profiler — entry point, language mix, topology detection
// Extracted from runtimeProfiler.ts

import * as fs from 'fs';
import * as path from 'path';
import type { EntryPoint, RuntimeProfile } from './runtimeProfiler';
import { readSafe } from './runtimeProfilerScan';

// ── Entry point detection ─────────────────────────────────────────────────────

export function detectEntryPoints(root: string, allFiles: string[]): EntryPoint[] {
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

export function detectLanguageMix(root: string, allFiles: string[]): string[] {
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

// ── Process topology ──────────────────────────────────────────────────────────

export function detectTopology(root: string, ipcPatterns: { type: string }[]): RuntimeProfile['processTopology'] {
  if (fs.existsSync(path.join(root, 'docker-compose.yml')) || fs.existsSync(path.join(root, 'docker-compose.yaml')) || fs.existsSync(path.join(root, 'Procfile'))) {
    return 'multi-service';
  }
  const multiProcessTypes = ['subprocess', 'child_process', 'zmq', 'multiprocessing'];
  if (ipcPatterns.some(p => multiProcessTypes.includes(p.type))) {
    return 'multi-process';
  }
  return 'single-process';
}
