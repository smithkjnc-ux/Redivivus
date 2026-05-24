// [SCOPE] Architecture Map panel — handles fixFile messages
import * as vscode from 'vscode';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeFixFile(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { map } = ctx;

  if (msg.type === 'fixFile' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    const issueType = msg.issueType || (node && node.lines > 200 ? 'largeFile' : node && node.todos > 0 ? 'todo' : 'uncommented');
    const task = issueType === 'largeFile'
      ? `Split ${msg.nodeId} (${node?.lines} lines) into smaller files under 200 lines each.`
      : issueType === 'todo'
      ? `Review and implement the TODO markers in ${msg.nodeId}.`
      : issueType === 'refactor'
      ? `Refactor ${msg.nodeId} for clarity, simplicity, and best practices. Reduce complexity, improve naming, and remove dead code.`
      : `Add a [SCOPE] comment at the top of ${msg.nodeId} explaining what this file does.`;
    await vscode.commands.executeCommand('chassis.runEditFix', task, msg.nodeId, issueType);
  }
}
