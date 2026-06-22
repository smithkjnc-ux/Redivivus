// [SCOPE] Surgical Edit Service -- applies SEARCH/REPLACE edits to existing files without full rewrites.
// Parses AI responses containing <<<SEARCH ... === ... REPLACE>>> blocks and applies them.
// Falls back to full-file write if surgical edits fail or the AI returns a full file instead.

import * as fs from 'fs';
import * as path from 'path';

// [DONE] normalizeForMatch, calculateSimilarity, findFuzzyMatch moved to surgicalEditMatcher.ts (Rule 9 split)
import { normalizeForMatch, findFuzzyMatch } from './surgicalEditMatcher.js';

/** Log helper for surgical matching -- uses console but can be swapped for proper logger. */
function surgicalLog(msg: string, details?: any): void {
  const prefix = '[SURGICAL]';
  if (details) { console.log(prefix, msg, details); }
  else { console.log(prefix, msg); }
}

// [DONE] SurgicalEdit, EditResult, parseSurgicalEdits moved to surgicalEditParser.ts (Rule 9 split)
import type { SurgicalEdit, EditResult } from './surgicalEditParser.js';
export type { SurgicalEdit, EditResult } from './surgicalEditParser.js';
export { parseSurgicalEdits } from './surgicalEditParser.js';

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
      
      // Strategy 2: Normalized match (handles line endings, trailing whitespace, tab/space drift).
      // [FIX] Use line-range replacement instead of character-index remapping. The old approach mapped
      // nIdx (an index into the NORMALIZED string) back to the original via line count — but normalizeForMatch
      // collapses blank lines and converts tabs, so the line count mapping was wrong and idx pointed to the
      // wrong position. Instead: find which window of ORIGINAL lines normalizes to match the search block,
      // then replace exactly those original lines with the replaceBlock.
      if (idx === -1) {
        surgicalLog(`  Exact match failed -- trying normalized line-range match...`);
        const normalizedSearch = normalizeForMatch(edit.searchBlock);
        const searchLineCount = edit.searchBlock.split('\n').length;
        const contentLines = content.split('\n');
        let normMatchLine = -1;
        // Slide a window of searchLineCount original lines and see if normalizing it matches
        for (let i = 0; i <= contentLines.length - searchLineCount; i++) {
          const window = contentLines.slice(i, i + searchLineCount).join('\n');
          if (normalizeForMatch(window) === normalizedSearch) {
            normMatchLine = i;
            break;
          }
        }
        // Widen/narrow the window by ±2 lines to absorb blank-line count drift from normalizeForMatch
        if (normMatchLine === -1) {
          outer: for (let delta = 1; delta <= 2; delta++) {
            for (const sc of [searchLineCount - delta, searchLineCount + delta]) {
              if (sc < 1) { continue; }
              for (let i = 0; i <= contentLines.length - sc; i++) {
                const window = contentLines.slice(i, i + sc).join('\n');
                if (normalizeForMatch(window) === normalizedSearch) {
                  normMatchLine = i;
                  // Replace the window lines with replaceBlock, overriding the post-loop slice
                  const before = contentLines.slice(0, normMatchLine).join('\n');
                  const after = contentLines.slice(normMatchLine + sc).join('\n');
                  content = [before, edit.replaceBlock, after].filter(s => s !== '').join('\n');
                  appliedCount++;
                  strategy = 'normalized';
                  surgicalLog(`  Normalized line-range match (±${delta} lines) succeeded (line ${normMatchLine + 1})`);
                  idx = 0; // sentinel — edit already applied above
                  break outer;
                }
              }
            }
          }
        } else {
          // Exact window size match — do the replacement
          const before = contentLines.slice(0, normMatchLine).join('\n');
          const after = contentLines.slice(normMatchLine + searchLineCount).join('\n');
          content = [before, edit.replaceBlock, after].filter(s => s !== '').join('\n');
          appliedCount++;
          strategy = 'normalized';
          surgicalLog(`  Normalized line-range match succeeded (line ${normMatchLine + 1})`);
          idx = 0; // sentinel — edit already applied above
        }
      }
      
      // Strategy 3: Trimmed-line match (handles indentation drift) — skip if Strategy 2 already applied
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
      
      // Apply the edit if any strategy found a match (idx=0 is sentinel: Strategy 2 already applied inline)
      if (idx === 0 && strategy === 'normalized') {
        surgicalLog(`  Edit already applied by Strategy 2 (line-range replacement)`);
      } else if (idx !== -1) {
        const before = content.slice(0, idx);
        const after = content.slice(idx + edit.searchBlock.length);
        content = before + edit.replaceBlock + after;
        appliedCount++;
        surgicalLog(`  Applied edit using ${strategy} strategy)`);
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

// [DONE] detectResponseFormat moved to surgicalEditParser.ts (Rule 9 split)
export { detectResponseFormat } from './surgicalEditParser.js';
export { parseUnifiedDiff } from './surgicalEditDiff.js';
