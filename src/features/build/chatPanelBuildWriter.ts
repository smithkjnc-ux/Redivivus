// [SCOPE] Redivivus Build Pipeline — File Writing, Snapshots, and Post-build actions
// Extracted from chatPanelBuild.ts. Keep under 200 lines.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SnapshotService } from '../project/logic/snapshotService.js';
import { autoCaptureFile } from '../vault/data/vaultAutoCapture.js';
import type { BuildContext } from './chatPanelBuild.js';

export interface WriteOptions { root?: string; task?: string; skipInitialSnapshot?: boolean; }

/**
 * Detects when the AI wrote placeholder/skeleton code instead of real implementations.
 * Returns an error string if the code is stub-only, null if it looks real.
 * Catches the pattern seen in screenshot bug: CSS blocks with only comments like
 * "/* 3D effect styles similar to black-pawn *\/" and no actual property declarations.
 */
export function detectPlaceholderCode(code: string, ext: string): string | null {
  const e = ext.toLowerCase()
  if (e === '.css' || e === '.scss') {
    const blocks = [...code.matchAll(/\{([^}]*)\}/g)].map(m => m[1].trim()).filter(Boolean)
    if (blocks.length === 0) return null
    const stubBlocks = blocks.filter(inner => {
      const lines = inner.split('\n').map(l => l.trim()).filter(Boolean)
      return lines.length > 0 && lines.every(l => l.startsWith('/*') || l.startsWith('*') || l.startsWith('//'))
    })
    if (stubBlocks.length > 0 && stubBlocks.length === blocks.length) {
      return 'The AI wrote placeholder comments instead of real CSS properties — nothing was applied. Ask it to write the actual CSS values (e.g. "text-shadow: 0 2px 4px rgba(0,0,0,0.5)") instead of stubs.'
    }
  }
  // Generic: catch "/* existing styles */" and "/* same as above */" patterns in any file
  const stubComments = (code.match(/\/\*\s*(existing|your|same as|placeholder|add here|implement|TODO)\s*(code|styles?|logic|content)?\s*\*\//gi) ?? []).length
  if (stubComments >= 2) {
    return `The AI wrote ${stubComments} placeholder stub comments instead of real code. Ask it to write the complete implementation.`
  }
  return null
}

export function writeBuiltFile(absPath: string, code: string, options?: WriteOptions): void {
  const isNewFile = !fs.existsSync(absPath);
  let finalCode = code;

  // Strip leading markdown code fence (e.g. ```html, ```css). AI occasionally wraps output in
  // a fence even when asked for raw file content — the fence literal ends up in the written file.
  const leadingFence = finalCode.match(/^```[\w]*\r?\n/);
  if (leadingFence) {
    finalCode = finalCode.slice(leadingFence[0].length);
    const trailingFence = finalCode.lastIndexOf('\n```');
    if (trailingFence !== -1 && trailingFence === finalCode.length - 4) {
      finalCode = finalCode.slice(0, trailingFence);
    }
  }

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

  const placeholderErr = detectPlaceholderCode(finalCode, path.extname(absPath))
  if (placeholderErr) { throw new Error(placeholderErr) }

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
  fs.writeFileSync(absPath, finalCode, 'utf8');

  // [FIX] Auto-capture initial state for brand-new files — permanent baseline, never pruned.
  // This is the save point the user can always revert to if future builds corrupt the file.
  if (isNewFile && options?.root && options?.task && !options?.skipInitialSnapshot) {
    try {
      const relPath = path.relative(options.root, absPath);
      new SnapshotService(options.root).captureInitial(`First build: ${options.task.slice(0, 60)}`, [relPath]);
    } catch {}
  }
}

export function createSnapshot(root: string, task: string, relPaths: string | string[]): string | undefined {
  try {
    const snap = new SnapshotService(root);
    return snap.prepare(task, Array.isArray(relPaths) ? relPaths : [relPaths]);
  } catch { return undefined; }
}

export async function openBuiltFile(absPath: string): Promise<void> {
  try {
    const uri = vscode.Uri.file(absPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    // ViewColumn.Two always opens a right-side split. Beside is relative to current focus
    // and lands in the wrong column when only the chat panel is open.
    await vscode.window.showTextDocument(doc, {
      preview: false,
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: false, // shift focus so the code is actually visible
    });
    await vscode.commands.executeCommand('revealInExplorer', uri);
  } catch (err) {
    console.error('[Redivivus] openBuiltFile failed:', err);
  }
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
