// [SCOPE] Vault Service orchestrator — thin facade over storage, query, mass ops, and import/export modules
// Split from 265-line monolith. Each responsibility now lives in its own file under 200 lines.

import * as vscode from 'vscode';
import * as path from 'path';
import { RoutingService } from './routingService.js';
import { VAULT_CATEGORIES, VaultCategory, VaultItem } from './vaultTypes.js';
import { extractFromFile } from './vaultExtractor.js';
import { aiCategorize as _aiCategorize, scanCodebase as _scanCodebase } from './vaultScanner.js';
import { VaultStorage } from './vaultStorage.js';
import { VaultQuery } from './vaultQuery.js';
import { VaultMassOps } from './vaultMassOps.js';
import { VaultImportExport } from './vaultImportExport.js';

export { VAULT_CATEGORIES, VaultCategory, VaultItem };

export class VaultService {
  private storage: VaultStorage;
  private query: VaultQuery;
  private massOps: VaultMassOps;
  private importExport: VaultImportExport;

  constructor(context: vscode.ExtensionContext) {
    const localDir = path.join(context.globalStorageUri.fsPath, 'vault', 'local');
    const globalDir = path.join(context.globalStorageUri.fsPath, 'vault', 'global');
    this.storage = new VaultStorage(localDir, globalDir);
    this.query = new VaultQuery(this.storage);
    this.massOps = new VaultMassOps(this.storage);
    this.importExport = new VaultImportExport(this.storage);
  }

  // ── CRUD (delegated to VaultStorage)

  listGlobalItems(): VaultItem[] {
    return this.storage.listGlobalItems();
  }

  saveItem(item: VaultItem, global = false): void {
    this.storage.saveItem(item, global);
  }

  isDuplicate(item: VaultItem, global = false): boolean {
    return this.storage.isDuplicate(item, global);
  }

  deleteItem(itemId: string, global = false): void {
    this.storage.deleteItem(itemId, global);
  }

  deleteItems(itemIds: string[], global = false): number {
    return this.storage.deleteItems(itemIds, global);
  }

  listItems(global = false): VaultItem[] {
    return this.storage.listItems(global);
  }

  getItem(itemId: string, global = false): VaultItem | null {
    return this.storage.getItem(itemId, global);
  }

  // ── query operations (delegated to VaultQuery)

  listByCategory(category: VaultCategory, global = false): VaultItem[] {
    return this.query.listByCategory(category, global);
  }

  listBySubcategory(category: VaultCategory, subcategory: string, global = false): VaultItem[] {
    return this.query.listBySubcategory(category, subcategory, global);
  }

  getSubcategoriesForCategory(category: VaultCategory, global = false): { name: string; count: number }[] {
    return this.query.getSubcategoriesForCategory(category, global);
  }

  searchItems(query: string, global = false): VaultItem[] {
    return this.query.searchItems(query, global);
  }

  // ── mass operations (delegated to VaultMassOps)

  massTag(tag: VaultCategory, global = false): number {
    return this.massOps.massTag(tag, global);
  }

  massDelete(global = false): number {
    return this.massOps.massDelete(global);
  }

  massReparent(fromGlobal: boolean, toGlobal: boolean): number {
    return this.massOps.massReparent(fromGlobal, toGlobal);
  }

  cleanupDuplicates(global = false): number {
    return this.massOps.cleanupDuplicates(global);
  }

  archiveBefore(date: Date, global = false): VaultItem[] {
    return this.massOps.archiveBefore(date, global);
  }

  // ── import/export (delegated to VaultImportExport)

  exportItems(global = false): string {
    return this.importExport.exportItems(global);
  }

  importItems(json: string, global = false): number {
    return this.importExport.importItems(json, global);
  }

  // ── category management (orchestrator-only)

  updateItemTags(itemId: string, tags: string[], global = false, subcategory?: string): void {
    const item = this.getItem(itemId, global);
    if (item) {
      item.tags = tags;
      if (subcategory !== undefined) { item.subcategory = subcategory; }
      this.saveItem(item, global);
    }
  }

  addToCategory(itemId: string, category: VaultCategory, global = false): void {
    const item = this.getItem(itemId, global);
    if (item) {
      if (!item.tags.includes(category)) {
        item.tags.push(category);
        this.saveItem(item, global);
      }
    }
  }

  removeFromCategory(itemId: string, category: VaultCategory, global = false): void {
    const item = this.getItem(itemId, global);
    if (item) {
      item.tags = item.tags.filter(t => t !== category);
      this.saveItem(item, global);
    }
  }

  // ── delegated methods (to vaultExtractor and vaultScanner)

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