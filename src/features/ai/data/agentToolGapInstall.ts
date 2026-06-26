// [SCOPE] Turn a missing capability into install guidance the USER (not just the owner) can act on:
// a plain-English purpose ("converts documents into PDFs"), a single runnable install command for THIS
// machine's package manager, and an optional caveat (e.g. native libs). Kept separate from the detection
// logic (agentToolGapExtract) so each stays small. Impure only in pkgManager() (probes which managers
// exist); everything else is a pure lookup. We NEVER run these — we hand them to the user to run.

type Pm = 'dnf' | 'apt' | 'brew' | 'pacman' | 'zypper' | '';

let _pm: Pm | undefined;
/** Detect the user's system package manager once (cached). '' when none is recognised. */
function pkgManager(): Pm {
  if (_pm !== undefined) { return _pm; }
  for (const m of ['dnf', 'apt', 'brew', 'pacman', 'zypper'] as Exclude<Pm, ''>[]) {
    try { require('child_process').execSync(`command -v ${m}`, { stdio: 'ignore' }); _pm = m; return m; } catch { /* next */ }
  }
  _pm = ''; return _pm;
}

const VERB: Record<Exclude<Pm, ''>, (pkg: string) => string> = {
  dnf: (p) => `sudo dnf install ${p}`,
  apt: (p) => `sudo apt install ${p}`,
  brew: (p) => `brew install ${p}`,
  pacman: (p) => `sudo pacman -S ${p}`,
  zypper: (p) => `sudo zypper install ${p}`,
};

// Base package name when it differs from the executable; per-manager overrides on top of that.
const BASE_PKG: Record<string, string> = { convert: 'imagemagick', magick: 'imagemagick', 'rsvg-convert': 'librsvg' };
const PKG_OVERRIDE: Record<string, Partial<Record<Exclude<Pm, ''>, string>>> = {
  convert: { dnf: 'ImageMagick', zypper: 'ImageMagick' },
  magick: { dnf: 'ImageMagick', zypper: 'ImageMagick' },
  'rsvg-convert': { dnf: 'librsvg2-tools', apt: 'librsvg2-bin', zypper: 'rsvg-convert' },
};
function pkgName(tool: string, pm: Exclude<Pm, ''>): string {
  return PKG_OVERRIDE[tool]?.[pm] || BASE_PKG[tool] || tool;
}

// Tools that are actually pip packages (no system package), and caveats worth telling the user up-front.
const PIP_TOOLS = new Set(['weasyprint']);
const NOTE: Record<string, string> = {
  weasyprint: 'weasyprint also needs native libraries — Fedora: sudo dnf install pango cairo gdk-pixbuf2  ·  Debian/Ubuntu: sudo apt install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0',
};

// Plain-English purpose so a novice knows WHY they're installing something.
const PURPOSE: Record<string, string> = {
  pandoc: 'converts documents (like Markdown) into PDFs and other formats',
  wkhtmltopdf: 'turns HTML pages into PDFs',
  weasyprint: 'renders HTML/Markdown into nicely-formatted PDFs',
  convert: 'converts and edits images',
  magick: 'converts and edits images',
  'rsvg-convert': 'turns SVG vector files into images',
  ffmpeg: 'converts audio and video files',
  libreoffice: 'opens and converts office documents',
  markdown: 'lets Python read and convert Markdown text',
};

/** A single runnable install command for this machine. pip for modules / pip-tools, else the system manager. */
export function installHint(name: string, kind: 'tool' | 'module'): string {
  if (kind === 'module' || PIP_TOOLS.has(name)) { return `pip install ${name}`; }
  const pm = pkgManager();
  return pm ? VERB[pm](pkgName(name, pm)) : `Install \`${name}\` with your system package manager (dnf / apt / brew).`;
}

/** Optional one-line caveat shown under the command (e.g. native libs weasyprint needs). */
export function installNote(name: string, _kind: 'tool' | 'module'): string | undefined { return NOTE[name]; }

/** Human-friendly "what it does" line; safe generic fallback so unknown tools still read sensibly. */
export function purposeOf(name: string, kind: 'tool' | 'module'): string {
  return PURPOSE[name] || (kind === 'module' ? 'is a Python package this task needs' : 'is a command-line tool this task needs');
}
