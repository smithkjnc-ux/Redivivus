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

function walk(dir: string, results: string[]): void {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) { continue; }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, results); }
      else if (SRC_EXTS.has(path.extname(e.name).toLowerCase())) { results.push(full); }
    }
  } catch { /* skip unreadable dirs */ }
}

function extractScope(content: string): string {
  const m = content.match(/\[SCOPE\]\s*(.+)/);
  return m ? m[1].trim().slice(0, 70) : '';
}

function countPattern(content: string, pattern: RegExp): number {
  return (content.match(pattern) || []).length;
}

// [SCOPE] Parse import/require/from statements to extract referenced module paths
function extractImports(content: string, ext: string): string[] {
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

function getBlueprintIntent(root: string): string[] {
  const bpPath = path.join(root, '.chassis', 'blueprint.md');
  if (!fs.existsSync(bpPath)) return [];
  try {
    const content = fs.readFileSync(bpPath, 'utf-8');
    const whatMatch = content.match(/## WHAT\n([\s\S]*?)(?=\n##|$)/);
    if (!whatMatch) return [];
    return whatMatch[1].toLowerCase().split(/\W+/).filter(w => w.length > 3);
  } catch { return []; }
}

function getDeadEnds(root: string): { from: string, to: string }[] {
  const dePath = path.join(root, '.chassis', 'dead_ends.md');
  if (!fs.existsSync(dePath)) return [];
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


function findLongPaths(nodes: MapNode[], edges: MapEdge[]): Set<string> {
  const adj: Record<string, string[]> = {};
  edges.forEach(e => {
    if (!adj[e.from]) adj[e.from] = [];
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
    if (path.includes(curr)) return; // circular

    const neighbors = adj[curr] || [];
    for (const next of neighbors) {
      dfs(next, [...path, curr], depth + 1);
    }
  }

  nodes.forEach(n => dfs(n.id, [], 0));
  return scenicEdges;
}

function generateLogicFlow(n: MapNode, edges: MapEdge[]): string {
  const inputs = edges.filter(e => e.to === n.id).map(e => path.basename(e.from));
  const outputs = edges.filter(e => e.from === n.id).map(e => path.basename(e.to));
  
  if (inputs.length === 0 && outputs.length === 0) return "This file is a standalone module with no external logic tethers.";
  
  let text = "Logic flow: ";
  if (inputs.length > 0) {
    text += `Takes input/context from ${inputs.slice(0,3).join(', ')}${inputs.length > 3 ? '...' : ''} `;
  }
  if (outputs.length > 0) {
    text += `${inputs.length > 0 ? 'and' : 'This file'} sends data/commands to ${outputs.slice(0,3).join(', ')}${outputs.length > 3 ? '...' : ''}.`;
  }
  return text;
}

// [SCOPE] Main entry — builds the full ProjectMap for a workspace root
export function buildProjectMap(root: string, intentService?: any): ProjectMap {
  const allFiles: string[] = [];
  const srcDir = path.join(root, 'src');
  if (fs.existsSync(srcDir)) { walk(srcDir, allFiles); }
  if (allFiles.length === 0) { walk(root, allFiles); } // fallback: scan root

  const nodes: MapNode[] = [];
  const relToFull: Record<string, string> = {};

  for (const full of allFiles) {
    try {
      const rel = path.relative(root, full).replace(/\\/g, '/');
      relToFull[rel] = full;
      let content = '';
      try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
      const lines = content.split('\n').length;
      const label = extractScope(content);
      const todos = countPattern(content, /\[TODO\]/g);
      const warns = countPattern(content, /\[WARN\]/g);
      const hasScope = !!label;
      const health: MapNode['health'] = lines > 200 ? 'bad'
        : (todos > 0 || !hasScope) ? 'warn'
        : 'good';
      nodes.push({ 
        id: rel, label: label || path.basename(rel), lines, todos, warns, hasScope, health,
        confirmedIntent: intentService?.isConfirmedFile ? intentService.isConfirmedFile(rel) : false
      });
    } catch (e) {
      console.error('[CHASSIS] Error processing file for map:', full, e);
    }
  }

  const nodeIds = new Set(nodes.map(n => n.id));
  const edges: MapEdge[] = [];
  const edgeSet = new Set<string>();

  const intentWords = getBlueprintIntent(root);
  const deadEnds = getDeadEnds(root);

  for (const n of nodes) {
    const full = relToFull[n.id];
    let content = '';
    try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
    
    // Check blueprint match
    const scope = n.label.toLowerCase();
    const filename = n.id.toLowerCase();
    n.matchesBlueprint = intentWords.length === 0 || intentWords.some(w => scope.includes(w) || filename.includes(w));
    
    // Check if UI
    n.isUI = filename.includes('ui') || filename.includes('view') || filename.includes('panel') || filename.includes('html') || filename.includes('style');

    const ext = path.extname(full).toLowerCase();
    const dir = path.dirname(n.id);
    for (const ref of extractImports(content, ext)) {
      // Skip obvious external JS packages (non-relative imports in JS/TS)
      if (!ref.startsWith('.') && !ref.startsWith('/') && !['.py', '.html', '.css'].includes(ext) && !ref.includes('/')) {
        continue;
      }
      
      const candidates: string[] = [];
      const suffixes = ['.ts', '.js', '.py', '.tsx', '.jsx', '.css', '/index.ts', '/index.js', ''];
      
      // 1. Try relative to current directory
      for (const suffix of suffixes) {
        candidates.push(path.join(dir, ref + suffix).replace(/\\/g, '/'));
      }
      
      // 2. Try relative to root (especially for Python module paths or absolute HTML paths)
      const cleanRef = ref.startsWith('/') ? ref.slice(1) : ref;
      for (const suffix of suffixes) {
        candidates.push(cleanRef + suffix);
      }

      for (const candidate of candidates) {
        if (nodeIds.has(candidate)) {
          const key = `${n.id}→${candidate}`;
          if (!edgeSet.has(key)) { 
            edgeSet.add(key); 
            edges.push({ 
              from: n.id, to: candidate,
              confirmedIntent: intentService?.isConfirmedRoute ? intentService.isConfirmedRoute(key) : false
            }); 
          }
          break;
        }
      }
    }
  }

  // Add dead-end edges
  for (const de of deadEnds) {
    const key = `${de.from}→${de.to}`;
    if (!edgeSet.has(key) && nodeIds.has(de.from) && nodeIds.has(de.to)) {
      edgeSet.add(key);
      edges.push({ from: de.from, to: de.to, isDeadEnd: true });
    }
  }

  // Final Pass: Complexity and Scenic Routes
  const scenicKeys = findLongPaths(nodes, edges);
  for (const e of edges) {
    if (scenicKeys.has(`${e.from}→${e.to}`)) e.isScenicRoute = true;
  }

  for (const n of nodes) {
    const outgoing = edges.filter(e => e.from === n.id).length;
    const incoming = edges.filter(e => e.to === n.id).length;
    n.complexityScore = outgoing + incoming;
    
    // Sledgehammer Check: 500+ lines for single responsibility? (simplified heuristic)
    if (n.lines > 500 && n.complexityScore < 3) {
      n.isSledgehammer = true;
      n.refactorRoadmap = [
        "This file is unusually large for its small number of connections.",
        "Consider splitting the internal logic into separate helper files.",
        "Check if you are including too much 'just in case' code that isn't used."
      ];
    }
    
    n.logicFlow = generateLogicFlow(n, edges);
  }

  if (nodes.length === 0) {
    nodes.push({ 
      id: 'DEBUG_ERROR_NO_FILES', 
      label: 'Scan found 0 files. Root: ' + root, 
      lines: 0, todos: 0, warns: 0, hasScope: false, health: 'neutral' 
    });
  }

  return { nodes, edges };
}
