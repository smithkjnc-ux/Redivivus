// [SCOPE] Architecture Map panel — handles architectReview messages
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeArchitectReview(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root, map } = ctx;

  if (msg.type === 'architectReview' && msg.prompt) {
    // [WARN] Must NOT use redivivus.postToChat here — routes through fix-request -> build pipeline -> vault modal.
    //        redivivus.mapContextChat routes through map-context -> direct AI call, no build pipeline.
    // [FIX] Enrich with actual file content server-side. Webview only has topology metadata (connections,
    //       line counts, health). Single-file projects have 0 graph edges — Claude refuses a code review
    //       with no code. Read top 5 files (health-prioritized) and append real content to the prompt.
    let enrichedPrompt = msg.prompt;
    if (map.nodes.length > 0) {
      const topNodes = [...map.nodes]
        .sort((a: any, b: any) => (b.todos || 0) + (b.warns || 0) - ((a.todos || 0) + (a.warns || 0)))
        .slice(0, 5);
      const snippets: string[] = [];
      for (const node of topNodes) {
        try {
          const content = fs.readFileSync(path.join(root, node.id), 'utf8').split('\n').slice(0, 80).join('\n');
          if (content.trim()) { snippets.push('FILE: ' + node.id + '\n```\n' + content + '\n```'); }
        } catch { /* unreadable — skip */ }
      }
      if (snippets.length > 0) {
        enrichedPrompt = msg.prompt + '\n\nACTUAL FILE CONTENT (first 80 lines each, for your analysis):\n\n' + snippets.join('\n\n');
      }
    }
    // Request structured actions so per-action fix buttons can be rendered in chat
    enrichedPrompt += '\n\nAt the very end of your response output one line exactly like this (no explanation after):\n'
      + 'ACTIONS_JSON:[{"file":"relative/path","action":"fix|delete|create","label":"Short label (max 4 words)","description":"Specific instruction for Redivivus to execute"}]\n'
      + 'One entry per concrete quick-win from your review. Relative file paths only.';
    await vscode.commands.executeCommand('redivivus.mapContextChat', {
      nodeId: '', label: '', lines: 0, health: 'neutral', todos: 0,
      _explainPrompt: enrichedPrompt, _displayLabel: 'Architect Review',
    });
  }
}
