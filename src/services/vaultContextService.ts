// [SCOPE] Vault Context Service — finds relevant vault items before AI writes code

import * as path from 'path';
import { VaultService, VaultItem } from './vaultService.js';

export interface VaultContext {
  items: VaultItem[];
  contextBlock: string;        // pre-formatted string to inject into AI prompts
  hitCount: number;
}

export class VaultContextService {
  constructor(private vaultService: VaultService) {}

  // ── Main entry point — call before any AI code generation ──
  findRelevantItems(filePath: string, fileContent: string, maxItems = 6): VaultContext {
    const allItems = this.vaultService.listItems(true);
    if (allItems.length === 0) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    const keywords = this.extractKeywords(filePath, fileContent);
    const scored = this.scoreItems(allItems, keywords, filePath);

    // Only items with at least 1 matching keyword signal
    const relevant = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxItems)
      .map(s => s.item);

    if (relevant.length === 0) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    return {
      items: relevant,
      contextBlock: this.buildContextBlock(relevant),
      hitCount: relevant.length,
    };
  }

  // ── Extract signals from the file being processed ──
  private extractKeywords(filePath: string, content: string): Set<string> {
    const keywords = new Set<string>();

    // From file path — directory names and file name are domain signals
    const parts = filePath.replace(/\\/g, '/').split('/');
    for (const p of parts) {
      const clean = p.replace(/\.[^.]+$/, '').toLowerCase();
      if (clean.length > 2) { keywords.add(clean); }
    }

    // From import statements — imported names and modules hint at domain
    const importMatches = content.matchAll(/import.*?['"]([^'"]+)['"]/g);
    for (const m of importMatches) {
      const mod = path.basename(m[1]).replace(/\.[^.]+$/, '').toLowerCase();
      if (mod.length > 2) { keywords.add(mod); }
    }

    // From function/class/variable names in content — camelCase split
    const identifiers = content.matchAll(/\b([a-zA-Z][a-zA-Z0-9]{2,})\b/g);
    const domainWords = new Set<string>();
    for (const m of identifiers) {
      const words = m[1].replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(/\s+/);
      for (const w of words) {
        if (w.length > 3) { domainWords.add(w); }
      }
    }
    // Only keep domain words that appear >= 2 times (strong signal)
    const wordCounts = new Map<string, number>();
    for (const w of domainWords) {
      const re = new RegExp('\\b' + w + '\\b', 'gi');
      const count = (content.match(re) || []).length;
      if (count >= 2) { keywords.add(w); }
    }

    return keywords;
  }

  // ── Score vault items against extracted keywords ──
  private scoreItems(items: VaultItem[], keywords: Set<string>, filePath: string): { item: VaultItem; score: number }[] {
    const fileExt = path.extname(filePath).toLowerCase();

    return items.map(item => {
      let score = 0;

      // Language match — strongly prefer same language
      const itemExt = path.extname(item.block.filePath).toLowerCase();
      if (itemExt === fileExt) { score += 3; }

      // Category/subcategory keyword hits
      for (const tag of item.tags) {
        if (keywords.has(tag)) { score += 2; }
      }
      if (item.subcategory && keywords.has(item.subcategory)) { score += 3; }

      // Item name keyword hits
      const nameParts = item.block.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/);
      for (const part of nameParts) {
        if (part.length > 3 && keywords.has(part)) { score += 2; }
      }

      // Item source file path keyword hits
      const srcParts = item.block.filePath.replace(/\\/g, '/').split('/');
      for (const p of srcParts) {
        const clean = p.replace(/\.[^.]+$/, '').toLowerCase();
        if (clean.length > 2 && keywords.has(clean)) { score += 1; }
      }

      // Code preview keyword hits (weaker signal)
      const preview = item.block.code.slice(0, 300).toLowerCase();
      let previewHits = 0;
      for (const kw of keywords) {
        if (kw.length > 4 && preview.includes(kw)) { previewHits++; }
      }
      score += Math.min(previewHits, 3); // cap preview hits at 3

      return { item, score };
    });
  }

  // ── Build the context block injected into AI prompts ──
  private buildContextBlock(items: VaultItem[]): string {
    const lines: string[] = [
      '=== CHASSIS VAULT: Relevant existing code ===',
      'The following reusable blocks already exist in the project vault.',
      'PREFER using or adapting these over writing new code from scratch.',
      '',
    ];

    for (const item of items) {
      const sub = item.subcategory ? ` › ${item.subcategory}` : '';
      lines.push(`--- [${item.tags.join('/')}${sub}] ${item.block.name} (${item.block.type}) ---`);
      lines.push(`// Source: ${item.block.filePath}`);
      lines.push(item.block.code.slice(0, 400)); // cap to avoid token bloat
      lines.push('');
    }

    lines.push('=== END VAULT CONTEXT ===');
    return lines.join('\n');
  }
}
