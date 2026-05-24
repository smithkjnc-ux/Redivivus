// [SCOPE] Visual Contract Patcher — apply single-property edits back to source files
import * as fs from 'fs';
import * as path from 'path';
import type { VisualProperty } from './visualContractTypes';

export interface PatchResult {
  success: boolean;
  file: string;
  message: string;
}

/**
 * Apply a new value to a VisualProperty in-file.
 * Uses the stored findRegex + findGroup to locate the exact token and swap the value.
 * Returns whether the file was written and what changed.
 */
export function applyPropertyPatch(
  prop: VisualProperty,
  newValue: string,
  projectRoot: string,
): PatchResult {
  const absPath = path.join(projectRoot, prop.file);
  let content: string;
  try { content = fs.readFileSync(absPath, 'utf-8'); }
  catch (e) { return { success: false, file: prop.file, message: `Cannot read ${prop.file}` }; }

  let re: RegExp;
  try { re = new RegExp(prop.findRegex, 'i'); }
  catch (e) { return { success: false, file: prop.file, message: `Bad pattern for ${prop.label}` }; }

  const match = re.exec(content);
  if (!match) {
    return { success: false, file: prop.file, message: `Pattern not found for "${prop.label}" in ${prop.file}` };
  }

  // Reconstruct the full match with group replaced
  const groups = Array.from(match);
  groups[prop.findGroup] = newValue;
  // Rebuild: concat groups[1..n], that covers the full match
  const replacement = groups.slice(1).join('');
  const patched = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);

  try { fs.writeFileSync(absPath, patched, 'utf-8'); }
  catch (e) { return { success: false, file: prop.file, message: `Cannot write ${prop.file}` }; }

  return { success: true, file: prop.file, message: `Updated "${prop.label}" → ${newValue}` };
}

/**
 * Apply a batch of property patches atomically — reads each file once, applies all patches
 * for that file, then writes once. Safer than applying one-at-a-time (avoids offset drift).
 */
export function applyBatchPatches(
  patches: Array<{ prop: VisualProperty; newValue: string }>,
  projectRoot: string,
): PatchResult[] {
  const results: PatchResult[] = [];
  // Group by file
  const byFile = new Map<string, typeof patches>();
  for (const p of patches) {
    const arr = byFile.get(p.prop.file) ?? [];
    arr.push(p); byFile.set(p.prop.file, arr);
  }

  for (const [relPath, filePatches] of byFile.entries()) {
    const absPath = path.join(projectRoot, relPath);
    let content: string;
    try { content = fs.readFileSync(absPath, 'utf-8'); }
    catch { results.push({ success: false, file: relPath, message: `Cannot read ${relPath}` }); continue; }

    for (const { prop, newValue } of filePatches) {
      let re: RegExp;
      try { re = new RegExp(prop.findRegex, 'i'); } catch { results.push({ success: false, file: relPath, message: `Bad pattern for ${prop.label}` }); continue; }
      const match = re.exec(content);
      if (!match) { results.push({ success: false, file: relPath, message: `Pattern not found for "${prop.label}"` }); continue; }
      const groups = Array.from(match);
      groups[prop.findGroup] = newValue;
      content = content.slice(0, match.index) + groups.slice(1).join('') + content.slice(match.index + match[0].length);
      results.push({ success: true, file: relPath, message: `Updated "${prop.label}" → ${newValue}` });
    }

    try { fs.writeFileSync(absPath, content, 'utf-8'); }
    catch { results.push({ success: false, file: relPath, message: `Cannot write ${relPath}` }); }
  }
  return results;
}
