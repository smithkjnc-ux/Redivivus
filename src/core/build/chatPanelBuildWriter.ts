// [SCOPE] Redivivus Build Pipeline — File Writing, Snapshots, and Post-build actions
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SnapshotService } from '../../services/snapshotService';
import { autoCaptureFile } from '../../services/vault/vaultAutoCapture';
import type { BuildContext } from './chatPanelBuild';

export interface WriteOptions { root?: string; task?: string; }

export function writeBuiltFile(absPath: string, code: string, options?: WriteOptions): void {
  const isNewFile = !fs.existsSync(absPath);
  let finalCode = code;

  // Strip JSON line comments (invalid JSON syntax)
  if (absPath.toLowerCase().endsWith('.json')) {
    finalCode = code.split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');
  }

  // [FIX] Strip any content after </html> for HTML files.
  // AI sometimes appends markdown planning blocks after the closing tag — these render as visible
  // text in the browser sidebar. Everything after </html> is garbage.
  if (absPath.toLowerCase().endsWith('.html')) {
    const closeMatch = finalCode.match(/<\/html\s*>/i);
    if (closeMatch && closeMatch.index !== undefined) {
      finalCode = finalCode.slice(0, closeMatch.index + closeMatch[0].length).trim();
    }
  }

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
  fs.writeFileSync(absPath, finalCode, 'utf8');

  // [FIX] Auto-capture initial state for brand-new files — permanent baseline, never pruned.
  // This is the save point the user can always revert to if future builds corrupt the file.
  if (isNewFile && options?.root && options?.task) {
    try {
      const relPath = path.relative(options.root, absPath);
      new SnapshotService(options.root).captureInitial(`First build: ${options.task.slice(0, 60)}`, [relPath]);
    } catch {}
  }
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
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(absPath));
  } catch {}
}

// Creates package.json and tsconfig.json for TypeScript Node.js projects if they don't exist.
// Only runs for .ts builds (not HTML, not React/TSX). Created arrays receives the relative paths of new files.
export function scaffoldNodeProject(root: string, nameBase: string, created: string[] = []): void {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    const pkg = { name: nameBase, version: '0.1.0', main: `dist/${nameBase}.js`, scripts: { build: 'tsc', start: `node dist/${nameBase}.js`, dev: `ts-node src/${nameBase}.ts` }, devDependencies: { '@types/node': '^20.0.0', typescript: '^5.0.0', 'ts-node': '^10.9.0' } };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
    created.push('package.json');
  }
  const tscPath = path.join(root, 'tsconfig.json');
  if (!fs.existsSync(tscPath)) {
    const tsconfig = { compilerOptions: { target: 'ES2020', module: 'commonjs', lib: ['ES2020'], outDir: './dist', rootDir: './src', strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true, resolveJsonModule: true }, include: ['src/**/*'], exclude: ['node_modules', 'dist'] };
    fs.writeFileSync(tscPath, JSON.stringify(tsconfig, null, 2), 'utf8');
    created.push('tsconfig.json');
  }
}

export function captureToVault(ctx: BuildContext, absPath: string, relPath: string): void {
  if (ctx.vault) {
    try {
      const projectName = path.basename(ctx.root);
      // [FIX] Pass callAI so the AI quality gate (evaluateQuality) actually runs.
      // Previously called without callAI → heuristic fallback always used → vault fills with low-quality code.
      const callAI = ctx.routing ? (p: string) => ctx.routing.prompt(p, 12_000) : undefined;
      autoCaptureFile(absPath, projectName, ctx.vault, ctx.task, callAI);
    } catch {}
  }
}
