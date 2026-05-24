// [SCOPE] Visual Contract — extract editable properties from built HTML/CSS files
import * as fs from 'fs';
import * as path from 'path';
import type { VisualProperty, VisualSection, VisualContract, PropCategory } from './visualContractTypes';

let _seq = 0;
function uid(prefix: string): string { return `${prefix}-${++_seq}`; }

function esc(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function cssLabel(propName: string, selectorCtx: string): string {
  const token = selectorCtx.replace(/[^a-zA-Z0-9-_]/g, ' ').trim().split(/\s+/)
    .filter(w => w.length > 2 && !['root', 'html', 'body', 'main', 'after', 'before', 'hover'].includes(w))[0] || '';
  const prop = propName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return token ? `${token.charAt(0).toUpperCase()}${token.slice(1)} ${prop}` : prop;
}

// Walk CSS to map character offset → containing selector string
function selectorAt(content: string, target: number): string {
  let sel = ''; let depth = 0; let lastSel = '';
  const selRe = /([^\n\r{}]+)\{|[{}]/g; let m: RegExpExecArray | null;
  while ((m = selRe.exec(content)) !== null) {
    if (m.index > target) { break; }
    const tok = m[0].trim();
    if (tok === '{') { depth++; }
    else if (tok === '}') { depth = Math.max(0, depth - 1); if (depth === 0) { lastSel = ''; } }
    else { lastSel = tok.replace(/\{.*/, '').trim(); if (m.index + m[0].length <= target) { sel = lastSel; } }
  }
  return sel;
}

function addCssProps(css: string, fileName: string, out: VisualProperty[]): void {
  const seenVals = new Set<string>();
  // Colors
  const colorRe = /(background(?:-color)?|(?:^|\W)color|border(?:-color)?|fill|outline-color)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/gi;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(css)) !== null) {
    const prop = m[1].replace(/^\W/, '').trim(); const val = m[2].toLowerCase();
    if (seenVals.has(prop + val)) { continue; }
    seenVals.add(prop + val);
    const ctx = selectorAt(css, m.index);
    out.push({ id: uid('clr'), label: cssLabel(prop, ctx), type: 'color', value: val,
      file: fileName, category: 'colors', proOnly: false, selectorCtx: ctx,
      findRegex: `(${esc(m[1])}\\s*:\\s*)(${esc(m[2])})`, findGroup: 2 });
    if (out.filter(p => p.category === 'colors').length >= 14) { break; }
  }
  // Numbers: font-size, border-radius, padding, gap, max-width
  const numRe = /(font-size|border-radius|padding(?:-(?:top|bottom|left|right))?|gap|max-width|letter-spacing)\s*:\s*([0-9.]+)(px|em|rem|%|vw|vh)/gi;
  while ((m = numRe.exec(css)) !== null) {
    const prop = m[1]; const val = m[2]; const unit = m[3];
    if (seenVals.has(prop + val + unit)) { continue; }
    seenVals.add(prop + val + unit);
    const ctx = selectorAt(css, m.index);
    const cat: PropCategory = /font-size|letter/.test(prop) ? 'text' : /padding|gap|max/.test(prop) ? 'layout' : 'effects';
    out.push({ id: uid('num'), label: cssLabel(prop, ctx), type: 'number', value: val, unit,
      file: fileName, category: cat, proOnly: /gap|max|letter/.test(prop),
      selectorCtx: ctx,
      findRegex: `(${esc(prop)}\\s*:\\s*)(${esc(val)})(${esc(unit)})`, findGroup: 2 });
  }
}

function addHtmlText(html: string, fileName: string, out: VisualProperty[]): void {
  // Page title
  const tM = /<title>([^<]{1,120})<\/title>/i.exec(html);
  if (tM) {
    out.push({ id: uid('txt'), label: 'Page Title', type: 'text', value: tM[1].trim(),
      file: fileName, category: 'text', proOnly: false,
      findRegex: '(<title>)([^<]+)(<\\/title>)', findGroup: 2 });
  }
  // h1–h4 headings
  const hRe = /<(h[1-4])[^>]*>\s*([^<\n]{1,120}?)\s*<\/h[1-4]>/gi;
  let m: RegExpExecArray | null; let hc = 0;
  while ((m = hRe.exec(html)) !== null && hc < 4) {
    const tag = m[1]; const text = m[2].trim().replace(/&[a-z]+;/g, '');
    if (text.length < 2) { continue; }
    out.push({ id: uid('txt'), label: `${tag.toUpperCase()} Text`, type: 'text', value: text,
      file: fileName, category: 'text', proOnly: false,
      findRegex: `(<${tag}[^>]*>\\s*)([^<\\n]{1,120}?)(\\s*<\\/${tag}>)`, findGroup: 2 }); hc++;
  }
  // Buttons (first 3)
  const bRe = /<button[^>]*>\s*([^<\n]{1,80}?)\s*<\/button>/gi; let bc = 0;
  while ((m = bRe.exec(html)) !== null && bc < 3) {
    const text = m[1].trim(); if (text.length < 2) { continue; }
    out.push({ id: uid('txt'), label: `Button: ${text.slice(0, 24)}`, type: 'text', value: text,
      file: fileName, category: 'text', proOnly: false,
      findRegex: `(<button[^>]*>\\s*)([^<\\n]{1,80}?)(\\s*<\\/button>)`, findGroup: 2 }); bc++;
  }
  // Inline <style> blocks
  const sRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = sRe.exec(html)) !== null) { addCssProps(m[1], fileName, out); }
}

function extractSections(html: string, fileName: string): VisualSection[] {
  const out: VisualSection[] = [];
  const re = /<(section|header|footer|nav|main|article)[^>]*(?:class="([^"]+)")?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[1]; const cls = (m[2] || '').split(/\s+/).find(c => c.length > 2) || tag;
    const label = cls.charAt(0).toUpperCase() + cls.slice(1);
    out.push({ id: uid('sec'), label: `${label} Section`, elementTag: tag, cssClass: m[2] });
    if (out.length >= 8) { break; }
  }
  return out;
}

export function extractVisualContract(projectRoot: string, builtFiles: string[]): VisualContract {
  _seq = 0;
  const properties: VisualProperty[] = [];
  const sections: VisualSection[] = [];
  const visualFiles = builtFiles.filter(f => /\.(html|css)$/i.test(f));

  for (const rel of visualFiles) {
    let content: string;
    try { content = fs.readFileSync(path.join(projectRoot, rel), 'utf-8'); } catch { continue; }
    if (rel.endsWith('.css')) { addCssProps(content, rel, properties); }
    else { addHtmlText(content, rel, properties); sections.push(...extractSections(content, rel)); }
  }
  return { projectRoot, files: visualFiles, properties, sections, extractedAt: Date.now() };
}
