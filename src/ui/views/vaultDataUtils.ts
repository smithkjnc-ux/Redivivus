// [SCOPE] Vault data utilities — getVaultItems, getVaultCategoryCounts, HTML escaping
// Called by vaultScanSummary and vaultTabRenderer. No rendering logic here.

import { VaultService, VaultCategory, VaultItem, VAULT_CATEGORIES } from '../../services/vaultService.js';

export function getVaultItems(vaultService: VaultService): VaultItem[] {
  return vaultService.listItems(true); // global vault
}

export function getVaultCategoryCounts(vaultService: VaultService): Record<string, number> {
  const all = vaultService.listItems(true);
  const counts: Record<string, number> = {};
  for (const c of VAULT_CATEGORIES) counts[c] = 0;
  for (const item of all) {
    for (const tag of item.tags) {
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

// [WARN] This function directly generates HTML strings, which is fragile and prone to XSS if not used carefully.
export function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
