// [SCOPE] Vault code extraction — main entry point and utilities
import * as path from 'path';
import * as crypto from 'crypto';
import { ExtractedBlock, VaultItem, VaultCategory } from './vaultTypes.js';

export { ExtractedBlock, VaultItem, VaultCategory };

export function detectLanguage(ext: string): string {
  switch (ext) {
    case '.ts': case '.tsx': return 'typescript';
    case '.js': case '.jsx': return 'javascript';
    case '.py': return 'python';
    case '.md': return 'markdown';
    default: return 'text';
  }
}

export function generateId(filePath: string, name: string, type: string): string {
  const hash = crypto.createHash('md5').update(`${filePath}:${name}:${type}`).digest('hex');
  return hash.substring(0, 12);
}

export function inferTags(filePath: string, block: ExtractedBlock): string[] {
  const tags: string[] = [];
  const basename = path.basename(filePath, path.extname(filePath));
  if (basename.includes('test') || basename.includes('spec')) { tags.push('testing'); }
  if (block.type === 'component') { tags.push('component'); }
  if (block.name.toLowerCase().includes('api') || block.name.toLowerCase().includes('endpoint')) { tags.push('api'); }
  if (block.name.toLowerCase().includes('config')) { tags.push('config'); }
  if (block.name.toLowerCase().includes('auth')) { tags.push('auth'); }
  if (tags.length === 0) { tags.push('other'); }
  return tags;
}

export function computeContentHash(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

import { shouldSkipBlock } from './vaultExtractorQuality.js';
import { extractTSJS } from './vaultExtractorTsJs.js';
import { extractPython, extractMarkdown } from './vaultExtractorLang.js';
import { suggestCategory, generateDescription, getSourceProject } from './vaultExtractorLang.js';

// [SCOPE] Main entry — extract all blocks from a file and apply quality filters
export function extractFromFile(filePath: string, content: string): { items: VaultItem[]; filteredCount: number } {
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();
  let rawBlocks: ExtractedBlock[] = [];
  switch (ext) {
    case '.ts': case '.tsx': case '.js': case '.jsx': rawBlocks = extractTSJS(lines, filePath); break;
    case '.py': rawBlocks = extractPython(lines, filePath); break;
    case '.md': rawBlocks = extractMarkdown(lines, filePath); break;
    case '.html': case '.htm': {
      // [FIX] Extract JS functions from inline <script> blocks instead of saving the whole file.
      // Games are 400-700 lines — the old 400-line limit silently skipped every single game build.
      // Individual functions (Particle, beep, drawBird) ARE reusable; the whole 600-line file is not.
      const scriptMatches = [...content.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const m of scriptMatches) {
        const jsContent = m[1];
        if (jsContent.trim().length > 100) {
          rawBlocks.push(...extractTSJS(jsContent.split('\n'), filePath.replace(/\.html?$/, '.js')));
        }
      }
      // Fallback for small non-game HTML (templates, partials) — save whole file
      if (rawBlocks.length === 0 && content.trim().length > 50 && lines.length <= 300) {
        const baseName = path.basename(filePath, ext).toLowerCase();
        rawBlocks = [{ name: baseName, type: 'component', code: content, lines: [1, lines.length], filePath, language: 'html' }];
      }
      break;
    }
    case '.css': case '.svg': {
      const baseName = path.basename(filePath, ext).toLowerCase();
      if (content.trim().length > 50 && lines.length <= 400) {
        rawBlocks = [{ name: baseName, type: 'component', code: content, lines: [1, lines.length], filePath, language: ext.replace('.', '') }];
      }
      break;
    }
    default: rawBlocks = [];
  }

  const items: VaultItem[] = [];
  let filteredCount = 0;
  const seenHashes = new Set<string>();
  const sourceProject = getSourceProject(filePath);

  for (const block of rawBlocks) {
    const quality = shouldSkipBlock(block, filePath);
    if (quality.skip) { filteredCount++; continue; }
    const contentHash = computeContentHash(block.code);
    if (seenHashes.has(contentHash)) { filteredCount++; continue; }
    seenHashes.add(contentHash);

    const category = suggestCategory(block.name, block.code);
    const lineCount = block.lines[1] - block.lines[0] + 1;

    items.push({
      id: contentHash.substring(0, 16),
      name: block.name,
      code: block.code,
      language: detectLanguage(ext),
      category,
      description: generateDescription(block.name, block.code),
      sourceProject,
      sourceFile: filePath,
      tags: inferTags(filePath, block),
      lineCount,
      importCount: 0,
      createdAt: new Date().toISOString(),
      contentHash,
    });
  }
  return { items, filteredCount };
}
