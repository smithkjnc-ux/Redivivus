// [SCOPE] Application of code fixes (Surgical or Full-file fallback)

import * as fs from 'fs';
import { validateCode } from '../workspace/logic/codeValidator.js';
import * as path from 'path';
import { parseFixResponse, takeSnapshot } from './chatPanelMsgFixUtils.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';

// Strip SEARCH/REPLACE separator artifacts ("===") that some AIs emit as visual section dividers.
// These are never valid in HTML/CSS/JS/TS/Python/Go — writing them breaks the target file.
function stripSeparatorArtifacts(content: string): string {
  return content.split('\n').filter(l => l.trim() !== '===').join('\n');
}

export async function applyFixContent(finalResponse: string, root: string, allowedRels: Set<string>, userText: string, options?: { disableLastResort?: boolean }): Promise<{ written: string[], failed: string[], skipped: string[], fixSnapId: string | undefined, usedSurgical: boolean }> {
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits, parseUnifiedDiff } = await import('../build/services/surgicalEditService.js');
  const responseFormat = detectResponseFormat(finalResponse);
  fixLog('Apply: Response format detected', { format: responseFormat, responseLength: finalResponse.length });

  let written: string[] = []; let failed: string[] = []; let skipped: string[] = []; let fixSnapId: string | undefined;
  let usedSurgical = false;

  // [FIX] Surgical is the PRIMARY apply path — always run it when the Worker emits <edit> blocks, even for .html.
  // [DEAD] Removed the old hasFullFileFallback/hasHtmlTarget skip. It preferred a full-file <content> for HTML
  // whenever the response merely CONTAINED a <content> substring. On a mixed/truncated Worker reply (valid
  // surgical <edit> blocks PLUS a partial <content>), that skip dropped the good surgical edits, then the
  // truncated <content> tripped the safety guard -> 0 files written, "fix didn't apply cleanly", and a retry
  // storm of ~8 Claude calls (frogger "make the frog more detailed", Jun 14, 2026). The deployed Worker rule now
  // uses surgical for small changes EVEN in HTML, so surgical must lead. If surgical genuinely writes nothing,
  // the legacy full-file fallback below still runs and catches a true miss.
  if (responseFormat === 'surgical') {
    const edits = parseSurgicalEdits(finalResponse);
    const editFiles = [...new Set(edits.map(e => e.filePath))];
    // Validate all edited files exist in project
    const validEdits = edits.filter((e: any) => allowedRels.has(e.filePath));
    skipped = edits.filter((e: any) => !allowedRels.has(e.filePath)).map((e: any) => e.filePath);

    if (validEdits.length > 0) {
      fixLog(`Apply: Found ${validEdits.length} surgical edits to apply`);
      validEdits.forEach((e: any, i: number) => fixLog(`  Edit ${i+1}`, { file: e.filePath, searchLength: e.searchBlock.length }));
      fixSnapId = takeSnapshot(root, editFiles.filter((f: any) => allowedRels.has(f)) as string[], userText);
      // Strip separator artifacts from replaceBlocks before applying surgical edits
      const sanitizedEdits = validEdits.map((e: any) => ({ ...e, replaceBlock: stripSeparatorArtifacts(e.replaceBlock) }));
      const results = applySurgicalEdits(sanitizedEdits, root);
      for (const r of results) {
        if (r.success) { written.push(r.filePath); fixLog(`  Applied`, { file: r.filePath }); }
        else { failed.push(`${r.filePath}: ${r.error || 'edit failed'}`); fixLog(`  Failed`, { file: r.filePath, error: r.error }); }
      }
      usedSurgical = true;
    } else {
      fixLog(`Apply: No valid surgical edits found`);
    }
  }

  // Unified diff path — standard git diff format; reuses applySurgicalEdits machinery
  if (responseFormat === 'unified' && !usedSurgical) {
    const edits = parseUnifiedDiff(finalResponse).filter((e: any) => allowedRels.has(e.filePath));
    if (edits.length > 0) {
      fixLog(`Apply: Found ${edits.length} unified diff hunk(s) to apply`);
      const editFiles = [...new Set(edits.map((e: any) => e.filePath))];
      fixSnapId = takeSnapshot(root, editFiles as string[], userText);
      const sanitized = edits.map((e: any) => ({ ...e, replaceBlock: stripSeparatorArtifacts(e.replaceBlock) }));
      const results = applySurgicalEdits(sanitized, root);
      for (const r of results) {
        if (r.success) { written.push(r.filePath); fixLog(`  Applied`, { file: r.filePath }); }
        else { failed.push(`${r.filePath}: ${r.error || 'edit failed'}`); }
      }
      usedSurgical = true;
    }
  }

  // Fallback: if no surgical edits found or all failed, try legacy full-file parsing
  if (!usedSurgical || (written.length === 0 && failed.length > 0)) {
    fixLog(`Apply: Falling back to legacy full-file parsing`, { usedSurgical, written: written.length, failed: failed.length });
    const { fixes: legacyFixes, skipped: legacySkipped } = parseFixResponse(finalResponse, root, allowedRels);
    fixLog(`Apply: Legacy parsing complete`, { filesFound: legacyFixes.length, skipped: legacySkipped.length });
    if (legacyFixes.length > 0) {
      // [SAFETY] Check if any fix content is truncated before writing
      const { isTruncatedOutput } = await import('../chat/logic/fileSizeGate.js');
      const truncatedFixes = legacyFixes.filter(f => isTruncatedOutput(f.content));
      if (truncatedFixes.length > 0) {
        fixLog(`[SAFETY] BLOCKING WRITE: ${truncatedFixes.length} file(s) have truncated content`, { files: truncatedFixes.map(f => f.rel) });
        failed.push(...truncatedFixes.map(f => `${f.rel}: Content appears truncated — write blocked to protect file`));
      } else {
        written = []; failed = []; skipped = legacySkipped;
        fixSnapId = takeSnapshot(root, legacyFixes.map(f => f.rel), userText);
        for (const fix of legacyFixes) {
          try {
            fs.mkdirSync(path.dirname(fix.abs), { recursive: true });
            const ext1 = path.extname(fix.rel);
            const validated1 = validateCode(stripSeparatorArtifacts(fix.content), ext1);
            if (validated1.autoFixed) { fixLog(`[CHECK10] Auto-fixed non-ASCII in ${fix.rel}`); }
            fs.writeFileSync(fix.abs, validated1.code, 'utf-8');
            written.push(fix.rel);
          } catch (e) { failed.push(`${fix.rel}: ${e instanceof Error ? e.message : String(e)}`); }
        }
      }
    }
  }

  // [FIX] Last-resort fallback: Worker wrapped code in prose/narrative headers (no ## Fix: format).
  // Extract the largest fenced code block and write it to the best-matching allowed file.
  // [WARN] Only triggers when ALL other parsers found zero files — never overwrites successful parses.
  if (!options?.disableLastResort && written.length === 0 && failed.length === 0 && allowedRels.size > 0) {
    fixLog(`Apply: Trying last-resort code block extraction`);
    const codeBlockRe = /```(?!json\b)[a-z]*\n([\s\S]*?)```/gi;
    let largest = ''; let blockMatch: RegExpExecArray | null;
    while ((blockMatch = codeBlockRe.exec(finalResponse)) !== null) {
      const block = blockMatch[1].trimEnd();
      if (block.length > largest.length) { largest = block; }
    }
    // Also try unclosed fence (AI sometimes omits closing ```)
    if (!largest) {
      const fenceIdx = finalResponse.indexOf('```');
      if (fenceIdx !== -1) {
        largest = finalResponse.slice(fenceIdx).replace(/^```[a-zA-Z0-9]*\n?/, '').trimEnd();
      }
    }
    if (largest && largest.length > 50) {
      // Pick the best target file: prefer single-file projects, else match by extension
      const rels = [...allowedRels];
      let targetRel = rels[0];
      if (rels.length > 1) {
        // Try to match from response text — look for filename mentions
        const mentioned = rels.find(r => finalResponse.includes(path.basename(r)));
        if (mentioned) { targetRel = mentioned; }
      }
      fixLog(`Apply: Last-resort extracted code block`, { targetRel, codeLength: largest.length });
      const absTarget = path.join(root, targetRel);
      fixSnapId = takeSnapshot(root, [targetRel], userText);
      try {
        fs.mkdirSync(path.dirname(absTarget), { recursive: true });
        const ext2 = path.extname(targetRel);
        const validated2 = validateCode(stripSeparatorArtifacts(largest), ext2);
        if (validated2.autoFixed) { fixLog(`[CHECK10] Auto-fixed non-ASCII in ${targetRel}`); }
        fs.writeFileSync(absTarget, validated2.code, 'utf-8');
        written.push(targetRel);
      } catch (e) { failed.push(`${targetRel}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  return { written, failed, skipped, fixSnapId, usedSurgical };
}
