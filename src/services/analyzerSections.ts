// [SCOPE] Recommendations panel HTML section builders — one function per section type
// Called only by analyzerPanel.ts. Returns HTML strings. No vscode imports needed here.
import { AnalysisResult } from './analyzerTypes.js';

// [WARN] All user content must pass through esc() before injection into HTML attributes or text
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}
export function fixBtn(prompt: string, label = 'Fix This', filePath = '', issueType = ''): string {
  const doneAttrs = filePath ? ` data-file="${attr(filePath)}" data-issue="${attr(issueType)}"` : '';
  const fileAttr = filePath ? ` data-file="${attr(filePath)}"` : '';
  return `<button class="fix-btn" data-prompt="${attr(prompt)}"${fileAttr}>${label}</button>` +
    (filePath ? `<button class="done-btn" title="Mark as fixed"${doneAttrs}>✓ Done</button>` : '');
}

// [SCOPE] Fix All bar — shows above each section's item list when there are multiple items
function fixAllBar(prompts: string[], issueType: string, label: string): string {
  if (prompts.length < 2) { return ''; }
  // [WARN] Encode prompts as JSON in a data attribute — must be attr-escaped
  const encoded = attr(JSON.stringify(prompts));
  return `<div class="fix-all-bar">
    <button class="fix-all-btn" data-prompts="${encoded}" data-issue="${issueType}" data-label="${label}">
      ⚡ Fix All ${prompts.length} — let AI handle them in sequence
    </button>
    <span class="fix-all-status"></span>
  </div>`;
}

export function buildOverviewSection(result: AnalysisResult): string {
  return `
    <div class="section">
      <div class="section-header overview">📊 Project Overview</div>
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">${result.totalFiles}</div><div class="stat-label">Files scanned</div></div>
        <div class="stat"><div class="stat-num">${result.totalLines.toLocaleString()}</div><div class="stat-label">Lines of code</div></div>
        <div class="stat ${result.largeFiles.length > 0 ? 'warn' : 'ok'}"><div class="stat-num">${result.largeFiles.length}</div><div class="stat-label">Files too long</div></div>
        <div class="stat ${result.todoItems.length > 0 ? 'warn' : 'ok'}"><div class="stat-num">${result.todoItems.length}</div><div class="stat-label">TODOs / FIXMEs</div></div>
        <div class="stat ${result.uncommentedFiles.length > 0 ? 'warn' : 'ok'}"><div class="stat-num">${result.uncommentedFiles.length}</div><div class="stat-label">Missing comments</div></div>
      </div>
    </div>`;
}

export function buildLargeFilesSection(result: AnalysisResult): string {
  if (result.largeFiles.length === 0) { return ''; }
  const allPrompts: string[] = [];
  const rows = result.largeFiles.slice(0, 15).map(f => {
    const prompt =
      `Split ${f.relativePath} (${f.lines} lines) into smaller files.\n` +
      `Each new file should handle one responsibility and be under 200 lines.\n` +
      `Keep all existing behavior — just reorganize the code.\n` +
      `Add a // [SCOPE] comment at the top of each new file explaining what it does.\n` +
      `Reference .chassis/rules.md for annotation standards.\n` +
      `After splitting, make sure the project still compiles with: npm run compile`;
    allPrompts.push(prompt);
    return `<div class="item-row">` +
      `<span class="item-file">${esc(f.relativePath)}</span>` +
      `<span class="item-badge warn-badge">${f.lines} lines</span>` +
      fixBtn(prompt, 'Fix This', f.relativePath, 'largeFile') + `</div>`;
  }).join('');
  const more = result.largeFiles.length > 15
    ? `<div class="item-more">+ ${result.largeFiles.length - 15} more large files</div>` : '';
  return `
      <div class="section">
        <div class="section-header warn-header">📏 Files That Are Too Long (${result.largeFiles.length})</div>
        <div class="section-why">AI tools work best with short, focused files. Files over 200 lines are harder to understand and more likely to cause bugs when edited.</div>
        ${fixAllBar(allPrompts, 'largeFile', 'split')}
        <div class="item-list">${rows}${more}</div>
      </div>`;
}

export function buildTodosSection(result: AnalysisResult, projectName: string): string {
  if (result.todoItems.length === 0) { return ''; }
  const byFile: Record<string, string[]> = {};
  for (const t of result.todoItems) { (byFile[t.file] = byFile[t.file] || []).push(t.line); }
  const allPrompts: string[] = [];
  const rows = Object.entries(byFile).slice(0, 12).map(([file, lines]) => {
    const lineItems = lines.slice(0, 3).map(l => {
      const lineNumMatch = l.match(/^L(\d+):\s*/);
      const lineNum = lineNumMatch ? lineNumMatch[1] : '?';
      const todoText = l.replace(/^L\d+:\s*/, '').trim();
      const prompt =
        `Look at ${file} line ${lineNum}.\n` +
        `There's a marker that says: "${todoText}"\n` +
        `Implement this following the project rules in .chassis/rules.md.\n` +
        `Project: ${projectName}\nAfter making changes, verify the project still compiles.`;
      allPrompts.push(prompt);
      return `<div class="todo-line-row"><span class="todo-line">${esc(l)}</span>${fixBtn(prompt, 'Fix This', file, 'todo')}</div>`;
    }).join('');
    const moreLines = lines.length > 3 ? `<div class="item-more">+ ${lines.length - 3} more in this file</div>` : '';
    return `<div class="item-row col"><span class="item-file">${esc(file)}</span>${lineItems}${moreLines}</div>`;
  }).join('');
  const moreFiles = Object.keys(byFile).length > 12
    ? `<div class="item-more">+ ${Object.keys(byFile).length - 12} more files with markers</div>` : '';
  return `
      <div class="section">
        <div class="section-header warn-header">📋 Things Still To Do (${result.todoItems.length} TODOs)</div>
        <div class="section-why">These are places in the code marked as incomplete. Click <strong>Fix This</strong> or use Fix All to let the AI handle them.</div>
        ${fixAllBar(allPrompts, 'todo', 'fix')}
        <div class="item-list">${rows}${moreFiles}</div>
      </div>`;
}

export function buildUncommentedSection(result: AnalysisResult, projectName: string): string {
  if (result.uncommentedFiles.length === 0) { return ''; }
  const allPrompts: string[] = [];
  const rows = result.uncommentedFiles.slice(0, 12).map(f => {
    const prompt =
      `Add a // [SCOPE] comment at the very top of ${f.relativePath} explaining what this file does, ` +
      `what it connects to, and why it exists.\n` +
      `Also add // [WARN] to any fragile or unclear sections.\n` +
      `Reference .chassis/rules.md for the annotation format.\n` +
      `Project: ${projectName}\nDo not change any existing code — comments only.`;
    allPrompts.push(prompt);
    return `<div class="item-row">` +
      `<span class="item-file">${esc(f.relativePath)}</span>` +
      `<span class="item-badge neutral-badge">${f.lines} lines</span>` +
      fixBtn(prompt, 'Add Scope', f.relativePath, 'uncommented') + `</div>`;
  }).join('');
  const more = result.uncommentedFiles.length > 12
    ? `<div class="item-more">+ ${result.uncommentedFiles.length - 12} more files</div>` : '';
  return `
      <div class="section">
        <div class="section-header neutral-header">💬 Files With No Comments (${result.uncommentedFiles.length})</div>
        <div class="section-why">These files have zero comments. Use Fix All to add [SCOPE] tags to all of them at once.</div>
        ${fixAllBar(allPrompts, 'uncommented', 'annotate')}
        <div class="item-list">${rows}${more}</div>
      </div>`;
}

export function buildNextStepsSection(result: AnalysisResult, projectName: string): string {
  const steps: { text: string; prompt: string; label: string }[] = [];
  if (result.largeFiles.length > 0) {
    steps.push({
      text: `Split the ${result.largeFiles.length} large file${result.largeFiles.length > 1 ? 's' : ''} listed above — aim for one responsibility per file, under 200 lines each.`,
      prompt: `List every file in ${projectName} that is over 200 lines. For each one, suggest how to split it by responsibility into smaller files under 200 lines each. Reference .chassis/rules.md for annotation standards.`,
      label: 'Do This'
    });
  }
  if (result.todoItems.length > 0) {
    steps.push({
      text: `Address the ${result.todoItems.length} remaining marker items listed above.`,
      prompt: `In ${projectName}, there are ${result.todoItems.length} items marked as incomplete. Start with the highest-risk ones. Reference .chassis/rules.md for standards. After each fix, verify the project still compiles.`,
      label: 'Do This'
    });
  }
  if (result.uncommentedFiles.length > 0) {
    steps.push({
      text: `Add a // [SCOPE] comment to the ${result.uncommentedFiles.length} uncommented files.`,
      prompt: `Add a // [SCOPE] comment at the top of each of the following files in ${projectName}, describing what each one does. Do not change any code. Reference .chassis/rules.md.\nFiles:\n${result.uncommentedFiles.slice(0, 20).map(f => '- ' + f.relativePath).join('\n')}`,
      label: 'Do This'
    });
  }
  steps.push({
    text: 'Run <strong>Retrofit Project</strong> to have CHASSIS annotate all pending files automatically using AI.',
    prompt: `Run CHASSIS Retrofit on ${projectName} to add [SCOPE], [TODO], [WARN], and [NEXT] annotations to all unannotated files. Follow the rules in .chassis/rules.md.`,
    label: 'Do This'
  });
  return `
    <div class="section next-section">
      <div class="section-header next-header">✅ What To Do Next</div>
      <ul class="next-list">${steps.map(s => `<li><span>${s.text}</span>${fixBtn(s.prompt, s.label)}</li>`).join('\n')}</ul>
    </div>`;
}
