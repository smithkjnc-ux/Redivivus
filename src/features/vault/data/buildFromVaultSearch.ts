// [SCOPE] Build from vault search — task-aware vault search with keyword extraction and scoring
// Called by buildFromVaultService. No build planning or assembly logic here.

import type { VaultItem } from './vaultService.js';

export interface VaultSearchResult {
  items: Array<VaultItem & { score: number }>;
  totalScanned: number;
  matchedCount: number;
  highConfidenceCount: number;
}

export function findRelevantByTask(task: string, items: VaultItem[]): VaultSearchResult {
  const taskLower = task.toLowerCase();

  // Extract meaningful words from task (3+ chars, no stop words)
  const stopWords = new Set(['the','and','for','with','that','this','from','into','when','will','make','have','add','new','get','set','use','its','are','was','not','but','can','all','any','put','our','out','has','had','more','than','then','some','such','also','into','over','only','just','how','what','each','they','them','been','were','does','did','let','per','via']);
  
  // Also extract technology keywords (longer words get more weight)
  const taskWords = taskLower
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .map(w => ({ word: w, weight: w.length >= 5 ? 3 : 2 })); // Longer words = more specific

  if (taskWords.length === 0) {
    return { items: [], totalScanned: items.length, matchedCount: 0, highConfidenceCount: 0 };
  }

  const scored = items
    .map(item => {
      let score = 0;
      const itemText = [
        item.name.toLowerCase(),
        item.sourceFile.toLowerCase(),
        item.category,
        item.tags.join(' '),
        (item.description || '').toLowerCase(),
        ((item as any).useCase || '').toLowerCase(),
        item.code.slice(0, 300).toLowerCase(),
      ].join(' ');

      // Weighted word scoring
      for (const { word, weight } of taskWords) {
        const count = (itemText.match(new RegExp(word, 'g')) || []).length;
        if (count > 0) { score += weight * count; }
      }
      
      // Boost for exact name match (very high confidence)
      if (taskLower.includes(item.name.toLowerCase())) { score += 15; }
      
      // Boost for category match
      if (taskLower.includes(item.category.toLowerCase())) { score += 5; }
      
      // Boost for tag matches
      for (const tag of item.tags) {
        if (taskLower.includes(tag.toLowerCase())) { score += 4; }
      }
      
      return { item, score };
    })
    .filter(s => s.score >= 5) // Minimum threshold - must be somewhat relevant
    .sort((a, b) => b.score - a.score);

  const highConfidence = scored.filter(s => s.score >= 25).length;
  
  const topMatches = scored.slice(0, 15);

  const finalScored = topMatches.length > 5 && topMatches[4].score > topMatches[5].score * 2
    ? topMatches.slice(0, 5)
    : topMatches.length > 10 && topMatches[9].score > topMatches[10].score * 2
    ? topMatches.slice(0, 10)
    : topMatches;
  return {
    items: finalScored.map(s => ({ ...s.item, score: s.score })),
    totalScanned: items.length,
    matchedCount: scored.length,
    highConfidenceCount: highConfidence,
  };
}
