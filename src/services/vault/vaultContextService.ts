// [SCOPE] Vault Context Service — finds relevant vault items before AI writes code

import * as path from 'path';
import type { VaultService, VaultItem } from './vaultService.js';

export interface VaultContext {
  items: VaultItem[];
  contextBlock: string;        // pre-formatted string to inject into AI prompts
  hitCount: number;
}

export class VaultContextService {
  constructor(private vaultService: VaultService) {}

  // ── Main entry point — call before any AI code generation ──
  findRelevantItems(filePath: string, fileContent: string, maxItems = 6): VaultContext {
    // Guard 1: no file path or too little meaningful content — skip vault injection
    if (!filePath || fileContent.length < 50) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    // Guard 2: no file extension — open-ended prompt with no language context, skip vault
    const fileExt = path.extname(filePath).toLowerCase();
    if (!fileExt) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    // Guard 3: fewer than 3 meaningful identifiers (words >= 4 chars) — not a code context
    const identifierMatches = fileContent.match(/\b[a-zA-Z][a-zA-Z0-9]{3,}\b/g) || [];
    const uniqueIdentifiers = new Set(identifierMatches.map(s => s.toLowerCase()));
    if (uniqueIdentifiers.size < 3) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    const allItems = this.vaultService.listItems();
    if (allItems.length === 0) {
      return { items: [], contextBlock: '', hitCount: 0 };
    }

    const keywords = this.extractKeywords(filePath, fileContent);
    const scored = this.scoreItems(allItems, keywords, filePath);

    // Only strongly relevant items (score >= 4) to avoid noise injection
    const relevant = scored
      .filter(s => s.score >= 4)
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
      // [WARN] Heuristic threshold for keyword length from file path
      if (clean.length > 2) { keywords.add(clean); }
    }

    // From import statements — imported names and modules hint at domain
    // [WARN] Regex parsing of imports can be fragile to different import syntaxes or complex paths.
    const importMatches = content.matchAll(/import.*?['"]([^'"]+)['"]/g);
    for (const m of importMatches) {
      const mod = path.basename(m[1]).replace(/\.[^.]+$/, '').toLowerCase();
      // [WARN] Heuristic threshold for keyword length from module names
      if (mod.length > 2) { keywords.add(mod); }
    }

    // From function/class/variable names in content — camelCase split
    // [WARN] Regex parsing of identifiers can be fragile and might miss some patterns or include irrelevant ones.
    const identifiers = content.matchAll(/\b([a-zA-Z][a-zA-Z0-9]{2,})\b/g);
    const domainWords = new Set<string>();
    for (const m of identifiers) {
      const words = m[1].replace(/([A-Z])/g, ' $1').toLowerCase().trim().split(/\s+/);
      for (const w of words) {
        // [WARN] Heuristic threshold for keyword length from identifiers
        if (w.length > 3) { domainWords.add(w); }
      }
    }
    // Only keep domain words that appear >= 2 times (strong signal)
    const wordCounts = new Map<string, number>();
    for (const w of domainWords) {
      const re = new RegExp('\\b' + w + '\\b', 'gi');
      // [WARN] Heuristic threshold for keyword frequency (appearing >= 2 times)
      // [WARN] Using RegExp for counting can be resource intensive on large files.
      const count = (content.match(re) || []).length;
      if (count >= 2) { keywords.add(w); }
    }

    return keywords;
  }

  // ── Score vault items against extracted keywords ──
  private scoreItems(items: VaultItem[], keywords: Set<string>, filePath: string): { item: VaultItem; score: number }[] {
    const fileExt = path.extname(filePath).toLowerCase(); // [WARN] fileExt empty check already done in findRelevantItems

    return items.map(item => {
      // [WARN] Scoring weights are heuristic and may need tuning for optimal performance.
      let score = 0;

      // Language match — strongly prefer same language
      const itemExt = path.extname(item.sourceFile).toLowerCase();
      if (itemExt === fileExt) { score += 3; }
      // Category + tags keyword hits
      if (keywords.has(item.category)) { score += 2; }
      for (const tag of item.tags) {
        if (keywords.has(tag)) { score += 2; }
      }

      // Item name keyword hits
      const nameParts = item.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/);
      for (const part of nameParts) {
        if (part.length > 3 && keywords.has(part)) { score += 2; }
      }

      // Item source file path keyword hits
      const srcParts = item.sourceFile.replace(/\\/g, '/').split('/');
      for (const p of srcParts) {
        const clean = p.replace(/\.[^.]+$/, '').toLowerCase();
        if (clean.length > 2 && keywords.has(clean)) { score += 1; }
      }

      // Code preview keyword hits (weaker signal)
      const preview = item.code.slice(0, 300).toLowerCase();
      let previewHits = 0;
      for (const kw of keywords) {
        if (kw.length > 4 && preview.includes(kw)) { previewHits++; }
      }
      score += Math.min(previewHits, 3);

      // [CHASSIS] Quality gate boost — prefer higher-quality items
      const qs = (item as any).qualityScore as number | undefined;
      if (qs && qs >= 4) { score += 2; }
      if (qs && qs >= 5) { score += 2; }

      // [CHASSIS] Description/useCase keyword matching
      const desc = ((item.description || '') + ' ' + ((item as any).useCase || '')).toLowerCase();
      for (const kw of keywords) {
        if (kw.length > 4 && desc.includes(kw)) { score += 1; break; }
      }

      return { item, score };
    });
  }

  // ── Build the context block injected into AI prompts ──
  buildContextBlock(items: VaultItem[]): string {
    const lines: string[] = [
      '=== CHASSIS VAULT: Relevant existing code ===',
      'The following reusable blocks already exist in the project vault.',
      'PREFER using or adapting these over writing new code from scratch.',
      '',
    ];

    for (const item of items) {
      const qs = (item as any).qualityScore as number | undefined;
      const star = qs && qs >= 5 ? ' ⭐' : '';
      lines.push(`--- [${item.category}] ${item.name} (${item.language})${star} ---`);
      if (item.description) { lines.push(`// ${item.description}`); }
      if ((item as any).useCase) { lines.push(`// Use when: ${(item as any).useCase}`); }
      lines.push(`// Source: ${item.sourceFile}`);
      // [WARN] 400-char limit was cutting most functions in half — increased to 1500 so workers see complete code
      lines.push(item.code.slice(0, 1500));
      lines.push('');
    }

    lines.push('=== END VAULT CONTEXT ===');
    return lines.join('\n');
  }
}

/** Returns false when user has disabled vault context injection in Setup Hub. Defaults to true. */
export function isVaultEnabled(): boolean {
  try {
    const ctx = (require('../../ui/panels/chat/chatPanel.js') as any).ChatPanel?.extensionContext;
    return ctx ? ctx.globalState.get('chassis.vaultEnabled', true) !== false : true;
  } catch { return true; }
}

/** Standalone formatter — call with findRelevantByTask results to get a vault context block for any AI prompt. */
export function formatVaultContext(items: VaultItem[]): string {
  if (!items || items.length === 0) { return ''; }
  return new VaultContextService(null as any).buildContextBlock(items);
}