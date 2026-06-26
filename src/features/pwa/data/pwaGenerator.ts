// [SCOPE] PWA generator (Phase 0) — turns a built web bundle (a folder with an index.html) into an installable
// PWA: enumerates the files, generates manifest.json + a precache service worker + an icon, injects the PWA wiring
// into the entry HTML, and flags local refs that won't bundle. Pure + offline (no hosting, no AI, no VS Code).
// Language-agnostic: it wraps the OUTPUT (html/js/wasm/assets), not the source language. See REDIVIVUS_ADD_TO_PHONE.md.

import * as fs from 'fs';
import * as path from 'path';
import { manifestJson, serviceWorkerJs, iconSvg, injectPwaIntoHtml } from './pwaTemplates.js';
import { iconPng } from './pngIcon.js';

const SKIP_DIRS = new Set(['.redivivus', '.git', 'node_modules', '.vscode', '__pycache__', '.idea', 'docs', 'tests']);
// Non-runtime files that shouldn't ship in (or be precached by) the installed app.
const SKIP_FILES = new Set(['.gitignore', '.ds_store', 'license', 'license.txt', 'file structure']);
function isRuntimeFile(name: string): boolean {
  const lower = name.toLowerCase();
  return !SKIP_FILES.has(lower) && !lower.endsWith('.md');
}

export interface PwaOptions {
  title: string;
  themeColor?: string;       // default near-black
  backgroundColor?: string;  // default dark
  orientation?: 'any' | 'portrait' | 'landscape';
  includeBadge?: boolean;    // free tier => true; paid-removed => false (enforced server-side at publish)
}

export interface PwaResult {
  files: Map<string, Buffer>; // relpath -> content (original assets + generated manifest/sw/icon + injected html)
  warnings: string[];         // local refs the standalone host won't have (failed inlines / runtime asset fetches)
  entry: string;              // the entry HTML path (e.g. "index.html")
  precache: string[];         // file list baked into the service worker
}

// Walk a folder into a relpath -> Buffer map, skipping junk dirs.
function readBundle(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) { continue; }
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { walk(full); }
      else if (isRuntimeFile(name)) { out.set(path.relative(root, full).replace(/\\/g, '/'), fs.readFileSync(full)); }
    }
  };
  walk(root);
  return out;
}

// Local refs in the HTML that are NOT in the bundle — these will 404 on the host (genuine breakage). A local ref
// that IS bundled (e.g. game.js for a multi-file app) is fine: the SW precaches it. Catches leftover
// <script src>/<link>/<img> and runtime fetch("local-asset"). External http(s)/data/blob are never flagged.
function findUninlinableRefs(html: string, entry: string, bundle: Set<string>): string[] {
  const baseDir = path.posix.dirname(entry);
  const isLocal = (r: string) => !!r && !/^(?:https?:|data:|blob:|\/\/|#|mailto:|tel:)/i.test(r.trim());
  const resolve = (r: string) => path.posix.normalize(path.posix.join(baseDir, r.split(/[?#]/)[0])).replace(/^\.\//, '');
  const hits: string[] = [];
  const push = (re: RegExp) => {
    let m;
    while ((m = re.exec(html))) {
      const ref = m[1];
      if (isLocal(ref) && !bundle.has(resolve(ref))) { hits.push(ref); }
    }
  };
  push(/<(?:script|img)\b[^>]*\bsrc=["']([^"']+)["']/gi);
  push(/<link\b[^>]*\bhref=["']([^"']+)["']/gi);
  push(/(?:fetch|\.open)\(\s*[^,)]*?["'`]([^"'`]+\.(?:svg|json|png|jpg|jpeg|gif|webp|txt|csv|wav|mp3|ogg|wasm))["'`]/gi);
  return [...new Set(hits)];
}

// Generate the PWA from a built folder. Returns the full augmented file map ready to publish (Phase 1 hosts it).
export function generatePwa(srcDir: string, opts: PwaOptions): PwaResult {
  const files = readBundle(srcDir);
  const entry = [...files.keys()].find(f => f === 'index.html')
    || [...files.keys()].find(f => f.toLowerCase().endsWith('index.html'))
    || [...files.keys()].find(f => f.toLowerCase().endsWith('.html'));
  if (!entry) { throw new Error('No HTML entry point found — a PWA needs an index.html.'); }

  const themeColor = opts.themeColor || '#0f1117';
  const backgroundColor = opts.backgroundColor || '#0f1117';
  const orientation = opts.orientation || 'any';
  const includeBadge = opts.includeBadge !== false; // default ON (free tier); publish re-stamps for free accounts
  const version = String(Date.now());

  // Inject the PWA wiring into the entry HTML.
  const html = files.get(entry)!.toString('utf-8');
  const warnings = findUninlinableRefs(html, entry, new Set(files.keys()));
  files.set(entry, Buffer.from(injectPwaIntoHtml(html, { title: opts.title, themeColor, includeBadge }), 'utf-8'));

  // Generated PWA files. icon.svg (with initials) for Android/manifest; PNG gradient tiles for iOS apple-touch-icon.
  files.set('icon.svg', Buffer.from(iconSvg(opts.title, themeColor, backgroundColor), 'utf-8'));
  files.set('icon-192.png', iconPng(themeColor, backgroundColor, 192));
  files.set('icon-512.png', iconPng(themeColor, backgroundColor, 512));
  files.set('manifest.json', Buffer.from(manifestJson({
    name: opts.title, themeColor, backgroundColor, orientation,
  }), 'utf-8'));
  const precache = [...files.keys()].filter(f => f !== 'sw.js');
  files.set('sw.js', Buffer.from(serviceWorkerJs(precache, version), 'utf-8'));

  return { files, warnings, entry, precache };
}

// Test/dev helper: write a PwaResult to an output folder.
export function writePwaBundle(result: PwaResult, outDir: string): void {
  for (const [rel, buf] of result.files) {
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
}
