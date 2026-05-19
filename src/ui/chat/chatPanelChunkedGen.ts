// [SCOPE] Chunked Code Generation — generates large files in parts, each with full source context
// Every API call sees the FULL source. Only the output is chunked. Keep under 200 lines.

/** A logical section of source code */
export interface SourceSection {
  label: string;
  startLine: number;
  endLine: number;
  lineCount: number;
}

// [WARN] Boundary detection patterns — order matters. More specific patterns first.
const BOUNDARY_PATTERNS = [
  /^(?:export\s+)?(?:abstract\s+)?class\s+\w+/,
  /^(?:export\s+)?enum\s+\w+/,
  /^(?:export\s+)?(?:async\s+)?function\s+\w+/,
  /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*\(/,
  /^(?:export\s+)?interface\s+\w+/,
  /^(?:export\s+)?type\s+\w+/,
  /^class\s+\w+.*:/,
  /^def\s+\w+/,
  /^func\s+\w+/,
];

/** Split source code into logical sections for chunked generation */
export function splitSourceIntoSections(content: string, maxLinesPerSection = 200): SourceSection[] {
  const lines = content.split('\n');
  if (lines.length <= maxLinesPerSection) {
    return [{ label: 'Complete file', startLine: 0, endLine: lines.length, lineCount: lines.length }];
  }

  const sections: SourceSection[] = [];
  let currentStart = 0;

  while (currentStart < lines.length) {
    let endLine = Math.min(currentStart + maxLinesPerSection, lines.length);

    // If not at end, find a good boundary. Enforce minimum 80 lines per section.
    if (endLine < lines.length) {
      let bestSplit = -1;
      const minLine = currentStart + 80; // [WARN] Minimum section size to avoid tiny fragments
      for (let i = endLine; i > minLine; i--) {
        const line = lines[i].trimStart();
        if (line === '' && bestSplit === -1) { bestSplit = i; }
        for (const pattern of BOUNDARY_PATTERNS) {
          if (pattern.test(line)) { bestSplit = i; break; }
        }
        if (bestSplit !== -1 && BOUNDARY_PATTERNS.some(p => p.test(lines[bestSplit]?.trimStart() || ''))) {
          break;
        }
      }
      if (bestSplit !== -1) { endLine = bestSplit; }
    }

    const sectionLines = lines.slice(currentStart, endLine);
    const label = deriveSectionLabel(sectionLines, sections.length + 1);
    sections.push({ label, startLine: currentStart, endLine, lineCount: endLine - currentStart });
    currentStart = endLine;
  }

  // [WARN] Merge tiny last section into previous one
  if (sections.length > 1 && sections[sections.length - 1].lineCount < 50) {
    const last = sections.pop()!;
    sections[sections.length - 1].endLine = last.endLine;
    sections[sections.length - 1].lineCount += last.lineCount;
  }

  return sections;
}

function deriveSectionLabel(lines: string[], index: number): string {
  for (const line of lines.slice(0, 20)) {
    const trimmed = line.trimStart();
    const classMatch = trimmed.match(/class\s+(\w+)/);
    if (classMatch) { return `${classMatch[1]} class`; }
    const funcMatch = trimmed.match(/function\s+(\w+)/);
    if (funcMatch) { return `${funcMatch[1]} function`; }
    const enumMatch = trimmed.match(/enum\s+(\w+)/);
    if (enumMatch) { return `${enumMatch[1]} enum`; }
  }
  if (index === 1) { return 'Constants and setup'; }
  return `Section ${index}`;
}

// [WARN] KEY INSIGHT: Every API call gets the FULL source file.
// Only the OUTPUT is chunked. This ensures the AI always has complete context.
// Previous approach sent only the section source — AI couldn't produce coherent code for small fragments.
/** Generate code in chunks — each API call sees full source, only output is chunked */
export async function chunkedGenerate(
  routing: any,
  fullSource: string,
  sections: SourceSection[],
  userText: string,
  targetFormat: string,
  onProgress: (msg: string) => void
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const chunks: string[] = [];
  const totalSections = sections.length;
  let totalIn = 0; let totalOut = 0;

  for (let i = 0; i < totalSections; i++) {
    const section = sections[i];
    onProgress(`⚙️ Generating part ${i + 1}/${totalSections}: ${section.label} (lines ${section.startLine + 1}-${section.endLine})...`);

    const prevOutput = chunks.length > 0
      ? `\n--- YOUR OUTPUT SO FAR (continue from here, do NOT repeat this) ---\n${chunks.join('\n').split('\n').slice(-80).join('\n')}\n--- END PREVIOUS OUTPUT ---\n`
      : '';

    const isFirst = i === 0;
    const isLast = i === totalSections - 1;

    const prompt = `You are a code generator converting source code to ${targetFormat}.
The FULL source file is provided below. You are generating the output in parts.
${isFirst ? `This is part 1 of ${totalSections}. Start from the beginning.` : ''}
${!isFirst && !isLast ? `This is part ${i + 1} of ${totalSections}. Continue where the previous output left off.` : ''}
${isLast ? `This is the FINAL part (${i + 1} of ${totalSections}). Complete the file and close all tags.` : ''}

FOCUS: Convert lines ${section.startLine + 1} through ${section.endLine} of the source.
${isFirst ? 'Start with <!DOCTYPE html>, <html>, <head>, <style>, <body>, <canvas>, <script>.' : ''}
${isLast ? 'End with proper closing: </script></body></html>.' : ''}
${!isFirst && !isLast ? 'Do NOT include HTML document structure — just the JavaScript code for this section.' : ''}

RULES:
- Convert ALL logic from the indicated source lines. Every function, every variable.
- No placeholders, stubs, or skipped sections.
- No markdown fences. No explanations. Raw code only.
- Convert TypeScript (enums, types) to plain JavaScript equivalents.
- Preserve all constants, physics values, colors, game logic exactly.

USER REQUEST: ${userText}
${prevOutput}
--- FULL SOURCE FILE ---
${fullSource}
--- END SOURCE ---`;

    const result = await routing.prompt(prompt, 90_000);
    if (!result.success) {
      onProgress(`⚠️ Part ${i + 1} failed: ${result.error}. Using partial output.`);
      if (result.text) { chunks.push(cleanChunk(result.text)); }
      continue;
    }
    totalIn += result.inputTokens ?? 0;
    totalOut += result.outputTokens ?? 0;
    chunks.push(cleanChunk(result.text));
  }

  return { text: assembleOutput(chunks), inputTokens: totalIn, outputTokens: totalOut };
}

function cleanChunk(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```\w*\s*\n?/, '');
  cleaned = cleaned.replace(/\n?```\s*$/, '');
  return cleaned.trim();
}

// [WARN] Critical: strip closing tags from ALL chunks except the last.
// Previous bug: first chunk kept </script></body></html>, so chunk 2's JS was outside the script tag.
function assembleOutput(chunks: string[]): string {
  if (chunks.length <= 1) { return chunks[0] || ''; }
  const result: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    const isLast = i === chunks.length - 1;
    // Strip document structure from non-first chunks
    if (i > 0) {
      chunk = chunk.replace(/<!DOCTYPE[^>]*>\s*/gi, '');
      chunk = chunk.replace(/<html[^>]*>\s*/gi, '');
      chunk = chunk.replace(/<head>[\s\S]*?<\/head>\s*/gi, '');
      chunk = chunk.replace(/<body[^>]*>\s*/gi, '');
      chunk = chunk.replace(/<canvas[^>]*>\s*<\/canvas>\s*/gi, '');
      chunk = chunk.replace(/<script>\s*/gi, '');
    }
    // Strip closing tags from ALL chunks except the last
    if (!isLast) {
      chunk = chunk.replace(/\s*<\/script>\s*/gi, '');
      chunk = chunk.replace(/\s*<\/body>\s*/gi, '');
      chunk = chunk.replace(/\s*<\/html>\s*/gi, '');
    }
    result.push(chunk.trim());
  }
  let output = result.join('\n\n');
  // Ensure proper closing tags
  if (!output.includes('</script>')) { output += '\n</script>'; }
  if (!output.includes('</body>')) { output += '\n</body>'; }
  if (!output.includes('</html>')) { output += '\n</html>'; }
  return output;
}
