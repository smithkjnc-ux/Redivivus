// [SCOPE] Vault data utilities — getVaultItems, getVaultCategoryCounts, HTML escaping
// Called by vaultScanSummary and vaultTabRenderer. No rendering logic here.

import type { VaultService, VaultItem} from '../../services/vault/vaultService.js';
import { VaultCategory, VAULT_CATEGORIES } from '../../services/vault/vaultService.js';

export function getVaultItems(vaultService: VaultService): VaultItem[] {
  return vaultService.listItems();
}

export function getVaultCategoryCounts(vaultService: VaultService): Record<string, number> {
  const all = vaultService.listItems();
  const counts: Record<string, number> = {};
  for (const c of VAULT_CATEGORIES) {counts[c] = 0;}
  for (const item of all) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return counts;
}

// [WARN] This function directly generates HTML strings, which is fragile and prone to XSS if not used carefully.
export function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
