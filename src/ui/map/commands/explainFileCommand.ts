// [SCOPE] Architecture Map panel — handles explainFile messages
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeExplainFile(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root, map } = ctx;

  if (msg.type === 'explainFile' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    let codeSnippet = '';
    try { codeSnippet = fs.readFileSync(path.join(root, msg.nodeId), 'utf8').split('\n').slice(0, 80).join('\n'); } catch { /* not readable */ }
    const prompt = codeSnippet
      ? `You are explaining code to a non-technical user. Read this file and explain it clearly.\n\nFile: ${msg.nodeId}\n\n\`\`\`\n${codeSnippet}\n\`\`\`\n\nAnswer these questions in plain English:\n1. What does this file do?\n2. Why does it exist -- what problem does it solve?\n3. How does it fit into the project?\n4. What should a developer know before touching it?\n\nKeep the total response under 200 words. No jargon.`
      : `Explain \`${msg.nodeId}\` (${msg.lines || node?.lines || '?'} lines, ${msg.health || node?.health || 'unknown'} health). What does it do, why does it exist, how does it fit into the project? Under 150 words.`;
    await vscode.commands.executeCommand('redivivus.mapContextChat', {
      nodeId: msg.nodeId, label: msg.label || node?.label || '',
      lines: msg.lines || node?.lines || 0, health: msg.health || node?.health || 'neutral',
      todos: msg.todos || node?.todos || 0, _explainPrompt: prompt,
    });
  }
}
