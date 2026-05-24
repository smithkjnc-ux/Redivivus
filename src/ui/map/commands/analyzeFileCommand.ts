// [SCOPE] Architecture Map panel — handles analyzeFile messages
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MapMsgCtx } from '../mapMessageDispatcher.js';

export async function executeAnalyzeFile(msg: any, ctx: MapMsgCtx): Promise<void> {
  const { root, map } = ctx;

  if (msg.type === 'analyzeFile' && msg.nodeId) {
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
  }
}
