// [SCOPE] Architecture Map panel — handles mapChat and chatAbout messages
import * as vscode from 'vscode';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeMapChat(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { map } = ctx;

  if (msg.type === 'mapChat' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    await vscode.commands.executeCommand('redivivus.mapContextChat', {
      nodeId: msg.nodeId, label: node?.label || msg.label || '',
      lines: node?.lines ?? msg.lines ?? 0, health: node?.health ?? msg.health ?? 'neutral',
      todos: node?.todos ?? msg.todos ?? 0,
    });
  } else if (msg.type === 'chatAbout' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    const promptText = msg.prompt
      ? msg.prompt
      : node
        ? `Tell me about \`${msg.nodeId}\`. It's described as: "${node.label}". Stats: ${node.lines} lines, ${node.todos} TODOs, ${node.warns} WARNs.`
        : `Tell me about \`${msg.nodeId}\`.`;
    await vscode.commands.executeCommand('redivivus.postToChat', promptText);
  }
}
