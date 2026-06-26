// [SCOPE] Redivivus Build Pipeline Runner — compiles/packages generated code into executables via VS Code terminal
// Supports: Python (PyInstaller), Rust (cargo/rustc), Go, C (gcc), C++ (g++)
// Entry points: maybeAutoCompile() called after each build, runSavedPipeline() for the action card button.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { BuildContext } from './chatPanelBuild.js';

export interface CompilePipeline {
  label: string;
  steps: string[];     // shell commands run in order in the terminal
  outputPath: string;  // relative path to expected binary
}

// Module-level store — set after every compilable build so redivivus.compileProject always has context
export let _lastCompileTarget: { root: string; relPath: string; pipeline: CompilePipeline } | undefined;

/** [RULE 18] AI decides if the task wants a standalone compiled executable. */
export async function wantsExecutable(task: string, routing: any): Promise<boolean> {
  // Fast path: explicit keywords
  if (/\b(exe|\.exe|executable|binary|standalone|compile|pyinstaller|cargo\s+build|run.*command.?line|run.*terminal|desktop\s+app|native\s+app)\b/i.test(task)) { return true; }
  try {
    const r = await routing.prompt(
      `Task: "${task.slice(0, 200)}"\nDoes this request a compiled/packaged standalone executable or binary that runs without a runtime? Reply: yes or no`,
      8_000
    );
    return r.success && r.text?.trim().toLowerCase().startsWith('yes');
  } catch { return false; }
}

/** Returns the compile pipeline for a given built file, or null if the language is unsupported. */
export function getCompilePipeline(relPath: string, root: string): CompilePipeline | null {
  const ext = path.extname(relPath).toLowerCase();
  const base = path.basename(relPath, ext);

  switch (ext) {
    case '.py': {
      // Scan the generated file for imported packages so we install them before pyinstaller
      const extraPkgs: string[] = [];
      try {
        const src = fs.readFileSync(path.join(root, relPath), 'utf8');
        if (src.includes('pygame'))   { extraPkgs.push('pygame'); }
        if (src.includes('requests')) { extraPkgs.push('requests'); }
        if (src.includes('numpy'))    { extraPkgs.push('numpy'); }
        if (src.includes('pillow') || src.includes('PIL')) { extraPkgs.push('pillow'); }
      } catch { /* best effort */ }
      const pipCmd = extraPkgs.length
        ? `pip install ${extraPkgs.join(' ')} pyinstaller`
        : 'pip install pyinstaller';
      return {
        label: 'Python → Executable (PyInstaller)',
        steps: [pipCmd, `pyinstaller --onefile --name "${base}" "${relPath}"`],
        outputPath: `dist/${base}`,
      };
    }
    case '.rs': {
      const hasCargo = fs.existsSync(path.join(root, 'Cargo.toml'));
      return hasCargo
        ? { label: 'Rust → Release Binary (cargo)', steps: ['cargo build --release'], outputPath: `target/release/${base}` }
        : { label: 'Rust → Binary (rustc)', steps: [`rustc -O -o "${base}" "${relPath}"`], outputPath: base };
    }
    case '.go':
      return { label: 'Go → Binary', steps: [`go build -o "${base}" "${relPath}"`], outputPath: base };
    case '.c':
      return { label: 'C → Binary (gcc)', steps: [`gcc -O2 -o "${base}" "${relPath}" -lm`], outputPath: base };
    case '.cpp':
      return { label: 'C++ → Binary (g++)', steps: [`g++ -O2 -o "${base}" "${relPath}" -lm`], outputPath: base };
    default: return null;
  }
}

/** Opens a visible VS Code terminal and runs the compile steps. User can watch progress. */
export function runCompilePipeline(pipeline: CompilePipeline, root: string): void {
  const term = vscode.window.createTerminal({ name: `Redivivus: ${pipeline.label}`, cwd: root });
  term.show();
  for (const step of pipeline.steps) { term.sendText(step); }
  term.sendText(`echo "--- Redivivus: Compile done. Binary: ${pipeline.outputPath} ---"`);
}

/** Returns the "Package as Executable" action card button for compilable file types. Empty string otherwise. */
export function appendCompileAction(relPath: string): string {
  return ['.py', '.rs', '.go', '.c', '.cpp'].includes(path.extname(relPath).toLowerCase())
    ? `\n__ACTION_CARD__redivivus.compileProject|||&#x1F4E6; Package as Executable|||END__`
    : '';
}

/**
 * Called after every successful build for compilable languages.
 * Always stores the pipeline (for the action card button).
 * Auto-runs the pipeline only when the task explicitly asked for an executable.
 */
export async function maybeAutoCompile(ctx: BuildContext, task: string, relPath: string, _absPath: string): Promise<void> {
  const pipeline = getCompilePipeline(relPath, ctx.root);
  if (!pipeline) { return; }
  _lastCompileTarget = { root: ctx.root, relPath, pipeline };
  if (!await wantsExecutable(task, ctx.routing)) { return; }
  ctx.conversation.push({
    role: 'assistant',
    content: `&#x2699;&#xFE0F; **Compiling to executable** — ${pipeline.label}\n\nWatch the terminal for progress. Binary will be at \`${pipeline.outputPath}\` when done.`,
    timestamp: Date.now(),
  });
  ctx.refresh();
  runCompilePipeline(pipeline, ctx.root);
}
