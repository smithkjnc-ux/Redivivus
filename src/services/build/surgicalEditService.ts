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

  // 1. Primary path: XML Structured Format (Gap 4 update)
  const xmlFileRe = /<file\s+path="([^"]+)">([\s\S]*?)<\/file>/g;
  let xmlFileMatch: RegExpExecArray | null;
  let foundXml = false;

  while ((xmlFileMatch = xmlFileRe.exec(response)) !== null) {
    foundXml = true;
    const filePath = xmlFileMatch[1].trim();
    const fileContent = xmlFileMatch[2];

    const xmlEditRe = /<edit>[\s\S]*?<search>\n?([\s\S]*?)\n?<\/search>[\s\S]*?<replace>\n?([\s\S]*?)\n?<\/replace>[\s\S]*?<\/edit>/g;
    let xmlEditMatch: RegExpExecArray | null;
    let foundEdits = false;
    
    while ((xmlEditMatch = xmlEditRe.exec(fileContent)) !== null) {
      foundEdits = true;
      edits.push({
        filePath,
        searchBlock: xmlEditMatch[1],
        replaceBlock: xmlEditMatch[2],
      });
    }

    // If it was a full file output in XML format
    if (!foundEdits) {
      const xmlContentRe = /<content>\n?([\s\S]*?)\n?<\/content>/;
      const contentMatch = xmlContentRe.exec(fileContent);
      if (contentMatch) {
        // Technically a full file replacement, but we can treat it as a surgical edit that replaces everything
        // Wait, chatPanelMsgFixApply needs full-file parsing. 
        // We'll let chatPanelMsgFixApply handle <content> tags in its fallback.
      }
    }
  }

  if (foundXml) {
    return edits;
  }

  // 2. Legacy path: Markdown Headers + SEARCH/REPLACE blocks
  const filePattern = /^##\s+(?:Edit|Fix):\s*(.+?)\s*$/gm;
  let fileMatch: RegExpExecArray | null;
  const filePositions: Array<{ path: string; start: number }> = [];

  while ((fileMatch = filePattern.exec(response)) !== null) {
    filePositions.push({ path: fileMatch[1].trim(), start: fileMatch.index + fileMatch[0].length });
  }

  if (filePositions.length === 0) {
    filePositions.push({ path: defaultFilePath, start: 0 });
  }

  for (let i = 0; i < filePositions.length; i++) {
    const fp = filePositions[i];
    const end = i + 1 < filePositions.length ? filePositions[i + 1].start : response.length;
    const section = response.slice(fp.start, end);

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
        // Pass 2: normalize trailing whitespace per line
        const normalizedContent = content.split('\n').map(l => l.trimEnd()).join('\n');
        const normalizedSearch = edit.searchBlock.split('\n').map(l => l.trimEnd()).join('\n');
        const nIdx = normalizedContent.indexOf(normalizedSearch);
        if (nIdx !== -1) {
          const linesBefore = normalizedContent.slice(0, nIdx).split('\n').length - 1;
          const searchLines = normalizedSearch.split('\n').length;
          const origLines = content.split('\n');
          const beforeStr = origLines.slice(0, linesBefore).join('\n') + (linesBefore > 0 ? '\n' : '');
          content = beforeStr + edit.replaceBlock + '\n' + origLines.slice(linesBefore + searchLines).join('\n');
        } else {
          // Pass 3: strip all leading+trailing whitespace per line (handles tab/space and indent drift)
          const normalize = (s: string) => s.replace(/\t/g, '  ').split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const strippedContent = content.replace(/\t/g, '  ').split('\n').map(l => l.trim());
          const strippedSearch = normalize(edit.searchBlock);
          let foundAt = -1;
          for (let si = 0; si <= strippedContent.length - strippedSearch.length; si++) {
            if (strippedSearch.every((sl, j) => strippedContent[si + j] === sl)) { foundAt = si; break; }
          }
          if (foundAt !== -1) {
            const origLines = content.split('\n');
            content = [...origLines.slice(0, foundAt), edit.replaceBlock, ...origLines.slice(foundAt + strippedSearch.length)].join('\n');
          } else {
            failedSearch = edit.searchBlock.slice(0, 60) + (edit.searchBlock.length > 60 ? '...' : '');
            break;
          }
        }
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
  if (/<file\s+path=".*?">[\s\S]*?<edit>/m.test(response)) { return 'surgical'; }
  if (/<<<SEARCH\n[\s\S]*?\n===\n[\s\S]*?\nREPLACE>>>/m.test(response)) { return 'surgical'; }
  if (/^---\s+\S+\n\+\+\+\s+\S+/m.test(response)) { return 'unified'; }
  return 'fullfile';
}

export { parseUnifiedDiff } from './surgicalEditDiff.js';
