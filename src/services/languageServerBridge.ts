// [SCOPE] Language Server Bridge -- gives CHASSIS access to VS Code's language intelligence.
// Provides go-to-definition, hover info, symbol references, and rename for any language
// that has an active language server. Used by build/fix pipelines for context enrichment.
// [WARN] All calls are best-effort -- if no LSP is active for the file, returns null gracefully.

import * as vscode from 'vscode';
import * as path from 'path';

export interface DefinitionInfo {
  filePath: string;
  line: number;
  character: number;
  preview?: string;
}

export interface HoverInfo {
  contents: string;
  range?: { startLine: number; endLine: number };
}

export interface SymbolReference {
  filePath: string;
  line: number;
  character: number;
  preview?: string;
}

export interface RenameEdit {
  filePath: string;
  edits: Array<{ startLine: number; startChar: number; endLine: number; endChar: number; newText: string }>;
}

/**
 * Get the definition location for a symbol at a given position.
 * Uses VS Code's built-in executeDefinitionProvider command.
 */
export async function getDefinition(fileUri: vscode.Uri, line: number, character: number): Promise<DefinitionInfo | null> {
  try {
    const position = new vscode.Position(line, character);
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider', fileUri, position
    );
    if (!locations || locations.length === 0) { return null; }
    const loc = locations[0];
    const preview = await getLinePreview(loc.uri, loc.range.start.line);
    return {
      filePath: loc.uri.fsPath,
      line: loc.range.start.line,
      character: loc.range.start.character,
      preview,
    };
  } catch { return null; }
}

/**
 * Get hover information for a symbol at a given position.
 * Returns formatted markdown content from the language server.
 */
export async function getHoverInfo(fileUri: vscode.Uri, line: number, character: number): Promise<HoverInfo | null> {
  try {
    const position = new vscode.Position(line, character);
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider', fileUri, position
    );
    if (!hovers || hovers.length === 0) { return null; }
    const hover = hovers[0];
    const contents = hover.contents
      .map(c => typeof c === 'string' ? c : ('value' in c ? c.value : String(c)))
      .join('\n\n');
    return {
      contents,
      range: hover.range ? { startLine: hover.range.start.line, endLine: hover.range.end.line } : undefined,
    };
  } catch { return null; }
}

/**
 * Find all references to a symbol at a given position.
 */
export async function getReferences(fileUri: vscode.Uri, line: number, character: number, maxResults = 20): Promise<SymbolReference[]> {
  try {
    const position = new vscode.Position(line, character);
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider', fileUri, position
    );
    if (!locations || locations.length === 0) { return []; }
    const results: SymbolReference[] = [];
    for (const loc of locations.slice(0, maxResults)) {
      const preview = await getLinePreview(loc.uri, loc.range.start.line);
      results.push({
        filePath: loc.uri.fsPath,
        line: loc.range.start.line,
        character: loc.range.start.character,
        preview,
      });
    }
    return results;
  } catch { return []; }
}

/**
 * Prepare a rename for a symbol at a given position.
 * Returns the workspace edit that would be applied.
 */
export async function prepareRename(fileUri: vscode.Uri, line: number, character: number, newName: string): Promise<RenameEdit[]> {
  try {
    const position = new vscode.Position(line, character);
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      'vscode.executeDocumentRenameProvider', fileUri, position, newName
    );
    if (!edit) { return []; }
    const results: RenameEdit[] = [];
    for (const [uri, textEdits] of edit.entries()) {
      results.push({
        filePath: uri.fsPath,
        edits: textEdits.map(e => ({
          startLine: e.range.start.line,
          startChar: e.range.start.character,
          endLine: e.range.end.line,
          endChar: e.range.end.character,
          newText: e.newText,
        })),
      });
    }
    return results;
  } catch { return []; }
}

/**
 * Get document symbols (functions, classes, variables) for a file.
 * Useful for building context about what's in a file without reading everything.
 */
export async function getDocumentSymbols(fileUri: vscode.Uri): Promise<Array<{ name: string; kind: string; line: number }>> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider', fileUri
    );
    if (!symbols) { return []; }
    const flat: Array<{ name: string; kind: string; line: number }> = [];
    const kindMap: Record<number, string> = {
      4: 'class', 5: 'method', 11: 'function', 12: 'variable',
      13: 'constant', 7: 'property', 8: 'field', 10: 'enum',
      1: 'file', 2: 'module', 3: 'namespace', 22: 'interface',
    };
    function walk(syms: vscode.DocumentSymbol[]) {
      for (const s of syms) {
        flat.push({ name: s.name, kind: kindMap[s.kind] || 'symbol', line: s.range.start.line });
        if (s.children) { walk(s.children); }
      }
    }
    walk(symbols);
    return flat;
  } catch { return []; }
}

/**
 * Build a compact context string from LSP data for AI prompt injection.
 * Summarizes what a file contains without reading the entire content.
 */
export async function buildLspContext(filePath: string): Promise<string> {
  try {
    const uri = vscode.Uri.file(filePath);
    const symbols = await getDocumentSymbols(uri);
    if (symbols.length === 0) { return ''; }
    const grouped: Record<string, string[]> = {};
    for (const s of symbols) {
      if (!grouped[s.kind]) { grouped[s.kind] = []; }
      grouped[s.kind].push(s.name);
    }
    const parts = Object.entries(grouped).map(([kind, names]) => `${kind}s: ${names.join(', ')}`);
    return `LSP: ${path.basename(filePath)} contains ${parts.join('; ')}`;
  } catch { return ''; }
}

// --- Internal ---

async function getLinePreview(uri: vscode.Uri, line: number): Promise<string> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.lineAt(line).text.trim().slice(0, 120);
  } catch { return ''; }
}
