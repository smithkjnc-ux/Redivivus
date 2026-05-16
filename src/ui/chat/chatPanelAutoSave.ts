// [SCOPE] Chat Panel Auto-Save — detects substantial code in AI responses, saves to project, opens in editor
// Matches Antigravity behavior: generate -> save -> open -> confirm. Keep under 200 lines.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { applyChassisStructure } from './chatPanelCodeStructure.js';

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

// [WARN][RULE 18] BUILD_VERB_RE below is a Rule 18 violation — keyword list simulating intent detection.
// shouldAutoSave() should use a 50-token AI classifier: "Did the user ask to create/build a file? yes or no"
// Requires making shouldAutoSave() async, which cascades to chatPanelMsgSendAI.ts caller.
// [NEXT] Replace with AI classifier when refactoring chatPanelMsgSendAI.ts.
const BUILD_VERB_RE = /\b(build|create|make|generate|write|add|implement|code|develop|produce|convert|turn|transform|rewrite|replace|port|refactor|rebuild|redo)\b/i;

interface AutoSaveTarget {
  code: string;
  filename: string;
  lang: string;
}

/** Checks if the AI response has a single dominant code block worth auto-saving */
export function shouldAutoSave(aiResponse: string, userMessage: string): boolean {
  // Only auto-save when user message contains a build/convert verb
  if (!BUILD_VERB_RE.test(userMessage)) { return false; }
  // [WARN] Handle BOTH closed (```...```) and truncated (```... with no closing fence) code blocks.
  // AI responses often get truncated when hitting output token limits.
  const closedBlocks = aiResponse.match(/```\w*\s*\n[\s\S]*?```/g) || [];
  // Check for unclosed block: starts with ``` but never closes
  const hasUnclosedBlock = /```\w*\s*\n[\s\S]{100,}$/.test(aiResponse) && !aiResponse.trim().endsWith('```');
  const totalBlocks = closedBlocks.length + (hasUnclosedBlock ? 1 : 0);
  if (totalBlocks === 0) { return false; }
  // Count substantial blocks (>= MIN_AUTO_SAVE_LINES)
  let substantialCount = closedBlocks.filter(b => b.split('\n').length - 2 >= MIN_AUTO_SAVE_LINES).length;
  if (hasUnclosedBlock) {
    const unclosedContent = aiResponse.slice(aiResponse.lastIndexOf('```'));
    if (unclosedContent.split('\n').length >= MIN_AUTO_SAVE_LINES) { substantialCount++; }
  }
  // Auto-save single dominant block (closed or truncated)
  return substantialCount === 1;
}

/** Extracts the auto-save target (code + filename) from an AI response */
export function extractAutoSaveTarget(aiResponse: string, userMessage: string): AutoSaveTarget | null {
  // Try closed block first, then unclosed (truncated) block
  let match = aiResponse.match(/```(\w*)\s*\n([\s\S]*?)```/);
  if (!match) {
    // [WARN] Handle truncated response — AI hit output token limit before closing the fence
    const unclosedMatch = aiResponse.match(/```(\w*)\s*\n([\s\S]+)$/);
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
    filename = deriveFilenameFromMessage(userMessage, ext);
  }

  return { code, filename, lang };
}

/** Derives a sensible filename from the user's message */
function deriveFilenameFromMessage(message: string, ext: string): string {
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
export async function autoSaveAndOpen(code: string, filename: string, root: string): Promise<string> {
  // [WARN] If no workspace is open, ask the user where to save instead of silently failing
  if (!root || root === 'none') {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Save here',
      title: `Choose where to save ${filename}`,
    });
    if (!picked || picked.length === 0) { return '⚠️ No folder selected — file was not saved.'; }
    root = picked[0].fsPath;
  }

  const absPath = path.join(root, filename);

  // Apply CHASSIS structure rules (generate first, structure after)
  let finalCode = applyChassisStructure(code, filename);

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

  // Open in editor
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch { /* best-effort */ }

  // [CHASSIS] Show full path so non-technical users know exactly where the file went
  const friendlyDir = root.replace(/^\/home\/\w+/, '~');
  return `✅ Saved: \`${filename}\` → \`${friendlyDir}/\``;
}

// [WARN][RULE 18] DELETE_RE is a Rule 18 violation — should use AI: "Does user want to delete files? yes or no"
const DELETE_RE = /\b(delete|remove|clean up|get rid of|trash)\b/i;
const FILE_EXT_RE = /\b(\w+\.\w{2,5})\b/g;

/** Check if user is asking to delete files */
export function shouldDeleteFiles(userText: string): boolean {
  return DELETE_RE.test(userText);
}

/** Delete files matching user request */
export async function deleteRequestedFiles(userText: string, root: string): Promise<string> {
  const matches: string[] = [];
  let m;
  while ((m = FILE_EXT_RE.exec(userText)) !== null) {
    const filename = m[1];
    // Only delete files that exist in the project
    const absPath = path.join(root, filename);
    if (fs.existsSync(absPath)) { matches.push(filename); }
  }
  if (matches.length === 0) {
    // Try to find files by extension mentioned in the message
    const extMatch = userText.match(/\b(html|js|ts|css|json)\b.*files?/i);
    if (extMatch) {
      const ext = '.' + extMatch[1].toLowerCase();
      const files = fs.readdirSync(root).filter(f => f.endsWith(ext) && !f.startsWith('.'));
      matches.push(...files);
    }
  }
  if (matches.length === 0) { return ''; }
  const deleted: string[] = [];
  for (const file of matches) {
    try {
      fs.unlinkSync(path.join(root, file));
      deleted.push(file);
    } catch { /* skip */ }
  }
  if (deleted.length === 0) { return ''; }
  return `🗑️ Deleted: ${deleted.map(f => `\`${f}\``).join(', ')}`;
}
