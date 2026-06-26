// [SCOPE] Vault Translation Engine — converts vault items between programming languages using AI

import type { VaultItem } from './vaultTypes.js';
import type { AIResponse } from '../../../shared/ai/infrastructure/routingTypes.js';
import * as crypto from 'crypto';

export const TRANSLATE_LANGS: Record<string, string> = {
  TypeScript: 'ts', JavaScript: 'js', Python: 'py',
  Go: 'go', Java: 'java', 'C#': 'cs', Rust: 'rs',
  PHP: 'php', Ruby: 'rb', Swift: 'swift', Kotlin: 'kt',
};

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TRANSLATE_LANGS).map(([label, ext]) => [ext, label])
);

export interface TranslateResult {
  item: VaultItem;
  notes: string;
}

export async function translateVaultItem(
  source: VaultItem,
  targetLang: string,   // display label e.g. "Python"
  targetExt: string,    // file ext e.g. "py"
  callAI: (prompt: string) => Promise<AIResponse>,
): Promise<TranslateResult | null> {
  const sourceLangLabel = LANG_LABEL[source.language] || source.language.toUpperCase();

  const prompt = `Translate the following ${sourceLangLabel} code to ${targetLang}.

Rules:
- Preserve exact logic — do not add features, remove behavior, or refactor
- Use idiomatic ${targetLang} patterns and naming conventions
- Adapt stdlib/runtime equivalents (async, type hints, error handling, etc.)
- If a direct equivalent doesn't exist, use the closest standard library approach
- Return ONLY the translated code — no explanation, no markdown fences, no comments

Source (${sourceLangLabel}):
${source.code}`;

  const res = await callAI(prompt);
  if (!res.success || !res.text?.trim()) { return null; }

  const translatedCode = res.text.trim()
    .replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  const translated: VaultItem = {
    id: crypto.randomUUID(),
    name: source.name,
    code: translatedCode,
    language: targetExt,
    category: source.category,
    description: source.description ? `${source.description} (translated from ${sourceLangLabel})` : `Translated from ${sourceLangLabel}`,
    sourceProject: 'vault-translation',
    sourceFile: source.sourceFile,
    tags: [...new Set([...source.tags, `translated-from-${source.language}`])],
    lineCount: translatedCode.split('\n').length,
    importCount: 0,
    createdAt: new Date().toISOString(),
    contentHash: crypto.createHash('sha256').update(translatedCode).digest('hex').slice(0, 16),
    useCase: source.useCase,
    qualityScore: source.qualityScore,
    reusable: source.reusable,
  };

  return {
    item: translated,
    notes: `Translated \`${source.name}\` from ${sourceLangLabel} → ${targetLang} (${source.lineCount} → ${translated.lineCount} lines).`,
  };
}
