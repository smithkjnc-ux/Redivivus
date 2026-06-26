// [SCOPE] Unified diff parsing for surgical edits
import type { SurgicalEdit } from './surgicalEditService.js';

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
