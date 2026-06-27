// [SCOPE] Redivivus Chat Panel AI helpers — system prompt builder, command card renderer, response processor
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../../features/vscode/logic/redivivusService.js';
import { LearnedMemoryService } from '../../../features/chat/logic/learnedMemoryService.js';
import { getSystemPrompt } from './chatPanelAIPrompt.js';
import { buildProjectAnnotationContext } from '../../../features/project/logic/chatPanelProjectContext.js';
import { Redivivus_WORKER_RULES } from '../data/redivivusWorkerRules.js';
import { extractFileMentions } from '../../../features/project/logic/chatPanelFileContext.js';
import { getActiveProjectRoot } from '../../../features/project/logic/activeProjectRoot.js';
import { selectRelevantTurns } from './contextSelector.js';
import { buildCodeGenPrefix } from './chatPanelAICodeGen.js';

/** Builds the AI prompt prefix — question path gets Redivivus identity + annotations, code gen gets focused prompt
 *  isConvert: true = code generation (convert/build). false or undefined = Q&A (always conversational). */
export async function buildAIPrefix(redivivus: RedivivusService, recentMessages: string[] = [], routing?: any, fullConversation?: Array<{role: string; content: string}>, userText?: string, isConvert?: boolean): Promise<string> {
  const config = redivivus.isInitialized() ? redivivus.loadConfig() : null;
  // [FIX] Use getActiveProjectRoot() so we resolve to chess-ai-game, not the projects container.
  // vscode.workspace.workspaceFolders[0] points at the container (~/projects/games) when Model A
  // is active, causing resolveSourceFiles to scan ALL projects instead of the active one.
  const workspaceRoot = getActiveProjectRoot({ redivivus }) || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'none';
  const bp = config?.blueprint;

  // [Redivivus] Code gen prompt ONLY for explicit convert/build paths (isConvert=true).
  // [FIX] Q&A path (isConvert=false) ALWAYS gets the conversational prompt — no keyword detection.
  // This prevents typos like "re you able to make X?" from triggering code gen because "make" was in the text.
  if (isConvert && userText && /\b(convert|turn|transform|rewrite|replace|port|rebuild|build|create|make|generate|write|implement)\b/i.test(userText)) {
    return buildCodeGenPrefix(userText, workspaceRoot);
  }

  let bpStr = 'No blueprint set.';
  if (bp) {
    bpStr = ['who','what','where','when','why'].map(f => `${f.toUpperCase()}: ${String(bp[f as keyof typeof bp] || '(not set)').trim()}`).join('\n');
    if (bp.revision && bp.revision > 1 && bp.revisions?.length) {
      bpStr += `\n(Revision ${bp.revision} — ${bp.revisions.length} previous version${bp.revisions.length !== 1 ? 's' : ''} preserved)`;
    }
  }

  // [Redivivus] If user mentions a specific file, find and inject it — never make the user paste content.
  let activeFileContext = '';
  if (userText && workspaceRoot !== 'none') {
    const mentioned = extractFileMentions(userText, workspaceRoot);
    if (mentioned.length > 0) {
      activeFileContext = mentioned.map(f => `\n--- FILE: ${f.relPath} (${f.content.split('\n').length} lines) ---\n\`\`\`\n${f.content.slice(0, 10000)}\n\`\`\``).join('\n') + '\n';
    }
  }
  // [FIX] If no file was explicitly mentioned, use AI file-picker (resolveSourceFiles) to inject
  // the most relevant project source files for the question. The previous fallback used
  // activeTextEditor which points at the chat panel webview — not the user's code — so the AI
  // answered generically instead of auditing the actual project. (Jun 24, 2026)
  if (!activeFileContext && workspaceRoot !== 'none' && userText) {
    try {
      const { resolveSourceFiles } = await import('../../../features/fix/chatPanelMsgFixContext.js');
      const files = await resolveSourceFiles(workspaceRoot, userText, { routing });
      if (files.length > 0) {
        activeFileContext = '\n--- CURRENT PROJECT SOURCE FILES (READ THESE to answer questions about behavior, appearance, rendering, bugs) ---'
          + files.slice(0, 5).map(f => `\n--- FILE: ${f.rel} ---\n\`\`\`\n${f.content.slice(0, 8000)}\n\`\`\``).join('\n') + '\n';
      }
    } catch {
      // Fallback: active editor (may be chat panel, best-effort)
      try {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const filePath = editor.document.uri.fsPath;
          const relPath = path.relative(workspaceRoot, filePath);
          const lines = editor.document.getText().split('\n');
          const maxLines = Math.min(lines.length, 500);
          const truncNote = lines.length > maxLines ? `\n(truncated: showing ${maxLines} of ${lines.length} lines)` : '';
          activeFileContext = `\n--- ACTIVE FILE: ${relPath} (${lines.length} lines) ---\n\`\`\`\n${lines.slice(0, maxLines).join('\n')}\n\`\`\`${truncNote}\n`;
        }
      } catch {}
    }
  }

  let conversationContext = '';
  if (fullConversation && routing) {
    // [DONE] Rule 18 — AI selects relevant turns; short convs skip AI call entirely (≤6 turns)
    const selected = await selectRelevantTurns(fullConversation, userText || '', routing);
    if (selected) { conversationContext = '\n--- HISTORY ---\n' + selected + '\n'; }
  }

  const previewSnapshot = getPreviewSnapshot();
  const prompt = getSystemPrompt(bpStr);
  // [Redivivus] Inject annotation-driven project context — the AI sees [SCOPE] from ALL files
  // in ~200 tokens instead of loading 50,000 tokens of raw code. This is the Redivivus advantage.
  const projectContext = buildProjectAnnotationContext(workspaceRoot);
  // [FIX] Inject user memory profile (~30 tokens, 0 AI cost to learn)
  let userProfileCtx = '';
  try { const { buildPromptInjection } = require('../../chat/logic/userMemoryService.js'); userProfileCtx = buildPromptInjection(); } catch {}
  // Attach snapshot note to prompt if we have a visual — multimodal models will see the image alongside
  const snapshotNote = previewSnapshot ? '\n[VISUAL CONTEXT: A screenshot of the running preview is attached. Use it to answer visual questions accurately.]\n' : '';
  return `${prompt}\n${userProfileCtx ? userProfileCtx + '\n' : ''}${projectContext}${activeFileContext}${conversationContext}${snapshotNote}\nUser:`;
}

/** Returns the most recent visual snapshot from the live preview server, if any.
 *  Used by Q&A path to attach a screenshot to the AI call so it can reason visually. */
export function getPreviewSnapshot(): { data: string; mimeType: string } | undefined {
  try {
    const { getRuntimeReports } = require('../../chat/ui/chatPanelPreview.js');
    const reports: Array<{ kind: string; msg: string; image?: string }> = getRuntimeReports();
    const snap = [...reports].reverse().find(r => (r.kind === 'snapshot' || r.kind === 'probe') && r.image);
    if (snap?.image) {
      const raw = snap.image.replace(/^data:[^;]+;base64,/, '');
      if (raw.length > 100) { return { data: raw, mimeType: 'image/jpeg' }; }
    }
  } catch { /* preview not running — non-fatal */ }
  return undefined;
}



/** Map VS Code command IDs to human-readable labels for action cards */
export function commandLabel(command: string): string {
  const labels: Record<string, string> = {
    'redivivus.startSession': '🚀 Start Session', 'redivivus.endSession': '🏁 End Session',
    'redivivus.wizardRetrofit': '🆕 New Project', 'redivivus.analyze': '🔍 Analyze',
    'redivivus.openVault': '💾 Vault', 'redivivus.savePoint': '💾 Save Point'
  };
  return labels[command] || `▶ Run: ${command}`;
}

const SAFE_COMMANDS = ['redivivus.showMap', 'redivivus.viewUsageInChat', 'redivivus.log', 'redivivus.deadends', 'redivivus.openVault'];

/** Process AI response — extract commands, generate action cards */
export function processAIResponse(text: string): { text: string; executedCommand: boolean } {
  const match = text.match(/\[\[COMMAND:(\w+(?:\.\w+)*)\]\]/);
  if (match) {
    const cmd = match[1];
    if (SAFE_COMMANDS.includes(cmd)) {
      vscode.commands.executeCommand(cmd).then(() => {}, () => {});
      return { text: text.replace(match[0], '').trim(), executedCommand: true };
    }
    return { text: text.replace(match[0], `__ACTION_CARD__${cmd}|||${commandLabel(cmd)}|||END__`).trim(), executedCommand: false };
  }
  return { text, executedCommand: false };
}
