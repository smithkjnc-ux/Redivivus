// [SCOPE] Retrofit chunker — splits large files into sections and processes each via AI routing
import type * as vscode from 'vscode';
import type { RoutingService } from '../../shared/ai/infrastructure/routingService.js';

// [WARN] Chunk boundaries are heuristic — natural breaks (empty lines, function/class defs) are
// preferred but not guaranteed. If a chunk fails, the original chunk is kept unchanged.
export async function processInChunks(
  filePath: string,
  content: string,
  routing: RoutingService,
  token?: vscode.CancellationToken
): Promise<{ text: string; model: string; success: boolean; error?: string }> {
  const lines = content.split('\n');
  const CHUNK_SIZE = 200;
  const chunks: string[] = [];

  let currentChunk: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    currentChunk.push(lines[i]);

    if (currentChunk.length >= CHUNK_SIZE) {
      // try to find a natural break in next 20 lines
      for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
        const line = lines[j].trim();
        if (line === '' || line.startsWith('def ') || line.startsWith('class ') ||
            line.startsWith('function ') || line.startsWith('export ') ||
            line.startsWith('// ──') || line.startsWith('# ──')) {
          for (let k = i + 1; k <= j; k++) { currentChunk.push(lines[k]); }
          i = j;
          break;
        }
      }
      chunks.push(currentChunk.join('\n'));
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) { chunks.push(currentChunk.join('\n')); }

  const processedChunks: string[] = [];

  for (let c = 0; c < chunks.length; c++) {
    if (token?.isCancellationRequested) {
      return { text: '', model: '', success: false, error: 'Cancelled' };
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const commentChar = ['py', 'sh', 'bash', 'yaml', 'yml', 'rb'].includes(ext) ? '#' : '//';
    const isFirst = c === 0;
    const styleWarning = '\nCRITICAL: This is a ' + ext.toUpperCase() + ' file. Use ONLY ' + commentChar +
      ' for comments. NEVER use ' + (commentChar === '#' ? '//' : '#') + ' comments.';
    // REGION MAP applies to every chunk: each chunk wraps whatever distinct entities/concepts it contains in
    // paired markers, so the whole file ends up chaptered. Granularity is entity-level, not per-function.
    const regionNote = ' ALSO add a REGION MAP: wrap each distinct entity/concept this chunk contains (e.g. FROG, ' +
      'VEHICLES, WATER, HUD, INPUT, GAME_LOOP, COLORS) in PAIRED markers -- "' + commentChar +
      ' [REGION: NAME] one-line description" before the block and "' + commentChar +
      ' [/REGION: NAME]" after it. Only ADD comment markers; change no code.';
    const instruction = (isFirst
      ? 'Add a ' + commentChar + ' [SCOPE] comment at the very top explaining what this file does. Convert TODOs to ' +
        commentChar + ' [TODO], add ' + commentChar + ' [WARN] to fragile code. Keep ALL code as-is.'
      : 'This is part ' + (c + 1) + ' of a large file. Convert TODOs to ' + commentChar +
        ' [TODO], add ' + commentChar + ' [WARN] to fragile code. Do NOT add [SCOPE]. Keep ALL code as-is.') + regionNote + styleWarning;

    const result = await routing.analyzeFile(
      filePath + ' (chunk ' + (c + 1) + '/' + chunks.length + ')',
      chunks[c],
      instruction,
      token
    );

    if (!result.success) {
      processedChunks.push(chunks[c]);
    } else {
      let cleaned = result.text;
      if (cleaned.startsWith('\`\`\`')) {
        cleaned = cleaned.replace(/^\`\`\`[a-z]*\n?/, '').replace(/\n?\`\`\`$/, '');
      }
      cleaned = cleaned.replace(/^\`\`\`[a-z]*$/gm, '').replace(/^\`\`\`$/gm, '');

      // auto-fix wrong comment style
      if (['py', 'sh', 'bash', 'yaml', 'yml', 'rb'].includes(ext)) {
        cleaned = cleaned.replace(/^\/\/ (\[(?:SCOPE|TODO|NEXT|WARN|DEAD|DONE)\])/gm, '# $1');
        cleaned = cleaned.replace(/^\/\/ /gm, '# ');
      }
      if (['html', 'xml', 'vue', 'svelte'].includes(ext)) {
        cleaned = cleaned.replace(/^\/\/ (\[(?:SCOPE|TODO|NEXT|WARN|DEAD|DONE)\].*)/gm, '<!-- $1 -->');
      }

      processedChunks.push(cleaned);
    }
  }

  return { text: processedChunks.join('\n'), model: 'gemini-2.5-flash (chunked)', success: true };
}
