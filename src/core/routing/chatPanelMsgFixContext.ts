// [SCOPE] Fix pipeline context enrichment — collects live IDE signals for the Supervisor AI.
// Gathers VS Code diagnostics, terminal errors, and build history into a single context string.
// Gives the Supervisor the same situational awareness a human developer has before touching code.

import * as vscode from 'vscode';
import * as path from 'path';
import { getRecentBuildContext } from './chatPanelMsgFixBuildCtx.js';
import { getLastTerminalError } from '../../services/workspace/terminalErrorService';
import { getPreviewErrors } from '../../services/workspace/previewErrorService';
import { listSourceFiles } from '../../services/workspace/codebaseSearch';
import { fixLog } from '../../services/logging/fixPipelineLogger';

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

  // Provide the full project file tree so the Supervisor doesn't hallucinate that files are missing
  // just because they were excluded from the 12-file content window.
  try {
    const { buildFileTree } = require('../../services/workspace/codebaseSearch.js');
    const tree = buildFileTree(root);
    if (tree) {
      parts.push(`PROJECT FILE TREE (These files exist on disk. If a file is listed here but its content is not shown below, DO NOT assume it is missing!):\n${tree}`);
    }
  } catch {}

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
      if (t.failingCommand) {
        parts.push(`FAILING COMMAND: ${t.failingCommand}`);
      }
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

/** AI-assisted file relevance selection — sends only filenames (not content) to a cheap model.
 *  Returns the AI-ranked subset; falls back to the sync heuristic if the AI call fails.
 *  [Rule 18] Replaces the keyword exclusion list with a real semantic judgment. */
export async function resolveSourceFiles(
  root: string,
  userText: string,
  deps?: { routing?: { promptCheap?: Function } },
): Promise<{ rel: string; content: string }[]> {
  const all = listSourceFiles(root, true, 50)
    .filter(f => f.content)
    .map(f => ({ rel: f.rel, content: f.content! }));
  if (all.length <= 15 || !userText) { return all; }

  // [Rule 18] Use cheap AI to pick relevant files by filename only — no file content sent.
  const routing = deps?.routing;
  if (routing?.promptCheap) {
    try {
      const fileList = all.map(f => f.rel).join('\n');
      const selectionPrompt = `A developer is asking: "${userText.slice(0, 300)}"

Project files:
${fileList}

Reply with ONLY the filenames most likely relevant to this request, one per line, no explanation. Max 12 files.`;
      const aiResult = await (routing.promptCheap as Function)(selectionPrompt, 12_000);
      if (aiResult.success && aiResult.text.trim()) {
        const picked = aiResult.text.trim().split('\n')
          .map((l: string) => l.trim().replace(/^[-*•\d.]+\s*/, ''))
          .filter((l: string) => l.length > 0);
        const pickedSet = new Set(picked);
        const matched = all.filter(f => pickedSet.has(f.rel));
        if (matched.length > 0) {
          fixLog(`[FILE-SELECT] AI picked ${matched.length} files from ${all.length}: ${matched.map(f => f.rel).join(', ')}`);
          return matched.slice(0, 12);
        }
      }
    } catch {
      fixLog('[FILE-SELECT] AI file selection failed — falling back to heuristic');
    }
  }

  // Fallback: sync heuristic (no exclusion list for domain words)
  fixLog('[FILE-SELECT] Using heuristic file selection');
  return collectSourceFiles(root, userText);
}
// [FIX] collectAllFixContext — gathers build context, dead ends, blueprint evolution, and project rules for the fix pipeline.
// [PERF] Static context (blueprint, dead ends, rules) is cached for 30s so batch operations (Deep Fix)
// don't re-read the same files per fix. Per-file context (build causation, verification cmd) is always fresh.
let _staticCtxCache: { root: string; ts: number; blueprintCtx: string; combinedDeadEnds: string; projectRules: string } | null = null;
const STATIC_CTX_TTL_MS = 30_000;

export async function collectAllFixContext(
  root: string,
  sourceFiles: { rel: string }[],
  _userText: string,
  _deps: any
): Promise<{ buildContext: string; projectDeadEnds: string; projectRules: string; verificationCommand: string | null }> {
  const [{ readProjectDeadEnds }, { readProjectRules, getRecentBuildContext, getBlueprintEvolutionContext }, { LearnedMemoryService }, { inferVerificationCommand }] = await Promise.all([
    import('./chatPanelMsgFixDeadEnds.js'),
    import('./chatPanelMsgFixBuildCtx.js'),
    import('../../services/learnedMemoryService.js'),
    import('../../services/workspace/postFixVerification.js'),
  ]);

  // Static context — cached across rapid sequential calls (batch fixes)
  let blueprintCtx: string;
  let combinedDeadEnds: string;
  let projectRules: string;
  if (_staticCtxCache && _staticCtxCache.root === root && (Date.now() - _staticCtxCache.ts) < STATIC_CTX_TTL_MS) {
    blueprintCtx = _staticCtxCache.blueprintCtx;
    combinedDeadEnds = _staticCtxCache.combinedDeadEnds;
    projectRules = _staticCtxCache.projectRules;
  } else {
    blueprintCtx = getBlueprintEvolutionContext(root);
    const projectDeadEnds = readProjectDeadEnds(root) || '';
    projectRules = readProjectRules(root);
    const knowledgeNeverDo = root ? (() => { try { return new LearnedMemoryService(root).getNeverDoForPrompt(); } catch { return ''; } })() : '';
    combinedDeadEnds = [projectDeadEnds, knowledgeNeverDo].filter(Boolean).join('\n\n');
    _staticCtxCache = { root, ts: Date.now(), blueprintCtx, combinedDeadEnds, projectRules };
  }

  // Per-file context — always fresh
  const recentBuildCtx = getRecentBuildContext(root, sourceFiles);
  const buildContext = [blueprintCtx, recentBuildCtx].filter(Boolean).join('\n\n');
  // Capture the failing command BEFORE the fix so we can re-run it after to verify
  const { getLastFailingCommand } = await import('../../services/workspace/terminalErrorService.js');
  const capturedCmd = getLastFailingCommand();
  const verificationCommand = inferVerificationCommand(root, capturedCmd?.command || undefined);
  return { buildContext, projectDeadEnds: combinedDeadEnds, projectRules, verificationCommand };
}
