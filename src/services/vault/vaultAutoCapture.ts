// [SCOPE] Vault Auto-Capture — runs after every build, extracts new functions/logic and saves to vault
// Called from chatPanelBuild.ts after file write. Silent — never blocks or surfaces errors to user.

import * as fs from 'fs';
import * as nodePath from 'path';
import type { VaultService } from './vaultService.js';
import { extractFromFile } from './vaultExtractor.js';
import { suggestCategory } from './vaultService.js';
import { evaluateQuality } from './vaultQualityGate.js';
import type { AIResponse } from '../ai/routingTypes.js';

export interface CaptureResult {
  newItems: number;
  skippedDupes: number;
  totalExtracted: number;
  /** True if the capture attempt threw an unrecoverable error */
  failed: boolean;
  /** Names of saved items for logging */
  savedNames: string[];
}

/** Derives tags from both the build prompt AND the code content (better retrieval signal). */
function tagsFromPromptAndCode(prompt: string, code: string): string[] {
  const stop = new Set(['the','and','for','with','that','this','from','make','create','build','write','add','new','get','set','use','file','code','return','const','function','async','await','class','import','export','type','interface','string','number','boolean','array','object']);
  const promptWords = prompt.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w)).slice(0, 4);
  // Extract dominant identifiers from code (camelCase split, 4+ chars, appears 2+ times)
  const codeWords: string[] = [];
  const identifiers = code.matchAll(/\b([a-zA-Z][a-zA-Z0-9]{3,})\b/g);
  const counts = new Map<string, number>();
  for (const m of identifiers) {
    const parts = m[1].replace(/([A-Z])/g,' $1').toLowerCase().trim().split(/\s+/);
    for (const p of parts) { if (p.length >= 4 && !stop.has(p)) { counts.set(p, (counts.get(p)||0)+1); } }
  }
  for (const [word, count] of counts) { if (count >= 2) { codeWords.push(word); } }
  codeWords.sort((a,b) => (counts.get(b)||0)-(counts.get(a)||0));
  return [...new Set([...promptWords, ...codeWords.slice(0,4)])].slice(0, 7);
}

/** Extracts functions/logic from a newly written file and saves unique items to vault.
 *  @param buildPrompt — optional original build task for tag generation */
export async function autoCaptureFile(
  absPath: string,
  projectName: string,
  vault: VaultService,
  buildPrompt = '',
  callAI?: (prompt: string) => Promise<AIResponse>
): Promise<CaptureResult> {
  const result: CaptureResult = { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  try {
    if (!fs.existsSync(absPath)) {return result;}
    const content = fs.readFileSync(absPath, 'utf8');
    const { items, filteredCount } = extractFromFile(absPath, content);
    result.totalExtracted = items.length + filteredCount;
    for (const item of items) {
      if (vault.isDuplicate(item.contentHash)) {
        result.skippedDupes++;
        continue;
      }
      // [CHASSIS] Pre-filter: never save deprecated, dead-end, or stub code
      if (/\[(WARN|DEAD)\].*deprecated|stub|placeholder|TODO.*implement|not yet implemented/i.test(item.code.slice(0, 300))) {
        result.skippedDupes++;
        continue;
      }
      // [CHASSIS] AI quality gate — evaluate before saving
      const verdict = await evaluateQuality(item.name, item.code, item.language, callAI);
      if (!verdict.reusable || verdict.qualityScore < 3) {
        result.skippedDupes++; // Count as filtered
        continue;
      }
      item.sourceProject = projectName;
      item.category = suggestCategory(item.name, item.code);
      item.description = verdict.description;
      (item as any).useCase = verdict.useCase;
      (item as any).qualityScore = verdict.qualityScore;
      (item as any).reusable = verdict.reusable;
      // [CHASSIS] Tags from AI verdict + prompt + code — all three sources for best retrieval coverage
      const itemTags = tagsFromPromptAndCode(buildPrompt, item.code);
      const aiTags: string[] = (verdict as any).tags || [];
      item.tags = [...new Set([...item.tags, ...aiTags, ...itemTags])];

      // [CHASSIS] Replace if better: if a semantically similar item exists with a lower quality score,
      // remove it so the vault always keeps the best version of each concept.
      const similar = vault.findSimilar(item.name, 0.75);
      if (similar.length > 0) {
        const best = similar[0];
        const existingScore = (best as any).qualityScore ?? 3;
        if (verdict.qualityScore > existingScore) {
          vault.deleteItem(best.id); // Evict inferior version before saving new one
        } else {
          result.skippedDupes++; // Existing version is as good or better — skip
          continue;
        }
      }

      vault.saveItem(item);
      result.newItems++;
      result.savedNames.push(item.name);
      try {
        const logLine = `[vault-capture] ${new Date().toISOString()} | ${absPath} | fn:${item.name} | score:${verdict.qualityScore} | tags:${item.tags.join(',')}`;
        const wsRoot = absPath.includes('.chassis') ? absPath.split('.chassis')[0] : nodePath.dirname(absPath);
        const logPath = nodePath.join(wsRoot, '.chassis', 'build_errors.log');
        fs.appendFileSync(logPath, logLine + '\n');
      } catch { /* log failure is non-fatal */ }
    }
  } catch {
    // [WARN] Silent — vault capture must never break the build flow
    result.failed = true;
  }
  return result;
}

/** Captures from multiple files (chunked builds). Returns aggregate result.
 *  @param buildPrompt — optional original build task for tag generation */
export async function autoCaptureFiles(
  absPaths: string[],
  projectName: string,
  vault: VaultService,
  buildPrompt = '',
  callAI?: (prompt: string) => Promise<AIResponse>
): Promise<CaptureResult> {
  const total: CaptureResult = { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  for (const p of absPaths) {
    const r = await autoCaptureFile(p, projectName, vault, buildPrompt, callAI);
    total.newItems += r.newItems;
    total.skippedDupes += r.skippedDupes;
    total.totalExtracted += r.totalExtracted;
    if (r.failed) { total.failed = true; }
    total.savedNames.push(...r.savedNames);
  }
  return total;
}
