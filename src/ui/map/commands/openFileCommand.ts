// [SCOPE] Architecture Map panel — handles openFileAtSymbol and openFile messages
import * as vscode from 'vscode';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeOpenFile(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root } = ctx;

  if (msg.type === 'openFileAtSymbol' && msg.nodeId) {
    try {
      const uri = vscode.Uri.file(path.join(root, msg.nodeId));
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
      if (msg.label) {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider', uri
        );
        if (symbols && symbols.length > 0) {
          const labelWords = msg.label.toLowerCase().split(/\\s+/).filter((w: string) => w.length > 3);
          const flat: vscode.DocumentSymbol[] = [];
          const flatten = (syms: vscode.DocumentSymbol[]) => { syms.forEach(s => { flat.push(s); if (s.children) {flatten(s.children);} }); };
          flatten(symbols);
          const scored = flat.map(s => {
            const name = s.name.toLowerCase();
            const score = labelWords.filter((w: string) => name.includes(w)).length;
            return { s, score };
          }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
          if (scored.length > 0) {
            const target = scored[0].s.selectionRange.start;
            editor.revealRange(scored[0].s.range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(target, target);
          }
        }
      }
    } catch { vscode.window.showErrorMessage(`Redivivus Map: Could not open ${msg.nodeId}`); }
  } else if (msg.type === 'openFile' && msg.nodeId) {
    try {
      const uri = vscode.Uri.file(path.join(root, msg.nodeId));
      await vscode.window.showTextDocument(uri, { preserveFocus: false });
    } catch { vscode.window.showErrorMessage(`Redivivus Map: Could not open ${msg.nodeId}`); }
  }
}
