// [SCOPE] Fix pipeline context enrichment — collects live IDE signals for the Supervisor AI.
// Gathers VS Code diagnostics, terminal errors, and build history into a single context string.
// Gives the Supervisor the same situational awareness a human developer has before touching code.

import * as vscode from 'vscode';
import * as path from 'path';
import { getRecentBuildContext } from './chatPanelMsgFixUtils';
import { getLastTerminalError } from '../../services/workspace/terminalErrorService';

/** Collect all available context signals: build history + live editor diagnostics + last terminal error. */
export function collectFixContext(root: string, sourceFiles: { rel: string; content: string }[]): string {
  const parts: string[] = [];

  const buildCtx = getRecentBuildContext(root, sourceFiles);
  if (buildCtx) { parts.push(buildCtx); }

  // Live VS Code diagnostics — real TypeScript/ESLint errors currently shown in the editor gutter.
  // The compiler ran these already; injecting them means the Supervisor knows what is broken NOW.
  try {
    const diagLines: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      const rel = path.relative(root, uri.fsPath);
      if (rel.startsWith('..') || rel.startsWith('/')) { continue; }
      for (const d of diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).slice(0, 5)) {
        diagLines.push(`  ${rel}:${d.range.start.line + 1}: ${d.message}`);
      }
    }
    if (diagLines.length > 0) {
      parts.push(`EDITOR DIAGNOSTICS (live errors in VS Code — these exist BEFORE this fix request):\n${diagLines.join('\n')}`);
    }
  } catch {}

  // Last terminal error — captures runtime crashes and script failures the compiler cannot see.
  // Only inject if there is an actual error signal (not just general output).
  try {
    const t = getLastTerminalError();
    if (t?.errorBlock?.trim()) {
      parts.push(`LAST TERMINAL ERROR (${t.terminalName}):\n${t.fullContext.slice(0, 600)}`);
    }
  } catch {}

  return parts.join('\n\n');
}
