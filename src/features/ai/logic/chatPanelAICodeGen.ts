// [SCOPE] Focused AI code generation prompts and AST workspace disk lookup logic
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Redivivus_WORKER_RULES } from '../data/redivivusWorkerRules.js';

export interface SourceFile { relPath: string; content: string; lineCount: number; }

/** Find source files in the project — reads from disk, not activeTextEditor */
export function findSourceFiles(userText: string, workspaceRoot: string): SourceFile[] {
  if (workspaceRoot === 'none') { return []; }
  const results: SourceFile[] = [];
  try {
    // Strategy: find the main source files in the project
    // Look for references like "the TypeScript file", "the .ts file", project name mentions
    const srcDir = path.join(workspaceRoot, 'src');
    const searchDirs = [srcDir, workspaceRoot];
    const codeExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb'];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) { continue; }
      const files = fs.readdirSync(dir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return codeExts.includes(ext) && !f.endsWith('.d.ts') && f !== 'vite-env.d.ts';
      });
      for (const file of files) {
        const absPath = path.join(dir, file);
        const stat = fs.statSync(absPath);
        if (stat.isFile() && stat.size < 100_000) {
          const content = fs.readFileSync(absPath, 'utf8');
          const lineCount = content.split('\n').length;
          if (lineCount > 10) { // Only include substantial files
            results.push({ relPath: path.relative(workspaceRoot, absPath), content, lineCount });
          }
        }
      }
      if (results.length > 0) { break; } // Found files in src/, don't also scan root
    }
  } catch { /* best-effort */ }
  return results.slice(0, 3); // Cap at 3 files to avoid token explosion
}

// [SCOPE] Focused code generation prompt — bypasses Redivivus identity noise entirely
// [WARN] This is the key difference vs Antigravity. Antigravity reads the whole file and uses a focused prompt.
// Redivivus was wrapping code gen in 44 lines of identity/capabilities/behavioral rules that distracted the AI.
export function buildCodeGenPrefix(userText: string, workspaceRoot: string): string {
  // 1. Find source files — read from disk, don't rely on activeTextEditor
  let sourceCode = '';
  const srcFiles = findSourceFiles(userText, workspaceRoot);
  if (srcFiles.length > 0) {
    for (const sf of srcFiles) {
      sourceCode += `\n--- SOURCE FILE: ${sf.relPath} (${sf.lineCount} lines) ---\n\`\`\`\n${sf.content}\n\`\`\`\n`;
    }
  } else {
    // Fall back to active editor
    try {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const filePath = editor.document.uri.fsPath;
        const relPath = workspaceRoot !== 'none' ? path.relative(workspaceRoot, filePath) : filePath;
        const content = editor.document.getText();
        sourceCode = `\n--- ACTIVE FILE: ${relPath} ---\n\`\`\`\n${content}\n\`\`\`\n`;
      }
    } catch {}
  }

  return `You are a code generator. Your job is to convert/create code exactly as requested.

RULES:
- Write the COMPLETE, FULLY FUNCTIONAL file. Every function, every variable, every line.
- Port ALL logic from the source. Do not skip, summarize, or stub any section.
- The output must work immediately when opened in a browser. Zero missing pieces.
- Output ONLY the code inside a single fenced code block. No explanations, no comments about what you did.
- For browser targets: single self-contained HTML file with inline <style> and <script>.
- Convert TypeScript constructs (enums, interfaces, type annotations) to plain JavaScript equivalents.
- Preserve all constants, physics values, colors, dimensions, and game logic exactly.

${Redivivus_WORKER_RULES}
${sourceCode}
User:`;
}
