// [SCOPE] CHASSIS Build Pipeline — File Writing, Snapshots, and Post-build actions
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SnapshotService } from '../services/snapshotService.js';
import { autoCaptureFile } from '../services/vaultAutoCapture.js';
import { BuildContext } from './chatPanelBuild.js';

export function writeBuiltFile(absPath: string, code: string): void {
  // [FIX 4] STRIP JSON COMMENTS
  let finalCode = code;
  if (absPath.toLowerCase().endsWith('.json')) {
    finalCode = code.split('\\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\\n');
  }
  
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, finalCode, 'utf8');
}

export function createSnapshot(root: string, task: string, relPath: string): string | undefined {
  try {
    const snap = new SnapshotService(root);
    return snap.prepare(task, [relPath]);
  } catch { return undefined; }
}

export async function openBuiltFile(absPath: string): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(absPath));
  } catch {}
}

export function captureToVault(ctx: BuildContext, absPath: string, relPath: string): void {
  if (ctx.vault) {
    try {
      const projectName = path.basename(ctx.root);
      autoCaptureFile(absPath, projectName, ctx.vault, ctx.task);
    } catch {}
  }
}
