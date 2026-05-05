// [SCOPE] Vault AI categorization and codebase scanning — delegates extraction to vaultExtractor.ts
import * as path from 'path';
import * as fs from 'fs';
import { RoutingService } from './routingService.js';
import { VAULT_CATEGORIES, VaultItem } from './vaultTypes.js';
import { extractFromFile } from './vaultExtractor.js';

// [SCOPE] AI categorize vault items in batches — returns category + subcategory per item
export async function aiCategorize(items: VaultItem[], routingService: RoutingService): Promise<VaultItem[]> {
  const BATCH = 20;
  const validCategories = VAULT_CATEGORIES as readonly string[];
  const result = [...items];

  for (let i = 0; i < result.length; i += BATCH) {
    const batch = result.slice(i, i + BATCH);
    const listStr = batch.map((item, idx) =>
      `${idx + 1}. name="${item.name}" language="${item.language}" file="${path.basename(item.sourceFile)}" preview="${item.code.slice(0, 120).replace(/\n/g, ' ')}"`
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
      console.warn(`[CHASSIS] aiCategorize batch ${i}-${i + BATCH} failed: ${response.error || 'no response'}`);
      continue;
    }
    // [WARN] AI responses can be malformed; robust parsing is critical here.
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
        if (cat && validCategories.includes(cat)) {
          item.category = cat;
          item.tags = [cat];
        }
      });
    } catch {
      console.warn(`[CHASSIS] aiCategorize batch ${i}-${i + BATCH} parse failed:`, response.text.slice(0, 200));
    }
  }
  return result;
}

// [SCOPE] Walk a codebase directory and extract all vault items from matching files
// [WARN] Uses synchronous fs operations — can block for very large codebases
export async function scanCodebase(
  root: string,
  fileTypes = ['.ts', '.tsx', '.js', '.jsx', '.py'],
  ignorePaths: string[] = ['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.chassis', 'functions/node_modules', 'ios/Pods', 'android/build'],
  progress?: (msg: string) => void
): Promise<{ items: VaultItem[]; fileCount: number; filteredCount: number }> {
  const items: VaultItem[] = [];
  let fileCount = 0;
  let totalFiltered = 0;

  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignorePaths.some(ip => full.includes(ip))) { continue; }
        walk(full);
      } else {
        const ext = path.extname(full).toLowerCase();
        if (!fileTypes.includes(ext)) { continue; }
        fileCount++;
        if (progress) { progress(`Scanning: ${path.basename(full)}`); }
        try {
          const content = fs.readFileSync(full, 'utf-8');
          const result = extractFromFile(full, content);
          items.push(...result.items);
          totalFiltered += result.filteredCount;
        } catch (e) {
          console.warn(`[VaultScanner] Could not read ${full}:`, e);
        }
      }
    }
  };
  walk(root);
  return { items, fileCount, filteredCount: totalFiltered };
}
