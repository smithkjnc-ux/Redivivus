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

// [DONE] extractFilesFromRawText moved here from cloudBuildResultProcessor.ts (Rule 9 split)
/**
 * Parse markdown code fences from a raw AI response and populate data.files.
 * Mutates data.files in place. No-op if rawText is empty.
 */
export function extractFilesFromRawText(data: { files: any[] }, rawText: string): void {
  const fenceRe = /```(\w+)?(?::([^\s`]+))?\s*(?:path:\s*([^\n]+?)\s*\n|filename="([^"]+)"\s*\n)?\n?([\s\S]*?)```/g;
  const headerMap = new Map<number, string>();
  const headerRe = /(?:^|\n)(?:#{1,4}\s+|(?:\*\*))([^\n*]+?)(?:\*\*)?[ \t]*\n(?:[ \t]*\n)?```/g;
  let hm;
  while ((hm = headerRe.exec(rawText)) !== null) {
    const fenceStart = rawText.indexOf('```', hm.index + hm[0].indexOf('\n'));
    if (fenceStart >= 0) { headerMap.set(fenceStart, hm[1].trim().replace(/^`|`$/g, '')); }
  }
  let match;
  const extMap: Record<string, string> = { javascript: 'js', typescript: 'ts', html: 'html', css: 'css', python: 'py', json: 'json', jsx: 'jsx', tsx: 'tsx', go: 'go', rust: 'rs', java: 'java', ruby: 'rb', shell: 'sh', bash: 'sh', sh: 'sh' };
  interface Blk { language?: string; content: string; explicit: string; ext: string; }
  const blocks: Blk[] = [];
  while ((match = fenceRe.exec(rawText)) !== null) {
    const [, language, colonPath, inlinePath, attrPath, content] = match;
    if (!content?.trim()) { continue; }
    const explicit = inlinePath?.trim() || colonPath?.trim() || attrPath?.trim() || headerMap.get(match.index) || '';
    const ext = language ? (extMap[language.toLowerCase()] || language.toLowerCase()) : '';
    blocks.push({ language, content: content.trim(), explicit, ext });
  }
  const htmlRefs: string[] = [];
  for (const b of blocks) {
    if (b.ext === 'html' || /^\s*<!doctype html|<html[\s>]/i.test(b.content)) {
      htmlRefs.push(...extractHtmlAssetRefs(b.content));
    }
  }
  const usedRefs = new Set<string>();
  const usedPaths = new Set<string>();
  let fileIndex = 0;
  for (const b of blocks) {
    let filePath = b.explicit || filenameFromFirstLine(b.content) || '';
    if (!filePath && b.ext && b.ext !== 'html') { filePath = nextRefForExt(htmlRefs, usedRefs, b.ext) || ''; }
    if (!filePath && b.ext === 'html') { filePath = 'index.html'; }
    if (!filePath && b.ext) { filePath = fileIndex === 0 ? `index.${b.ext}` : `file${fileIndex}.${b.ext}`; }
    if (!filePath) { filePath = fileIndex === 0 ? 'index.html' : `file${fileIndex}.txt`; }
    if (usedPaths.has(filePath)) { const dot = filePath.lastIndexOf('.'); filePath = dot > 0 ? `${filePath.slice(0, dot)}-${fileIndex}${filePath.slice(dot)}` : `${filePath}-${fileIndex}`; }
    usedPaths.add(filePath);
    data.files.push({ path: filePath, content: b.content, isNew: true });
    fileIndex++;
  }
  if (data.files.length === 0 && rawText.trim()) {
    const errM = rawText.match(/\[ERROR:\s*([^\]]+)\]/);
    try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] NO-FENCE output (first 500): ${rawText.trim().slice(0,500).replace(/\n/g,' ')}\n`); } catch {}
    if (errM) { throw new Error(`Build worker error: ${errM[1].trim()}`); }
    const t = rawText.trim()
      .replace(/^```[\w-]*(?::[^\n]*)?[ \t]*\n?/, '')
      .replace(/\n?```[ \t]*$/, '')
      .trim();
    if (/<!doctype html|<html[\s>]/i.test(t) || (/[<{]/.test(t) && t.length > 80)) {
      data.files.push({ path: 'index.html', content: t, isNew: true });
    }
  }
  try { require('fs').appendFileSync(require('os').homedir()+'/redivivus_debug.log', `[buildtrace] parse: blocks=${blocks.length} htmlRefs=[${htmlRefs.join(', ')}] -> files=[${data.files.map((f: any) => f.path).join(', ')}]\n`); } catch {}
}
