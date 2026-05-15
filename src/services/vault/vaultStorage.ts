// [SCOPE] Vault storage operations — CRUD for vault items
// Storage: ~/.chassis-vault/{category}/{name}_{hash}.json
// [WARN] Also reads legacy flat files from ~/.chassis-vault/ root and globalStorage for migration.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { VaultItem, VAULT_CATEGORIES } from './vaultTypes.js';

const VAULT_ROOT = path.join(os.homedir(), '.chassis-vault');
// [DEAD] Legacy Windsurf globalStorage path removed — CHASSIS only reads from ~/.chassis-vault/

function computeContentHash(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

/** Convert old-format vault files to new flat VaultItem */
function migrateOldItem(raw: any): VaultItem | null {
  if (!raw || typeof raw !== 'object') return null;

  // Format 1: new flat (already correct)
  if (raw.code && raw.name && raw.category && raw.contentHash) {
    return raw as VaultItem;
  }

  // Format 2: old nested block structure (from globalStorage)
  if (raw.block && raw.block.code) {
    const block = raw.block;
    const lines = Array.isArray(block.lines) ? block.lines : [0, 0];
    const code = block.code || '';
    return {
      id: raw.id || computeContentHash(code).slice(0, 16),
      name: block.name || 'unknown',
      code,
      language: block.language || 'txt',
      category: (raw.tags?.[0] || 'other').toLowerCase(),
      description: '',
      sourceProject: '',
      sourceFile: '',
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: string) => t.toLowerCase()) : ['other'],
      lineCount: (lines[1] - lines[0]) + 1,
      importCount: 0,
      createdAt: new Date().toISOString(),
      contentHash: raw.contentHash || computeContentHash(code),
    };
  }

  // Format 3: source/provenance structure (from ~/.chassis-vault/ root)
  if (raw.code && raw.name && raw.source) {
    const code = raw.code || '';
    return {
      id: raw.id || computeContentHash(code).slice(0, 16),
      name: raw.name || 'unknown',
      code,
      language: raw.language || 'txt',
      category: (raw.category || 'other').toLowerCase(),
      description: raw.description || '',
      sourceProject: raw.source?.projectName || '',
      sourceFile: raw.source?.filePath || '',
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: string) => t.toLowerCase()) : [raw.category || 'other'],
      lineCount: code.split('\n').length,
      importCount: raw.provenance?.timesImported || 0,
      createdAt: raw.provenance?.createdAt || raw.source?.extractedAt || new Date().toISOString(),
      contentHash: computeContentHash(code),
    };
  }

  return null;
}

export class VaultStorage {
  private rootDir: string;

  constructor(rootDir = VAULT_ROOT) {
    this.rootDir = rootDir;
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private itemPath(item: VaultItem): string {
    const catDir = path.join(this.rootDir, item.category);
    return path.join(catDir, `${item.name}_${item.contentHash.slice(0, 8)}.json`);
  }

  /** Build VaultItem from flat file path */
  private loadItem(filePath: string): VaultItem | null {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return migrateOldItem(raw);
    } catch {
      return null;
    }
  }

  saveItem(item: VaultItem): void {
    const p = this.itemPath(item);
    this.ensureDir(path.dirname(p));
    fs.writeFileSync(p, JSON.stringify(item, null, 2));
  }

  isDuplicate(contentHash: string): boolean {
    return this.getAllItems().some(e => e.contentHash === contentHash);
  }

  deleteItem(itemId: string): boolean {
    for (const cat of VAULT_CATEGORIES) {
      const catDir = path.join(this.rootDir, cat);
      if (!fs.existsSync(catDir)) continue;
      const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const item = this.loadItem(path.join(catDir, f));
        if (item && item.id === itemId) {
          fs.unlinkSync(path.join(catDir, f));
          return true;
        }
      }
    }
    return false;
  }

  getItem(itemId: string): VaultItem | null {
    return this.getAllItems().find(e => e.id === itemId) || null;
  }

  /** Read new category-based files + legacy flat files from root + globalStorage */
  getAllItems(): VaultItem[] {
    const seen = new Set<string>();
    const items: VaultItem[] = [];

    // 1. New category-based structure
    if (fs.existsSync(this.rootDir)) {
      const cats = fs.readdirSync(this.rootDir).filter(d => {
        const p = path.join(this.rootDir, d);
        return fs.statSync(p).isDirectory();
      });
      for (const cat of cats) {
        const catDir = path.join(this.rootDir, cat);
        const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          const item = this.loadItem(path.join(catDir, f));
          if (item && !seen.has(item.contentHash)) {
            seen.add(item.contentHash);
            items.push(item);
          }
        }
      }
    }

    // 2. Legacy flat files in ~/.chassis-vault/ root
    if (fs.existsSync(this.rootDir)) {
      const rootFiles = fs.readdirSync(this.rootDir).filter(f => f.endsWith('.json'));
      for (const f of rootFiles) {
        const item = this.loadItem(path.join(this.rootDir, f));
        if (item && !seen.has(item.contentHash)) {
          seen.add(item.contentHash);
          items.push(item);
        }
      }
    }

    // [DEAD] Legacy globalStorage reading removed — never pull from Windsurf's storage path

    return items;
  }

  getItemsByCategory(category: string): VaultItem[] {
    const catDir = path.join(this.rootDir, category);
    if (!fs.existsSync(catDir)) return [];
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));
    return files.map(f => this.loadItem(path.join(catDir, f))).filter(Boolean) as VaultItem[];
  }

  getCategories(): { name: string; count: number }[] {
    if (!fs.existsSync(this.rootDir)) return [];
    return VAULT_CATEGORIES.map(cat => {
      const catDir = path.join(this.rootDir, cat);
      const count = fs.existsSync(catDir)
        ? fs.readdirSync(catDir).filter(f => f.endsWith('.json')).length
        : 0;
      return { name: cat, count };
    }).sort((a, b) => b.count - a.count);
  }

  /** For backward compat — list all items (alias for getAllItems) */
  listItems(): VaultItem[] {
    return this.getAllItems();
  }
  listGlobalItems(): VaultItem[] {
    return this.getAllItems(); // unified storage, no local/global split
  }
}

