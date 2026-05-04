// [SCOPE] Vault storage operations — CRUD for vault items (save, load, delete, list, duplicate check)
// Called by vaultService and vaultMassOps. No query or mass operation logic here.

import * as fs from 'fs';
import * as path from 'path';
import { VaultItem } from './vaultTypes.js';
import { computeContentHash } from './vaultExtractor.js';

export class VaultStorage {
  private localDir: string;
  private globalDir: string;

  constructor(localDir: string, globalDir: string) {
    this.localDir = localDir;
    this.globalDir = globalDir;
  }

  ensureVaultDirs(): void {
    if (!fs.existsSync(this.localDir)) {
      fs.mkdirSync(this.localDir, { recursive: true });
    }
    if (!fs.existsSync(this.globalDir)) {
      fs.mkdirSync(this.globalDir, { recursive: true });
    }
  }

  itemPath(itemId: string, global = false): string {
    const dir = global ? this.globalDir : this.localDir;
    return path.join(dir, `${itemId}.json`);
  }

  listGlobalItems(): VaultItem[] {
    this.ensureVaultDirs();
    if (!fs.existsSync(this.globalDir)) { return []; }
    const files = fs.readdirSync(this.globalDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const content = fs.readFileSync(path.join(this.globalDir, f), 'utf-8');
      // [WARN] The 'null!' assertion can mask runtime errors during JSON parsing. Consider logging the error or returning 'null' explicitly.
      try { return JSON.parse(content); } catch { return null!; }
    }).filter(Boolean);
  }

  saveItem(item: VaultItem, global = false): void {
    this.ensureVaultDirs();
    if (!item.contentHash) { item.contentHash = computeContentHash(item.block.code); }
    fs.writeFileSync(this.itemPath(item.id, global), JSON.stringify(item, null, 2));
  }

  isDuplicate(item: VaultItem, global = false): boolean {
    const existing = this.listItems(global);
    const itemHash = item.contentHash || computeContentHash(item.block.code);
    return existing.some(e => (e.contentHash || computeContentHash(e.block.code)) === itemHash);
  }

  deleteItem(itemId: string, global = false): void {
    this.ensureVaultDirs();
    const p = this.itemPath(itemId, global);
    if (fs.existsSync(p)) { fs.unlinkSync(p); }
  }

  deleteItems(itemIds: string[], global = false): number {
    let count = 0;
    for (const id of itemIds) {
      const p = this.itemPath(id, global);
      if (fs.existsSync(p)) { fs.unlinkSync(p); count++; }
    }
    return count;
  }

  listItems(global = false): VaultItem[] {
    this.ensureVaultDirs();
    const dir = global ? this.globalDir : this.localDir;
    if (!fs.existsSync(dir)) { return []; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8');
      // [WARN] The 'null!' assertion can mask runtime errors during JSON parsing. Consider logging the error or returning 'null' explicitly.
      try { return JSON.parse(content); } catch { return null!; }
    }).filter(Boolean);
  }

  getItem(itemId: string, global = false): VaultItem | null {
    const p = this.itemPath(itemId, global);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      // [WARN] Silent failure for file read or JSON parsing.
      return null;
    }
  }
}
