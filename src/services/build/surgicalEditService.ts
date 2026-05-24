// [SCOPE] Surgical Edit Service -- applies SEARCH/REPLACE edits to existing files without full rewrites.
// Parses AI responses containing <<<SEARCH ... === ... REPLACE>>> blocks and applies them.
// Falls back to full-file write if surgical edits fail or the AI returns a full file instead.

import * as fs from 'fs';
import * as path from 'path';

export interface SurgicalEdit {
  filePath: string;       // relative path
  searchBlock: string;    // exact text to find
  replaceBlock: string;   // text to replace with
}

export interface EditResult {
  filePath: string;
  success: boolean;
  editCount: number;
  error?: string;
  usedFallback?: boolean;
}

/**
 * Parse AI response for SEARCH/REPLACE blocks.
 * Expected format per edit:
 *   ## Edit: relative/path/to/file
 *   <<<SEARCH
 *   [exact existing code to find]
 *   ===
 *   [replacement code]
 *   REPLACE>>>
 *
 * Multiple edits per file are supported.
 */
export function parseSurgicalEdits(response: string, defaultFilePath: string = 'default'): SurgicalEdit[] {
  const edits: SurgicalEdit[] = [];
  // Match file headers: ## Edit: path or ## Fix: path (backward compat)
  const filePattern = /^##\s+(?:Edit|Fix):\s*(.+?)\s*$/gm;
  let fileMatch: RegExpExecArray | null;
  const filePositions: Array<{ path: string; start: number }> = [];

  while ((fileMatch = filePattern.exec(response)) !== null) {
    filePositions.push({ path: fileMatch[1].trim(), start: fileMatch.index + fileMatch[0].length });
  }

  // If no file headers are found, treat the entire response as belonging to the default file path
  if (filePositions.length === 0) {
    filePositions.push({ path: defaultFilePath, start: 0 });
  }

  for (let i = 0; i < filePositions.length; i++) {
    const fp = filePositions[i];
    const end = i + 1 < filePositions.length ? filePositions[i + 1].start : response.length;
    const section = response.slice(fp.start, end);

    // Parse all SEARCH/REPLACE blocks in this file section
    const editBlockRe = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
    let editMatch: RegExpExecArray | null;
    while ((editMatch = editBlockRe.exec(section)) !== null) {
      edits.push({
        filePath: fp.path,
        searchBlock: editMatch[1],
        replaceBlock: editMatch[2],
      });
    }
  }
  return edits;
}

/**
 * Apply surgical edits to files on disk.
 * For each file, reads current content, finds the search block, and replaces it.
 * If any search block is not found, returns an error for that file.
 */
export function applySurgicalEdits(edits: SurgicalEdit[], root: string): EditResult[] {
  // Group edits by file
  const grouped = new Map<string, SurgicalEdit[]>();
  for (const edit of edits) {
    const list = grouped.get(edit.filePath) || [];
    list.push(edit);
    grouped.set(edit.filePath, list);
  }

  const results: EditResult[] = [];
  for (const [relPath, fileEdits] of grouped) {
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) {
      results.push({ filePath: relPath, success: false, editCount: 0, error: 'File does not exist' });
      continue;
    }

    let content = fs.readFileSync(absPath, 'utf-8');
    let appliedCount = 0;
    let failedSearch: string | undefined;

    for (const edit of fileEdits) {
      const idx = content.indexOf(edit.searchBlock);
      if (idx === -1) {
        // Try with normalized whitespace (trim trailing spaces per line)
        const normalizedContent = content.split('\n').map(l => l.trimEnd()).join('\n');
        const normalizedSearch = edit.searchBlock.split('\n').map(l => l.trimEnd()).join('\n');
        const nIdx = normalizedContent.indexOf(normalizedSearch);
        if (nIdx === -1) {
          failedSearch = edit.searchBlock.slice(0, 60) + (edit.searchBlock.length > 60 ? '...' : '');
          break;
        }
        // Find the actual position in original content using line offsets
        const linesBefore = normalizedContent.slice(0, nIdx).split('\n').length - 1;
        const searchLines = normalizedSearch.split('\n').length;
        const origLines = content.split('\n');
        const beforeStr = origLines.slice(0, linesBefore).join('\n') + (linesBefore > 0 ? '\n' : '');
        const matchStr = origLines.slice(linesBefore, linesBefore + searchLines).join('\n');
        content = beforeStr + edit.replaceBlock + '\n' + origLines.slice(linesBefore + searchLines).join('\n');
      } else {
        content = content.slice(0, idx) + edit.replaceBlock + content.slice(idx + edit.searchBlock.length);
      }
      appliedCount++;
    }

    if (failedSearch) {
      results.push({ filePath: relPath, success: false, editCount: appliedCount, error: `Search block not found: "${failedSearch}"` });
    } else {
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, content, 'utf-8');
      results.push({ filePath: relPath, success: true, editCount: appliedCount });
    }
  }
  return results;
}

/**
 * Detect whether an AI response contains surgical edits, a unified diff, or full-file output.
 */
export function detectResponseFormat(response: string): 'surgical' | 'unified' | 'fullfile' {
  if (/<<<SEARCH\n[\s\S]*?\n===\n[\s\S]*?\nREPLACE>>>/m.test(response)) { return 'surgical'; }
  if (/^---\s+\S+\n\+\+\+\s+\S+/m.test(response)) { return 'unified'; }
  return 'fullfile';
}

/**
 * Parse a unified diff response (--- a/path / +++ b/path / @@ hunks) into SurgicalEdit objects.
 * Line numbers in @@ headers are intentionally ignored — AI models often get them wrong.
 * Instead each hunk becomes a SEARCH/REPLACE pair using context+changed lines as the anchor.
 */
export function parseUnifiedDiff(response: string): SurgicalEdit[] {
  const edits: SurgicalEdit[] = [];
  const sections = response.split(/^(?=---\s)/m).filter(s => /^---\s+\S+\n\+\+\+/.test(s));
  for (const section of sections) {
    const fm = section.match(/^---\s+\S+\n\+\+\+\s+(?:b\/)?(.+?)(?:\s|$)/m);
    if (!fm) { continue; }
    const filePath = fm[1].trim().replace(/^b\//, '');
    // Parse hunks line-by-line — avoids the \s*$ multiline regex bug where $ matches end of every line
    let inHunk = false;
    let searchLines: string[] = [];
    let replaceLines: string[] = [];
    const flushHunk = () => {
      const searchBlock = searchLines.join('\n').trimEnd();
      const replaceBlock = replaceLines.join('\n').trimEnd();
      if (searchBlock && searchBlock !== replaceBlock) { edits.push({ filePath, searchBlock, replaceBlock }); }
      searchLines = []; replaceLines = [];
    };
    for (const line of section.split('\n')) {
      if (line.startsWith('@@')) { if (inHunk) { flushHunk(); } inHunk = true; }
      else if (inHunk && !line.startsWith('---') && !line.startsWith('+++')) {
        if (line.startsWith('-')) { searchLines.push(line.slice(1)); }
        else if (line.startsWith('+')) { replaceLines.push(line.slice(1)); }
        else { const ctx = line.startsWith(' ') ? line.slice(1) : line; searchLines.push(ctx); replaceLines.push(ctx); }
      }
    }
    if (inHunk) { flushHunk(); }
  }
  return edits;
}
