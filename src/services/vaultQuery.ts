// [SCOPE] Vault query operations — listByCategory, listBySubcategory, getSubcategoriesForCategory, searchItems
// Called by vaultService. No storage or mass operation logic here.

import { VaultCategory, VaultItem } from './vaultTypes.js';

export class VaultQuery {
  constructor(private storage: any) {} // VaultStorage instance

  listByCategory(category: VaultCategory, global = false): VaultItem[] {
    return this.storage.getAllItems().filter((i: VaultItem) => i.category === category);
  }

  listBySubcategory(category: VaultCategory, subcategory: string, global = false): VaultItem[] {
    return this.storage.getAllItems().filter((i: VaultItem) =>
      i.category === category && i.tags.includes(subcategory)
    );
  }

  getSubcategoriesForCategory(category: VaultCategory, global = false): { name: string; count: number }[] {
    const items = this.listByCategory(category, global);
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        if (tag !== category) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  searchItems(query: string, global = false): VaultItem[] {
    const lower = query.toLowerCase();
    return this.storage.getAllItems().filter((i: VaultItem) =>
      i.name.toLowerCase().includes(lower) ||
      i.code.toLowerCase().includes(lower) ||
      i.category.toLowerCase().includes(lower) ||
      i.tags.some((t: string) => t.toLowerCase().includes(lower))
    );
  }
}
