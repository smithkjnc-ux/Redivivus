// [SCOPE] Pull the REAL missing capabilities out of a (possibly multi-line) shell command the agent ran,
// so a tool gap is reported against the thing the owner must install (pandoc, weasyprint) — NEVER the
// wrapper it was buried inside (`set`, `bash`, `python3`). Each missing capability is returned SEPARATELY
// (we never bundle), each with copy-pasteable install guidance. Impure: probes PATH (`command -v`) and the
// Python import path, but every probe fails safe (un-checkable token → treated as present → never flagged).

import { installHint, installNote, purposeOf } from './agentToolGapInstall.js';

export interface MissingCap { name: string; kind: 'tool' | 'module'; install: string; what?: string; note?: string; }

// Shell builtins / keywords / wrappers that are NEVER the missing capability — the real tool is elsewhere.
const SHELL_NOISE = new Set([
  'set', 'cd', 'export', 'echo', 'printf', 'read', 'exit', 'return', 'true', 'false', 'test',
  'source', '.', 'eval', 'exec', 'trap', 'shift', 'unset', 'wait', 'local', 'declare', 'pushd', 'popd',
  'bash', 'sh', 'zsh', 'env', 'sudo', 'nohup', 'time', 'then', 'do', 'else', 'fi', 'done', 'esac',
]);
// Control keywords that can precede the real command on a line (`if pandoc ...; then`).
const CONTROL = new Set(['if', 'while', 'elif', 'until', '!', 'time']);
// Common stdlib modules — skip the import probe (they're always present); not exhaustive, just an optimisation.
const PY_STDLIB = new Set([
  'os', 'sys', 're', 'json', 'math', 'pathlib', 'subprocess', 'shutil', 'io', 'time', 'datetime',
  'typing', 'collections', 'itertools', 'functools', 'argparse', 'tempfile', 'glob', 'random',
]);

function toolPresent(x: string): boolean {
  if (!/^[A-Za-z0-9._+-]+$/.test(x)) { return true; } // not checkable → don't flag
  try { require('child_process').execSync(`command -v ${x}`, { stdio: 'ignore' }); return true; } catch { return false; }
}
function modulePresent(m: string): boolean {
  if (!/^[A-Za-z0-9_]+$/.test(m)) { return true; }
  try { require('child_process').execSync(`python3 -c "import ${m}"`, { stdio: 'ignore' }); return true; } catch { return false; }
}

/** The executable in command position for one pipeline segment — skipping control keywords and leading
 *  VAR=val assignments, and stripping any path. Returns '' when there's no real command (e.g. `X=$?`). */
function segmentExe(seg: string): string {
  const toks = seg.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < toks.length && (CONTROL.has(toks[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]))) { i++; }
  return (toks[i] || '').split('/').pop() || '';
}

/** Strip the parts of a script that look like commands but aren't shell command position: heredoc bodies
 *  (embedded Python/CSS) and quoted strings (echo text, inline HTML). Heredocs FIRST — their start marker
 *  `<< 'DELIM'` contains quotes we must not eat early. Keeps shell command lines (`pandoc ...`, `which X`)
 *  intact so the executable scan sees real commands, not `except`, `body`, `assert`, or echo'd words. */
function stripForCommandScan(text: string): string {
  return (text || '')
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?\n[ \t]*\2\b/g, ' ') // heredoc bodies
    .replace(/'[^']*'/g, ' ')   // single-quoted strings
    .replace(/"[^"]*"/g, ' ');  // double-quoted strings
}

/** Scan a command/script and return every capability that is genuinely missing right now, each separate,
 *  each with an install hint. Catches: (1) command-position executables, (2) tools probed via
 *  which/command -v/type, (3) Python modules imported or run via `-m`. Pure result, fails safe. */
export function extractMissingCapabilities(command: string): MissingCap[] {
  const out: MissingCap[] = [];
  const seen = new Set<string>();
  const add = (name: string, kind: 'tool' | 'module') => {
    const key = `${kind}:${name}`;
    if (!name || seen.has(key)) { return; }
    seen.add(key);
    out.push({ name, kind, install: installHint(name, kind), what: purposeOf(name, kind), note: installNote(name, kind) });
  };
  // (1)+(2) run on the SHELL surface only — heredoc bodies / quoted strings removed so we never flag
  // Python keywords (`except`, `assert`), CSS selectors (`body`, `table`), or words inside echo text.
  const shell = stripForCommandScan(command || '');
  for (const seg of shell.split(/[\n;|]+|&&|\|\|/)) {
    const exe = segmentExe(seg);
    if (exe && /^[A-Za-z]/.test(exe) && !SHELL_NOISE.has(exe) && !toolPresent(exe)) { add(exe, 'tool'); }
  }
  for (const m of shell.matchAll(/\b(?:command\s+-v|which|type)\s+([A-Za-z0-9._/+-]+)/g)) {
    const t = (m[1].split('/').pop() || '');
    if (t && !SHELL_NOISE.has(t) && !toolPresent(t)) { add(t, 'tool'); }
  }
  // (3) Python modules: scan the FULL text (the imports live inside the heredoc we stripped above).
  const mods = new Set<string>();
  for (const m of (command || '').matchAll(/(?:^|\s)import\s+([A-Za-z0-9_]+)/g)) { mods.add(m[1]); }
  for (const m of (command || '').matchAll(/from\s+([A-Za-z0-9_]+)\s+import/g)) { mods.add(m[1]); }
  for (const m of (command || '').matchAll(/python3?\s+-m\s+([A-Za-z0-9_]+)/g)) { mods.add(m[1]); }
  for (const mod of mods) { if (!PY_STDLIB.has(mod) && !modulePresent(mod)) { add(mod, 'module'); } }
  return out;
}
