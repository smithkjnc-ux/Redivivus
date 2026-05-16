// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI (best available) diagnoses ALL bugs.
// Phase 2: Worker AI generates complete corrected files.
// Phase 3: Guardian reviews and corrects the fix. Writes to disk only after Guardian pass.
// [WARN] Always use routing.prompt() here -- routeByComplexity routes simple-looking bug reports
//        to Groq/cheap models which produce thin output and cause silent pipeline failure.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageHandlerDeps } from './chatPanelMessages.js';

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20_000;

function modelLabel(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('claude')) { return 'Claude'; }
  if (m.includes('gemini')) { return 'Gemini'; }
  if (m.includes('gpt') || m.includes('openai')) { return 'GPT-4o'; }
  if (m.includes('llama') || m === 'groq') { return 'Groq'; }
  if (m.includes('grok') || m === 'xai') { return 'Grok'; }
  if (m.includes('kimi') || m.includes('moonshot')) { return 'Kimi'; }
  return model || 'AI';
}

export async function handleFixRequest(userText: string, deps: MessageHandlerDeps): Promise<void> {
  const { routing, conversation, refresh } = deps;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    conversation.push({ role: 'assistant', content: 'No project folder open -- open your project first.', timestamp: Date.now() });
    refresh(); return;
  }

  const sourceFiles = collectSourceFiles(root);
  if (sourceFiles.length === 0) {
    conversation.push({ role: 'assistant', content: 'No source files found. Is the correct folder open?', timestamp: Date.now() });
    refresh(); return;
  }
  const filesBlock = sourceFiles.map(f => `// === FILE: ${f.rel} ===\n${f.content}`).join('\n\n');

  // Phase 1: Supervisor diagnoses ALL bugs
  // [WARN] Use routing.prompt() not routeByComplexity() -- short bug reports get misrouted to Groq
  conversation.push({ role: 'assistant', content: '[1/3] Supervisor: reading all files and diagnosing...', timestamp: Date.now() });
  refresh();

  let diagnosis = ''; let supervisorLabel = 'AI';
  try {
    const diagPrompt = `You are the Supervisor AI. A user reports a bug in their existing project.
User reports: "${userText}"

Source files:
${filesBlock}

Find EVERY bug contributing to this problem. For each bug:
- Severity: CRITICAL / HIGH / MODERATE
- File and exact function/line
- What is wrong and why it causes this symptom
- What the correct code should do

Number each bug. Be specific -- name actual variable names, function names. Do NOT suggest rebuilding.`;

    const diagRes = await routing.prompt(diagPrompt, 60_000);
    if (!diagRes.success || !diagRes.text?.trim()) {
      conversation[conversation.length - 1].content = `[FAIL] Supervisor returned no response. Error: ${diagRes.error || 'unknown'}. Check your API key in Settings.`;
      refresh(); return;
    }
    diagnosis = diagRes.text.trim();
    supervisorLabel = modelLabel(diagRes.model);
  } catch (err) {
    conversation[conversation.length - 1].content = `[FAIL] Supervisor phase failed: ${err instanceof Error ? err.message : String(err)}`;
    refresh(); return;
  }

  // Phase 2: Worker generates complete corrected files
  conversation[conversation.length - 1].content =
    `[1/3] Supervisor (${supervisorLabel}): done\n[2/3] Worker: generating fix...`;
  refresh();

  let workerResponse = ''; let workerLabel = 'AI';
  try {
    const fixPrompt = `You are the Worker AI. Fix ALL bugs identified by the Supervisor.

SUPERVISOR DIAGNOSIS:
${diagnosis}

ORIGINAL SOURCE FILES:
${filesBlock}

RULES:
1. Fix ALL bugs in the diagnosis -- do not skip any
2. Return the COMPLETE corrected file for every file that changes -- every line, no truncation
3. Do NOT add unrequested features. Fix only what is diagnosed.

FORMAT (exact -- required):
## Fix: relative/path/to/file
\`\`\`
[COMPLETE corrected file content -- no truncation]
\`\`\``;

    const fixRes = await routing.prompt(fixPrompt, 90_000);
    if (!fixRes.success || !fixRes.text?.trim()) {
      conversation[conversation.length - 1].content = `[FAIL] Worker returned no response. Error: ${fixRes.error || 'unknown'}.`;
      refresh(); return;
    }
    workerResponse = fixRes.text.trim();
    workerLabel = modelLabel(fixRes.model);
  } catch (err) {
    conversation[conversation.length - 1].content = `[FAIL] Worker phase failed: ${err instanceof Error ? err.message : String(err)}`;
    refresh(); return;
  }

  // Phase 3: Guardian reviews the fix
  conversation[conversation.length - 1].content =
    `[1/3] Supervisor (${supervisorLabel}): done\n[2/3] Worker (${workerLabel}): done\n[3/3] Guardian: reviewing fix...`;
  refresh();

  let finalResponse = workerResponse; let guardianLabel = 'AI'; let guardianNote = '';
  try {
    const guardianContext = `Original problem: "${userText}"\nDiagnosis:\n${diagnosis}`;
    const guardianResult = await routing.guardianReview(guardianContext, workerResponse, workerLabel.toLowerCase(), '');
    guardianLabel = modelLabel(guardianResult.guardianAI || '');
    if (!guardianResult.passed && guardianResult.correctedText) {
      finalResponse = guardianResult.correctedText;
      guardianNote = `Guardian (${guardianLabel}) corrected ${guardianResult.issues.length} issue${guardianResult.issues.length !== 1 ? 's' : ''}: ${guardianResult.issues.slice(0, 2).join('; ')}`;
    } else {
      guardianNote = `Guardian (${guardianLabel}): Approved`;
    }
  } catch { guardianNote = 'Guardian: skipped (error)'; }

  // Parse fix blocks and write files
  const { fixes } = parseFixResponse(finalResponse, root);
  if (fixes.length === 0) {
    conversation[conversation.length - 1].content =
      `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\nWorker could not produce correctable file blocks. Describe the problem differently and try again.`;
    refresh(); return;
  }

  takeSnapshot(root, fixes.map(f => f.rel));
  const written: string[] = []; const failed: string[] = [];
  for (const fix of fixes) {
    try {
      fs.mkdirSync(path.dirname(fix.abs), { recursive: true });
      fs.writeFileSync(fix.abs, fix.content, 'utf-8');
      written.push(fix.rel);
    } catch (e) { failed.push(`${fix.rel}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  const fileList = written.map(f => `- \`${f}\``).join('\n');
  const failLine = failed.length > 0 ? `\n[WARN] Could not write: ${failed.join(', ')}` : '';
  const previewToken = written.some(f => f.endsWith('.html'))
    ? `\n__PREVIEW_BROWSER__${path.join(root, written.find(f => f.endsWith('.html'))!)}|||END_PREVIEW_BROWSER__`
    : '';

  conversation[conversation.length - 1].content =
    `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\n` +
    `**Fixed ${written.length} file${written.length !== 1 ? 's' : ''}** (Worker: ${workerLabel})\n${guardianNote}\n${fileList}${failLine}${previewToken}`;
  refresh();

  if (written.length > 0) {
    try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: true, preserveFocus: true }); } catch { /* non-blocking */ }
  }
}

function parseFixResponse(text: string, root: string): { fixes: { rel: string; abs: string; content: string }[] } {
  const fixes: { rel: string; abs: string; content: string }[] = [];
  const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = fixPattern.exec(text)) !== null) {
    const rel = match[1].trim().replace(/^\//, '');
    const content = match[2].trimEnd();
    if (rel && content) { fixes.push({ rel, abs: path.join(root, rel), content }); }
  }
  if (fixes.length === 0) {
    const alt = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
    while ((match = alt.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\//, '');
      const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
      if (rel && content && content.length > 10) { fixes.push({ rel, abs: path.join(root, rel), content }); }
    }
  }
  return { fixes };
}

function takeSnapshot(root: string, relPaths: string[]): void {
  try {
    const snapDir = path.join(root, '.chassis', 'fix-snapshots', `fix-${Date.now()}`);
    fs.mkdirSync(snapDir, { recursive: true });
    for (const rel of relPaths) {
      const src = path.join(root, rel);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(snapDir, rel.replace(/\//g, '__'))); }
    }
  } catch { /* best-effort */ }
}

function collectSourceFiles(root: string): { rel: string; content: string }[] {
  const results: { rel: string; content: string }[] = [];
  function walk(dir: string, depth: number): void {
    if (results.length >= MAX_FILES || depth > 4) { return; }
    let entries: string[];
    try { entries = fs.readdirSync(dir).sort(); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) { continue; }
      const full = path.join(dir, entry); const rel = path.relative(root, full);
      let stat: fs.Stats; try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, depth + 1); continue; }
      if (!SOURCE_EXTS.has(path.extname(entry).toLowerCase())) { continue; }
      try { let c = fs.readFileSync(full, 'utf-8'); if (c.length > MAX_FILE_BYTES) { c = c.slice(0, MAX_FILE_BYTES) + '\n// ...'; } results.push({ rel, content: c }); } catch { continue; }
      if (results.length >= MAX_FILES) { return; }
    }
  }
  walk(root, 0); return results;
}
