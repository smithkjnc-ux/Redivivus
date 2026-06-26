// [SCOPE] Visual Lens Service — maps UI element descriptions to source code for fix injection.
// Workflow: user describes an element → grep project for class/id/tag → inject file context into chat.
// [DONE] captureElement, translateToSource, injectContext stubs now implemented.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { AnalyzerService } from '../ui/analyzer/analyzerService.js';
import type { GuardianService } from '../../../shared/ai/infrastructure/guardianService.js';

export interface ElementMetadata {
  tagName?: string;
  className?: string;
  id?: string;
  text?: string;          // inner text (first 60 chars)
  description?: string;   // user's natural-language description
}

export interface SourceRef {
  filePath: string;
  line: number;
  snippet: string;
}

export class LensService {
  private _lastCapture: ElementMetadata | null = null;

  constructor(
    private analyzer: AnalyzerService,
    private guardian: GuardianService
  ) {}

  /** Store element metadata from the webview bridge or user input. */
  async captureElement(metadata: ElementMetadata): Promise<void> {
    this._lastCapture = metadata;
  }

  /** Search project files for the element's class, id, or tag. Returns the best match. */
  async translateToSource(metadata: ElementMetadata): Promise<SourceRef | null> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { return null; }

    // Build search terms from most-specific to least
    const terms: string[] = [];
    if (metadata.id) { terms.push(`id="${metadata.id}"`, `id='${metadata.id}'`, `#${metadata.id}`); }
    if (metadata.className) { terms.push(...metadata.className.split(' ').filter(Boolean).map(c => `.${c}`), metadata.className); }
    if (metadata.description) { terms.push(metadata.description); }
    if (metadata.tagName) { terms.push(`<${metadata.tagName}`); }

    for (const term of terms) {
      const result = await searchProjectFiles(root, term);
      if (result) { return result; }
    }
    return null;
  }

  /** Inject element context and source reference into the active ChatPanel conversation. */
  async injectContext(snippet: string, sourceRef: SourceRef): Promise<void> {
    const { ChatPanel } = await import('../../chat/ui/chatPanel.js');
    if (!ChatPanel.currentPanel) { return; }
    const content = [
      `&#x1F50D; **UI Inspector found:** \`${sourceRef.filePath}:${sourceRef.line}\``,
      `\`\`\`\n${snippet}\n\`\`\``,
      `_Type "fix this" or describe the change you want._`,
    ].join('\n');
    (ChatPanel.currentPanel as any).state.conversation.push({ role: 'assistant', content, timestamp: Date.now() });
    ChatPanel.currentPanel.refresh();
    vscode.window.showTextDocument(vscode.Uri.file(sourceRef.filePath), { preview: true, selection: new vscode.Range(Math.max(0, sourceRef.line - 1), 0, sourceRef.line, 0) });
  }

  /** High-level entry: capture → translate → inject. Called by redivivus.inspectElement command. */
  async inspectAndInject(metadata: ElementMetadata): Promise<void> {
    await this.captureElement(metadata);
    const ref = await this.translateToSource(metadata);
    if (!ref) {
      vscode.window.showWarningMessage(`Redivivus: Could not find source for "${metadata.description || metadata.className || metadata.id || metadata.tagName}"`);
      return;
    }
    await this.injectContext(ref.snippet, ref);
  }
}

async function searchProjectFiles(root: string, term: string): Promise<SourceRef | null> {
  const exts = ['.tsx', '.jsx', '.ts', '.js', '.html', '.vue', '.svelte'];
  const skipDirs = new Set(['node_modules', '.redivivus', 'out', 'dist', '.git']);
  try {
    for await (const filePath of walkDir(root, exts, skipDirs)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(term)) {
          const start = Math.max(0, i - 2); const end = Math.min(lines.length - 1, i + 4);
          return { filePath: path.relative(root, filePath), line: i + 1, snippet: lines.slice(start, end + 1).join('\n') };
        }
      }
    }
  } catch { /* file read errors are non-fatal */ }
  return null;
}

async function* walkDir(dir: string, exts: string[], skipDirs: Set<string>): AsyncGenerator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) { yield* walkDir(path.join(dir, entry.name), exts, skipDirs); }
    } else if (exts.some(e => entry.name.endsWith(e))) {
      yield path.join(dir, entry.name);
    }
  }
}
