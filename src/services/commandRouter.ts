// [SCOPE] Natural language -> VS Code command router. Three-layer matching: dictionary, fuzzy, AI.
// Phase 1: dictionary (zero cost). Phase 2: fuzzy (zero cost). Phase 3: AI classify (~50 tokens).

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface CommandEntry {
  phrases: string[];
  command: string;
  label?: string;
}

let _dict: CommandEntry[] | undefined;

/** Loads and caches the commands.json dictionary from the extension's out/data folder */
function getDict(): CommandEntry[] {
  if (!_dict) {
    try {
      const ext = vscode.extensions.getExtension('papajoe.chassis');
      const extPath = ext?.extensionPath || path.join(__dirname, '..', '..');
      const jsonPath = path.join(extPath, 'out', 'data', 'commands.json');
      _dict = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as CommandEntry[];
    } catch {
      _dict = [];
    }
  }
  return _dict;
}

/** Normalize input for matching: lowercase, trim, strip filler */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[!?.]+$/, '')
    .replace(/^(can you|could you|please|hey|i want to|i need to|i'd like to|let's|lets|go ahead and|just|quickly)\s+/g, '')
    .replace(/\s+(please|for me|now|quickly)$/g, '')
    .replace(/\ba\b\s+/g, '');
}

export interface CommandMatch {
  commandId: string;
  label: string;
  matchType: 'dictionary' | 'fuzzy' | 'ai';
}

// [WARN] Levenshtein distance — O(n*m) but phrases are short (<30 chars). Safe for real-time use.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Phase 1: Dictionary match — exact, startsWith, endsWith, contains */
export function matchVSCodeCommand(input: string): CommandMatch | undefined {
  if (!input) { return undefined; }
  const norm = normalize(input);
  const dict = getDict();
  for (const entry of dict) {
    for (const phrase of entry.phrases) {
      if (norm === phrase || norm.startsWith(phrase + ' ') || norm.endsWith(' ' + phrase)) {
        return { commandId: entry.command, label: entry.label || entry.phrases[0], matchType: 'dictionary' };
      }
    }
  }
  for (const entry of dict) {
    for (const phrase of entry.phrases) {
      if (phrase.length >= 5 && norm.includes(phrase)) {
        return { commandId: entry.command, label: entry.label || entry.phrases[0], matchType: 'dictionary' };
      }
    }
  }
  return undefined;
}

/** Phase 2: Fuzzy match — catches typos like "clse projct" -> "close project" */
export function fuzzyMatchCommand(input: string): CommandMatch | undefined {
  const norm = normalize(input);
  if (norm.length < 4 || norm.split(' ').length > 8) { return undefined; }
  const dict = getDict();
  let bestMatch: CommandEntry | undefined;
  let bestDist = Infinity;
  for (const entry of dict) {
    for (const phrase of entry.phrases) {
      const dist = levenshtein(norm, phrase);
      // [WARN] Threshold: allow up to 30% of chars to be wrong, max 3 edits
      const maxDist = Math.min(3, Math.floor(phrase.length * 0.3));
      if (dist <= maxDist && dist < bestDist) {
        bestDist = dist;
        bestMatch = entry;
      }
    }
  }
  if (bestMatch) {
    return { commandId: bestMatch.command, label: bestMatch.label || bestMatch.phrases[0], matchType: 'fuzzy' };
  }
  return undefined;
}

/** Phase 3: AI classify — sends compact command list to AI for semantic matching */
export async function aiMatchCommand(input: string, routing: any): Promise<CommandMatch | undefined> {
  if (!routing) { return undefined; }
  // [WARN] Only attempt AI classification if input looks like a command (short, imperative).
  // Don't waste tokens classifying questions or code gen requests.
  const norm = normalize(input);
  if (norm.split(' ').length > 12) { return undefined; } // Too long to be a command
  if (/^(what|how|why|where|when|who|explain|describe|show me how|tell me)\b/i.test(norm)) { return undefined; }

  const dict = getDict();
  // Build compact list: just labels, no full phrase lists (~200 tokens)
  const commandList = dict.map((e, i) => `${i}:${e.label || e.phrases[0]}`).join('|');

  const prompt = `Given this user input: "${input}"
Match it to ONE of these commands (respond with ONLY the number, nothing else):
${commandList}
If none match, respond with: NONE`;

  try {
    const result = await routing.prompt(prompt, 10_000);
    if (!result.success || !result.text) { return undefined; }
    const text = result.text.trim();
    if (text === 'NONE' || text.includes('NONE')) { return undefined; }
    const idx = parseInt(text, 10);
    if (isNaN(idx) || idx < 0 || idx >= dict.length) { return undefined; }
    const entry = dict[idx];
    return { commandId: entry.command, label: entry.label || entry.phrases[0], matchType: 'ai' };
  } catch {
    return undefined;
  }
}

/** Full pipeline: dictionary -> fuzzy -> AI classify -> execute */
export async function tryRouteToVSCodeCommand(input: string, routing?: any): Promise<string | undefined> {
  // Phase 1: Dictionary (instant, free)
  let match = matchVSCodeCommand(input);
  // Phase 2: Fuzzy (instant, free)
  if (!match) { match = fuzzyMatchCommand(input); }
  // Phase 3: AI classify (cheap, ~50 tokens) — only if routing is provided
  if (!match && routing) { match = await aiMatchCommand(input, routing); }

  if (!match) { return undefined; }

  try {
    await vscode.commands.executeCommand(match.commandId);
    return match.label;
  } catch {
    return undefined;
  }
}
