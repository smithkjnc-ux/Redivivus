// [SCOPE] Fix pipeline context enrichment — collects live IDE signals for the Supervisor AI.
// Gathers VS Code diagnostics, terminal errors, and build history into a single context string.
// Gives the Supervisor the same situational awareness a human developer has before touching code.

import * as vscode from 'vscode';
import * as path from 'path';
import { getRecentBuildContext } from './chatPanelMsgFixBuildCtx.js';
import { getLastTerminalError } from '../workspace/data/terminalErrorService.js';
import { getPreviewErrors } from '../workspace/data/previewErrorService.js';
import { listSourceFiles } from '../workspace/data/codebaseSearch.js';
import { fixLog } from '../../features/logging/data/fixPipelineLogger.js';
import { collectSourceFiles, resolveSourceFiles } from './chatPanelMsgFixFileSelect.js';

export { collectSourceFiles, resolveSourceFiles };

/** Collect all available context signals: build history + live editor diagnostics + last terminal error. */
export function collectFixContext(root: string, sourceFiles: { rel: string }[]): string {
  const parts: string[] = [];

  // Provide the full project file tree so the Supervisor doesn't hallucinate that files are missing
  // just because they were excluded from the 12-file content window.
  try {
    const { buildFileTree } = require('../workspace/data/codebaseSearch.js');
    const tree = buildFileTree(root);
    if (tree) {
      parts.push(`PROJECT FILE TREE (These files exist on disk. If a file is listed here but its content is not shown below, DO NOT assume it is missing!):\n${tree}`);
    }
  } catch {}

  const buildCtx = getRecentBuildContext(root, sourceFiles);
  if (buildCtx) { parts.push(buildCtx); }

  // Static HTML project detection — no package.json, no build system, served directly as a file.
  try {
    const rootFiles = require('fs').readdirSync(root) as string[];
    const isStaticHtml = rootFiles.some((f: string) => f.endsWith('.html')) &&
      !rootFiles.includes('package.json') && !rootFiles.includes('requirements.txt');
    if (isStaticHtml) {
      parts.push('PROJECT TYPE: Pure static HTML (no build system). When opened in a browser as file://, fetch() calls to local files fail silently (CORS/network error). The in-app preview at localhost works fine — if the user reports a browser-only bug, check for fetch() or XMLHttpRequest calls loading local assets.');
    }
  } catch {}

  // Live VS Code diagnostics — real TypeScript/ESLint errors currently shown in the editor gutter.
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
  try {
    const previewErrs = getPreviewErrors();
    const runtimeLines: string[] = [];
    
    if (previewErrs.length > 0) {
      previewErrs.forEach(e => {
        const loc = e.source ? ` (${e.source}${e.line ? ':' + e.line : ''})` : '';
        runtimeLines.push(`  [${e.type.toUpperCase()}]${loc} ${e.message}`);
      });
    }

    // [PREVIEW-AUTOFIX] Read from the local HTTP server's beacon receiver
    const { getRuntimeReports } = require('../../ui/panels/chat/chatPanelPreview.js');
    const reports = getRuntimeReports();
    if (reports && reports.length > 0) {
      reports.forEach((r: { kind: string; msg: string }) => {
        runtimeLines.push(`  [${r.kind.toUpperCase()}] ${r.msg}`);
      });
    }

    if (runtimeLines.length > 0) {
      parts.push(`BROWSER RUNTIME ERRORS (captured from live preview -- these are what the user actually sees):\n${runtimeLines.join('\n')}`);
    }
  } catch {}

  return parts.join('\n\n');
}


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
    import('../chat/logic/learnedMemoryService.js'),
    import('../workspace/data/postFixVerification.js'),
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
  const fullDiagnosticCtx = collectFixContext(root, sourceFiles);
  const buildContext = [blueprintCtx, fullDiagnosticCtx].filter(Boolean).join('\n\n');
  // Capture the failing command BEFORE the fix so we can re-run it after to verify
  const { getLastFailingCommand } = await import('../workspace/data/terminalErrorService.js');
  const capturedCmd = getLastFailingCommand();
  const verificationCommand = inferVerificationCommand(root, capturedCmd?.command || undefined);
  return { buildContext, projectDeadEnds: combinedDeadEnds, projectRules, verificationCommand };
}
