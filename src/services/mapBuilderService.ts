// [SCOPE] CHASSIS Map Builder Service — main entry point for building the project architecture map.
// Delegates to mapBuilderHelpers.ts for scanning and analysis utilities.

import * as fs from 'fs';
import * as path from 'path';
import {
  walk, extractScope, countPattern, extractImports,
  getBlueprintIntent, getDeadEnds, findLongPaths, generateLogicFlow,
  MapNode, MapEdge, ProjectMap
} from './mapBuilderHelpers.js';
export { MapNode, MapEdge, ProjectMap };

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
