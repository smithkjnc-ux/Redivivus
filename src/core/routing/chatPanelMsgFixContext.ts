// [SCOPE] Fix pipeline context enrichment — collects live IDE signals for the Supervisor AI.
// Gathers VS Code diagnostics, terminal errors, and build history into a single context string.
// Gives the Supervisor the same situational awareness a human developer has before touching code.

import * as vscode from 'vscode';
import * as path from 'path';
import { getRecentBuildContext } from './chatPanelMsgFixBuildCtx.js';
import { getLastTerminalError } from '../../services/workspace/terminalErrorService';
import { getPreviewErrors } from '../../services/workspace/previewErrorService';
import { listSourceFiles } from '../../services/workspace/codebaseSearch';

// [FIX] Smart file selection: when userText is provided, send only files relevant to the bug
// rather than all 50 source files. Mentioned files + their importers come first; others fill to 12.
// [FIX] Include src/ folder files and content-matched files, not just filename mentions.
// [FIX] Prioritize files with [SCOPE] or [ANNOTATION] tags - they have self-documenting info.
export function collectSourceFiles(root: string, userText?: string): { rel: string; content: string }[] {
  const all = listSourceFiles(root, true, 50)
    .filter(f => f.content)
    .map(f => ({ rel: f.rel, content: f.content! }));
  if (!userText || all.length <= 15) { return all; }
  const textLower = userText.toLowerCase();

  // Include files whose basename is mentioned in user text
  const mentioned = all.filter(f => textLower.includes(path.basename(f.rel).toLowerCase()));
  const mentionedSet = new Set(mentioned.map(f => f.rel));

  // Include files in src/ folder (likely contains core logic)
  const srcFiles = all.filter(f => f.rel.startsWith('src/') && !mentionedSet.has(f.rel));
  const srcSet = new Set(srcFiles.map(f => f.rel));

  // Include files whose CONTENT contains keywords from user text (semantic match)
  const keywords = textLower.split(/\s+/).filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'they', 'have', 'were', 'been', 'have', 'game', 'make', 'code', 'file'].includes(w));
  const contentMatched = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && keywords.some(k => f.content.toLowerCase().includes(k)));
  const contentMatchedSet = new Set(contentMatched.map(f => f.rel));

  // Files that import the mentioned files
  const importers = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && mentioned.some(m => f.content.includes(path.basename(m.rel, path.extname(m.rel)))));
  const importersSet = new Set(importers.map(f => f.rel));

  // [Redivivus CORE] Prioritize files with ANNOTATIONS - they have [SCOPE]/[ANNOTATION] tags
  const hasAnnotations = (f: {content: string}) => /\[?(?:SCOPE|ANNOTATION|TODO|WARN|DONE)\]?\s*[:\-]/.test(f.content);
  const annotatedFiles = all.filter(f => !mentionedSet.has(f.rel) && !srcSet.has(f.rel) && !contentMatchedSet.has(f.rel) && !importersSet.has(f.rel) && hasAnnotations(f));

  const selected = [...mentioned, ...srcFiles, ...contentMatched, ...importers, ...annotatedFiles];
  if (selected.length >= 12) { return selected.slice(0, 12); }
  const rest = all.filter(f => !selected.some(s => s.rel === f.rel)).sort((a, b) => a.content.length - b.content.length);
  return [...selected, ...rest].slice(0, 12);
}

/** Collect all available context signals: build history + live editor diagnostics + last terminal error. */
export function collectFixContext(root: string, sourceFiles: { rel: string; content: string }[]): string {
  const parts: string[] = [];

  const buildCtx = getRecentBuildContext(root, sourceFiles);
  if (buildCtx) { parts.push(buildCtx); }

  // Static HTML project detection — no package.json, no build system, served directly as a file.
  // When the user opens it in a real browser it loads as file://, which silently breaks:
  // - fetch() calls to local paths (CORS block)
  // - ES module imports with bare specifiers
  // - Any API that requires a real origin
  // The Redivivus in-app preview serves it at localhost so it works there but not in the browser.
  try {
    const rootFiles = require('fs').readdirSync(root) as string[];
    const isStaticHtml = rootFiles.some((f: string) => f.endsWith('.html')) &&
      !rootFiles.includes('package.json') && !rootFiles.includes('requirements.txt');
    if (isStaticHtml) {
      parts.push('PROJECT TYPE: Pure static HTML (no build system). When opened in a browser as file://, fetch() calls to local files fail silently (CORS/network error). The in-app preview at localhost works fine — if the user reports a browser-only bug, check for fetch() or XMLHttpRequest calls loading local assets.');
    }
  } catch {}

  // Live VS Code diagnostics — real TypeScript/ESLint errors currently shown in the editor gutter.
  // The compiler ran these already; injecting them means the Supervisor knows what is broken NOW.
  try {
    const diagLines: string[] = [];
    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
      const rel = path.relative(root, uri.fsPath);
      if (rel.startsWith('..') || rel.startsWith('/')) { continue; }
      for (const d of diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).slice(0, 5)) {
        diagLines.push(`  ${rel}:${d.range.start.line + 1}: ${d.message}`);
      }
    }
    if (diagLines.length > 0) {
      parts.push(`EDITOR DIAGNOSTICS (live errors in VS Code — these exist BEFORE this fix request):\n${diagLines.join('\n')}`);
    }
  } catch {}

  // Last terminal error — captures runtime crashes and script failures the compiler cannot see.
  // Only inject if there is an actual error signal (not just general output).
  try {
    const t = getLastTerminalError();
    if (t?.errorBlock?.trim()) {
      parts.push(`LAST TERMINAL ERROR (${t.terminalName}):\n${t.fullContext.slice(0, 600)}`);
    }
  } catch {}

  // Browser runtime errors captured from the live preview iframe.
  // These are gold: they tell the Supervisor exactly what failed at runtime, not just what the code says.
  try {
    const previewErrs = getPreviewErrors();
    if (previewErrs.length > 0) {
      const lines = previewErrs.map(e => {
        const loc = e.source ? ` (${e.source}${e.line ? ':' + e.line : ''})` : '';
        return `  [${e.type.toUpperCase()}]${loc} ${e.message}`;
      }).join('\n');
      parts.push(`BROWSER RUNTIME ERRORS (captured from live preview -- these are what the user actually sees):\n${lines}`);
    }
  } catch {}

  return parts.join('\n\n');
}

// [FIX] resolveSourceFiles is the new name used in chatPanelMsgFix.ts after refactor;
//       collectSourceFiles is the original. Keep both so the file compiles.
export { collectSourceFiles as resolveSourceFiles };
// [FIX] collectAllFixContext — gathers build context, dead ends, and project rules for the fix pipeline.
export async function collectAllFixContext(
  root: string,
  sourceFiles: { rel: string }[],
  _userText: string,
  _deps: any
): Promise<{ buildContext: string; projectDeadEnds: string; projectRules: string }> {
  const { readProjectDeadEnds } = await import('./chatPanelMsgFixDeadEnds.js');
  const { readProjectRules, getRecentBuildContext } = await import('./chatPanelMsgFixBuildCtx.js');
  const buildContext = getRecentBuildContext(root, sourceFiles);
  const projectDeadEnds = readProjectDeadEnds(root) || '';
  const projectRules = readProjectRules(root);
  return { buildContext, projectDeadEnds, projectRules };
}
