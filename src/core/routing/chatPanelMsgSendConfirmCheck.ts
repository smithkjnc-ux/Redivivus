// [SCOPE] Build-confirmation fast-path + workspace file list helper.
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split — file hit 201 lines).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';

const _BUILD_CONFIRM = /\b(build\s+it|lets\s+(build|do)\s+it|go\s+ahead|make\s+it|start\s+building|lets\s+go)\b/i;
const _AGREEMENT = /^\s*(yes|yeah|yep|do it|proceed|go ahead|sure|ok|okay|sounds good)\s*[.!]?$|\b(sounds?\s+(good|great|perfect|awesome)|that('s|\s+is)?\s+(good|great|perfect|awesome)|love\s+it|exactly|yes.*build)\b/i;

// [RULE 18] Structural fast-path only — regex matches short agreement phrases, not intent.
// The cloud classifier cannot reach back into conversation history so this stays as code.
export async function checkBuildConfirmation(lowerText: string, userText: string, deps: MessageHandlerDeps, conversation: any[], refresh: () => void): Promise<boolean> {
  if (!(_BUILD_CONFIRM.test(lowerText) || _AGREEMENT.test(lowerText)) || lowerText.length >= 80) { return false; }
  let foundRequest = '';
  for (let i = conversation.length - 2; i >= 0; i--) {
    if (conversation[i].role === 'user') {
      const prior = conversation[i].content.toLowerCase();
      if (_BUILD_CONFIRM.test(prior) || _AGREEMENT.test(prior)) { continue; }
      foundRequest = conversation[i].content;
      break;
    }
  }
  if (foundRequest) {
    const { runConfirmedLocalBuild } = await import('./chatPanelMsgSendConfirmedBuild.js');
    await runConfirmedLocalBuild(foundRequest, userText, deps, conversation, refresh);
    return true;
  }
  conversation.push({ role: 'assistant', content: 'I\'m ready to build — what would you like me to make?', timestamp: Date.now() });
  refresh();
  return true;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '__pycache__', '.cache']);
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.scss', '.json', '.md', '.vue', '.svelte', '.go', '.rs', '.java', '.cpp', '.c', '.rb', '.php']);

// Returns relative source file paths so cloudChat can classify intent with project context.
export function getWorkspaceFileList(root: string, maxFiles = 80): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 3 || results.length >= maxFiles) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('.')) { continue; }
      const full = path.join(dir, entry);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) { walk(full, depth + 1); }
      } else if (SOURCE_EXTS.has(path.extname(entry))) {
        results.push(path.relative(root, full));
      }
    }
  }
  walk(root, 0);
  return results;
}
