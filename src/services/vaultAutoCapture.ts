// [SCOPE] Vault Auto-Capture — runs after every build, extracts new functions/logic and saves to vault
// Called from chatPanelBuild.ts after file write. Silent — never blocks or surfaces errors to user.

import * as fs from 'fs';
import * as nodePath from 'path';
import { VaultService } from './vaultService.js';
import { extractFromFile } from './vaultExtractor.js';
import { suggestCategory } from './vaultService.js';

export interface CaptureResult {
  newItems: number;
  skippedDupes: number;
  totalExtracted: number;
  /** True if the capture attempt threw an unrecoverable error */
  failed: boolean;
  /** Names of saved items for logging */
  savedNames: string[];
}

/** Derives simple tags from a build prompt (top non-stop keywords). */
function tagsFromPrompt(prompt: string): string[] {
  const stop = new Set(['the','and','for','with','that','this','from','make','create','build','write','add','new','get','set','use','file','code']);
  return prompt.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w))
    .slice(0, 5);
}

/** Extracts functions/logic from a newly written file and saves unique items to vault.
 *  @param buildPrompt — optional original build task for tag generation */
export function autoCaptureFile(
  absPath: string,
  projectName: string,
  vault: VaultService,
  buildPrompt = ''
): CaptureResult {
  const result: CaptureResult = { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  try {
    if (!fs.existsSync(absPath)) return result;
    const content = fs.readFileSync(absPath, 'utf8');
    const { items, filteredCount } = extractFromFile(absPath, content);
    result.totalExtracted = items.length + filteredCount;
    const promptTags = tagsFromPrompt(buildPrompt);

    for (const item of items) {
      if (vault.isDuplicate(item.contentHash)) {
        result.skippedDupes++;
        continue;
      }
      item.sourceProject = projectName;
      item.category = suggestCategory(item.name, item.code);
      // Merge prompt-derived tags with any existing tags
      if (promptTags.length > 0) {
        item.tags = [...new Set([...item.tags, ...promptTags])];
      }
      vault.saveItem(item);
      result.newItems++;
      result.savedNames.push(item.name);
      // [CHASSIS] Log saved item: file, function name, tags
      try {
        const logLine = `[vault-capture] ${new Date().toISOString()} | ${absPath} | fn:${item.name} | tags:${item.tags.join(',')}`;
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
export function autoCaptureFiles(
  absPaths: string[],
  projectName: string,
  vault: VaultService,
  buildPrompt = ''
): CaptureResult {
  const total: CaptureResult = { newItems: 0, skippedDupes: 0, totalExtracted: 0, failed: false, savedNames: [] };
  for (const p of absPaths) {
    const r = autoCaptureFile(p, projectName, vault, buildPrompt);
    total.newItems += r.newItems;
    total.skippedDupes += r.skippedDupes;
    total.totalExtracted += r.totalExtracted;
    if (r.failed) { total.failed = true; }
    total.savedNames.push(...r.savedNames);
  }
  return total;
}
