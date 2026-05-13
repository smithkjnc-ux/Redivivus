// [SCOPE] Persists resolved/dismissed items from the Recommendations panel across re-scans
// Resolved items are stored in .chassis/resolved.json as a set of file paths + issue types.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ResolvedItem {
  filePath: string;   // relative path from workspace root
  issueType: string;  // 'largeFile' | 'todo' | 'uncommented'
  resolvedAt: string; // ISO timestamp
}

function resolvedPath(): string | null {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { return null; }
  return path.join(root, '.chassis', 'resolved.json');
}

export function loadResolved(): ResolvedItem[] {
  const p = resolvedPath();
  if (!p || !fs.existsSync(p)) { return []; }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ResolvedItem[];
  } catch { return []; }
}

export function saveResolved(items: ResolvedItem[]): void {
  const p = resolvedPath();
  if (!p) { return; }
  try {
    fs.writeFileSync(p, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) { console.error('[CHASSIS] Failed to save resolved.json:', e); }
}

export function markResolved(filePath: string, issueType: string): void {
  const items = loadResolved();
  const already = items.some(i => i.filePath === filePath && i.issueType === issueType);
  if (already) { return; }
  items.push({ filePath, issueType, resolvedAt: new Date().toISOString() });
  saveResolved(items);
}

export function isResolved(filePath: string, issueType: string): boolean {
  const items = loadResolved();
  return items.some(i => i.filePath === filePath && i.issueType === issueType);
}

export function getResolvedPaths(issueType: string): Set<string> {
  const items = loadResolved();
  return new Set(items.filter(i => i.issueType === issueType).map(i => i.filePath));
}
