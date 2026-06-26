// [SCOPE] Fix pipeline file selection — isolates file picking logic to comply with Rule 9 limits.
import * as path from 'path';
import { listSourceFiles } from '../../../services/workspace/codebaseSearch.js';
import { fixLog } from '../../../shared/logging/infrastructure/fixPipelineLogger.js';

// [FIX] Smart file selection: when userText is provided, send only files relevant to the bug
// rather than all 50 source files. Mentioned files + their importers come first; others fill to 12.
// [FIX] Include src/ folder files and content-matched files, not just filename mentions.
// [FIX] Prioritize files with [SCOPE] or [ANNOTATION] tags - they have self-documenting info.
export function collectSourceFiles(root: string, userText?: string): { rel: string; content: string }[] {
  const all = listSourceFiles(root, true, 50)
    .filter(f => f.content)
    .map(f => ({ rel: f.rel, content: f.content! }));
  if (!userText || all.length <= 15) { return all; }
  const textLower = userText.toLowerCase();

  // Include files whose basename is mentioned in user text
  const mentioned = all.filter(f => textLower.includes(path.basename(f.rel).toLowerCase()));
  const mentionedSet = new Set(mentioned.map(f => f.rel));

  // Include files in src/ folder (likely contains core logic)
  const srcFiles = all.filter(f => f.rel.startsWith('src/') && !mentionedSet.has(f.rel));
  const srcSet = new Set(srcFiles.map(f => f.rel));

  // Include files whose CONTENT contains keywords from user text (semantic match)
  const keywords = textLower.split(/\s+/).filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'were', 'been', 'have', 'game', 'make', 'code', 'file'].includes(w));
  const contentMatched = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && keywords.some(k => f.content.toLowerCase().includes(k)));
  const contentMatchedSet = new Set(contentMatched.map(f => f.rel));

  // Files that import the mentioned files
  const importers = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && mentioned.some(m => f.content.includes(path.basename(m.rel, path.extname(m.rel)))));
  const importersSet = new Set(importers.map(f => f.rel));

  // [Redivivus CORE] Prioritize files with ANNOTATIONS - they have [SCOPE]/[ANNOTATION] tags
  const hasAnnotations = (f: {content: string}) => /\[?(?:SCOPE|ANNOTATION|TODO|WARN|DONE)\]?\s*[:\-]/.test(f.content);
  const annotatedFiles = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && !contentMatchedSet.has(f.rel) && !importersSet.has(f.rel) && hasAnnotations(f));

  const selected = [...mentioned, ...srcFiles, ...contentMatched, ...importers, ...annotatedFiles];
  const uniqueSelected = Array.from(new Map(selected.map(f => [f.rel, f])).values());
  return uniqueSelected.slice(0, 12);
}

/** AI-assisted file relevance selection — sends only filenames (not content) to a cheap model.
 *  Returns the AI-ranked subset; falls back to the sync heuristic if the AI call fails.
 *  [Rule 18] Replaces the keyword exclusion list with a real semantic judgment. */
export async function resolveSourceFiles(
  root: string,
  userText: string,
  deps?: { routing?: { promptCheap?: Function } },
  imageBase64?: string,
  imageType?: string
): Promise<{ rel: string; content: string }[]> {
  const all = listSourceFiles(root, true, 50)
    .filter(f => f.content)
    .map(f => ({ rel: f.rel, content: f.content! }));
  if (all.length <= 15 || !userText) { return all; }

  // [Rule 18] Use cheap AI to pick relevant files by filename only — no file content sent.
  const routing = deps?.routing;
  if (routing?.promptCheap) {
    try {
      const fileList = all.map(f => {
        const scopeLine = f.content.split('\n').slice(0, 4).find(l => /\[SCOPE\]|\[NARRATOR\]/.test(l));
        const scopeText = scopeLine ? scopeLine.replace(/^(?:\/\/\s*|<!--\s*|\/\*\s*|#\s*)\[(?:SCOPE|NARRATOR)\]\s*/i, '').trim() : '';
        return scopeText ? `${f.rel}: ${scopeText}` : f.rel;
      }).join('\n');

      const selectionPrompt = `A developer is asking: "${userText.slice(0, 300)}"

Project Skeleton:
\${fileList}

Reply with ONLY the exact filenames absolutely necessary to fulfill this request.
For example, if it is a visual style change, return ONLY the CSS file. Do not return unrelated logic or data files.
Return one filename per line, no explanation.`;
      const aiResult = await (routing.promptCheap as Function)(selectionPrompt, 12_000, imageBase64, imageType);
      if (aiResult.success && aiResult.text.trim()) {
        const picked = aiResult.text.trim().split('\n')
          .map((l: string) => l.trim().replace(/^[-*•\d.]+\s*/, ''))
          .filter((l: string) => l.length > 0);
        const pickedSet = new Set(picked);
        const matched = all.filter(f => pickedSet.has(f.rel));
        if (matched.length > 0) {
          fixLog(`[FILE-SELECT] AI picked \${matched.length} files from \${all.length}: \${matched.map(f => f.rel).join(', ')}`);
          return matched.slice(0, 12);
        }
      }
    } catch {
      fixLog('[FILE-SELECT] AI file selection failed — falling back to heuristic');
    }
  }

  // Fallback: sync heuristic (no exclusion list for domain words)
  fixLog('[FILE-SELECT] Using heuristic file selection');
  return collectSourceFiles(root, userText);
}
