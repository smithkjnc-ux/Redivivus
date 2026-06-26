// [SCOPE] Redivivus Delegation CodeLens — "Fix this" and "Ask Redivivus" buttons above [TODO] and [WARN] tags
// Appears inline in the editor above any annotated line. Routes through redivivus.postToChat.

import * as vscode from 'vscode';
import * as path from 'path';

// Matches // [TODO], # [TODO], -- [TODO], <!-- [TODO] --> in any file
const TAG_RE = /(?:\/\/|#|--|<!--)\s*\[(TODO|WARN)\]\s*(.*?)(?:\s*-->)?$/;

export class DelegationCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.languages.onDidChangeDiagnostics(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const relPath = root ? path.relative(root, document.uri.fsPath) : path.basename(document.uri.fsPath);

    // --- [TODO] / [WARN] tag lenses ---
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const m = TAG_RE.exec(line.text);
      if (!m) { continue; }

      const tag = m[1];
      const tagText = m[2].trim();
      const range = line.range;

      if (tag === 'TODO') {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(tools) Fix this with Redivivus',
          command: 'redivivus.postToChat',
          arguments: [`Fix the task at line ${i + 1} in \`${relPath}\`: ${tagText || 'complete the TODO'}`],
        }));
      } else if (tag === 'WARN') {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(warning) Ask Redivivus about this',
          command: 'redivivus.postToChat',
          arguments: [`There is a warning flag at line ${i + 1} in \`${relPath}\`: ${tagText || 'review this section'} — can you explain what could go wrong and suggest a fix?`],
        }));
      }
    }

    // --- Diagnostic error lenses: 💡 Explain + ⚡ Fix above every Error-severity diagnostic ---
    const diagnostics = vscode.languages.getDiagnostics(document.uri)
      .filter(d => d.severity === vscode.DiagnosticSeverity.Error);

    // Deduplicate by line — one pair of lenses per line even if multiple errors exist
    const seenLines = new Set<number>();
    for (const diag of diagnostics) {
      const lineIdx = diag.range.start.line;
      if (seenLines.has(lineIdx)) { continue; }
      seenLines.add(lineIdx);

      const range = new vscode.Range(lineIdx, 0, lineIdx, 0);
      const errorMsg = diag.message.replace(/\n/g, ' ').slice(0, 200);
      const source = diag.source ? `${diag.source}: ` : '';
      const lineNo = lineIdx + 1;

      // 3 lines of context around the error
      const ctxStart = Math.max(0, lineIdx - 1);
      const ctxEnd = Math.min(document.lineCount - 1, lineIdx + 1);
      const ctxLines: string[] = [];
      for (let l = ctxStart; l <= ctxEnd; l++) { ctxLines.push(document.lineAt(l).text); }
      const context = ctxLines.join('\n');

      const explainPrompt =
        `Explain this error in plain English and tell me exactly how to fix it:\n\n` +
        `**Error:** \`${source}${errorMsg}\`\n` +
        `**File:** \`${relPath}\` line ${lineNo}\n\n` +
        `**Code around the error:**\n\`\`\`\n${context}\n\`\`\``;

      const fixPrompt =
        `Fix this error in \`${relPath}\` at line ${lineNo}:\n\n` +
        `**Error:** \`${source}${errorMsg}\`\n\n` +
        `**Code around the error:**\n\`\`\`\n${context}\n\`\`\``;

      lenses.push(new vscode.CodeLens(range, {
        title: '$(lightbulb) Explain error',
        command: 'redivivus.postToChat',
        arguments: [explainPrompt],
      }));
      lenses.push(new vscode.CodeLens(range, {
        title: '$(zap) Fix with Redivivus',
        command: 'redivivus.postToChat',
        arguments: [fixPrompt],
      }));
    }

    return lenses;
  }

  dispose(): void { this._onDidChangeCodeLenses.dispose(); }
}
