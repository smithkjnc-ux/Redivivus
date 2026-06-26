// [SCOPE] Vault Semantic Search — AI-powered duplicate detection before building.
// Sends a compact prompt asking the AI to match a build task against vault item summaries.
// Catches any wording, grammar variations, synonyms — not just keyword overlap.
// [WARN] Makes one AI call per build request. Keep the prompt compact to stay under 500 tokens.

import type { VaultItem } from './vaultTypes.js';
import { suggestCategory } from './vaultService.js';

export interface SemanticMatch {
  item: VaultItem;
  confidence: number; // 0–1
  reason: string;     // plain English explanation from the AI
  intentMismatch?: boolean; // true when task is frontend but match is backend (or vice versa)
}

/** Build a compact vault summary for the AI prompt — name + description only, no code. */
function buildVaultSummary(items: VaultItem[]): string {
  return items
    .slice(0, 60) // cap at 60 items to stay token-efficient
    .map((item, i) => {
      const name = item.name.replace(/[_-]+/g, ' ');
      const desc = item.description ? ` — ${item.description.slice(0, 80)}` : '';
      return `${i + 1}. [${item.category}] ${name}${desc}`;
    })
    .join('\n');
}

/** Prompt the AI to find semantic matches. Returns raw AI response text. */
function buildSemanticPrompt(task: string, vaultSummary: string): string {
  return `You are a code vault assistant. A user wants to build something. Check if it already exists in the vault.

USER TASK: "${task}"

VAULT CONTENTS (name — description):
${vaultSummary}

INSTRUCTIONS:
- Read the user task carefully. Ignore grammar and phrasing — focus on what they WANT TO BUILD.
- Check if any vault item does the same thing, even if described differently.
- Examples of matches: "make a function that waits before running" = debounce. "check if email is valid" = email validator. "sort list fastest way" = sorting algorithm.

Reply in EXACTLY this format (nothing else):

MATCH_FOUND: <item number from the list>
CONFIDENCE: <0-100>
REASON: <one sentence plain English — what they asked for and why it matches>

OR if nothing matches:

NO_MATCH`;
}

/** Parse the AI response into a structured result. */
function parseSemanticResponse(
  response: string,
  items: VaultItem[]
): { index: number; confidence: number; reason: string } | null {
  const trimmed = response.trim();
  if (trimmed.startsWith('NO_MATCH') || !trimmed.includes('MATCH_FOUND')) { return null; }

  const matchLine = trimmed.match(/MATCH_FOUND:\s*(\d+)/i);
  const confLine  = trimmed.match(/CONFIDENCE:\s*(\d+)/i);
  const reasonLine = trimmed.match(/REASON:\s*(.+)/i);

  if (!matchLine) { return null; }

  const index = parseInt(matchLine[1], 10) - 1; // convert 1-based to 0-based
  const confidence = confLine ? Math.min(100, parseInt(confLine[1], 10)) / 100 : 0.5;
  const reason = reasonLine ? reasonLine[1].trim() : 'Similar functionality found in vault.';

  if (index < 0 || index >= items.length) { return null; }
  return { index, confidence, reason };
}

/** Classify the task into a vault category, then return only items from that category.
 *  Falls back to cross-category top-30 by name relevance if category is 'other' or too sparse. */
function preFilterByCategory(task: string, items: VaultItem[], limit = 30): VaultItem[] {
  // Use the existing category classifier — pass empty code string, task is the "name"
  const category = suggestCategory(task, '');

  // Get items from the matching category
  const inCategory = category !== 'other'
    ? items.filter(i => i.category === category)
    : [];

  // If category has enough items, sort by name relevance and return
  if (inCategory.length >= 5) {
    const stopWords = new Set(['a','an','the','and','or','for','to','in','of','that','with','build','create','make','write','generate','simple','basic','small']);
    const taskWords = task.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const scored = inCategory.map(item => {
      const haystack = [item.name, item.description].join(' ').toLowerCase().replace(/[_-]/g,' ');
      const score = taskWords.filter(w => haystack.includes(w)).length;
      return { item, score };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.item);
  }

  // Fallback: cross-category keyword match with synonym expansion
  const stopWords = new Set(['a','an','the','and','or','for','to','in','of','that','with','build','create','make','write','generate','simple','basic','small']);
  const rawWords = task.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  // Synonym map — expand vague words into vault-searchable terms
  const synonyms: Record<string, string[]> = {
    wait:    ['debounce','delay','timeout','throttle','defer'],
    waits:   ['debounce','delay','timeout','throttle','defer'],
    delay:   ['debounce','timeout','throttle','defer'],
    run:     ['execute','invoke','call','trigger','dispatch'],
    running: ['execute','invoke','call','trigger','dispatch'],
    slow:    ['throttle','debounce','limit','rate'],
    limit:   ['throttle','rate','debounce'],
    repeat:  ['interval','loop','poll','retry'],
    check:   ['validate','verify','assert','test'],
    store:   ['cache','save','persist','storage'],
    save:    ['cache','persist','storage','write'],
    format:  ['parse','convert','transform','stringify'],
    clean:   ['sanitize','normalize','trim','strip'],
  };
  const expanded = new Set(rawWords);
  rawWords.forEach(w => (synonyms[w] || []).forEach(s => expanded.add(s)));

  // Collect the synonym-expanded terms separately for boosting exact name hits
  const expandedOnly = new Set<string>();
  rawWords.forEach(w => (synonyms[w] || []).forEach(s => expandedOnly.add(s)));

  return items
    .map(item => {
      const itemName = item.name.toLowerCase().replace(/[_-]/g,' ');
      const haystack = [itemName, item.description, item.tags.join(' ')].join(' ').toLowerCase();
      // Exact name match on a synonym = highest priority
      const exactSynonymHit = [...expandedOnly].some(s => itemName === s || itemName.includes(s));
      const score = [...expanded].filter(w => haystack.includes(w)).length + (exactSynonymHit ? 100 : 0);
      return { item, score };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

// [DONE] detectIntentMismatch regex replaced with AI classifier per Rule 18.
async function detectIntentMismatch(
  task: string,
  item: VaultItem,
  callAI: (prompt: string) => Promise<{ text: string; success: boolean }>
): Promise<boolean> {
  try {
    const snippet = [item.name, item.description ?? '', item.code.slice(0, 200)].join(' ');
    const prompt = `Task: "${task.slice(0, 150)}"\nVault item: "${snippet.slice(0, 200)}"\nAre these clearly in opposite domains (one frontend UI, the other backend logic)? Reply with one word: mismatch or match`;
    const res = await callAI(prompt);
    return res.success && !!res.text && res.text.trim().toLowerCase().startsWith('mismatch');
  } catch {
    return false; // never block vault results on AI failure
  }
}

/** Run AI semantic search against the vault.
 *  Returns top match or null if nothing similar found. */
export async function semanticVaultSearch(
  task: string,
  items: VaultItem[],
  callAI: (prompt: string) => Promise<{ text: string; success: boolean }>
): Promise<SemanticMatch | null> {
  if (items.length === 0) { return null; }

  const capped = preFilterByCategory(task, items, 30);
  const summary = buildVaultSummary(capped);
  const prompt = buildSemanticPrompt(task, summary);

  try {
    const res = await callAI(prompt);
    if (!res.success || !res.text) { return null; }

    const parsed = parseSemanticResponse(res.text, capped);
    // [FIX] Was 0.95 — AI responses rarely score that high; semantic search was effectively never firing
    if (!parsed || parsed.confidence < 0.65) { return null; }

    const matched = capped[parsed.index];
    const intentMismatch = await detectIntentMismatch(task, matched, callAI);

    return {
      item: matched,
      confidence: parsed.confidence,
      reason: parsed.reason,
      intentMismatch,
    };
  } catch {
    return null; // never block a build due to semantic check failure
  }
}
