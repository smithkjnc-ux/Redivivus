// [SCOPE] Architecture Map panel — handles architectReview messages
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';
import { buildProjectMap } from '../../../services/mapBuilderService.js';

export async function executeArchitectReview(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root } = ctx;
  // [FIX] Rebuild the topology FRESH from disk. The webview's GRAPH_DATA (the basis of msg.prompt) is a snapshot
  // frozen when the map was last opened/refreshed — the map has no file-watcher. After a fix wires new imports,
  // that snapshot is stale and reports "0 connections / ISOLATED FILES (possibly dead code)", which made the
  // architect call fully-wired, healthy code CRITICAL (cry-wolf, Design Rule 1). Use the live graph for the
  // file-content enrichment AND append an authoritative topology block the AI must trust over the stale stats.
  let map = ctx.map;
  try { const fresh = buildProjectMap(root); if (fresh && fresh.nodes.length > 0) { map = fresh; } } catch { /* keep snapshot */ }

  if (msg.type === 'architectReview' && msg.prompt) {
    // [WARN] Must NOT use redivivus.postToChat here — routes through fix-request -> build pipeline -> vault modal.
    //        redivivus.mapContextChat routes through map-context -> direct AI call, no build pipeline.
    // [BLUEPRINT-REVIEW] Read the blueprint from disk and substitute it into the prompt so the AI
    // can compare what was spec'd against what was actually built.
    let blueprintBlock = 'PROJECT BLUEPRINT: No blueprint found. Judge the project solely from the file content below.';
    try {
      const bpPath = path.join(root, '.redivivus', 'blueprint.md');
      if (fs.existsSync(bpPath)) {
        const bpRaw = fs.readFileSync(bpPath, 'utf8').trim();
        if (bpRaw) { blueprintBlock = 'PROJECT BLUEPRINT (what this project was designed to be):\n' + bpRaw; }
      }
    } catch { /* blueprint unreadable — use fallback */ }
    // [FIX] Enrich with actual file content server-side. Webview only has topology metadata (connections,
    //       line counts, health). Single-file projects have 0 graph edges — Claude refuses a code review
    //       with no code. Read top 5 files (health-prioritized) and append real content to the prompt.
    let enrichedPrompt = msg.prompt.replace('__BLUEPRINT_PLACEHOLDER__', blueprintBlock);
    if (map.nodes.length > 0) {
      const topNodes = [...map.nodes]
        .sort((a: any, b: any) => (b.todos || 0) + (b.warns || 0) - ((a.todos || 0) + (a.warns || 0)))
        .slice(0, 5);
      const snippets: string[] = [];
      // [FIX] Single-file projects (e.g. self-contained games) need the full file read — 80 lines
      // only captures constants/setup, leaving the AI blind to actual game logic, collision detection,
      // game loops, etc. For single-file projects read up to 600 lines. For multi-file read 300.
      const isSingleFile = map.nodes.length === 1;
      const lineLimit = isSingleFile ? 600 : 300;
      for (const node of topNodes) {
        try {
          const content = fs.readFileSync(path.join(root, node.id), 'utf8').split('\n').slice(0, lineLimit).join('\n');
          if (content.trim()) { snippets.push('FILE: ' + node.id + '\n```\n' + content + '\n```'); }
        } catch { /* unreadable — skip */ }
      }
      if (snippets.length > 0) {
        const contentLabel = isSingleFile ? 'ACTUAL FILE CONTENT (full file)' : 'ACTUAL FILE CONTENT (first 300 lines each)';
        enrichedPrompt += '\n\n' + contentLabel + ':\n\n' + snippets.join('\n\n');
      }
    }
    // [FIX] Authoritative current graph — overrides any stale "0 connections / isolated" stats baked into the
    // prompt from the webview snapshot. This is what kills the false CRITICAL on healthy, wired code.
    const conns = (map.edges || []).map((e: any) => '  ' + e.from + ' -> ' + e.to).join('\n');
    enrichedPrompt += '\n\nAUTHORITATIVE CURRENT TOPOLOGY (rebuilt from disk just now -- TRUST THIS over any earlier '
      + '"connections"/"isolated files"/"dead code" stats above, which may be a stale map snapshot):\n'
      + map.nodes.length + ' file(s), ' + (map.edges || []).length + ' import connection(s)\n'
      + ((map.edges || []).length ? conns : '  (no import edges found)') + '\n';
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
