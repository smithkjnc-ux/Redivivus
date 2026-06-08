// [SCOPE] Surgical Edit Service -- applies SEARCH/REPLACE edits to existing files without full rewrites.
// Parses AI responses containing <<<SEARCH ... === ... REPLACE>>> blocks and applies them.
// Falls back to full-file write if surgical edits fail or the AI returns a full file instead.

import * as fs from 'fs';
import * as path from 'path';

// [FIX] Fuzzy matching support for surgical edits -- handles whitespace drift and minor changes
// that occur after multiple fix attempts on the same file.

/** Normalize text for matching -- handles line endings, tabs, whitespace, blank lines. */
function normalizeForMatch(text: string): string {
  return text
    .replace(/\r\n/g, '\n')          // normalize line endings
    .replace(/\t/g, '  ')            // tabs to spaces
    .replace(/[ \t]+$/gm, '')        // trim trailing whitespace per line
    .replace(/\n{3,}/g, '\n\n')      // collapse 3+ blank lines to 2
    .trim();                          // trim leading/trailing whitespace
}

/** Calculate similarity between two strings (0-1 scale). Uses line-based comparison. */
function calculateSimilarity(a: string, b: string): number {
  const linesA = a.split('\n').filter(l => l.trim().length > 0);
  const linesB = b.split('\n').filter(l => l.trim().length > 0);
  if (linesA.length === 0 || linesB.length === 0) return 0;
  
  // Find longest common subsequence of non-empty lines (normalized)
  const normA = linesA.map(l => l.trim().replace(/\s+/g, ' '));
  const normB = linesB.map(l => l.trim().replace(/\s+/g, ' '));
  
  let matches = 0;
  let bi = 0;
  for (const line of normA) {
    const idx = normB.indexOf(line, bi);
    if (idx !== -1) { matches++; bi = idx + 1; }
  }
  
  return matches / Math.max(normA.length, normB.length);
}

/** Find best fuzzy match location in content using similarity. Returns {index, similarity}. */
function findFuzzyMatch(searchBlock: string, content: string, threshold: number): { index: number; similarity: number } | null {
  const searchLines = normalizeForMatch(searchBlock).split('\n').filter(l => l.length > 0);
  const contentLines = content.split('\n');
  
  if (searchLines.length === 0) return null;
  if (searchLines.length < 3) return null; // Don't fuzzy-match short blocks -- too risky
  
  let bestIndex = -1;
  let bestSimilarity = 0;
  
  // Sliding window over content lines
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const windowContent = contentLines.slice(i, i + searchLines.length).join('\n');
    const similarity = calculateSimilarity(searchBlock, windowContent);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestIndex = i;
    }
  }
  
  if (bestSimilarity >= threshold && bestIndex !== -1) {
    // Convert line index to character index
    const index = contentLines.slice(0, bestIndex).join('\n').length + (bestIndex > 0 ? 1 : 0);
    return { index, similarity: bestSimilarity };
  }
  
  return null;
}

/** Log helper for surgical matching -- uses console but can be swapped for proper logger. */
function surgicalLog(msg: string, details?: any): void {
  const prefix = '[SURGICAL]';
  if (details) { console.log(prefix, msg, details); }
  else { console.log(prefix, msg); }
}

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
 * Uses 4-pass matching: exact -> normalized -> trimmed-line -> fuzzy (85% threshold).
 * If any search block is not found after all 4 passes, returns an error for that file.
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
    let failedEdit: { searchBlock: string; strategy: string } | undefined;

    for (const edit of fileEdits) {
      const blockPreview = edit.searchBlock.slice(0, 40).replace(/\n/g, '\\n');
      surgicalLog(`Trying exact match for "${blockPreview}..."`);
      
      // Strategy 1: Exact match (fastest, most precise)
      let idx = content.indexOf(edit.searchBlock);
      let strategy = 'exact';
      
      // Strategy 2: Normalized match (handles line endings, trailing whitespace)
      if (idx === -1) {
        surgicalLog(`  Exact match failed -- trying normalized match...`);
        const normalizedContent = normalizeForMatch(content);
        const normalizedSearch = normalizeForMatch(edit.searchBlock);
        const nIdx = normalizedContent.indexOf(normalizedSearch);
        if (nIdx !== -1) {
          // Map normalized index back to original content
          const beforeMatch = normalizedContent.slice(0, nIdx);
          const linesBefore = beforeMatch.split('\n').length - 1;
          const searchLines = normalizedSearch.split('\n').length;
          const origLines = content.split('\n');
          const charIndex = origLines.slice(0, linesBefore).join('\n').length + (linesBefore > 0 ? 1 : 0);
          idx = charIndex;
          strategy = 'normalized';
          surgicalLog(`  Normalized match succeeded`);
        }
      }
      
      // Strategy 3: Trimmed-line match (handles indentation drift)
      if (idx === -1) {
        surgicalLog(`  Normalized match failed -- trying trimmed-line match...`);
        const contentLines = content.split('\n');
        const searchLines = edit.searchBlock.split('\n');
        const trimmedSearch = searchLines.map(l => l.trim());
        
        // Don't try if search is just empty/whitespace
        if (trimmedSearch.some(l => l.length > 0)) {
          // Sliding window over content lines
          for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const windowTrimmed = contentLines.slice(i, i + searchLines.length).map(l => l.trim());
            if (trimmedSearch.every((sl, j) => windowTrimmed[j] === sl)) {
              // Found at line index i -- convert to char index
              const charIndex = contentLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
              idx = charIndex;
              strategy = 'trimmed-line';
              surgicalLog(`  Trimmed-line match succeeded (line ${i + 1})`);
              break;
            }
          }
        }
      }
      
      // Strategy 4: Fuzzy match (85% similarity threshold, last resort)
      if (idx === -1) {
        const searchLines = edit.searchBlock.split('\n').filter(l => l.trim().length > 0);
        if (searchLines.length >= 3) {
          surgicalLog(`  Trimmed-line match failed -- trying fuzzy match (min 85% similarity)...`);
          const fuzzy = findFuzzyMatch(edit.searchBlock, content, 0.85);
          if (fuzzy) {
            idx = fuzzy.index;
            strategy = 'fuzzy';
            surgicalLog(`  Fuzzy match succeeded (${(fuzzy.similarity * 100).toFixed(1)}% similarity)`);
          }
        } else {
          surgicalLog(`  Skipping fuzzy match -- search block too short (${searchLines.length} lines, need 3+)`);
        }
      }
      
      // Apply the edit if any strategy found a match
      if (idx !== -1) {
        const before = content.slice(0, idx);
        const after = content.slice(idx + edit.searchBlock.length);
        content = before + edit.replaceBlock + after;
        appliedCount++;
        surgicalLog(`  Applied edit using ${strategy} strategy`);
      } else {
        // All strategies failed -- log detailed failure info
        failedEdit = { searchBlock: edit.searchBlock, strategy: 'all-4-failed' };
        const searchPreview = edit.searchBlock.slice(0, 100).replace(/\n/g, '\\n');
        surgicalLog(`  ALL STRATEGIES FAILED for search block: "${searchPreview}..."`);
        
        // Find best fuzzy match anyway to show how close we got
        const bestMatch = findFuzzyMatch(edit.searchBlock, content, 0.0); // threshold 0 = find best regardless
        if (bestMatch && bestMatch.similarity > 0) {
          surgicalLog(`  Best match found: ${(bestMatch.similarity * 100).toFixed(1)}% similarity (needed 85%)`);
        }
        break;
      }
    }

    if (failedEdit) {
      const failedPreview = failedEdit.searchBlock.slice(0, 60).replace(/\n/g, '\\n') + (failedEdit.searchBlock.length > 60 ? '...' : '');
      results.push({ filePath: relPath, success: false, editCount: appliedCount, error: `Search block not found (all 4 strategies failed): "${failedPreview}"` });
    } else {
      const dir = path.dirname(absPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      fs.writeFileSync(absPath, content, 'utf-8');
      results.push({ filePath: relPath, success: true, editCount: appliedCount });
      surgicalLog(`Successfully applied ${appliedCount} edits to ${relPath}`);
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
