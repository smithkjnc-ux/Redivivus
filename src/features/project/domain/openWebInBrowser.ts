// [SCOPE] Open a web build in the REAL browser over http (a local static server) — NEVER file://.
// Why: ES-module apps (<script type="module">) are CORS-blocked on file://, so the page renders but the
// JS never runs ("plays in Preview, dead via Run"). Every Run / Preview / Open-in-Browser path must use
// this so a web build runs like a standalone app. Falls back to file:// only when the server can't start
// (a self-contained single-file page still works that way). Returns true if served over http.

import * as vscode from 'vscode';
import * as path from 'path';

export async function openWebInBrowser(root: string, entryFile: string): Promise<boolean> {
  try {
    const { detectDevServer, startPreviewServer, waitForPort } = await import('../../chat/ui/chatPanelPreview.js');
    const info = detectDevServer(root);
    if (info) {
      const { port } = await startPreviewServer(root, info);
      if (await waitForPort(port, info.type === 'static' ? 2_000 : 30_000)) {
        const file = path.basename(entryFile);
        const urlPath = file.toLowerCase() === 'index.html' ? '' : file;
        await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}/${urlPath}`));
        return true;
      }
    }
  } catch { /* fall through to file:// */ }
  await vscode.env.openExternal(vscode.Uri.file(path.join(root, entryFile)));
  return false;
}
