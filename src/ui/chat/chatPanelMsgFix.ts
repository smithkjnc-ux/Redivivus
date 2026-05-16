// [SCOPE] Chat fix handler -- diagnoses bugs in existing project code
// Called when user reports a problem (fix intent). Reads project files, asks AI to diagnose,
// replies with findings. Does NOT show the build modal.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageHandlerDeps } from './chatPanelMessages.js';

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.json', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 18_000;

export async function handleFixRequest(
  userText: string,
  deps: MessageHandlerDeps
): Promise<void> {
  const { routing, conversation, refresh } = deps;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!root) {
    conversation.push({ role: 'assistant', content: 'No project folder open -- open your project first.', timestamp: Date.now() });
    refresh();
    return;
  }

  conversation.push({ role: 'assistant', content: 'Let me look at the current code to see what\'s wrong...', timestamp: Date.now() });
  refresh();

  const sourceFiles = collectSourceFiles(root);

  if (sourceFiles.length === 0) {
    conversation[conversation.length - 1].content = 'No source files found in this project. Is the correct folder open?';
    refresh();
    return;
  }

  const filesBlock = sourceFiles
    .map(f => `// === ${f.rel} ===\n${f.content}`)
    .join('\n\n');

  const prompt = `You are a debugging assistant reviewing an existing project.

The user reports: "${userText}"

Project source files:
${filesBlock}

INSTRUCTIONS:
- Identify the specific bug or problem (name the exact file, function, or line)
- Explain WHY the problem occurs
- Give concrete steps to fix it (specific code changes, not vague advice)
- If you need more information from the user to diagnose the issue, ask directly
- Do NOT suggest rebuilding from scratch -- this project already exists and runs
- Keep your response focused and practical

If there are multiple possible causes, rank them by likelihood.`;

  const res = await routing?.prompt(prompt, 16_000);

  if (!res || !res.success || !res.text?.trim()) {
    conversation[conversation.length - 1].content = 'Could not analyze the project -- AI returned no response. Check your API key in Settings.';
    refresh();
    return;
  }

  const diagnosis = res.text.trim();
  conversation[conversation.length - 1].content =
    diagnosis + '\n\n---\nSay **"yes, apply the fix"** and I\'ll make the changes, or describe what you\'d like to adjust first.';
  refresh();
}

function collectSourceFiles(root: string): { rel: string; content: string }[] {
  const results: { rel: string; content: string }[] = [];

  function walk(dir: string, depth: number): void {
    if (results.length >= MAX_FILES || depth > 4) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir); } catch { return; }
    // Sort: files first, then directories (so index.html / main.js come before subdirs)
    entries.sort((a, b) => {
      const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
      const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
      return aIsDir === bIsDir ? a.localeCompare(b) : aIsDir ? 1 : -1;
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
        if (content.length > MAX_FILE_BYTES) {
          content = content.slice(0, MAX_FILE_BYTES) + '\n// ... (truncated)';
        }
        results.push({ rel, content });
      } catch { continue; }
      if (results.length >= MAX_FILES) { return; }
    }
  }

  walk(root, 0);
  return results;
}
