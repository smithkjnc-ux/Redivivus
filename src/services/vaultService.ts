import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { RoutingService } from './routingService.js';

// ── Vault categories ──
export const VAULT_CATEGORIES = [
  'component',
  'utility',
  'algorithm',
  'pattern',
  'config',
  'api',
  'database',
  'auth',
  'validation',
  'error',
  'testing',
  'other',
] as const;
export type VaultCategory = typeof VAULT_CATEGORIES[number];

// ── Vault item interfaces ──
export interface ExtractedBlock {
  filePath: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'component' | 'custom';
  code: string;
  language: string;
  lines: [number, number];
}

export interface VaultItem {
  id: string;
  block: ExtractedBlock;
  tags: string[];
  subcategory?: string;      // AI-suggested domain subcategory e.g. 'video', 'payments', 'geolocation'
  contentHash?: string;
  lines?: [number, number];
}

// ── Vault Service ──
export class VaultService {
  private localDir: string;
  private globalDir: string;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.localDir = path.join(context.globalStorageUri.fsPath, 'vault', 'local');
    this.globalDir = path.join(context.globalStorageUri.fsPath, 'vault', 'global');
    this.ensureVaultDirs();
  }

  private ensureVaultDirs(): void {
    if (!fs.existsSync(this.localDir)) {
      fs.mkdirSync(this.localDir, { recursive: true });
    }
    if (!fs.existsSync(this.globalDir)) {
      fs.mkdirSync(this.globalDir, { recursive: true });
    }
  }

  private itemPath(itemId: string, global = false): string {
    const dir = global ? this.globalDir : this.localDir;
    return path.join(dir, `${itemId}.json`);
  }

  private globalItemPath(itemId: string): string {
    return this.itemPath(itemId, true);
  }

  listGlobalItems(): VaultItem[] {
    this.ensureVaultDirs();
    if (!fs.existsSync(this.globalDir)) { return []; }
    const files = fs.readdirSync(this.globalDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const content = fs.readFileSync(path.join(this.globalDir, f), 'utf-8');
      try { return JSON.parse(content); } catch { return null!; }
    }).filter(Boolean);
  }

  // [SCOPE] Code extraction helpers

  private computeContentHash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  saveItem(item: VaultItem, global = false): void {
    this.ensureVaultDirs();
    if (!item.contentHash) {
      item.contentHash = this.computeContentHash(item.block.code);
    }
    fs.writeFileSync(this.itemPath(item.id, global), JSON.stringify(item, null, 2));
  }

  isDuplicate(item: VaultItem, global = false): boolean {
    const existing = this.listItems(global);
    const block = item.block;
    const itemHash = item.contentHash || this.computeContentHash(block.code);
    return existing.some(e => {
      const existingHash = e.contentHash || this.computeContentHash(e.block.code);
      return itemHash === existingHash;
    });
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
      try { return JSON.parse(content); } catch { return null!; }
    }).filter(Boolean);
  }

  listByCategory(category: VaultCategory, global = false): VaultItem[] {
    return this.listItems(global).filter(i => i.tags.includes(category));
  }

  listBySubcategory(category: VaultCategory, subcategory: string, global = false): VaultItem[] {
    return this.listItems(global).filter(i =>
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
    return this.listItems(global).filter(i =>
      i.block.name.toLowerCase().includes(lower) ||
      i.block.code.toLowerCase().includes(lower) ||
      i.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  // [SCOPE] Code extraction filters — reject low-value blocks
  private isSingleReturnWrapper(block: ExtractedBlock): boolean {
    const code = block.code.trim();
    const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 3) {
      const body = lines.join(' ');
      const patterns = [
        /^return\s+\w+\s*\(.*\)\s*;?$/,
        /^return\s+new\s+\w+\s*\(.*\)\s*;?$/,
        /^(return\s+)?\{?\s*\w+\s*:\s*\w+\s*,?\s*\}?\s*;?$/,
      ];
      return patterns.some(p => p.test(body));
    }
    return false;
  }

  private shouldSkipBlock(block: ExtractedBlock, filePath: string): { skip: boolean, reason?: string } {
    // Skip test files
    const testPatterns = /\.(test|spec)\.|__tests__|__mocks__|e2e|\.e2e\./i;
    if (testPatterns.test(filePath)) {
      return { skip: true, reason: 'test-file' };
    }
    const lineCount = block.lines[1] - block.lines[0] + 1;
    // Skip functions under 5 lines
    if (block.type === 'function' && lineCount < 5) {
      return { skip: true, reason: 'too-short' };
    }
    // Skip anonymous / unassigned arrow functions
    if (block.type === 'function' && (block.name === 'unnamed' || /^[a-z]$/.test(block.name) || block.name.startsWith('_'))) {
      return { skip: true, reason: 'anonymous' };
    }
    // Skip single-return wrappers
    if (this.isSingleReturnWrapper(block)) {
      return { skip: true, reason: 'wrapper' };
    }
    return { skip: false };
  }

  // [SCOPE] ── extractBlocks(...) → { items, filteredCount } ──
  private extractBlocks(filePath: string, content: string): { items: VaultItem[], filteredCount: number } {
    const items: VaultItem[] = [];
    let filteredCount = 0;
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();
    let rawBlocks: ExtractedBlock[] = [];
    switch (ext) {
      case '.ts': case '.tsx': case '.js': case '.jsx':
        rawBlocks = this.extractTSJS(lines, filePath, content);
        break;
      case '.py':
        rawBlocks = this.extractPython(lines, filePath, content);
        break;
      case '.md':
        rawBlocks = this.extractMarkdown(lines, filePath, content);
        break;
      default:
        rawBlocks = [];
    }
    // First pass: compute hashes and deduplicate within the same file batch
    const seenHashes = new Set<string>();
    for (const block of rawBlocks) {
      const quality = this.shouldSkipBlock(block, filePath);
      if (quality.skip) {
        filteredCount++;
        continue;
      }
      const contentHash = this.computeContentHash(block.code);
      // Dedup within this file's blocks by content hash
      if (seenHashes.has(contentHash)) {
        filteredCount++;
        continue;
      }
      seenHashes.add(contentHash);
      const item: VaultItem = {
        id: this.generateId(filePath, block.name, block.type),
        block,
        tags: this.inferTags(filePath, block),
        contentHash,
      };
      if (this.isDuplicate(item, true)) {
        filteredCount++;
        continue;
      }
      items.push(item);
    }
    return { items, filteredCount };
  }

  // ── Extraction methods ──
  private detectLanguage(ext: string): string {
    switch (ext) {
      case '.ts': case '.tsx': return 'typescript';
      case '.js': case '.jsx': return 'javascript';
      case '.py': return 'python';
      case '.md': return 'markdown';
      default: return 'text';
    }
  }

  private extractTSJS(lines: string[], filePath: string, content: string): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    const language = this.detectLanguage(path.extname(filePath));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Functions
      const fnMatch = line.match(/^(export\s+)?(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/);
      if (fnMatch) {
        const name = line.match(/function\s+(\w+)/)?.[1] || line.match(/(?:const|let|var)\s+(\w+)/)?.[1] || 'unnamed';
        const start = i + 1;
        let braceCount = 0;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          for (const char of lines[j]) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
          if (braceCount <= 0) {
            end = j + 1;
            break;
          }
        }
        if (end > start) {
          blocks.push({
            filePath,
            name,
            type: 'function',
            code: lines.slice(start - 1, end).join('\n'),
            language,
            lines: [start, end],
          });
        }
      }
      // Classes
      const classMatch = line.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[3];
        const start = i + 1;
        let braceCount = 0;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          for (const char of lines[j]) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
          if (braceCount <= 0) {
            end = j + 1;
            break;
          }
        }
        if (end > start) {
          blocks.push({
            filePath,
            name,
            type: 'class',
            code: lines.slice(start - 1, end).join('\n'),
            language,
            lines: [start, end],
          });
        }
      }
      // Interfaces
      const interfaceMatch = line.match(/^(export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        const name = interfaceMatch[2];
        const start = i + 1;
        let braceCount = 0;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          for (const char of lines[j]) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
          if (braceCount <= 0) {
            end = j + 1;
            break;
          }
        }
        if (end > start) {
          blocks.push({
            filePath,
            name,
            type: 'interface',
            code: lines.slice(start - 1, end).join('\n'),
            language,
            lines: [start, end],
          });
        }
      }
    }
    return blocks;
  }

  private extractPython(lines: string[], filePath: string, content: string): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    const language = 'python';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Functions
      const fnMatch = line.match(/^(def\s+(\w+)\s*\()/);
      if (fnMatch) {
        const name = fnMatch[2];
        const start = i + 1;
        let indentLevel = 0;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          const indent = lines[j].search(/\S/);
          if (j === start) {
            indentLevel = indent;
          } else if (indent <= indentLevel && lines[j].trim().length > 0) {
            end = j;
            break;
          }
          end = j + 1;
        }
        if (end > start) {
          blocks.push({
            filePath,
            name,
            type: 'function',
            code: lines.slice(start - 1, end).join('\n'),
            language,
            lines: [start, end],
          });
        }
      }
      // Classes
      const classMatch = line.match(/^(class\s+(\w+))/);
      if (classMatch) {
        const name = classMatch[2];
        const start = i + 1;
        let indentLevel = 0;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          const indent = lines[j].search(/\S/);
          if (j === start) {
            indentLevel = indent;
          } else if (indent <= indentLevel && lines[j].trim().length > 0 && !lines[j].trim().startsWith('@')) {
            end = j;
            break;
          }
          end = j + 1;
        }
        if (end > start) {
          blocks.push({
            filePath,
            name,
            type: 'class',
            code: lines.slice(start - 1, end).join('\n'),
            language,
            lines: [start, end],
          });
        }
      }
    }
    return blocks;
  }

  private extractMarkdown(lines: string[], filePath: string, content: string): ExtractedBlock[] {
    const blocks: ExtractedBlock[] = [];
    const language = 'markdown';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Code blocks
      if (line.startsWith('```')) {
        const start = i + 1;
        let end = start;
        for (let j = start; j < lines.length; j++) {
          if (lines[j].startsWith('```')) {
            end = j;
            break;
          }
          end = j + 1;
        }
        if (end > start) {
          const code = lines.slice(start, end).join('\n');
          const langMatch = line.match(/```(\w+)/);
          const codeLang = langMatch?.[1] || 'text';
          blocks.push({
            filePath,
            name: `code-block-${i}`,
            type: 'custom',
            code,
            language: codeLang,
            lines: [start, end],
          });
        }
      }
    }
    return blocks;
  }

  // ── Helper methods ──
  private generateId(filePath: string, name: string, type: string): string {
    const hash = crypto.createHash('md5').update(`${filePath}:${name}:${type}`).digest('hex');
    return hash.substring(0, 12);
  }

  private inferTags(filePath: string, block: ExtractedBlock): string[] {
    const tags: string[] = [];
    const basename = path.basename(filePath, path.extname(filePath));
    if (basename.includes('test') || basename.includes('spec')) {
      tags.push('testing');
    }
    if (block.type === 'component') {
      tags.push('component');
    }
    if (block.name.toLowerCase().includes('api') || block.name.toLowerCase().includes('endpoint')) {
      tags.push('api');
    }
    if (block.name.toLowerCase().includes('config')) {
      tags.push('config');
    }
    if (block.name.toLowerCase().includes('auth')) {
      tags.push('auth');
    }
    if (tags.length === 0) {
      tags.push('other');
    }
    return tags;
  }

  // ── Extract from single file ──
  extractFromFile(filePath: string, content: string): { items: VaultItem[], filteredCount: number } {
    return this.extractBlocks(filePath, content);
  }

  // ── AI Categorize items — returns category + subcategory in one pass ──
  async aiCategorize(items: VaultItem[], routingService: RoutingService): Promise<VaultItem[]> {
    const BATCH = 20;
    const validCategories = VAULT_CATEGORIES as readonly string[];
    const result = [...items];

    for (let i = 0; i < result.length; i += BATCH) {
      const batch = result.slice(i, i + BATCH);
      const listStr = batch.map((item, idx) =>
        `${idx + 1}. name="${item.block.name}" type="${item.block.type}" file="${path.basename(item.block.filePath)}" preview="${item.block.code.slice(0, 120).replace(/\n/g, ' ')}"`
      ).join('\n');

      const prompt = `You are a code librarian. For each code block return TWO things:
1. category — exactly ONE of: ${validCategories.join(', ')}
2. subcategory — a short domain label (1-2 words, lowercase, e.g. "video", "payments", "geolocation", "messaging", "auth", "notifications", "contacts", "feed", "search", "p2p", "crypto", "backup", "general")

Category rules:
- component: UI components, React/Vue/Svelte/React Native components
- utility: helper functions, formatters, converters, mappers (rowTo*, parsers)
- algorithm: sorting, searching, data processing, hashing, geohash
- pattern: design patterns, stores, slices, state interfaces, factories
- config: configuration, constants, environment setup, feature flags
- api: HTTP calls, REST/GraphQL endpoints, fetch wrappers, Firebase calls
- database: DB queries, SQLite, ORM models, migrations, schema
- auth: authentication, authorization, JWT, sessions, OTP, tokens
- validation: input validation, schema validation, sanitization
- error: error handling, error classes, error boundaries
- testing: test utilities, mocks, fixtures
- other: truly cannot be categorized

Subcategory examples by domain: video, audio, messaging, payments, geolocation, notifications, contacts, feed, listings, reputation, p2p, crypto, backup, restore, onboarding, settings, permissions, general

Respond with ONLY a JSON array of objects, one per item:
[{"category":"api","subcategory":"notifications"},{"category":"component","subcategory":"feed"}]

Items:
${listStr}`;

      const response = await routingService.prompt(prompt);
      if (!response.success || !response.text) {
        console.warn(`[CHASSIS] aiCategorize batch ${i}-${i+BATCH} failed: ${response.error || 'no response'}`);
        continue;
      }
      try {
        let raw = response.text.trim();
        raw = raw.replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim();
        const arrayMatch = raw.match(/\[[\s\S]*\]/);
        if (arrayMatch) { raw = arrayMatch[0]; }
        const results: { category: string; subcategory: string }[] = JSON.parse(raw);
        batch.forEach((item, idx) => {
          const r = results[idx];
          if (!r) { return; }
          const cat = r.category?.toLowerCase().trim();
          const sub = r.subcategory?.toLowerCase().trim().replace(/[^a-z0-9 _-]/g, '') || 'general';
          if (cat && validCategories.includes(cat)) {
            const filtered = item.tags.filter((t: string) => t !== 'other');
            if (!filtered.includes(cat)) { filtered.push(cat); }
            item.tags = filtered.length > 0 ? filtered : [cat];
            item.subcategory = sub;
          }
        });
      } catch (e) {
        console.warn(`[CHASSIS] aiCategorize batch ${i}-${i+BATCH} parse failed:`, response.text.slice(0, 200));
      }
    }
    return result;
  }

  // ── Scan codebase ──
  async scanCodebase(
    root: string,
    fileTypes = ['.ts', '.tsx', '.js', '.jsx', '.py'],
    ignorePaths: string[] = ['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.chassis', 'functions/node_modules', 'ios/Pods', 'android/build'],
    progress?: (msg: string) => void
  ): Promise<{ items: VaultItem[], fileCount: number, filteredCount: number }> {
    const items: VaultItem[] = [];
    let fileCount = 0;
    let totalFiltered = 0;
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (ignorePaths.some(ip => full.includes(ip))) continue;
          walk(full);
        } else {
          const ext = path.extname(full).toLowerCase();
          if (!fileTypes.includes(ext)) continue;
          fileCount++;
          if (progress) progress(`Scanning: ${path.basename(full)}`);
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const result = this.extractBlocks(full, content);
            items.push(...result.items);
            totalFiltered += result.filteredCount;
          } catch (e) {
            console.warn(`[VaultService] Could not read ${full}:`, e);
          }
        }
      }
    };
    walk(root);
    return { items, fileCount, filteredCount: totalFiltered };
  }

  // ── Update all tags for an item ──
  updateItemTags(itemId: string, tags: string[], global = false, subcategory?: string): void {
    const item = this.getItem(itemId, global);
    if (item) {
      item.tags = tags;
      if (subcategory !== undefined) { item.subcategory = subcategory; }
      this.saveItem(item, global);
    }
  }

  // ── Category manager ──
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

  getItem(itemId: string, global = false): VaultItem | null {
    const p = this.itemPath(itemId, global);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      return null;
    }
  }

  // ── Mass operations ──
  massTag(tag: VaultCategory, global = false): number {
    const items = this.listItems(global);
    let count = 0;
    for (const item of items) {
      if (!item.tags.includes(tag)) {
        item.tags.push(tag);
        this.saveItem(item, global);
        count++;
      }
    }
    return count;
  }

  massDelete(global = false): number {
    const items = this.listItems(global);
    for (const item of items) {
      this.deleteItem(item.id, global);
    }
    return items.length;
  }

  massReparent(fromGlobal: boolean, toGlobal: boolean): number {
    const items = this.listItems(fromGlobal);
    for (const item of items) {
      this.deleteItem(item.id, fromGlobal);
      this.saveItem(item, toGlobal);
    }
    return items.length;
  }

  cleanupDuplicates(global = false): number {
    const items = this.listItems(global);
    const seen = new Map<string, VaultItem>();
    let removed = 0;
    for (const item of items) {
      const hash = item.contentHash || this.computeContentHash(item.block.code);
      if (seen.has(hash)) {
        this.deleteItem(item.id, global);
        removed++;
      } else {
        seen.set(hash, item);
      }
    }
    return removed;
  }

  archiveBefore(date: Date, global = false): VaultItem[] {
    const items = this.listItems(global);
    return items.filter(item => {
      const p = this.itemPath(item.id, global);
      const stats = fs.statSync(p);
      return stats.mtime < date;
    });
  }

  // ── Import / Export ──
  exportItems(global = false): string {
    const items = this.listItems(global);
    return JSON.stringify(items, null, 2);
  }

  importItems(json: string, global = false): number {
    const items = JSON.parse(json) as VaultItem[];
    for (const item of items) {
      if (!this.isDuplicate(item, global)) {
        this.saveItem(item, global);
      }
    }
    return items.length;
  }
}
