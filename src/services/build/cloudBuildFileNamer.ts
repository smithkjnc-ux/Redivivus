// [SCOPE] Filename inference for the single-file build fallback. When /plan did NOT return a multi-file
// plan but the worker returned a multi-file blob, this recovers the REAL filenames instead of the
// generic file1.js/file2.js — which break wiring (e.g. index.html references board.js but the file was
// saved as file2.js, so nothing loads). Sources, in priority order: (1) a first-line filename comment,
// (2) the HTML's referenced assets (<script src> / <link href>) matched by extension and document order.

const FILE_RE = /([\w][\w./-]*\.[a-z0-9]{1,5})/i;

/** Local asset paths referenced by an HTML string, in document order (skips http/CDN/absolute). */
export function extractHtmlAssetRefs(html: string): string[] {
  const refs: string[] = [];
  const scriptRe = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  const linkRe = /<link[^>]*\bhref\s*=\s*["']([^"']+\.css)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) { refs.push(m[1].trim()); }
  while ((m = linkRe.exec(html)) !== null) { refs.push(m[1].trim()); }
  return refs.filter(r => r && !/^https?:\/\//i.test(r) && !r.startsWith('//') && !r.startsWith('data:'));
}

/** Filename from a first-line comment (slash-slash, slash-star, HTML comment, or hash style). */
export function filenameFromFirstLine(content: string): string | undefined {
  const first = (content.split('\n')[0] || '').trim();
  // Strip common comment delimiters, then look for a bare filename token.
  const stripped = first
    .replace(/^<!--/, '').replace(/-->$/, '')
    .replace(/^\/\*/, '').replace(/\*\/$/, '')
    .replace(/^\/\//, '').replace(/^#/, '').replace(/^--/, '')
    .replace(/\[SCOPE\]/i, '')
    .trim();
  // Accept only if the line is essentially JUST a filename (avoids matching prose with a dotted word).
  if (/^[\w][\w./-]*\.[a-z0-9]{1,5}$/i.test(stripped)) { return stripped; }
  const m = first.match(/^(?:\/\/|#|--|\/\*|<!--)\s*([\w][\w./-]*\.[a-z0-9]{1,5})\s*(?:\*\/|-->)?\s*$/i);
  return m ? m[1] : undefined;
}

/**
 * Pull the next unused HTML-referenced asset matching `ext` (e.g. 'js', 'css'), in document order.
 * Mutates `used` to mark the chosen ref. Returns undefined when none remain for that extension.
 */
export function nextRefForExt(refs: string[], used: Set<string>, ext: string): string | undefined {
  for (const r of refs) {
    if (used.has(r)) { continue; }
    if (r.toLowerCase().endsWith('.' + ext.toLowerCase())) { used.add(r); return r; }
  }
  return undefined;
}

export { FILE_RE };
