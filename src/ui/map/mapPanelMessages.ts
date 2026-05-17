// [SCOPE] Architecture Map panel — webview message handlers (file inspection, chat, fix, architect review)
// Context pattern: MapMsgCtx passes panel state to handlers without class refs.
// Timeline messages (tl-*) are delegated to mapPanelTimelineMessages.ts.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectMap } from '../../services/mapBuilderService.js';
import { GuardianService } from '../../services/ai/guardianService.js';
import { handleMapTimelineMessage } from './mapPanelTimelineMessages.js';

export interface MapMsgCtx {
  root: string;
  map: ProjectMap;
  webview: vscode.Webview;
  guardian: GuardianService;
  panel: vscode.WebviewPanel;
  refresh: () => void;
}

export async function handleMapMessage(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root, map, webview, guardian, panel } = ctx;

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
          const labelWords = msg.label.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          const flat: vscode.DocumentSymbol[] = [];
          const flatten = (syms: vscode.DocumentSymbol[]) => { syms.forEach(s => { flat.push(s); if (s.children) flatten(s.children); }); };
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
    } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

  } else if (msg.type === 'openFile' && msg.nodeId) {
    try {
      const uri = vscode.Uri.file(path.join(root, msg.nodeId));
      await vscode.window.showTextDocument(uri, { preserveFocus: false });
    } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

  } else if (msg.type === 'mapChat' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    await vscode.commands.executeCommand('chassis.mapContextChat', {
      nodeId: msg.nodeId, label: node?.label || msg.label || '',
      lines: node?.lines ?? msg.lines ?? 0, health: node?.health ?? msg.health ?? 'neutral',
      todos: node?.todos ?? msg.todos ?? 0,
    });

  } else if (msg.type === 'explainFile' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    let codeSnippet = '';
    try { codeSnippet = fs.readFileSync(path.join(root, msg.nodeId), 'utf8').split('\n').slice(0, 80).join('\n'); } catch { /* not readable */ }
    const prompt = codeSnippet
      ? `You are explaining code to a non-technical user. Read this file and explain it clearly.\n\nFile: ${msg.nodeId}\n\n\`\`\`\n${codeSnippet}\n\`\`\`\n\nAnswer these questions in plain English:\n1. What does this file do?\n2. Why does it exist -- what problem does it solve?\n3. How does it fit into the project?\n4. What should a developer know before touching it?\n\nKeep the total response under 200 words. No jargon.`
      : `Explain \`${msg.nodeId}\` (${msg.lines || node?.lines || '?'} lines, ${msg.health || node?.health || 'unknown'} health). What does it do, why does it exist, how does it fit into the project? Under 150 words.`;
    await vscode.commands.executeCommand('chassis.mapContextChat', {
      nodeId: msg.nodeId, label: msg.label || node?.label || '',
      lines: msg.lines || node?.lines || 0, health: msg.health || node?.health || 'neutral',
      todos: msg.todos || node?.todos || 0, _explainPrompt: prompt,
    });

  } else if (msg.type === 'analyzeFile' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    let code = '';
    try { code = fs.readFileSync(path.join(root, msg.nodeId), 'utf8').split('\n').slice(0, 120).join('\n'); } catch { /* ignore */ }
    const modePrompts: Record<string, string> = {
      trace: code
        ? `You are a code analyst. Read this file and trace the complete logic flow in plain English.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nFor every function or logical section:\n- What triggers it?\n- What does it do step by step?\n- What does it return or produce?\n\nNumber each step. Plain English only -- no jargon. If there are branching paths, explain each branch.`
        : `Trace the complete logic flow for \`${msg.nodeId}\`. Follow every function call and explain each step in plain English as a numbered list.`,
      test: code
        ? `You are a test engineer. Read this file and write a complete test plan in plain English.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nList:\n1. Every function/feature that needs a test\n2. The normal cases to test\n3. The edge cases and error conditions\n4. What a passing test looks like for each\n\nDo NOT write code -- just describe what to test and why.`
        : `Describe a complete test plan for \`${msg.nodeId}\`. List every function to test, normal cases, edge cases, and error conditions in plain English.`,
      improve: code
        ? `You are a code reviewer. Read this file and identify improvements.\n\nFile: ${msg.nodeId}\n\`\`\`\n${code}\n\`\`\`\n\nIdentify:\n1. The biggest structural problem\n2. Any missing error handling\n3. Performance concerns\n4. A simpler way to achieve the same result\n\nBe specific and direct. Reference actual line numbers or function names.`
        : `Critically review \`${msg.nodeId}\` and suggest concrete improvements. Look for simpler architecture, missing error handling, performance issues. Be specific.`,
    };
    const displayLabels: Record<string, string> = { trace: 'Trace logic of', test: 'Test plan for', improve: 'Improve' };
    await vscode.commands.executeCommand('chassis.mapContextChat', {
      nodeId: msg.nodeId, label: msg.label || node?.label || '',
      lines: msg.lines || node?.lines || 0, health: msg.health || node?.health || 'neutral',
      todos: msg.todos || node?.todos || 0,
      _explainPrompt: modePrompts[msg.mode] || modePrompts['trace'],
      _displayLabel: displayLabels[msg.mode] || 'Analyze',
    });

  } else if (msg.type === 'chatAbout' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    const promptText = msg.prompt
      ? msg.prompt
      : node
        ? `Tell me about \`${msg.nodeId}\`. It's described as: "${node.label}". Stats: ${node.lines} lines, ${node.todos} TODOs, ${node.warns} WARNs.`
        : `Tell me about \`${msg.nodeId}\`.`;
    await vscode.commands.executeCommand('chassis.postToChat', promptText);

  } else if (msg.type === 'runCommand' && msg.nodeId && msg.command) {
    try {
      const uri = vscode.Uri.file(path.join(root, msg.nodeId));
      await vscode.window.showTextDocument(uri, { preserveFocus: false });
      await vscode.commands.executeCommand(msg.command);
    } catch { vscode.window.showErrorMessage(`CHASSIS Map: Could not open ${msg.nodeId}`); }

  } else if (msg.type === 'fixFile' && msg.nodeId) {
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

  } else if (msg.type === 'architectReview' && msg.prompt) {
    // [WARN] Must NOT use chassis.postToChat here — routes through fix-request -> build pipeline -> vault modal.
    //        chassis.mapContextChat routes through map-context -> direct AI call, no build pipeline.
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
      + 'ACTIONS_JSON:[{"file":"relative/path","action":"fix|delete|create","label":"Short label (max 4 words)","description":"Specific instruction for CHASSIS to execute"}]\n'
      + 'One entry per concrete quick-win from your review. Relative file paths only.';
    await vscode.commands.executeCommand('chassis.mapContextChat', {
      nodeId: '', label: '', lines: 0, health: 'neutral', todos: 0,
      _explainPrompt: enrichedPrompt, _displayLabel: 'Architect Review',
    });

  } else if (msg.type === 'back-to-chat') {
    panel.dispose();
    await vscode.commands.executeCommand('chassis.openChat');

  } else if (msg.type === 'refresh') {
    ctx.refresh();

  } else if (msg.type === 'getELI5' && msg.nodeId) {
    const node = map.nodes.find(n => n.id === msg.nodeId);
    if (node) {
      const technical = `File health is ${node.health}. Issues: ${node.todos} TODOs, ${node.warns} WARNs. Lines: ${node.lines}. matchesBlueprint: ${node.matchesBlueprint}`;
      const eli5 = guardian.translateToELI5(technical, 'map-hover');
      webview.postMessage({ type: 'eli5-response', nodeId: msg.nodeId, text: eli5.plainEnglish });
    }

  } else {
    await handleMapTimelineMessage(msg, ctx);
  }
}
