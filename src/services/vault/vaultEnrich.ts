// [SCOPE] Vault Enrichment — retroactively adds AI descriptions/quality scores to existing vault items
// Run once via redivivus.vault.enrich to upgrade items captured before AI quality gate was wired.

import type { VaultService } from './vaultService.js';
import { evaluateQuality } from './vaultQualityGate.js';
import type { AIResponse } from '../ai/routingTypes.js';

export interface EnrichResult {
  enriched: number;
  skipped: number;
  failed: number;
}

/**
 * Loops through vault items that are missing description or qualityScore
 * and fills them using the AI quality gate. Saves enriched items back to vault.
 * Safe to re-run — already-enriched items are skipped.
 */
export async function enrichVaultDescriptions(
  vault: VaultService,
  callAI: (prompt: string) => Promise<AIResponse>,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, skipped: 0, failed: 0 };
  const items = vault.listItems();
  const needsEnrich = items.filter(item => !item.description || !(item as any).qualityScore);

  for (let i = 0; i < needsEnrich.length; i++) {
    const item = needsEnrich[i];
    onProgress?.(i, needsEnrich.length, item.name);
    try {
      const verdict = await evaluateQuality(item.name, item.code, item.language, callAI);
      if (!verdict.reusable || verdict.qualityScore < 3) {
        // Low quality — remove from vault rather than keep it unscored
        vault.deleteItem(item.id);
        result.skipped++;
        continue;
      }
      item.description = verdict.description || item.description;
      (item as any).useCase = verdict.useCase;
      (item as any).qualityScore = verdict.qualityScore;
      (item as any).reusable = verdict.reusable;
      vault.saveItem(item);
      result.enriched++;
    } catch {
      result.failed++;
    }
  }
  return result;
}
