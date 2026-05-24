// [SCOPE] Vault Service — main facade for vault operations
// Rebuilt to spec: ~/.chassis-vault/{category}/{name}_{hash}.json

import type * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VAULT_CATEGORIES, VaultCategory, VaultItem } from './vaultTypes.js';
import { extractFromFile, computeContentHash } from './vaultExtractor.js';
import { aiCategorize as _aiCategorize, scanCodebase as _scanCodebase } from './vaultScanner.js';
import { VaultStorage } from './vaultStorage.js';
import { chassisFormat } from '../code/chassisFormatter.js';
import type { RoutingService } from '../ai/routingService.js';

export { VAULT_CATEGORIES, VaultCategory, VaultItem };

/** Keyword-based category suggestion per spec */
export function suggestCategory(name: string, code: string): VaultCategory {
  const text = (name + ' ' + code).toLowerCase();
  const rules: { keywords: string[]; category: VaultCategory }[] = [
    { keywords: ['auth', 'login', 'token', 'session', 'password', 'credential', 'jwt', 'oauth', 'permission', 'role'], category: 'auth' },
    { keywords: ['fetch', 'api', 'request', 'endpoint', 'http', 'axios', 'graphql', 'rest', 'client', 'url'], category: 'api' },
    { keywords: ['db', 'database', 'query', 'sql', 'table', 'insert', 'select', 'update', 'delete', 'schema', 'model', 'orm', 'mongoose', 'prisma'], category: 'database' },
    { keywords: ['component', 'render', 'view', 'screen', 'button', 'modal', 'card', 'list', 'form', 'input', 'page', 'ui', 'widget', 'layout'], category: 'component' },
    { keywords: ['util', 'helper', 'format', 'parse', 'convert', 'transform', 'sanitize', 'normalize', 'encode', 'decode', 'slugify', 'camelize'], category: 'utility' },
    { keywords: ['validate', 'check', 'verify', 'sanitize', 'schema', 'zod', 'joi', 'yup', 'validator', 'regex'], category: 'validation' },
    { keywords: ['error', 'exception', 'catch', 'throw', 'fail', 'handler', 'guard', 'try', 'reject'], category: 'error' },
    { keywords: ['test', 'spec', 'mock', 'expect', 'assert', 'jest', 'mocha', 'cypress', 'e2e', 'unit'], category: 'testing' },
    { keywords: ['socket', 'websocket', 'p2p', 'network', 'connect', 'tcp', 'udp', 'stream', 'pipe', 'download', 'upload'], category: 'network' },
    { keywords: ['sort', 'search', 'filter', 'algorithm', 'calculate', 'compute', 'matrix', 'graph', 'tree', 'cache', 'memoize', 'hash', 'crypto'], category: 'algorithm' },
    { keywords: ['config', 'setting', 'env', 'option', 'preference', 'constant', 'define', 'preset', 'theme'], category: 'config' },
    { keywords: ['pattern', 'factory', 'singleton', 'observer', 'middleware', 'decorator', 'strategy', 'proxy', 'builder'], category: 'pattern' },
  ];
  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) {return rule.category;}
  }
  return 'other';
}

export class VaultService {
  private storage: VaultStorage;

  constructor(context: vscode.ExtensionContext) {
    this.storage = new VaultStorage(); // uses ~/.chassis-vault/ default
  }

  // ── CRUD

  getAllItems(): VaultItem[] { return this.storage.getAllItems(); }
  listItems(): VaultItem[] { return this.storage.getAllItems(); }
  listGlobalItems(): VaultItem[] { return this.storage.getAllItems(); }
  getItem(itemId: string, _global?: boolean): VaultItem | null { return this.storage.getItem(itemId); }

  saveItem(item: VaultItem): void {
    this.storage.saveItem(item);
  }

  isDuplicate(contentHash: string): boolean {
    return this.storage.isDuplicate(contentHash);
  }

  deleteItem(itemId: string): void {
    this.storage.deleteItem(itemId);
  }

  importItems(itemsJson: string, _global?: boolean): number {
    const items: VaultItem[] = JSON.parse(itemsJson);
    for (const item of items) { this.storage.saveItem(item); }
    return items.length;
  }

  // ── category queries

  getItemsByCategory(category: string): VaultItem[] {
    return this.storage.getItemsByCategory(category);
  }

  listByCategory(category: VaultCategory, _global = false): VaultItem[] {
    return this.storage.getItemsByCategory(category);
  }

  listBySubcategory(category: VaultCategory, subcategory: string, _global = false): VaultItem[] {
    return this.storage.getAllItems().filter(i => i.category === category && i.tags.includes(subcategory));
  }

  getCategories(): { name: string; count: number }[] {
    return this.storage.getCategories();
  }

  searchItems(query: string): VaultItem[] {
    const q = query.toLowerCase();
    return this.getAllItems().filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q)) ||
      item.description.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q)
    );
  }

  /** Finds vault items that are likely duplicates of a build task.
   *  Extracts meaningful words from the task, scores each vault item by keyword overlap,
   *  returns matches above the threshold sorted by score descending. */
  findSimilar(task: string, threshold = 0.25): Array<VaultItem & { score: number }> {
    const stopWords = new Set(['a','an','the','and','or','for','to','in','of','that','with','build','create','make','write','generate','function','simple','basic','small']);
    const taskWords = task.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    if (taskWords.length === 0) { return []; }
    return this.getAllItems()
      .map(item => {
        const itemName = item.name.toLowerCase().replace(/[_-]/g, ' ');
        // Exact name match is decisive — always surfaces as a strong hit
        const exactNameMatch = taskWords.some(w => itemName === w || itemName.includes(w));
        if (exactNameMatch) { return { ...item, score: 1.0 }; }
        // Name word matches count double (more signal than description words)
        const nameWords = itemName.split(/\s+/).filter(w => w.length > 2);
        const nameMatches = taskWords.filter(w => nameWords.some(n => n.includes(w) || w.includes(n))).length;
        const descHaystack = [item.description, item.tags.join(' ')]
          .join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        const descMatches = taskWords.filter(w => descHaystack.includes(w)).length;
        const score = (nameMatches * 2 + descMatches) / (taskWords.length + nameMatches);
        return { ...item, score };
      })
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ── import item into target project

  importItem(itemId: string, targetProject: string): string | null {
    const item = this.getItem(itemId);
    if (!item) {return null;}

    const vaultDir = path.join(targetProject, 'src', 'vault');
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const ext = item.language === 'typescript' ? 'ts'
      : item.language === 'javascript' ? 'js'
      : item.language === 'python' ? 'py'
      : item.language;
    const filePath = path.join(vaultDir, `${item.name}.${ext}`);

    const formattedCode = chassisFormat(item.code, item.name, item.language || 'typescript');
    const header = `// Imported from CHASSIS Vault — source: ${item.sourceProject}/${path.basename(item.sourceFile)}\n`;
    fs.writeFileSync(filePath, header + formattedCode);

    item.importCount++;
    this.saveItem(item);

    return filePath;
  }

  // ── delegated extractors

  extractFromFile(filePath: string, content: string): { items: VaultItem[]; filteredCount: number } {
    return extractFromFile(filePath, content);
  }

  async aiCategorize(items: VaultItem[], routingService: RoutingService): Promise<VaultItem[]> {
    return _aiCategorize(items, routingService);
  }

  async scanCodebase(
    root: string,
    fileTypes?: string[],
    ignorePaths?: string[],
    progress?: (msg: string) => void
  ): Promise<{ items: VaultItem[]; fileCount: number; filteredCount: number }> {
    return _scanCodebase(root, fileTypes, ignorePaths, progress);
  }
}