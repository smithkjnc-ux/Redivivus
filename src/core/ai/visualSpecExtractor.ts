// [SCOPE] Visual Spec Extractor -- scans project files for existing visual data.
// Two strategies: (1) theme/token files for explicit design system values,
// (2) UI component scan for implicit style patterns.
// No AI calls -- pure file system reads.

import * as fs from 'fs';
import * as path from 'path';
import type { VisualSpec } from './visualSpecService';

const THEME_FILE_NAMES = ['theme.ts', 'theme.js', 'theme.css', 'tokens.ts', 'tokens.js',
  'designTokens.ts', 'designTokens.js', 'design-tokens.css', 'variables.css', 'vars.css',
  'colors.ts', 'colors.js', 'tailwind.config.ts', 'tailwind.config.js'];

// Scan for CSS custom property values (--primary: #1a73e8)
const CSS_VAR_RE = /--([a-z][a-z0-9-]*(?:color|primary|secondary|background|surface|text|accent|bg|fg|brand|foreground)[a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/gi;
const FONT_VAR_RE = /--[a-z-]*font(?:-family)?\s*:\s*([^;}\n]{3,60})/i;
const RADIUS_VAR_RE = /--[a-z-]*radius[a-z-]*\s*:\s*([^;}\n]{2,20})/i;
const BASE_FONT_SIZE_RE = /--[a-z-]*(?:font-size-base|base-size|size-base)[a-z-]*\s*:\s*(\d+)px/i;
const HEX_COLOR_RE = /#([0-9a-fA-F]{3,8})/g;

function readSafe(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function findThemeFile(projectRoot: string): { path: string; content: string } | null {
  const searchDirs = ['src', 'src/styles', 'src/theme', 'src/tokens', 'styles', '.'];
  for (const dir of searchDirs) {
    for (const name of THEME_FILE_NAMES) {
      const full = path.join(projectRoot, dir, name);
      const content = readSafe(full);
      if (content) { return { path: full, content }; }
    }
  }
  return null;
}

function extractHexColors(text: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(HEX_COLOR_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const hex = `#${m[1].toLowerCase()}`;
    if (!found.includes(hex)) { found.push(hex); }
  }
  return found;
}

/** Strategy 1: extract from a theme/token file with CSS custom properties */
export function extractFromProjectFiles(projectRoot: string): Partial<VisualSpec> | null {
  const themeFile = findThemeFile(projectRoot);
  if (!themeFile) { return null; }

  const text = themeFile.content;
  const palette: Record<string, string> = {};

  let m: RegExpExecArray | null;
  const varRe = new RegExp(CSS_VAR_RE.source, 'gi');
  while ((m = varRe.exec(text)) !== null) {
    const varName = m[1].toLowerCase();
    const val = m[2].toLowerCase();
    if (varName.includes('primary') && !palette.primary)       { palette.primary = val; }
    if (varName.includes('secondary') && !palette.secondary)   { palette.secondary = val; }
    if ((varName.includes('background') || varName.includes('bg')) && !palette.background) { palette.background = val; }
    if ((varName.includes('surface') || varName.includes('card')) && !palette.surface) { palette.surface = val; }
    if ((varName.includes('text') || varName.includes('foreground') || varName.includes('fg')) && !palette.text) { palette.text = val; }
    if (varName.includes('accent') && !palette.accent)         { palette.accent = val; }
  }
  if (Object.keys(palette).length < 2) { return null; }

  const fontMatch = FONT_VAR_RE.exec(text);
  const radiusMatch = RADIUS_VAR_RE.exec(text);
  const sizeMatch = BASE_FONT_SIZE_RE.exec(text);

  return {
    palette: {
      primary:    palette.primary    || '#3b82f6',
      secondary:  palette.secondary  || '#64748b',
      background: palette.background || '#ffffff',
      surface:    palette.surface    || '#f8fafc',
      text:       palette.text       || '#0f172a',
      accent:     palette.accent     || '#f59e0b',
    },
    typography: {
      fontFamily:    fontMatch ? fontMatch[1].trim().replace(/['"]/g, '') : 'system-ui, sans-serif',
      scaleBase:     sizeMatch ? parseInt(sizeMatch[1]) : 16,
      weightRegular: 400,
      weightBold:    700,
    },
    spacing: {
      unit:         8,
      borderRadius: radiusMatch ? radiusMatch[1].trim() : 'md',
    },
    confidence: 0.85,
    source: 'extracted',
  };
}

/** Strategy 2: infer style from 2-3 existing UI component files */
export function inferFromComponents(projectRoot: string): Partial<VisualSpec> | null {
  const componentDirs = ['src/components', 'src/ui', 'components', 'src'];
  let componentFiles: string[] = [];

  for (const dir of componentDirs) {
    const full = path.join(projectRoot, dir);
    try {
      const entries = fs.readdirSync(full);
      const found = entries
        .filter(f => /\.(tsx|jsx|vue|svelte|html|css)$/.test(f))
        .slice(0, 3)
        .map(f => path.join(full, f));
      componentFiles = componentFiles.concat(found);
    } catch { /* dir doesn't exist */ }
    if (componentFiles.length >= 3) { break; }
  }
  if (componentFiles.length === 0) { return null; }

  const allColors: string[] = [];
  let dominantFont = '';
  for (const file of componentFiles.slice(0, 3)) {
    const content = readSafe(file);
    if (!content) { continue; }
    allColors.push(...extractHexColors(content).slice(0, 4));
    if (!dominantFont) {
      const fm = /font-family\s*:\s*([^;}\n]{3,40})/.exec(content);
      if (fm) { dominantFont = fm[1].trim().replace(/['"]/g, ''); }
    }
  }
  if (allColors.length < 2) { return null; }

  const [primary = '#3b82f6', secondary = '#64748b', ...rest] = allColors;
  const accent = rest.find(c => c !== primary && c !== secondary) || '#f59e0b';

  return {
    palette: {
      primary, secondary,
      background: '#ffffff',
      surface:    '#f8fafc',
      text:       '#0f172a',
      accent,
    },
    typography: {
      fontFamily: dominantFont || 'system-ui, sans-serif',
      scaleBase: 16, weightRegular: 400, weightBold: 700,
    },
    spacing: { unit: 8, borderRadius: 'md' },
    referenceComponents: componentFiles.map(f => path.basename(f)),
    confidence: 0.6,
    source: 'extracted',
  };
}
