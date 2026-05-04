// [SCOPE] Vault query operations — listByCategory, listBySubcategory, getSubcategoriesForCategory, searchItems
// Called by vaultService. No storage or mass operation logic here.

import { VaultCategory, VaultItem } from './vaultTypes.js';

export class VaultQuery {
  constructor(private storage: any) {} // VaultStorage instance

  listByCategory(category: VaultCategory, global = false): VaultItem[] {
    return this.storage.listItems(global).filter((i: VaultItem) => i.tags.includes(category));
  }

  listBySubcategory(category: VaultCategory, subcategory: string, global = false): VaultItem[] {
    return this.storage.listItems(global).filter((i: VaultItem) =>
      i.tags.includes(category) && i.subcategory === subcategory
    );
  }

  getSubcategoriesForCategory(category: VaultCategory, global = false): { name: string; count: number }[] {
    const items = this.listByCategory(category, global);
    const counts = new Map<string, number>();
    for (const item of items) {
      const sub = item.subcategory || 'general';
      counts.set(sub, (counts.get(sub) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  searchItems(query: string, global = false): VaultItem[] {
    const lower = query.toLowerCase();
    return this.storage.listItems(global).filter((i: VaultItem) =>
      i.block.name.toLowerCase().includes(lower) ||
      i.block.code.toLowerCase().includes(lower) ||
      i.tags.some((t: string) => t.toLowerCase().includes(lower))
    );
  }
}
