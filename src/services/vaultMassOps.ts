// [SCOPE] Vault mass operations — massTag, massDelete, massReparent, cleanupDuplicates, archiveBefore
// Called by vaultService. Uses vaultStorage for CRUD. No query or import/export logic here.

import * as fs from 'fs';
import { VaultCategory, VaultItem } from './vaultTypes.js';
import { computeContentHash } from './vaultExtractor.js';

export class VaultMassOps {
  constructor(private storage: any) {} // VaultStorage instance

  massTag(tag: VaultCategory, global = false): number {
    const items = this.storage.listItems(global);
    let count = 0;
    for (const item of items) {
      if (!item.tags.includes(tag)) {
        item.tags.push(tag);
        // [WARN] Individual save operations; if one fails, subsequent items will still be processed,
        // but the overall operation might leave the vault in an inconsistent state.
        this.storage.saveItem(item, global);
        count++;
      }
    }
    return count;
  }

  massDelete(global = false): number {
    const items = this.storage.listItems(global);
    for (const item of items) {
      // [WARN] Individual delete operations; if one fails, subsequent items will still be processed.
      this.storage.deleteItem(item.id, global);
    }
    return items.length;
  }

  massReparent(fromGlobal: boolean, toGlobal: boolean): number {
    const items = this.storage.listItems(fromGlobal);
    for (const item of items) {
      this.storage.deleteItem(item.id, fromGlobal);
      // [WARN] Potential data loss: If 'deleteItem' succeeds but 'saveItem' fails, the item could be lost.
      this.storage.saveItem(item, toGlobal);
    }
    return items.length;
  }

  cleanupDuplicates(global = false): number {
    const items = this.storage.listItems(global);
    const seen = new Map<string, VaultItem>();
    let removed = 0;
    for (const item of items) {
      const hash = item.contentHash || computeContentHash(item.block.code);
      if (seen.has(hash)) {
        this.storage.deleteItem(item.id, global);
        removed++;
      } else {
        seen.set(hash, item);
      }
    }
    return removed;
  }

  archiveBefore(date: Date, global = false): VaultItem[] {
    const items = this.storage.listItems(global);
    return items.filter((item: VaultItem) => {
      const p = this.storage.itemPath(item.id, global);
      // [WARN] fs.statSync can throw if file is unexpectedly missing or inaccessible.
      const stats = fs.statSync(p);
      return stats.mtime < date;
    });
  }
}
