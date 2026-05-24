// [SCOPE] Chat build import validation — checks if imports in built files resolve to existing files
// Scans newly written code for import statements and validates against project structure.

import * as fs from 'fs';
import * as path from 'path';

export interface ImportCheckResult {
  missing: string[];
  resolved: string[];
  language: 'python' | 'node' | 'unknown';
}

/** Check imports in a file and return list of unresolved imports.
 *  For Python: checks import X and from X import Y
 *  For Node/TS: checks require('...') and import ... from '...'
 */
export function checkImports(root: string, filePath: string, code: string): ImportCheckResult {
  const ext = path.extname(filePath).toLowerCase();
  const isPython = ext === '.py';
  const isNode = ['.js', '.ts', '.tsx', '.jsx', '.mjs'].includes(ext);

  if (isPython) {
    return checkPythonImports(root, code);
  }
  if (isNode) {
    return checkNodeImports(root, filePath, code);
  }
  return { missing: [], resolved: [], language: 'unknown' };
}

function checkPythonImports(root: string, code: string): ImportCheckResult {
  const missing: string[] = [];
  const resolved: string[] = [];

  // Match: import X, import X as Y, from X import Y, from X import Y as Z
  const importRegex = /^(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/gm;
  const matches = [...code.matchAll(importRegex)];

  for (const match of matches) {
    const modulePath = match[1]; // e.g., "utils" or "app.models"
    if (!modulePath) {continue;}

    // Skip stdlib modules (common ones)
    const stdlibModules = new Set([
      'os', 'sys', 'json', 're', 'math', 'random', 'datetime', 'collections',
      'itertools', 'functools', 'typing', 'pathlib', 'subprocess', 'time',
      'hashlib', 'base64', 'urllib', 'http', 'socket', 'threading', 'asyncio',
      'unittest', 'pytest', 'logging', 'argparse', 'configparser', 'csv',
      'sqlite3', 'xml', 'html', 'email', 'uuid', 'copy', 'pickle', 'io',
      'warnings', 'contextlib', 'dataclasses', 'enum', 'inspect', 'types',
      'string', 'textwrap', 'numbers', 'decimal', 'fractions', 'statistics'
    ]);
    const topModule = modulePath.split('.')[0];
    if (stdlibModules.has(topModule)) {continue;}

    // Check if module file exists
    // Try as file: X/Y/Z.py
    const possiblePaths = [
      path.join(root, ...modulePath.split('.')) + '.py',
      path.join(root, modulePath.split('.')[0] + '.py'),
    ];

    let found = false;
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        found = true;
        resolved.push(modulePath);
        break;
      }
    }

    if (!found) {
      missing.push(modulePath);
    }
  }

  return { missing, resolved, language: 'python' };
}

function checkNodeImports(root: string, filePath: string, code: string): ImportCheckResult {
  const missing: string[] = [];
  const resolved: string[] = [];
  const fileDir = path.dirname(filePath);

  // Match: import X from '...', import '...', require('...'), import * as X from '...'
  // Also handles dynamic import: import('...')
  const esmRegex = /import(?:\s+type)?\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)/g;
  const cjsRegex = /require\(['"]([^'"]+)['"]\)/g;

  const imports = new Set<string>();

  for (const match of code.matchAll(esmRegex)) {
    const mod = match[1] || match[2];
    if (mod) {imports.add(mod);}
  }
  for (const match of code.matchAll(cjsRegex)) {
    const mod = match[1];
    if (mod) {imports.add(mod);}
  }

  for (const mod of imports) {
    // Skip node_modules packages (no relative path, not absolute)
    if (!mod.startsWith('.') && !mod.startsWith('/')) {continue;}

    // Resolve relative to the importing file
    const resolvedPath = path.resolve(fileDir, mod);
    const possiblePaths = [
      resolvedPath,
      resolvedPath + '.js',
      resolvedPath + '.ts',
      resolvedPath + '.tsx',
      resolvedPath + '.jsx',
      path.join(resolvedPath, 'index.js'),
      path.join(resolvedPath, 'index.ts'),
    ];

    let found = false;
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        found = true;
        resolved.push(mod);
        break;
      }
    }

    if (!found) {
      missing.push(mod);
    }
  }

  return { missing, resolved, language: 'node' };
}

/** Format missing imports as a user-friendly message for the result card. */
export function formatMissingImports(result: ImportCheckResult, relPath: string): string {
  if (result.missing.length === 0) {return '';}

  const items = result.missing.map(m => `\`${m}\``).join(', ');
  const lang = result.language === 'python' ? 'Python module' : 'module';

  return `\n\n**Import Check:** ${relPath} references ${result.missing.length} missing ${lang}(s): ${items}. Type 'build <name>' to create them.`;
}
