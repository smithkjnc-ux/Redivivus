// [SCOPE] Vault seeder — pulls curated patterns from GitHub and ships starter patterns with CHASSIS.
// Runs on first install and on "CHASSIS: Refresh Knowledge Base" command.
// [WARN] GitHub unauthenticated API: 60 req/hr. With token: 5000 req/hr.
// Only pulls MIT/Apache/BSD licensed code. Never overwrites user vault items.

import * as crypto from 'crypto';
import { VaultItem, VaultCategory } from './vaultTypes.js';
import { VaultService } from './vaultService.js';
import { getStarterPatterns } from '../project/starterPatterns.js';

// [NEXT] Add more search queries as patterns are validated
const GITHUB_SEARCHES: Array<{ query: string; category: VaultCategory; language: string; tags: string[] }> = [
  { query: 'canvas animation trail requestAnimationFrame', category: 'component', language: 'js', tags: ['canvas', 'animation', 'trail', 'html'] },
  { query: 'debounce throttle utility function', category: 'utility', language: 'js', tags: ['debounce', 'throttle', 'performance'] },
  { query: 'fetch wrapper retry timeout javascript', category: 'api', language: 'js', tags: ['fetch', 'api', 'retry', 'timeout'] },
  { query: 'jwt verify sign node express', category: 'auth', language: 'js', tags: ['jwt', 'auth', 'token', 'express'] },
  { query: 'binary search algorithm javascript', category: 'algorithm', language: 'js', tags: ['binary-search', 'algorithm', 'sorted'] },
  { query: 'deep clone object javascript utility', category: 'utility', language: 'js', tags: ['clone', 'deep-copy', 'object'] },
  { query: 'rate limiter middleware express', category: 'api', language: 'js', tags: ['rate-limit', 'middleware', 'express'] },
  { query: 'observer pattern event emitter typescript', category: 'pattern', language: 'ts', tags: ['observer', 'event-emitter', 'pattern'] },
  { query: 'input validation sanitize form typescript', category: 'validation', language: 'ts', tags: ['validation', 'sanitize', 'form'] },
  { query: 'error boundary react component', category: 'error', language: 'tsx', tags: ['error-boundary', 'react', 'component'] },
];

const ALLOWED_LICENSES = ['mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'isc', '0bsd'];

function makeHash(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
}

function makeVaultItem(
  name: string, code: string, language: string,
  category: VaultCategory, description: string, tags: string[], source: string
): VaultItem {
  const hash = makeHash(code);
  return {
    id: hash,
    name,
    code,
    language,
    category,
    description,
    sourceProject: 'chassis-seeded',
    sourceFile: source,
    tags,
    lineCount: code.split('\n').length,
    importCount: 0,
    createdAt: new Date().toISOString(),
    contentHash: hash,
  };
}

/** Extract meaningful code blocks from a raw file string */
function extractBlocks(raw: string, language: string): string[] {
  const blocks: string[] = [];
  // Match top-level functions, classes, arrow functions assigned to const
  const patterns = [
    /^(export\s+)?(async\s+)?function\s+\w+[\s\S]*?^}/gm,
    /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\([\s\S]*?^};/gm,
    /^(export\s+)?class\s+\w+[\s\S]*?^}/gm,
  ];
  for (const pat of patterns) {
    const matches = raw.match(pat) || [];
    for (const m of matches) {
      if (m.split('\n').length >= 4 && m.split('\n').length <= 80) {
        blocks.push(m.trim());
      }
    }
  }
  return blocks;
}

/** Search GitHub for files matching query, return raw file contents */
async function searchGitHub(
  query: string, language: string, token?: string
): Promise<Array<{ name: string; content: string; repoLicense: string; htmlUrl: string }>> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CHASSIS-VSCode-Extension',
  };
  if (token) { headers['Authorization'] = `token ${token}`; }

  try {
    const searchUrl = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+language:${language}&per_page=5&sort=indexed`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) { return []; }
    const searchData = await searchRes.json() as { items?: Array<{ name: string; url: string; repository: { license?: { spdx_id?: string } }; html_url: string }> };
    const items = searchData.items || [];

    const results: Array<{ name: string; content: string; repoLicense: string; htmlUrl: string }> = [];
    for (const item of items.slice(0, 3)) {
      // Check license
      const license = (item.repository?.license?.spdx_id || '').toLowerCase();
      if (!ALLOWED_LICENSES.includes(license)) { continue; }

      // Fetch raw content
      const contentRes = await fetch(item.url, { headers });
      if (!contentRes.ok) { continue; }
      const contentData = await contentRes.json() as { content?: string; encoding?: string };
      if (!contentData.content) { continue; }

      const raw = Buffer.from(contentData.content, 'base64').toString('utf-8');
      if (raw.length > 50_000) { continue; } // skip huge files
      results.push({ name: item.name, content: raw, repoLicense: license, htmlUrl: item.html_url });
    }
    return results;
  } catch {
    return [];
  }
}

export interface SeedResult {
  added: number;
  skipped: number;
  categories: string[];
  fromGitHub: number;
  fromStarter: number;
}

/**
 * Seed the vault with starter patterns + optional GitHub-sourced patterns.
 * Safe to call multiple times — deduplicates by content hash.
 */
export async function seedVault(
  vault: VaultService,
  options: { useGitHub?: boolean; githubToken?: string; onProgress?: (msg: string) => void } = {}
): Promise<SeedResult> {
  const { useGitHub = false, githubToken, onProgress } = options;
  let added = 0, skipped = 0, fromGitHub = 0, fromStarter = 0;
  const categories = new Set<string>();

  const progress = (msg: string) => { if (onProgress) { onProgress(msg); } };

  // ── Phase 1: Ship starter patterns (always runs) ──
  progress('Seeding starter patterns...');
  const starters = getStarterPatterns();
  for (const p of starters) {
    const existing = vault.searchItems(p.name);
    const alreadyExists = existing.some((e: VaultItem) => e.contentHash === p.contentHash);
    if (alreadyExists) { skipped++; continue; }
    vault.saveItem(p);
    added++;
    fromStarter++;
    categories.add(p.category);
  }
  progress(`Starter patterns: ${fromStarter} added, ${skipped} already present`);

  // ── Phase 2: GitHub search (optional, requires network) ──
  if (useGitHub) {
    progress('Searching GitHub for high-quality patterns (MIT/Apache only)...');
    for (const search of GITHUB_SEARCHES) {
      try {
        progress(`Searching: ${search.query.slice(0, 40)}...`);
        const files = await searchGitHub(search.query, search.language, githubToken);
        for (const file of files) {
          const blocks = extractBlocks(file.content, search.language);
          for (const block of blocks.slice(0, 2)) { // max 2 blocks per file
            const hash = makeHash(block);
            const existing = vault.searchItems(block.slice(0, 30));
            if (existing.some((e: VaultItem) => e.contentHash === hash)) { skipped++; continue; }
            const name = block.match(/(?:function|class|const)\s+(\w+)/)?.[1] || file.name.replace(/\.[^.]+$/, '');
            const item = makeVaultItem(
              name, block, search.language, search.category,
              `${name} — sourced from GitHub (${file.repoLicense} license)`,
              [...search.tags, 'github-seeded', file.repoLicense],
              file.htmlUrl
            );
            vault.saveItem(item);
            added++;
            fromGitHub++;
            categories.add(search.category);
          }
        }
      } catch { /* skip failed searches, never block */ }
    }
    progress(`GitHub patterns: ${fromGitHub} added`);
  }

  return { added, skipped, categories: [...categories], fromGitHub, fromStarter };
}
