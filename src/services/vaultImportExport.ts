// [SCOPE] Vault import/export — exportItems, importItems for vault data portability
// Called by vaultService. Uses vaultStorage for CRUD. No query or mass operation logic here.

import { VaultItem } from './vaultTypes.js';

export class VaultImportExport {
  constructor(private storage: any) {} // VaultStorage instance

  exportItems(global = false): string {
    const items = this.storage.listItems(global);
    return JSON.stringify(items, null, 2);
  }

  importItems(json: string, global = false): number {
    // [WARN] JSON.parse can throw an error for invalid JSON, which is not caught locally.
    const items = JSON.parse(json) as VaultItem[];
    for (const item of items) {
      if (!this.storage.isDuplicate(item, global)) {
        // [WARN] Individual save operations; if one fails, subsequent items will still be processed,
        // potentially leading to an incomplete import.
        this.storage.saveItem(item, global);
      }
    }
    return items.length;
  }
}
