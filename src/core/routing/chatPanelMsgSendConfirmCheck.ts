// [SCOPE] Build-confirmation fast-path + workspace file list helper.
// Extracted from chatPanelMsgSendMessage.ts (Rule 9 split — file hit 201 lines).

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { MessageHandlerDeps } from './chatPanelMessages';

// Regex fallbacks — used only when AI classifier is unavailable.
const _BUILD_CONFIRM = /\b(build\s+it|lets\s+(build|do)\s+it|go\s+ahead|make\s+it|start\s+building|lets\s+go)\b/i;
const _AGREEMENT     = /^\s*(yes|yeah|yep|do it|proceed|go ahead|sure|ok|okay|sounds good)\s*[.!]?$|\b(sounds?\s+(good|great|perfect|awesome)|that('s|\s+is)?\s+(good|great|perfect|awesome)|love\s+it|exactly|yes.*build)\b/i;

// [Rule 18] AI classifier determines whether the user is confirming a build.
// Length gate (< 80 chars) stays as a structural pre-filter — short messages only.
// Regex patterns are kept as catch-block fallback when the classifier is unavailable.
export async function checkBuildConfirmation(lowerText: string, userText: string, deps: MessageHandlerDeps, conversation: any[], refresh: () => void): Promise<boolean> {
  if (lowerText.length >= 80) { return false; }

  // AI classifier — include last assistant message as context so the model knows what they're confirming.
  let looksLikeAgreement = false;
  try {
    const lastAssistant = [...conversation].reverse().find((m: any) => m.role === 'assistant')?.content?.slice(0, 400) || '';
    const prompt = `Reply with YES or NO only. The user just sent a very short message. Is the user ONLY agreeing or confirming to proceed (e.g. "yes", "do it", "looks good")?
${lastAssistant ? `What the assistant just said: "${lastAssistant}"\n` : ''}User message: "${userText}"
Answer YES ONLY if the user is confirming a pending request WITHOUT providing any new instructions on what to build. If the user is telling you WHAT to build (e.g. "make a clock", "build a website"), answer NO.`;
    const result = await deps.routing.prompt(prompt, 12_000);
    looksLikeAgreement = result.success && !!result.text?.trim().toUpperCase().startsWith('YES');
  } catch {
    looksLikeAgreement = _BUILD_CONFIRM.test(lowerText) || _AGREEMENT.test(lowerText);
  }

  if (!looksLikeAgreement) { return false; }

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
