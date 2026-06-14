// [SCOPE] "Add to Phone" webview panel. Generates a QR for the install URL server-side (vendored MIT qrcode lib,
// inlined as SVG) and shows the finished PWA preview: URL + QR + countdown + install steps. See REDIVIVUS_ADD_TO_PHONE.md.
import * as vscode from 'vscode';
import type { PublishResult } from '../../../services/pwa/pwaPublish.js';
import { addToPhoneHtml } from './addToPhonePanelHtml.js';

// Vendored qrcode-generator (Kazuhiko Arase, MIT) — copied to out/ by the compile step; required in Node, not the webview.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('./vendor/qrcode.js');

// QR for a URL as a scalable SVG string. Error-correction 'M', auto type number (0).
function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
}

export function showAddToPhonePanel(result: PublishResult, title: string): void {
  const panel = vscode.window.createWebviewPanel(
    'rdvAddToPhone',
    `Add to Phone: ${title}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = addToPhoneHtml(result, title, qrSvg(result.url));
  panel.webview.onDidReceiveMessage((m: { type?: string }) => {
    if (m?.type === 'copy') {
      vscode.env.clipboard.writeText(result.url);
      vscode.window.showInformationMessage('Install link copied to clipboard.');
    } else if (m?.type === 'open') {
      vscode.env.openExternal(vscode.Uri.parse(result.url));
    }
  });
}
