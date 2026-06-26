// [SCOPE] Text normalization and fuzzy matching helpers for surgical edit application.
// Extracted from surgicalEditService.ts (Rule 9 split — was 355 lines).
// Used by applySurgicalEdits for its 4-pass matching strategy.

/** Normalize text for matching — handles line endings, tabs, whitespace, blank lines. */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Calculate similarity between two strings (0-1 scale) using line-based comparison. */
export function calculateSimilarity(a: string, b: string): number {
  const linesA = a.split('\n').filter(l => l.trim().length > 0);
  const linesB = b.split('\n').filter(l => l.trim().length > 0);
  if (linesA.length === 0 || linesB.length === 0) { return 0; }
  const normA = linesA.map(l => l.trim().replace(/\s+/g, ' '));
  const normB = linesB.map(l => l.trim().replace(/\s+/g, ' '));
  let matches = 0; let bi = 0;
  for (const line of normA) {
    const idx = normB.indexOf(line, bi);
    if (idx !== -1) { matches++; bi = idx + 1; }
  }
  return matches / Math.max(normA.length, normB.length);
}

/** Find best fuzzy match location in content. Returns {index, similarity} or null. */
export function findFuzzyMatch(searchBlock: string, content: string, threshold: number): { index: number; similarity: number } | null {
  const searchLines = normalizeForMatch(searchBlock).split('\n').filter(l => l.length > 0);
  const contentLines = content.split('\n');
  if (searchLines.length === 0 || searchLines.length < 3) { return null; }
  let bestIndex = -1; let bestSimilarity = 0;
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const windowContent = contentLines.slice(i, i + searchLines.length).join('\n');
    const similarity = calculateSimilarity(searchBlock, windowContent);
    if (similarity > bestSimilarity) { bestSimilarity = similarity; bestIndex = i; }
  }
  if (bestSimilarity >= threshold && bestIndex !== -1) {
    const index = contentLines.slice(0, bestIndex).join('\n').length + (bestIndex > 0 ? 1 : 0);
    return { index, similarity: bestSimilarity };
  }
  return null;
}
