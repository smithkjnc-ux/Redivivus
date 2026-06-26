// [SCOPE] Terminal Error Service — captures terminal output and extracts the last error block
// Hooks vscode.window.onDidWriteTerminalData to buffer per-terminal output.
// Exposes getLastTerminalError() for injection into chat context.

import * as vscode from 'vscode';

// Max chars to buffer per terminal — enough to catch multiline errors without memory bloat
const MAX_BUFFER = 8000;

// [WARN] Strip ANSI escape codes before storing — raw terminal output contains colour codes
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g;

interface TerminalBuffer {
  name: string;
  text: string;
}

const _buffers = new Map<vscode.Terminal, TerminalBuffer>();

// Error-indicating line patterns — match any of these to consider a block an error
const ERROR_LINE_RE = /\b(error|Error|ERROR|exception|Exception|EXCEPTION|fatal|Fatal|FATAL|failed|Failed|FAILED|SyntaxError|TypeError|ReferenceError|RangeError|Cannot find|Cannot read|Unexpected token|undefined is not|null is not|is not a function|ENOENT|EACCES|EADDRINUSE|npm ERR!|tsc.*error|TS[0-9]{4}|command not found|ModuleNotFoundError|ImportError|AttributeError|NameError|KeyError|IndexError|ZeroDivisionError|AssertionError|Segmentation fault|Traceback)\b/;

// Shell prompt patterns — lines ending in $ or > preceded by path/user, or plain $ > prompts
// Also matches common CI/script invocation patterns like `> script-name`
const PROMPT_RE = /(?:^|\s)[\w.~/@-]*[$#>]\s+(.+)$|^>\s+([\w][\w:/@.-]*)\s*$/;

export function registerTerminalErrorService(context: vscode.ExtensionContext): void {
  // onDidWriteTerminalData is a proposed API — accessing the property throws in VS Code 1.110+
  // if the extension hasn't declared "terminalDataWriteEvent" in enabledApiProposals.
  // Wrap in try/catch so a missing proposed API never blocks extension activation.
  try {
    const dataDisposable = (vscode.window as any).onDidWriteTerminalData?.((e: { terminal: vscode.Terminal; data: string }) => {
      const clean = e.data.replace(ANSI_RE, '');
      const existing = _buffers.get(e.terminal);
      const combined = (existing?.text || '') + clean;
      _buffers.set(e.terminal, {
        name: e.terminal.name,
        text: combined.length > MAX_BUFFER ? combined.slice(combined.length - MAX_BUFFER) : combined,
      });
    });
    if (dataDisposable) { context.subscriptions.push(dataDisposable); }
  } catch {
    // Proposed API unavailable — terminal buffering disabled, getLastTerminalError() returns null
  }

  context.subscriptions.push(vscode.window.onDidCloseTerminal((t) => { _buffers.delete(t); }));
}

export interface TerminalError {
  terminalName: string;
  errorBlock: string;   // The extracted error lines (trimmed)
  fullContext: string;  // Up to 20 lines around the error for AI context
  failingCommand?: string; // The command that was running when the error occurred
}

export interface FailingCommand {
  command: string;      // e.g. "npm run build", "python main.py", "tsc"
  terminalName: string;
  cwd?: string;         // working directory if detectable
}

/** Extract the last error block from all known terminal buffers.
 *  Returns the most recently written terminal that contains an error, or null. */
export function getLastTerminalError(): TerminalError | null {
  // Check active terminal first, then all others
  const active = vscode.window.activeTerminal;
  const ordered: vscode.Terminal[] = [];
  if (active && _buffers.has(active)) { ordered.push(active); }
  for (const t of _buffers.keys()) {
    if (t !== active) { ordered.push(t); }
  }

  for (const terminal of ordered) {
    const buf = _buffers.get(terminal);
    if (!buf) { continue; }
    const lines = buf.text.split('\n');
    // Find the last line matching an error pattern
    let lastErrorIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (ERROR_LINE_RE.test(lines[i])) { lastErrorIdx = i; break; }
    }
    if (lastErrorIdx === -1) { continue; }

    // Grab up to 30 lines ending at the last error line (context window)
    const start = Math.max(0, lastErrorIdx - 10);
    const end = Math.min(lines.length, lastErrorIdx + 20);
    const contextLines = lines.slice(start, end).filter(l => l.trim().length > 0);

    // Error block: lines from first error marker to lastErrorIdx
    let firstErrorIdx = lastErrorIdx;
    for (let i = lastErrorIdx - 1; i >= start; i--) {
      if (ERROR_LINE_RE.test(lines[i])) { firstErrorIdx = i; }
      else if (lines[i].trim() === '' && i < lastErrorIdx - 3) { break; }
    }
    const errorLines = lines.slice(firstErrorIdx, end).filter(l => l.trim().length > 0);

    const failingCommand = extractCommandBeforeError(lines, firstErrorIdx);
    return {
      terminalName: buf.name || terminal.name || 'Terminal',
      errorBlock: errorLines.slice(0, 15).join('\n').trim(),
      fullContext: contextLines.slice(0, 30).join('\n').trim(),
      failingCommand: failingCommand || undefined,
    };
  }
  return null;
}

/** Scan backwards from errorIdx to find the shell command that triggered the error. */
function extractCommandBeforeError(lines: string[], errorIdx: number): string | null {
  // Look back up to 50 lines for a prompt line
  const searchStart = Math.max(0, errorIdx - 50);
  for (let i = errorIdx - 1; i >= searchStart; i--) {
    const line = lines[i].trim();
    if (!line) { continue; }
    const m = PROMPT_RE.exec(line);
    if (m) {
      const cmd = (m[1] || m[2] || '').trim();
      if (cmd.length > 1 && cmd.length < 200) { return cmd; }
    }
    // npm/yarn/pnpm script lines: "> script-name" or "$ npm run ..."
    if (/^\$?\s*(npm|yarn|pnpm|npx|node|python3?|ruby|go|cargo|tsc|make|gradle|mvn|pytest|jest|vitest)\s+/.test(line)) {
      return line.replace(/^\$\s*/, '').trim();
    }
  }
  return null;
}

/** Returns the command that was running when the last terminal error occurred.
 *  Returns null if no terminal error exists or command cannot be determined. */
export function getLastFailingCommand(): FailingCommand | null {
  const err = getLastTerminalError();
  if (!err?.failingCommand) { return null; }
  return {
    command: err.failingCommand,
    terminalName: err.terminalName,
  };
}
