// [SCOPE] CHASSIS Delegation CodeLens — "Fix this" and "Ask CHASSIS" buttons above [TODO] and [WARN] tags
// Appears inline in the editor above any annotated line. Routes through chassis.postToChat.

import * as vscode from 'vscode';
import * as path from 'path';

// Matches // [TODO], # [TODO], -- [TODO], <!-- [TODO] --> in any file
const TAG_RE = /(?:\/\/|#|--|<!--)\s*\[(TODO|WARN)\]\s*(.*?)(?:\s*-->)?$/;

export class DelegationCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const relPath = root ? path.relative(root, document.uri.fsPath) : path.basename(document.uri.fsPath);

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const m = TAG_RE.exec(line.text);
      if (!m) { continue; }

      const tag = m[1];
      const tagText = m[2].trim();
      const range = line.range;

      if (tag === 'TODO') {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(tools) Fix this with CHASSIS',
          command: 'chassis.postToChat',
          arguments: [`Fix the task at line ${i + 1} in \`${relPath}\`: ${tagText || 'complete the TODO'}`],
        }));
      } else if (tag === 'WARN') {
        lenses.push(new vscode.CodeLens(range, {
          title: '$(warning) Ask CHASSIS about this',
          command: 'chassis.postToChat',
          arguments: [`There is a warning flag at line ${i + 1} in \`${relPath}\`: ${tagText || 'review this section'} — can you explain what could go wrong and suggest a fix?`],
        }));
      }
    }
    return lenses;
  }
}
