// [SCOPE] Redivivus Chat Panel AI helpers — system prompt builder, command card renderer, response processor
// Extracted from chatPanelHtml.ts. Keep under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { RedivivusService } from '../../services/redivivusService';
import { LearnedMemoryService } from '../../services/learnedMemoryService';
import { getSystemPrompt } from './chatPanelAIPrompt';
import { buildProjectAnnotationContext } from '../project/chatPanelProjectContext';
import { Redivivus_WORKER_RULES } from '../../services/ai/redivivusWorkerRules';
import { extractFileMentions } from '../project/chatPanelFileContext';
import { selectRelevantTurns } from './contextSelector';

/** Builds the AI prompt prefix — question path gets Redivivus identity + annotations, code gen gets focused prompt
 *  isConvert: true = code generation (convert/build). false or undefined = Q&A (always conversational). */
export async function buildAIPrefix(redivivus: RedivivusService, recentMessages: string[] = [], routing?: any, fullConversation?: Array<{role: string; content: string}>, userText?: string, isConvert?: boolean): Promise<string> {
  const config = redivivus.isInitialized() ? redivivus.loadConfig() : null;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'none';
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
      const { resolveSourceFiles } = await import('../routing/chatPanelMsgFixContext.js');
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
  try { const { buildPromptInjection } = require('../../services/userMemoryService.js'); userProfileCtx = buildPromptInjection(); } catch {}
  // Attach snapshot note to prompt if we have a visual — multimodal models will see the image alongside
  const snapshotNote = previewSnapshot ? '\n[VISUAL CONTEXT: A screenshot of the running preview is attached. Use it to answer visual questions accurately.]\n' : '';
  return `${prompt}\n${userProfileCtx ? userProfileCtx + '\n' : ''}${projectContext}${activeFileContext}${conversationContext}${snapshotNote}\nUser:`;
}

/** Returns the most recent visual snapshot from the live preview server, if any.
 *  Used by Q&A path to attach a screenshot to the AI call so it can reason visually. */
export function getPreviewSnapshot(): { data: string; mimeType: string } | undefined {
  try {
    const { getRuntimeReports } = require('../../ui/panels/chat/chatPanelPreview.js');
    const reports: Array<{ kind: string; msg: string; image?: string }> = getRuntimeReports();
    const snap = [...reports].reverse().find(r => (r.kind === 'snapshot' || r.kind === 'probe') && r.image);
    if (snap?.image) {
      const raw = snap.image.replace(/^data:[^;]+;base64,/, '');
      if (raw.length > 100) { return { data: raw, mimeType: 'image/jpeg' }; }
    }
  } catch { /* preview not running — non-fatal */ }
  return undefined;
}

// [SCOPE] Focused code generation prompt — bypasses Redivivus identity noise entirely
// [WARN] This is the key difference vs Antigravity. Antigravity reads the whole file and uses a focused prompt.
// Redivivus was wrapping code gen in 44 lines of identity/capabilities/behavioral rules that distracted the AI.
function buildCodeGenPrefix(userText: string, workspaceRoot: string): string {
  // 1. Find source files — read from disk, don't rely on activeTextEditor
  let sourceCode = '';
  const srcFiles = findSourceFiles(userText, workspaceRoot);
  if (srcFiles.length > 0) {
    for (const sf of srcFiles) {
      sourceCode += `\n--- SOURCE FILE: ${sf.relPath} (${sf.lineCount} lines) ---\n\`\`\`\n${sf.content}\n\`\`\`\n`;
    }
  } else {
    // Fall back to active editor
    try {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const filePath = editor.document.uri.fsPath;
        const relPath = workspaceRoot !== 'none' ? path.relative(workspaceRoot, filePath) : filePath;
        const content = editor.document.getText();
        sourceCode = `\n--- ACTIVE FILE: ${relPath} ---\n\`\`\`\n${content}\n\`\`\`\n`;
      }
    } catch {}
  }

  return `You are a code generator. Your job is to convert/create code exactly as requested.

RULES:
- Write the COMPLETE, FULLY FUNCTIONAL file. Every function, every variable, every line.
- Port ALL logic from the source. Do not skip, summarize, or stub any section.
- The output must work immediately when opened in a browser. Zero missing pieces.
- Output ONLY the code inside a single fenced code block. No explanations, no comments about what you did.
- For browser targets: single self-contained HTML file with inline <style> and <script>.
- Convert TypeScript constructs (enums, interfaces, type annotations) to plain JavaScript equivalents.
- Preserve all constants, physics values, colors, dimensions, and game logic exactly.

${Redivivus_WORKER_RULES}
${sourceCode}
User:`;
}

// [SCOPE] Find source files referenced in user message — reads from disk, not activeTextEditor
// [WARN] This is critical: when user is in the chat panel, activeTextEditor may not have the right file.
export interface SourceFile { relPath: string; content: string; lineCount: number; }
/** Find source files in the project — reads from disk, not activeTextEditor */
export function findSourceFiles(userText: string, workspaceRoot: string): SourceFile[] {
  if (workspaceRoot === 'none') { return []; }
  const results: SourceFile[] = [];
  try {
    // Strategy: find the main source files in the project
    // Look for references like "the TypeScript file", "the .ts file", project name mentions
    const srcDir = path.join(workspaceRoot, 'src');
    const searchDirs = [srcDir, workspaceRoot];
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb'];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) { continue; }
      const files = fs.readdirSync(dir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return codeExts.includes(ext) && !f.endsWith('.d.ts') && f !== 'vite-env.d.ts';
      });
      for (const file of files) {
        const absPath = path.join(dir, file);
        const stat = fs.statSync(absPath);
        if (stat.isFile() && stat.size < 100_000) {
          const content = fs.readFileSync(absPath, 'utf8');
          const lineCount = content.split('\n').length;
          if (lineCount > 10) { // Only include substantial files
            results.push({ relPath: path.relative(workspaceRoot, absPath), content, lineCount });
          }
        }
      }
      if (results.length > 0) { break; } // Found files in src/, don't also scan root
    }
  } catch { /* best-effort */ }
  return results.slice(0, 3); // Cap at 3 files to avoid token explosion
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
