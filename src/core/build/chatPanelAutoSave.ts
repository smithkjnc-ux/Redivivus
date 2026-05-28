// [SCOPE] Chat Panel Auto-Save — detects substantial code in AI responses, saves to project, opens in editor
// Matches Antigravity behavior: generate -> save -> open -> confirm. Keep under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { applyRedivivusStructure } from '../../ui/panels/chat/chatPanelCodeStructure';
import type { RoutingService } from '../../services/ai/routingService';

// Minimum lines in a code block to qualify for auto-save
const MIN_AUTO_SAVE_LINES = 10;

// Extension map for language tag -> file extension
const EXT_MAP: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  jsx: 'jsx', tsx: 'tsx', python: 'py', py: 'py',
  ruby: 'rb', rb: 'rb', go: 'go', rust: 'rs', rs: 'rs',
  java: 'java', kotlin: 'kt', swift: 'swift', c: 'c', cpp: 'cpp',
  cs: 'cs', php: 'php', sh: 'sh', bash: 'sh', shell: 'sh',
  json: 'json', yaml: 'yaml', yml: 'yml', toml: 'toml',
  sql: 'sql', md: 'md', markdown: 'md', xml: 'xml', svg: 'svg',
};

// [DONE] BUILD_VERB_RE replaced with AI classifier per Rule 18.

interface AutoSaveTarget {
  code: string;
  filename: string;
  lang: string;
}

export { shouldAutoSave } from './chatPanelAutoSaveInference';

/** Extracts the auto-save target (code + filename) from an AI response */
export function extractAutoSaveTarget(aiResponse: string, userMessage: string, root?: string): AutoSaveTarget | null {
  // Try closed block first, then unclosed (truncated) block
  let match = aiResponse.match(/```(\w*)[^\S\r\n]*\r?\n([\s\S]*?)```/);
  if (!match) {
    // [WARN] Handle truncated response — AI hit output token limit before closing the fence
    const unclosedMatch = aiResponse.match(/```(\w*)[^\S\r\n]*\r?\n([\s\S]+)$/);
    if (unclosedMatch) { match = unclosedMatch; }
  }
  if (!match) { return null; }

  const lang = match[1] || '';
  const code = match[2].trim();
  if (code.split('\n').length < MIN_AUTO_SAVE_LINES) { return null; }

  const ext = EXT_MAP[lang.toLowerCase()] || (lang ? lang : 'txt');

  // Try to detect filename from first-line comment or SCOPE tag
  const firstLine = code.split('\n')[0]?.trim() || '';
  const fnMatch = firstLine.match(/\/\/\s*([\w.\-/]+\.[a-z0-9]+)/i)
               || firstLine.match(/\/\*\s*([\w.\-/]+\.[a-z0-9]+)\s*\*\//i)
               || firstLine.match(/<!--\s*([\w.\-/]+\.[a-z0-9]+)\s*-->/i)
               || firstLine.match(/\[SCOPE\]\s*([\w.\-/]+\.[a-z0-9]+)/i)
               || firstLine.match(/#\s*([\w.\-/]+\.[a-z0-9]+)/i);

  let filename: string;
  if (fnMatch) {
    filename = fnMatch[1];
  } else {
    // Derive from user message or fall back to default
    filename = deriveFilenameFromMessage(userMessage, ext, root);
  }

  return { code, filename, lang };
}

/** Derives a sensible filename from the user's message or the existing directory contents */
function deriveFilenameFromMessage(message: string, ext: string, root?: string): string {
  // Check if there is exactly one matching file in the root directory
  if (root) {
    try {
      if (fs.existsSync(root)) {
        const files = fs.readdirSync(root).filter(f => !f.startsWith('.') && f.endsWith('.' + ext) && fs.statSync(path.join(root, f)).isFile());
        if (files.length === 1) {
          return files[0];
        }
      }
    } catch { /* best effort */ }
  }

  // "convert the flappy-bird game to HTML" -> "flappy-bird.html"
  const nameMatch = message.match(/\b([\w-]+)\s+(game|app|page|site|component|widget|tool)\b/i);
  if (nameMatch) {
    return `${nameMatch[1].toLowerCase()}.${ext}`;
  }
  // Default: index for HTML, main for others
  if (ext === 'html') { return 'index.html'; }
  return `main.${ext}`;
}

/** Writes code to disk, opens in editor, returns confirmation message */
export async function autoSaveAndOpen(
  code: string, filename: string, root: string,
  meta?: { model?: string; tokens?: number },
): Promise<string> {
  const projectsDir = vscode.workspace.getConfiguration('redivivus')
    .get<string>('projectsDirectory', '~/projects')!
    .replace('~', require('os').homedir());

  // If no workspace or projects container, create a proper project folder with full scaffold
  const isProjectsContainer = (r: string) => path.resolve(r) === path.resolve(projectsDir);
  if (!root || root === 'none' || isProjectsContainer(root)) {
    const stem = path.basename(filename, path.extname(filename)).replace(/[^a-z0-9_-]/gi, '_') || 'project';
    root = path.join(projectsDir, stem);
    const { scaffoldAt } = await import('../../services/project/redivivusInit.js');
    await scaffoldAt(root, stem);
  }

  const absPath = path.join(root, filename);

  // Apply Redivivus structure rules (generate first, structure after)
  let finalCode = applyRedivivusStructure(code, filename);

  // Strip JSON comments if target is .json
  if (filename.toLowerCase().endsWith('.json')) {
    finalCode = finalCode.split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
  }

  // Write file
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  fs.writeFileSync(absPath, finalCode, 'utf8');

  // Open in editor — only if we already have a workspace open (openFolder reloads the window)
  const currentRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const isSameRoot = currentRoot && path.resolve(currentRoot).toLowerCase() === path.resolve(root).toLowerCase();
  
  if (isSameRoot) {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch { /* best-effort */ }
  }

  // Signal build finished so vault capture, session recording, etc. all fire
  try {
    const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
    ChatPanel.onBuildFinished?.('auto-save', [absPath], root);
  } catch { /* best-effort */ }

  // [Redivivus] Rich result card with AI attribution
  const modelLabel = meta?.model ?? 'AI';
  const tokenStr = meta?.tokens ? ` (~${meta.tokens.toLocaleString()} tokens)` : '';
  // [FIX] Open the project folder in a NEW window if no folder is currently open or it's different.
  // We use forceNewWindow = true to guarantee we bypass the "Save Workspace" dialog entirely.
  // The user is trapped in a dirty "Untitled (Workspace)" state, and opening in a new window is the only programmatic escape.
  if (!isSameRoot) {
    try {
      const { ChatPanel } = await import('../../ui/panels/chat/chatPanel.js');
      const ctx = ChatPanel.extensionContext;
      if (ctx) {
        // Persist the build result so it shows after the new window opens
        ctx.globalState.update('redivivus.pendingBuildResult', {
          filename, root, model: meta?.model, tokens: meta?.tokens,
          absPath, timestamp: Date.now(),
        });
      }
    } catch { /* best-effort */ }
    
    // If they have NO workspace open, replace the current window.
    // If they have a DIFFERENT workspace open, open a new window to preserve their current work.
    const shouldNewWindow = !!currentRoot;
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(root), { forceNewWindow: shouldNewWindow });
    
    // Explicitly inform the user that a new window was opened
    const windowMsg = shouldNewWindow ? '\n\n> [!TIP]\n> **Project opened in a new window!**\n> Please switch to the new VS Code window to see your files.' : '\n\n> [!TIP]\n> **Project opened!**';
    return `__RESULT_CARD__\n✅ Done! Built 1 file\n\n- \`${filename}\`\n\n*Built with ${modelLabel}${tokenStr}*\n__END_RESULT_CARD__${windowMsg}`;
  }

  const resultMsg = `__RESULT_CARD__\n✅ Done! Built 1 file\n\n- \`${filename}\`\n\n*Built with ${modelLabel}${tokenStr}*\n__END_RESULT_CARD__\n__BUILD_RESULT__${filename}|||${absPath}|||END__`;
  return resultMsg;
}
// [DONE] DELETE_RE replaced with AI classifier per Rule 18.
// Delete helpers extracted to chatPanelAutoSaveDelete.ts (Rule 9 split)
export { shouldDeleteFiles, deleteRequestedFiles } from './chatPanelAutoSaveDelete';

