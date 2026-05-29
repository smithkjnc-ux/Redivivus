// [SCOPE] Application of code fixes (Surgical or Full-file fallback)

import * as fs from 'fs';
import * as path from 'path';
import { parseFixResponse, takeSnapshot } from './chatPanelMsgFixUtils';
import { fixLog } from '../../services/logging/fixPipelineLogger';

// Strip SEARCH/REPLACE separator artifacts ("===") that some AIs emit as visual section dividers.
// These are never valid in HTML/CSS/JS/TS/Python/Go — writing them breaks the target file.
function stripSeparatorArtifacts(content: string): string {
  return content.split('\n').filter(l => l.trim() !== '===').join('\n');
}

export async function applyFixContent(finalResponse: string, root: string, allowedRels: Set<string>, userText: string): Promise<{ written: string[], failed: string[], skipped: string[], fixSnapId: string | undefined, usedSurgical: boolean }> {
  const { detectResponseFormat, parseSurgicalEdits, applySurgicalEdits, parseUnifiedDiff } = await import('../../services/build/surgicalEditService.js');
  const responseFormat = detectResponseFormat(finalResponse);
  fixLog('Apply: Response format detected', { format: responseFormat, responseLength: finalResponse.length });

  let written: string[] = []; let failed: string[] = []; let skipped: string[] = []; let fixSnapId: string | undefined;
  let usedSurgical = false;

  // [FIX] Skip surgical for HTML files — text matching is unreliable on large HTML/JS files.
  // Falls through to parseFixResponse which handles <content> full-file output.
  const hasHtmlTarget = responseFormat === 'surgical' && parseSurgicalEdits(finalResponse).some((e: any) => e.filePath.endsWith('.html'));

  if (responseFormat === 'surgical' && !hasHtmlTarget) {
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
      written = []; failed = []; skipped = legacySkipped;
      fixSnapId = takeSnapshot(root, legacyFixes.map(f => f.rel), userText);
      for (const fix of legacyFixes) {
        try {
          fs.mkdirSync(path.dirname(fix.abs), { recursive: true });
          fs.writeFileSync(fix.abs, stripSeparatorArtifacts(fix.content), 'utf-8');
          written.push(fix.rel);
        } catch (e) { failed.push(`${fix.rel}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
  }

  // [FIX] Last-resort fallback: Worker wrapped code in prose/narrative headers (no ## Fix: format).
  // Extract the largest fenced code block and write it to the best-matching allowed file.
  // [WARN] Only triggers when ALL other parsers found zero files — never overwrites successful parses.
  if (written.length === 0 && failed.length === 0 && allowedRels.size > 0) {
    fixLog(`Apply: Trying last-resort code block extraction`);
    const codeBlockRe = /```[a-z]*\n([\s\S]*?)```/g;
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
        fs.writeFileSync(absTarget, stripSeparatorArtifacts(largest), 'utf-8');
        written.push(targetRel);
      } catch (e) { failed.push(`${targetRel}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  return { written, failed, skipped, fixSnapId, usedSurgical };
}
