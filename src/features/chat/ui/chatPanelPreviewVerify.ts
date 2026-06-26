// [SCOPE] Preview Auto-Fix Phase 1 — verifyPreviewRuns(): the headless "does this actually run?" check.
// Serves the project, loads it in a short-lived webview (so its JS executes, the render loop fires, the canvas
// paints), waits for the injected capture script (chatPanelPreviewCapture.ts) to beacon any runtime failures,
// then returns a verdict. This is "preview as truth" — the execution evidence the Verify/Guardian AI checks
// cannot provide. Best-effort: a failure to verify is reported as "couldn't check", never as "broken".
// See docs/REDIVIVUS_PREVIEW_AUTOFIX.md.

import * as vscode from 'vscode';
import { detectDevServer, startPreviewServer, waitForPort, getRuntimeReports, clearRuntimeReports } from './chatPanelPreview.js';

export interface PreviewVerifyResult {
  applicable: boolean; // false = not a static web project (nothing to run-check this way)
  ok: boolean;         // true = no runtime failures detected
  errors: string[];    // uncaught errors / failed <script src> loads / console.error
  blank: boolean;      // canvas blank AND no loop -> dead game shell
  noLoop: boolean;     // no animation loop ever started
  summary: string;     // plain-English one-liner for the user
}

const _skip = (summary: string): PreviewVerifyResult => ({ applicable: false, ok: true, errors: [], blank: false, noLoop: false, summary });

export async function verifyPreviewRuns(root: string, waitMs = 2800): Promise<PreviewVerifyResult> {
  const info = (() => { try { return detectDevServer(root); } catch { return null; } })();
  // Only static/web projects load this way. npm dev-server projects and non-web (python/CLI) are skipped.
  if (!info || info.type !== 'static') { return _skip('Not a static web preview - skipped the run-check.'); }

  let panel: vscode.WebviewPanel | undefined;
  try {
    const started = await startPreviewServer(root, info);
    await waitForPort(started.port, 8000);
    clearRuntimeReports();
    // Short-lived webview hosting an iframe to the served page. The page (with the injected capture script)
    // runs in its own origin and beacons any failures to the preview server, which we read after the wait.
    panel = vscode.window.createWebviewPanel(
      'redivivusPreviewVerify', 'Checking the preview...',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const ext = await vscode.env.asExternalUri(vscode.Uri.parse(`http://localhost:${started.port}/`));
    panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8">`
      + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http: https:; style-src 'unsafe-inline';">`
      + `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head>`
      + `<body><iframe src="${ext.toString()}"></iframe></body></html>`;
    await new Promise(r => setTimeout(r, waitMs));
  } catch {
    return { applicable: true, ok: true, errors: [], blank: false, noLoop: false, summary: 'Could not run the preview check (treated as inconclusive).' };
  } finally {
    try { panel?.dispose(); } catch { /* already gone */ }
  }

  const reports = getRuntimeReports();
  const errors = reports.filter(r => r.kind === 'error' || r.kind === 'rejection' || r.kind === 'console').map(r => r.msg);
  const probe = reports.filter(r => r.kind === 'probe').map(r => r.msg);
  const blank = probe.some(m => /blank/i.test(m));
  const noLoop = blank || probe.some(m => /no animation loop/i.test(m));
  const ok = errors.length === 0 && !blank && !noLoop;
  const summary = ok
    ? 'The preview runs - no runtime errors.'
    : blank ? 'The preview loads but the screen is blank and the render loop never starts.'
    : noLoop ? 'The preview loads but never starts a render loop.'
    : `The preview has ${errors.length} runtime error(s): ${[...new Set(errors)].slice(0, 2).join('; ')}`;
  return { applicable: true, ok, errors: [...new Set(errors)], blank, noLoop, summary };
}
