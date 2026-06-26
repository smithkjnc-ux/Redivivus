// [SCOPE] Architecture Map panel — handles runCommand messages
import * as vscode from 'vscode';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeRunCommand(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root } = ctx;

  if (msg.type === 'runCommand' && msg.nodeId && msg.command) {
    try {
      const uri = vscode.Uri.file(path.join(root, msg.nodeId));
      await vscode.window.showTextDocument(uri, { preserveFocus: false });
      await vscode.commands.executeCommand(msg.command);
    } catch { vscode.window.showErrorMessage(`Redivivus Map: Could not open ${msg.nodeId}`); }
  }
}
