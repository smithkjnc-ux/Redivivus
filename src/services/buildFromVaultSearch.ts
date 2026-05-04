// [SCOPE] Build from vault search — task-aware vault search with keyword extraction and scoring
// Called by buildFromVaultService. No build planning or assembly logic here.

import { VaultItem } from './vaultService.js';

export function findRelevantByTask(task: string, items: VaultItem[]): VaultItem[] {
  const taskLower = task.toLowerCase();

  // Extract words from task (3+ chars, no stop words)
  const stopWords = new Set(['the','and','for','with','that','this','from','into','when','will','make','have','add','new','get','set','use','its','are','was','not','but','can','all','any','put','our','out','has','had','more','than','then','some','such','also','into','over','only','just','how','what','each','they','them','been','were','does','did','let','per','via']);
  const taskWords = taskLower
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  return items
    .map(item => {
      let score = 0;
      const itemText = [
        item.block.name.toLowerCase(),
        item.block.filePath.toLowerCase(),
        item.tags.join(' '),
        item.subcategory || '',
        item.block.code.slice(0, 200).toLowerCase(),
      ].join(' ');

      for (const word of taskWords) {
        if (itemText.includes(word)) { score += 2; }
      }
      // boost exact name matches
      if (taskLower.includes(item.block.name.toLowerCase())) { score += 5; }
      return { item, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(s => s.item);
}
