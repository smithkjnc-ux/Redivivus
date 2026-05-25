// [SCOPE] HTML element mover — reorders or reparents elements in HTML by DOM path + indices

const VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

interface Tok { type: 'open'|'close'|'void'; tag: string; start: number; end: number; }

function nextTag(html: string, from: number): Tok | null {
  let pos = from;
  while (pos < html.length) {
    const i = html.indexOf('<', pos);
    if (i === -1) return null;
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); pos = e === -1 ? html.length : e + 3; continue; }
    if (html[i + 1] === '!') { const e = html.indexOf('>', i); pos = e === -1 ? html.length : e + 1; continue; }
    if (html.startsWith('</', i)) {
      const e = html.indexOf('>', i); if (e === -1) return null;
      const tag = html.slice(i + 2, e).trim().split(/[\s>]/)[0].toLowerCase();
      return { type: 'close', tag, start: i, end: e + 1 };
    }
    const e = html.indexOf('>', i); if (e === -1) return null;
    const rawName = html.slice(i + 1, e).trim().split(/[\s/>]/)[0].toLowerCase();
    if (!rawName || !/^[a-z]/.test(rawName)) { pos = i + 1; continue; }
    const selfClose = html[e - 1] === '/' || VOID_TAGS.has(rawName);
    return { type: selfClose ? 'void' : 'open', tag: rawName, start: i, end: e + 1 };
  }
  return null;
}

function closeStart(html: string, from: number, tag: string): number {
  let pos = from, depth = 1;
  while (pos < html.length) {
    const t = nextTag(html, pos); if (!t) return -1;
    if (t.tag === tag) { if (t.type === 'open') depth++; else if (t.type === 'close' && --depth === 0) return t.start; }
    pos = t.end;
  }
  return -1;
}

function skipSubtree(html: string, openEnd: number, tag: string): number {
  const cs = closeStart(html, openEnd, tag); if (cs === -1) return -1;
  return html.indexOf('>', cs) + 1;
}

function findChildAt(html: string, from: number, to: number, idx: number): { openEnd: number; closeStart: number; tag: string } | null {
  let pos = from, n = 0;
  while (pos < to) {
    const t = nextTag(html, pos); if (!t || t.start >= to) break;
    if (t.type === 'open') {
      if (n === idx) { const cs = closeStart(html, t.end, t.tag); return cs !== -1 ? { openEnd: t.end, closeStart: cs, tag: t.tag } : null; }
      n++; pos = skipSubtree(html, t.end, t.tag); if (pos === -1) break;
    } else if (t.type === 'void') { if (n === idx) return null; n++; pos = t.end; }
    else { pos = t.end; }
  }
  return null;
}

function directChildren(html: string, from: number, to: number): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let pos = from;
  while (pos < to) {
    const t = nextTag(html, pos); if (!t || t.start >= to) break;
    if (t.type === 'open') {
      const cs = closeStart(html, t.end, t.tag); if (cs === -1) break;
      const ce = html.indexOf('>', cs) + 1; out.push({ start: t.start, end: ce }); pos = ce;
    } else if (t.type === 'void') { out.push({ start: t.start, end: t.end }); pos = t.end; }
    else { pos = t.end; }
  }
  return out;
}

function navigatePath(html: string, path: number[]): { innerStart: number; innerEnd: number } | null {
  let from = 0, to = html.length;
  for (const idx of path) {
    const child = findChildAt(html, from, to, idx); if (!child) return null;
    from = child.openEnd; to = child.closeStart;
  }
  return { innerStart: from, innerEnd: to };
}

export function moveChildElement(html: string, parentPath: number[], fromIndex: number, toIndex: number): string {
  if (fromIndex === toIndex) return html;
  const span = navigatePath(html, parentPath); if (!span) return html;
  const { innerStart, innerEnd } = span;
  const inner = html.slice(innerStart, innerEnd);
  const kids = directChildren(inner, 0, inner.length);
  if (fromIndex >= kids.length || toIndex >= kids.length) return html;
  const order = Array.from({ length: kids.length }, (_, i) => i);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  let newInner = '', pos = 0;
  for (let i = 0; i < kids.length; i++) {
    newInner += inner.slice(pos, kids[i].start);
    const src = kids[order[i]];
    newInner += inner.slice(src.start, src.end);
    pos = kids[i].end;
  }
  newInner += inner.slice(pos);
  return html.slice(0, innerStart) + newInner + html.slice(innerEnd);
}

function adjustPathAfterRemoval(path: number[], removedParentPath: number[], removedIndex: number): number[] {
  if (path.length <= removedParentPath.length) return path;
  for (let i = 0; i < removedParentPath.length; i++) {
    if (path[i] !== removedParentPath[i]) return path;
  }
  const idxInParent = path[removedParentPath.length];
  if (idxInParent > removedIndex) {
    const adj = [...path];
    adj[removedParentPath.length] = idxInParent - 1;
    return adj;
  }
  return path;
}

export function transplantElement(html: string, fromParentPath: number[], fromIndex: number, refPath: number[], insertAfter: boolean): string {
  if (!refPath.length) return html;
  if (refPath.length > fromParentPath.length &&
      fromParentPath.every((v, i) => v === refPath[i]) &&
      refPath[fromParentPath.length] === fromIndex) return html;
  const srcSpan = navigatePath(html, fromParentPath); if (!srcSpan) return html;
  const srcInner = html.slice(srcSpan.innerStart, srcSpan.innerEnd);
  const srcKids = directChildren(srcInner, 0, srcInner.length);
  if (fromIndex >= srcKids.length) return html;
  const elemHtml = srcInner.slice(srcKids[fromIndex].start, srcKids[fromIndex].end);
  const newSrcInner = srcInner.slice(0, srcKids[fromIndex].start) + srcInner.slice(srcKids[fromIndex].end);
  const htmlAfterRemove = html.slice(0, srcSpan.innerStart) + newSrcInner + html.slice(srcSpan.innerEnd);
  const adjRefPath = adjustPathAfterRemoval(refPath, fromParentPath, fromIndex);
  const adjRefParentPath = adjRefPath.slice(0, -1);
  const adjRefIndex = adjRefPath[adjRefPath.length - 1];
  const dstParentSpan = navigatePath(htmlAfterRemove, adjRefParentPath); if (!dstParentSpan) return html;
  const dstInner = htmlAfterRemove.slice(dstParentSpan.innerStart, dstParentSpan.innerEnd);
  const dstKids = directChildren(dstInner, 0, dstInner.length);
  if (adjRefIndex >= dstKids.length) return html;
  const insertPos = insertAfter ? dstKids[adjRefIndex].end : dstKids[adjRefIndex].start;
  const newDstInner = dstInner.slice(0, insertPos) + elemHtml + dstInner.slice(insertPos);
  return htmlAfterRemove.slice(0, dstParentSpan.innerStart) + newDstInner + htmlAfterRemove.slice(dstParentSpan.innerEnd);
}

export function reparentElement(html: string, fromParentPath: number[], fromIndex: number, toPath: number[]): string {
  // Guard: can't move an element inside itself
  if (toPath.length > fromParentPath.length &&
      fromParentPath.every((v, i) => v === toPath[i]) &&
      toPath[fromParentPath.length] === fromIndex) return html;
  const srcSpan = navigatePath(html, fromParentPath); if (!srcSpan) return html;
  const srcInner = html.slice(srcSpan.innerStart, srcSpan.innerEnd);
  const srcKids = directChildren(srcInner, 0, srcInner.length);
  if (fromIndex >= srcKids.length) return html;
  const elemHtml = srcInner.slice(srcKids[fromIndex].start, srcKids[fromIndex].end);
  const newSrcInner = srcInner.slice(0, srcKids[fromIndex].start) + srcInner.slice(srcKids[fromIndex].end);
  const htmlAfterRemove = html.slice(0, srcSpan.innerStart) + newSrcInner + html.slice(srcSpan.innerEnd);
  const adjustedToPath = adjustPathAfterRemoval(toPath, fromParentPath, fromIndex);
  const dstSpan = navigatePath(htmlAfterRemove, adjustedToPath); if (!dstSpan) return html;
  return htmlAfterRemove.slice(0, dstSpan.innerEnd) + elemHtml + htmlAfterRemove.slice(dstSpan.innerEnd);
}
