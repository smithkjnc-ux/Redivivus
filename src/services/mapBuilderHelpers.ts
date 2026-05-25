// [SCOPE] Redivivus Map Builder Helpers — utility functions for scanning and analyzing project files.
// Extracted from mapBuilderService.ts to keep source files under 200 lines.

// [SCOPE] Visual map builder — scans project source files and builds a graph of nodes (files) and edges (imports)
// Used by mapPanel.ts to generate the interactive architecture diagram. No vscode dependency.
// [WARN] Only scans src/ by default. Falls back to root scan if src/ is empty.

import * as fs from 'fs';
import * as path from 'path';

export interface MapNode {
  id: string;        // relative file path (e.g. "src/dashboard.py")
  label: string;     // [SCOPE] description, truncated to 70 chars
  lines: number;
  todos: number;
  warns: number;
  hasScope: boolean;
  health: 'good' | 'warn' | 'bad' | 'neutral';
  matchesBlueprint?: boolean;
  isUI?: boolean;
  complexityScore?: number;
  isSledgehammer?: boolean;
  refactorRoadmap?: string[];
  logicFlow?: string;
  confirmedIntent?: boolean;
  warnTexts?: string[];
  todoTexts?: string[];
  deadTexts?: string[];
}

export interface MapEdge {
  from: string;  // relative path
  to: string;    // relative path
  isDeadEnd?: boolean;
  isScenicRoute?: boolean;
  confirmedIntent?: boolean;
}

export interface ProjectMap {
  nodes: MapNode[];
  edges: MapEdge[];
}

const SRC_EXTS = new Set(['.ts', '.js', '.py', '.go', '.rs', '.tsx', '.jsx', '.vue', '.svelte', '.rb', '.c', '.cpp', '.cs', '.java', '.html', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'dist', 'out', 'build', 'venv', '.venv', 'coverage', '.nyc_output']);

export function walk(dir: string, results: string[]): void {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) { continue; }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, results); }
      else if (SRC_EXTS.has(path.extname(e.name).toLowerCase())) { results.push(full); }
    }
  } catch { /* skip unreadable dirs */ }
}

export function extractScope(content: string): string {
  const m = content.match(/\[SCOPE\]\s*(.+)/);
  return m ? m[1].trim().slice(0, 70) : '';
}

export function countPattern(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

// [SCOPE] Parse import/require/from statements to extract referenced module paths
export function extractImports(content: string, ext: string): string[] {
  const refs: string[] = [];
  if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
    const re = /(?:import|from|require)\s*\(?['"]([^'"]+)['"]\)?/g;
    let m;
    while ((m = re.exec(content)) !== null) { refs.push(m[1]); }
  }
  if (ext === '.py') {
    const re = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    let m;
    while ((m = re.exec(content)) !== null) { refs.push((m[1] || m[2]).replace(/\./g, '/')); }
  }
  if (ext === '.html') {
    const scriptRe = /<script\s+[^>]*src=['"]([^'"]+)['"]/g;
    const linkRe = /<link\s+[^>]*href=['"]([^'"]+\.css)['"]/g;
    let m;
    while ((m = scriptRe.exec(content)) !== null) { refs.push(m[1]); }
    while ((m = linkRe.exec(content)) !== null) { refs.push(m[1]); }
  }
  return refs;
}

export function getBlueprintIntent(root: string): string[] {
  const bpPath = path.join(root, '.redivivus', 'blueprint.md');
  if (!fs.existsSync(bpPath)) {return [];}
  try {
    const content = fs.readFileSync(bpPath, 'utf-8');
    const whatMatch = content.match(/## WHAT\n([\s\S]*?)(?=\n##|$)/);
    if (!whatMatch) {return [];}
    return whatMatch[1].toLowerCase().split(/\W+/).filter(w => w.length > 3);
  } catch { return []; }
}

export function getDeadEnds(root: string): { from: string, to: string }[] {
  const dePath = path.join(root, '.redivivus', 'dead_ends.md');
  if (!fs.existsSync(dePath)) {return [];}
  try {
    const content = fs.readFileSync(dePath, 'utf-8');
    const ends: { from: string, to: string }[] = [];
    const re = /connection failed:\s*([\w./-]+)\s*->\s*([\w./-]+)/gi;
    let m;
    while ((m = re.exec(content)) !== null) {
      ends.push({ from: m[1], to: m[2] });
    }
    return ends;
  } catch { return []; }
}


export function findLongPaths(nodes: MapNode[], edges: MapEdge[]): Set<string> {
  const adj: Record<string, string[]> = {};
  edges.forEach(e => {
    if (!adj[e.from]) {adj[e.from] = [];}
    adj[e.from].push(e.to);
  });

  const scenicEdges = new Set<string>();
  
  function dfs(curr: string, path: string[], depth: number) {
    if (depth > 5) {
      // Flag the last edge in the chain as part of a scenic route
      if (path.length > 1) {
        scenicEdges.add(`${path[path.length-1]}→${curr}`);
      }
      return;
    }
    if (path.includes(curr)) {return;} // circular

    const neighbors = adj[curr] || [];
    for (const next of neighbors) {
      dfs(next, [...path, curr], depth + 1);
    }
  }

  nodes.forEach(n => dfs(n.id, [], 0));
  return scenicEdges;
}

export function generateLogicFlow(n: MapNode, edges: MapEdge[]): string {
  const inputs = edges.filter(e => e.to === n.id).map(e => path.basename(e.from));
  const outputs = edges.filter(e => e.from === n.id).map(e => path.basename(e.to));
  
  if (inputs.length === 0 && outputs.length === 0) {return "This file is a standalone module with no external logic tethers.";}
  
  let text = "Logic flow: ";
  if (inputs.length > 0) {
    text += `Takes input/context from ${inputs.slice(0,3).join(', ')}${inputs.length > 3 ? '...' : ''} `;
  }
  if (outputs.length > 0) {
    text += `${inputs.length > 0 ? 'and' : 'This file'} sends data/commands to ${outputs.slice(0,3).join(', ')}${outputs.length > 3 ? '...' : ''}.`;
  }
  return text;
}

export function extractAnnotationTexts(content: string, tag: string): string[] {
  const re = new RegExp(`\\[${tag}\\]\\s*(.+)`, 'g');
  const results: string[] = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const text = m[1].trim().slice(0, 120);
    if (text) { results.push(text); }
  }
  return results;
}

// [SCOPE] Main entry — builds the full ProjectMap for a workspace root