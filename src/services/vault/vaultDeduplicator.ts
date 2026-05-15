// [SCOPE] Vault Deduplication + Merge Engine
// Detects near-duplicate VaultItems using token-level Jaccard similarity.
// Merges duplicate clusters: keeps the item with highest importCount (or newest), deletes the rest.
// Zero AI cost — pure string/set operations.

import { VaultItem } from './vaultTypes.js';

// Threshold above which two items are considered near-duplicates (0.0–1.0)
// 0.82 means ~82% token overlap required — tight enough to avoid false positives
const DEFAULT_THRESHOLD = 0.82;

// [WARN] Tokenizer strips all punctuation — intentional. We want semantic similarity, not syntax.
function tokenize(code: string): Set<string> {
  return new Set(
    code
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

/** Jaccard similarity: |A intersect B| / |A union B| */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) { return 1; }
  let intersection = 0;
  for (const t of a) { if (b.has(t)) { intersection++; } }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface DuplicateCluster {
  keep: VaultItem;       // item to keep (highest importCount, then newest)
  duplicates: VaultItem[]; // items to delete
  similarity: number;    // max similarity within cluster
}

export interface DeduplicationResult {
  clusters: DuplicateCluster[];
  totalScanned: number;
  totalDuplicates: number;
  totalMerged: number;
}

/**
 * Scan items for near-duplicates within the same category.
 * Only compares items in the same category to avoid cross-domain false positives.
 * Returns clusters of near-duplicates — caller decides whether to merge.
 */
export function findNearDuplicates(
  items: VaultItem[],
  threshold = DEFAULT_THRESHOLD
): DuplicateCluster[] {
  const clusters: DuplicateCluster[] = [];
  const consumed = new Set<string>(); // ids already assigned to a cluster

  // Pre-compute token sets
  const tokenMap = new Map<string, Set<string>>();
  for (const item of items) {
    tokenMap.set(item.id, tokenize(item.code));
  }

  // Group by category first to reduce O(n^2) cost
  const byCategory = new Map<string, VaultItem[]>();
  for (const item of items) {
    if (!byCategory.has(item.category)) { byCategory.set(item.category, []); }
    byCategory.get(item.category)!.push(item);
  }

  for (const [, catItems] of byCategory) {
    for (let i = 0; i < catItems.length; i++) {
      const a = catItems[i];
      if (consumed.has(a.id)) { continue; }
      const cluster: VaultItem[] = [];
      let maxSim = 0;

      for (let j = i + 1; j < catItems.length; j++) {
        const b = catItems[j];
        if (consumed.has(b.id)) { continue; }
        const sim = jaccardSimilarity(tokenMap.get(a.id)!, tokenMap.get(b.id)!);
        if (sim >= threshold) {
          cluster.push(b);
          consumed.add(b.id);
          if (sim > maxSim) { maxSim = sim; }
        }
      }

      if (cluster.length > 0) {
        consumed.add(a.id);
        // Elect the "keep" item: highest importCount, then most recently created
        const all = [a, ...cluster];
        all.sort((x, y) => {
          if (y.importCount !== x.importCount) { return y.importCount - x.importCount; }
          return new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime();
        });
        clusters.push({ keep: all[0], duplicates: all.slice(1), similarity: maxSim });
      }
    }
  }

  return clusters;
}

/**
 * Build a human-readable summary of what would be merged, for chat display.
 */
export function summarizeClusters(clusters: DuplicateCluster[]): string {
  if (clusters.length === 0) {
    return 'Vault is clean — no near-duplicates found.';
  }
  const total = clusters.reduce((n, c) => n + c.duplicates.length, 0);
  const lines = [
    `Found **${clusters.length} duplicate cluster${clusters.length !== 1 ? 's'  : ''}** (${total} item${total !== 1 ? 's' : ''} removable):`,
    '',
  ];
  for (const c of clusters) {
    const simPct = Math.round(c.similarity * 100);
    lines.push(`- **Keep:** \`${c.keep.name}\` (${c.keep.category}, ${c.keep.importCount} imports)`);
    for (const d of c.duplicates) {
      lines.push(`  - Remove: \`${d.name}\` (${simPct}% similar, ${d.importCount} imports)`);
    }
  }
  return lines.join('\n');
}
