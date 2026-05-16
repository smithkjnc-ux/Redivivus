// [SCOPE] Chat fix handler -- 3-phase Supervisor/Worker/Guardian bug fix pipeline
// Phase 1: Supervisor AI diagnoses ALL bugs. Phase 2: Worker AI generates complete fixed files.
// Phase 3: Guardian AI reviews and corrects the fix. Results written to disk only after Guardian pass.
// Shows which AI did each step. Snapshot taken before writes.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageHandlerDeps } from './chatPanelMessages.js';

const SOURCE_EXTS = new Set(['.html', '.js', '.ts', '.jsx', '.tsx', '.py', '.css', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', '.chassis', '__pycache__', '.venv']);
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20_000;
const AI_LABEL: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', openai: 'GPT-4o', groq: 'Groq', xai: 'Grok', kimi: 'Kimi', none: 'AI' };

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

  // ── Phase 1: Supervisor diagnoses ALL bugs ──────────────────────────────────
  conversation.push({ role: 'assistant', content: '&#x1F50D; **Phase 1/3 — Supervisor: reading all files and diagnosing...**', timestamp: Date.now() });
  refresh();

  const diagPrompt = `You are the Supervisor AI performing a bug diagnosis.
User reports: "${userText}"

Project source files:
${filesBlock}

Find EVERY bug that contributes to this problem. For each bug:
- Severity: CRITICAL / HIGH / MODERATE
- File and exact function/line
- What is wrong
- Why it causes the symptom
- What the correct code should do

Number each bug. Be specific -- name actual variable names, function names, line numbers.
Do NOT suggest rebuilding. Fix the existing code.`;

  const diagRes = await routing.routeByComplexity(userText, diagPrompt, 16_000);
  if (!diagRes.success || !diagRes.text?.trim()) {
    conversation[conversation.length - 1].content = '&#x274C; Supervisor could not analyze the project. Check your API key in Settings.';
    refresh(); return;
  }
  const diagnosis = diagRes.text.trim();
  const supervisorLabel = AI_LABEL[diagRes.model?.toLowerCase() || ''] || diagRes.model || 'AI';

  // ── Phase 2: Worker generates complete corrected files ───────────────────────
  conversation[conversation.length - 1].content =
    `&#x1F50D; **Phase 1/3 done** (Supervisor: ${supervisorLabel})\n&#x2699;&#xFE0F; **Phase 2/3 — Worker: generating fix...**`;
  refresh();

  const fixPrompt = `You are the Worker AI. Fix ALL bugs identified by the Supervisor.

SUPERVISOR DIAGNOSIS:
${diagnosis}

ORIGINAL SOURCE FILES:
${filesBlock}

RULES:
1. Fix ALL bugs in the diagnosis -- do not skip any
2. Return the COMPLETE corrected file for every file that changes -- every line, no truncation
3. Do NOT add unrequested features. Do NOT rebuild from scratch. Fix only what is diagnosed.

FORMAT (required, exact):
## Fix: relative/path/to/file
\`\`\`
[COMPLETE corrected file content]
\`\`\``;

  const fixRes = await routing.prompt(fixPrompt, 90_000);
  if (!fixRes.success || !fixRes.text?.trim()) {
    conversation[conversation.length - 1].content = '&#x274C; Worker could not generate a fix. Try again or check your API key.';
    refresh(); return;
  }
  const workerLabel = AI_LABEL[fixRes.model?.toLowerCase() || ''] || fixRes.model || 'AI';
  const workerResponse = fixRes.text.trim();

  // ── Phase 3: Guardian reviews the fix ───────────────────────────────────────
  conversation[conversation.length - 1].content =
    `&#x1F50D; **Phase 1/3 done** (Supervisor: ${supervisorLabel})\n&#x2699;&#xFE0F; **Phase 2/3 done** (Worker: ${workerLabel})\n&#x1F6E1;&#xFE0F; **Phase 3/3 — Guardian: reviewing fix...**`;
  refresh();

  const guardianContext = `Original problem: "${userText}"\nDiagnosis:\n${diagnosis}`;
  const guardianResult = await routing.guardianReview(guardianContext, workerResponse, fixRes.model || 'ai', '');
  const guardianLabel = AI_LABEL[guardianResult.guardianAI?.toLowerCase() || ''] || guardianResult.guardianAI || 'AI';

  // Use guardian's corrected version if it found and fixed issues
  const finalResponse = (!guardianResult.passed && guardianResult.correctedText)
    ? guardianResult.correctedText
    : workerResponse;
  const guardianNote = !guardianResult.passed && guardianResult.issues.length > 0
    ? `\n**Guardian corrected ${guardianResult.issues.length} issue${guardianResult.issues.length !== 1 ? 's' : ''}:** ${guardianResult.issues.slice(0, 2).join('; ')}`
    : '\n**Guardian review:** Approved &#x2713;';

  // ── Parse and write all fix blocks ──────────────────────────────────────────
  const { diagnosis: diagText, fixes } = parseFixResponse(finalResponse, root);

  if (fixes.length === 0) {
    conversation[conversation.length - 1].content =
      `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\n&#x26A0; Worker generated a diagnosis but no correctable file blocks were found. Try describing the problem differently.`;
    refresh(); return;
  }

  takeSnapshot(root, fixes.map(f => f.rel));
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

  const fileList = written.map(f => `- \`${f}\``).join('\n');
  const failList = failed.length > 0 ? `\n&#x26A0; **Could not write:** ${failed.join(', ')}` : '';
  const previewToken = written.some(f => f.endsWith('.html'))
    ? `\n__PREVIEW_BROWSER__${path.join(root, written.find(f => f.endsWith('.html'))!)}|||END_PREVIEW_BROWSER__`
    : '';

  conversation[conversation.length - 1].content =
    `**Supervisor (${supervisorLabel}):**\n${diagnosis}\n\n---\n` +
    `**Fixed ${written.length} file${written.length !== 1 ? 's' : ''}** (Worker: ${workerLabel}, Guardian: ${guardianLabel}):${guardianNote}\n${fileList}${failList}${previewToken}`;
  refresh();

  if (written.length > 0) {
    try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, written[0])), { preview: true, preserveFocus: true }); } catch { /* non-blocking */ }
  }
}

function parseFixResponse(text: string, root: string): { diagnosis: string; fixes: { rel: string; abs: string; content: string }[] } {
  const fixes: { rel: string; abs: string; content: string }[] = [];
  const firstFixIdx = text.indexOf('\n## Fix:');
  const diagnosis = (firstFixIdx > 0 ? text.slice(0, firstFixIdx) : text).replace(/^## Diagnosis\s*/i, '').trim();

  const fixPattern = /^## Fix:\s*(.+?)\s*\n```[a-z]*\n([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = fixPattern.exec(text)) !== null) {
    const rel = match[1].trim().replace(/^\//, '');
    const content = match[2].trimEnd();
    if (rel && content) { fixes.push({ rel, abs: path.join(root, rel), content }); }
  }
  // Fallback: undelimited fix blocks
  if (fixes.length === 0) {
    const alt = /^## Fix:\s*(.+?)\s*\n([\s\S]*?)(?=^## Fix:|$)/gm;
    while ((match = alt.exec(text)) !== null) {
      const rel = match[1].trim().replace(/^\//, '');
      const content = match[2].replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trimEnd();
      if (rel && content && content.length > 10) { fixes.push({ rel, abs: path.join(root, rel), content }); }
    }
  }
  return { diagnosis, fixes };
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
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries.sort()) {
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
