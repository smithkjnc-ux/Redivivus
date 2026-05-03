// [SCOPE] Annotation decoration — highlights [DONE], [NEXT], [TODO], [WARN], [DEAD], [SCOPE] in code

import * as vscode from 'vscode';

interface TagStyle {
  pattern: RegExp;
  decoration: vscode.TextEditorDecorationType;
}

export class AnnotationService {
  private tags: TagStyle[] = [];
  private disposables: vscode.Disposable[] = [];

  activate(context: vscode.ExtensionContext): void {
    // define tag styles
    this.tags = [
      this.createTag(/\/\/\s*\[DONE\].*/g,  '#4ec959', '✅'),
      this.createTag(/\/\/\s*\[NEXT\].*/g,  '#3b9dff', '➡️'),
      this.createTag(/\/\/\s*\[TODO\].*/g,  '#f5a623', '📋'),
      this.createTag(/\/\/\s*\[WARN\].*/g,  '#ff6b35', '⚠️'),
      this.createTag(/\/\/\s*\[DEAD\].*/g,  '#888888', '💀'),
      this.createTag(/\/\/\s*\[SCOPE\].*/g, '#c678dd', '🔒'),
      // also match # comment style (Python, YAML, etc)
      this.createTag(/#\s*\[DONE\].*/g,  '#4ec959', '✅'),
      this.createTag(/#\s*\[NEXT\].*/g,  '#3b9dff', '➡️'),
      this.createTag(/#\s*\[TODO\].*/g,  '#f5a623', '📋'),
      this.createTag(/#\s*\[WARN\].*/g,  '#ff6b35', '⚠️'),
      this.createTag(/#\s*\[DEAD\].*/g,  '#888888', '💀'),
      this.createTag(/#\s*\[SCOPE\].*/g, '#c678dd', '🔒'),
    ];

    // trigger on editor change
    const updateHandler = (editor: vscode.TextEditor | undefined) => {
      if (editor) { this.updateDecorations(editor); }
    };

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(updateHandler),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && e.document === editor.document) {
          this.updateDecorations(editor);
        }
      })
    );

    // initial update
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }

    context.subscriptions.push(...this.disposables);
  }

  private createTag(pattern: RegExp, color: string, _icon: string): TagStyle {
    const decoration = vscode.window.createTextEditorDecorationType({
      color: color,
      fontWeight: 'bold',
      backgroundColor: color + '15', // very subtle highlight
      borderRadius: '2px',
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    return { pattern, decoration };
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    const text = editor.document.getText();

    for (const tag of this.tags) {
      const ranges: vscode.DecorationOptions[] = [];
      let match;
      tag.pattern.lastIndex = 0;

      while ((match = tag.pattern.exec(text))) {
        const startPos = editor.document.positionAt(match.index);
        const endPos = editor.document.positionAt(match.index + match[0].length);
        ranges.push({ range: new vscode.Range(startPos, endPos) });
      }

      editor.setDecorations(tag.decoration, ranges);
    }
  }

  dispose(): void {
    for (const tag of this.tags) {
      tag.decoration.dispose();
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
