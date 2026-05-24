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

    return {
      terminalName: buf.name || terminal.name || 'Terminal',
      errorBlock: errorLines.slice(0, 15).join('\n').trim(),
      fullContext: contextLines.slice(0, 30).join('\n').trim(),
    };
  }
  return null;
}
