// [SCOPE] Chat fix handler -- finds ALL bugs in existing project code and applies ALL fixes in one pass.
// Reads source files, asks AI to diagnose + return complete corrected file content,
// parses structured fix blocks, writes each fixed file to disk, reports what changed.
// [WARN] No "say yes" loop -- fixes are applied immediately. Add snapshot before writing.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageHandlerDeps } from './chatPanelMessages.js';

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20_000;

export async function handleFixRequest(
  userText: string,
  deps: MessageHandlerDeps
): Promise<void> {
  const { routing, conversation, refresh } = deps;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!root) {
    conversation.push({ role: 'assistant', content: 'No project folder open -- open your project first.', timestamp: Date.now() });
    refresh(); return;
  }

  conversation.push({ role: 'assistant', content: 'Reading the project and finding all issues...', timestamp: Date.now() });
  refresh();

  const sourceFiles = collectSourceFiles(root);
  if (sourceFiles.length === 0) {
    conversation[conversation.length - 1].content = 'No source files found. Is the correct folder open?';
    refresh(); return;
  }

  const filesBlock = sourceFiles.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');

  // Ask AI to diagnose ALL issues and return COMPLETE corrected file content in one pass.
  // Structured response format lets us reliably parse which files to write.
  const prompt = `You are fixing a bug in an existing project. Find ALL root causes and fix ALL of them.

User reports: "${userText}"

Source files:
${filesBlock}

IMPORTANT RULES:
1. Find every bug contributing to this problem -- not just the most obvious one
2. Fix ALL of them in this single response
3. Do NOT suggest rebuilding -- fix the existing code
4. Return the COMPLETE corrected file content for every file that needs changes
5. Do NOT truncate -- return the entire file, every line

FORMAT YOUR RESPONSE EXACTLY:

## Diagnosis
[Concise explanation of each bug found, why it causes the problem, ranked by impact]

## Fix: relative/path/to/file
\`\`\`
[COMPLETE corrected file content -- every line, no truncation]
\`\`\`

Repeat the Fix block for each file that needs changes. If only one file needs changes, one block is correct.`;

  const res = await routing?.routeByComplexity(userText, prompt, 90_000);

  if (!res || !res.success || !res.text?.trim()) {
    conversation[conversation.length - 1].content = 'Could not analyze the project -- AI returned no response. Check your API key in Settings.';
    refresh(); return;
  }

  const { diagnosis, fixes } = parseFixResponse(res.text, root);

  if (fixes.length === 0) {
    // AI diagnosed but couldn't produce correctable file content -- show diagnosis only
    conversation[conversation.length - 1].content =
      diagnosis + '\n\n---\n**No automatic fix could be applied** -- the issue may require manual changes or more context.\nDescribe what you\'d like to change and I\'ll try again.';
    refresh(); return;
  }

  // Take a snapshot before writing (non-blocking)
  takeSnapshot(root, fixes.map(f => f.rel));

  // Write all fixed files to disk
  const written: string[] = [];
  const failed: string[] = [];
  for (const fix of fixes) {
    try {
      fs.mkdirSync(path.dirname(fix.abs), { recursive: true });
      fs.writeFileSync(fix.abs, fix.content, 'utf-8');
      written.push(fix.rel);
    } catch (e) {
      failed.push(`${fix.rel}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Build result message
  const fileList = written.map(f => `- \`${f}\``).join('\n');
  const failList = failed.length > 0 ? `\n\n**Could not write:**\n${failed.map(f => `- ${f}`).join('\n')}` : '';
  const previewToken = written.some(f => f.endsWith('.html'))
    ? `\n__PREVIEW_BROWSER__${path.join(root, written.find(f => f.endsWith('.html'))!)}|||END_PREVIEW_BROWSER__`
    : '';

  conversation[conversation.length - 1].content =
    `${diagnosis}\n\n---\n**Fixed ${written.length} file${written.length !== 1 ? 's' : ''}:**\n${fileList}${failList}${previewToken}`;
  refresh();

  // Open the first changed file so the user can see the diff
  if (written.length > 0) {
    const firstAbs = path.join(root, written[0]);
    try { await vscode.window.showTextDocument(vscode.Uri.file(firstAbs), { preview: true, preserveFocus: true }); } catch { /* non-blocking */ }
  }
}

/** Parse AI response into diagnosis text and file fix blocks. */
function parseFixResponse(text: string, root: string): { diagnosis: string; fixes: { rel: string; abs: string; content: string }[] } {
  const fixes: { rel: string; abs: string; content: string }[] = [];

  // Extract diagnosis (everything before the first ## Fix: block)
  const firstFixIdx = text.indexOf('\n## Fix:');
  const diagnosis = firstFixIdx > 0
    ? text.slice(0, firstFixIdx).replace(/^## Diagnosis\s*/i, '').trim()
    : text.replace(/^## Diagnosis\s*/i, '').trim();

  // Match all ## Fix: blocks -- each has a path and a fenced code block
  const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = fixPattern.exec(text)) !== null) {
    const rel = match[1].trim().replace(/^\//, '');
    const content = match[2].trimEnd();
    if (!rel || !content) { continue; }
    fixes.push({ rel, abs: path.join(root, rel), content });
  }

  // Fallback: try undelimited blocks if fenced blocks weren't used
  if (fixes.length === 0) {
    const altPattern = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
    while ((match = altPattern.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\//, '');
      const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
      if (!rel || !content || content.length < 10) { continue; }
      fixes.push({ rel, abs: path.join(root, rel), content });
    }
  }

  return { diagnosis, fixes };
}

/** Write a simple backup of files before overwriting. Non-blocking. */
function takeSnapshot(root: string, relPaths: string[]): void {
  try {
    const snapDir = path.join(root, '.chassis', 'fix-snapshots', `fix-${Date.now()}`);
    fs.mkdirSync(snapDir, { recursive: true });
    for (const rel of relPaths) {
      const src = path.join(root, rel);
      if (!fs.existsSync(src)) { continue; }
      const dst = path.join(snapDir, rel.replace(/\//g, '__'));
      fs.copyFileSync(src, dst);
    }
  } catch { /* snapshots are best-effort */ }
}

function collectSourceFiles(root: string): { rel: string; content: string }[] {
  const results: { rel: string; content: string }[] = [];
  function walk(dir: string, depth: number): void {
    if (results.length >= MAX_FILES || depth > 4) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    entries.sort((a, b) => {
      try {
        const aD = fs.statSync(path.join(dir, a)).isDirectory();
        const bD = fs.statSync(path.join(dir, b)).isDirectory();
        return aD === bD ? a.localeCompare(b) : aD ? 1 : -1;
      } catch { return 0; }
    });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) { continue; }
      const full = path.join(dir, entry);
      const rel = path.relative(root, full);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(entry).toLowerCase())) { continue; }
      try {
        let content = fs.readFileSync(full, 'utf-8');
        if (content.length > MAX_FILE_BYTES) { content = content.slice(0, MAX_FILE_BYTES) + '\n// ... (truncated)'; }
        results.push({ rel, content });
      } catch { continue; }
      if (results.length >= MAX_FILES) { return; }
    }
  }
  walk(root, 0);
  return results;
}
