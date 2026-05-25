// [SCOPE] Chat Panel Code Structurer — applies Redivivus rules to AI-generated code AFTER it works
// Generate first, structure after. Keep under 200 lines.

import * as path from 'path';

// Comment syntax per language
const COMMENT_MAP: Record<string, { line?: string; block?: [string, string] }> = {
  ts: { line: '//', block: ['/*', '*/'] },  tsx: { line: '//', block: ['/*', '*/'] },
  js: { line: '//', block: ['/*', '*/'] },  jsx: { line: '//', block: ['/*', '*/'] },
  py: { line: '#' },  rb: { line: '#' },  sh: { line: '#' },  bash: { line: '#' },
  go: { line: '//', block: ['/*', '*/'] },  rs: { line: '//', block: ['/*', '*/'] },
  java: { line: '//', block: ['/*', '*/'] },  kt: { line: '//', block: ['/*', '*/'] },
  css: { block: ['/*', '*/'] },  scss: { block: ['/*', '*/'] },
  html: { block: ['<!--', '-->'] },  xml: { block: ['<!--', '-->'] },  svg: { block: ['<!--', '-->'] },
  yaml: { line: '#' },  yml: { line: '#' },  toml: { line: '#' },
  sql: { line: '--' },  md: { block: ['<!--', '-->'] },
};

/** Apply Redivivus structural rules to generated code */
export function applyRedivivusStructure(code: string, filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const syntax = COMMENT_MAP[ext];
  if (!syntax) { return code; } // Unknown extension, return as-is

  const lines = code.split('\n');
  let result = [...lines];

  // 1. Add [SCOPE] tag at line 1 if missing
  if (!lines[0]?.includes('[SCOPE]')) {
    const scopeDesc = deriveScopeFromContent(lines, filename);
    const scopeLine = syntax.line
      ? `${syntax.line} [SCOPE] ${scopeDesc}`
      : `${syntax.block![0]} [SCOPE] ${scopeDesc} ${syntax.block![1]}`;
    result.unshift(scopeLine);
  }

  // 2. Add NARRATOR comments to major functions (JS/TS/HTML only)
  if (['js', 'ts', 'jsx', 'tsx', 'html'].includes(ext)) {
    result = addNarratorComments(result, syntax);
  }

  return result.join('\n');
}

/** Derive a [SCOPE] description from the file content */
function deriveScopeFromContent(lines: string[], filename: string): string {
  const basename = path.basename(filename, path.extname(filename));
  // Look for title tag, class name, or main export
  for (const line of lines.slice(0, 30)) {
    const titleMatch = line.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) { return `${titleMatch[1]} — browser game/application`; }
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) { return `${classMatch[1]} class implementation`; }
    const exportMatch = line.match(/export\s+(default\s+)?function\s+(\w+)/);
    if (exportMatch) { return `${exportMatch[2]} module`; }
  }
  return `${basename} — generated code`;
}

/** Add // NARRATOR: comments above significant functions */
function addNarratorComments(lines: string[], syntax: { line?: string; block?: [string, string] }): string[] {
  // [WARN] HTML files have no line comment syntax but their <script> blocks use JS comments.
  // Detect if we're inside a <script> tag and use // for NARRATOR comments there.
  const jsPrefix = '//';
  const commentPrefix = syntax.line || jsPrefix; // Fallback to JS-style for HTML
  const result: string[] = [];
  const funcRe = /^\s*(export\s+)?(async\s+)?function\s+(\w+)/;
  const arrowRe = /^\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/;
  let insideScript = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim().toLowerCase();
    // Track whether we're inside a <script> block
    if (trimmed.includes('<script')) { insideScript = true; }
    if (trimmed.includes('</script')) { insideScript = false; }

    const prevLine = i > 0 ? lines[i - 1]?.trim() : '';
    if (prevLine.includes('NARRATOR:')) { result.push(line); continue; }

    // Only add NARRATOR if we're in a script context (or in a JS/TS file)
    const inJsContext = insideScript || !!syntax.line;
    const funcMatch = line.match(funcRe);
    const arrowMatch = line.match(arrowRe);

    if (inJsContext && funcMatch) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}${commentPrefix} NARRATOR: ${funcMatch[3]} function`);
    } else if (inJsContext && arrowMatch && !['const', 'let', 'var'].includes(arrowMatch[2])) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}${commentPrefix} NARRATOR: ${arrowMatch[2]}`);
    }
    // [WARN] Don't add NARRATOR to every method — only top-level functions to avoid noise
    result.push(line);
  }
  return result;
}
