// [SCOPE] Report Issue message handler — processes webview messages, uploads screenshots,
// bundles session logs, and submits to the feedback API. Split from reportIssue.ts (Rule 9).

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import type { RoutingService } from '../../../shared/ai/infrastructure/routingService.js';
import { getSessionSnapshot } from '../../../shared/logging/infrastructure/redivivusLoggerOps.js';
import { collectDiagnostics } from './reportDiagnostics.js';

const FEEDBACK_URL = 'https://redivivus.dev/api/feedback';

let _pickedPaths: string[] = [];

export function getPickedPaths(): string[] { return _pickedPaths; }
export function resetPickedPaths(): void { _pickedPaths = []; }

export async function handleReportMessage(
  msg: any, version: string, routing: RoutingService | undefined, panel: vscode.WebviewPanel,
): Promise<void> {
  if (msg.type === 'pick-image') {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true, canSelectFolders: false,
      filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
    });
    if (!uris?.length) { return; }
    const dataUrls: string[] = [];
    for (const uri of uris) {
      try {
        _pickedPaths.push(uri.fsPath);
        const buf = fs.readFileSync(uri.fsPath);
        const ext = path.extname(uri.fsPath).slice(1).replace('jpg', 'jpeg');
        dataUrls.push(`data:image/${ext || 'png'};base64,${buf.toString('base64')}`);
      } catch { /* skip unreadable */ }
    }
    panel.webview.postMessage({ type: 'images-previewed', uris: dataUrls });
    return;
  }

  if (msg.type === 'clear-images') { _pickedPaths = []; return; }

  if (msg.type === 'submit') {
    panel.webview.postMessage({ type: 'status', text: 'Uploading screenshots...' });
    const screenshotUrls = uploadWithCurl(_pickedPaths);

    panel.webview.postMessage({ type: 'status', text: 'Bundling session logs...' });
    // Include session logs when user opts in (default: on)
    const includeLogs = msg.includeLogs !== false;
    const logSection = includeLogs ? buildLogSection() : '';

    panel.webview.postMessage({ type: 'status', text: 'Generating debug prompt...' });
    const { title, description: baseDesc } = await buildReport(msg.category, msg.description, msg.steps ?? '', version, routing);

    // Environment / build identity / workspace / recent builds — always included (small, high-value).
    const diagnosticsSection = collectDiagnostics(version);
    const screenshotLine = screenshotUrls.length > 0 ? `\n\n**Screenshots:** ${screenshotUrls.join(' | ')}` : '';
    const description = baseDesc + screenshotLine + diagnosticsSection + logSection;

    panel.webview.postMessage({ type: 'status', text: 'Submitting report...' });
    const res = await Promise.race([
      fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: categoryToType(msg.category), title, description, version, source: 'ide' }),
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timed out')), 15_000)),
    ]);
    if (!(res as Response).ok) {
      const err = await (res as Response).json().catch(() => ({})) as any;
      panel.webview.postMessage({ type: 'error', text: err.error ?? `Server ${(res as Response).status}` });
      return;
    }
    const resBody = await (res as Response).json().catch(() => ({})) as any;
    _pickedPaths = [];
    panel.webview.postMessage({ type: 'success', screenshotUrls, isDuplicate: resBody.is_duplicate === true });
    vscode.window.showInformationMessage(
      resBody.is_duplicate ? 'Report logged (likely duplicate — admin will review).' : 'Report sent to Redivivus admin.',
    );
    return;
  }

  if (msg.type === 'close') { panel.dispose(); }
}

function buildLogSection(): string {
  try {
    const snapshot = getSessionSnapshot(150);
    return `\n\n<details>\n<summary>Session logs (last 150 entries)</summary>\n\n\`\`\`\n${snapshot}\n\`\`\`\n</details>`;
  } catch { return ''; }
}

// [WARN] 0x0.st is defunct — use catbox.moe. catbox API: POST reqtype=fileupload + fileToUpload=@path
function uploadWithCurl(paths: string[]): string[] {
  return paths.map(p => {
    try {
      const out = execFileSync('curl', ['-s', '--max-time', '20', '-F', 'reqtype=fileupload', '-F', `fileToUpload=@${p}`, 'https://catbox.moe/user/api.php'], { timeout: 25_000 }).toString().trim();
      return out.startsWith('https://') ? out : '';
    } catch { return ''; }
  }).filter(Boolean);
}

async function buildReport(
  category: string, description: string, steps: string, version: string, routing?: RoutingService,
): Promise<{ title: string; description: string }> {
  const stepsLine = steps.trim() ? `\n\n**Steps to reproduce:**\n${steps.trim()}` : '';
  let debugSection = '';
  if (routing?.prompt) {
    try {
      const res = await routing.prompt(
        `Redivivus IDE v${version} — ${category}\nUser report: "${description}"\nWrite 3-4 concrete debugging bullet points: which source files/functions to check, what log entries to look for. Under 120 words.`, 8_000,
      );
      const text = (res as any).text ?? String(res);
      if (text && !text.includes('[object')) { debugSection = `\n\n**Debug checklist:**\n${text}`; }
    } catch { /* skip */ }
  }
  return {
    title: `[${category}] ${description.trim().slice(0, 65)}`,
    description: `${description.trim()}${stepsLine}${debugSection}\n\n_Redivivus v${version} | source: IDE_`,
  };
}

function categoryToType(c: string): string {
  return c === 'Feature Request' ? 'feature' : c === 'Other' ? 'other' : 'bug';
}
