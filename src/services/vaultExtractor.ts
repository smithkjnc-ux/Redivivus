// [SCOPE] Vault code extraction — parses TS/JS, Python, and Markdown files into ExtractedBlock items for vault storage
import * as path from 'path';
import * as crypto from 'crypto';
import { ExtractedBlock, VaultItem, VaultCategory } from './vaultTypes.js';

export { ExtractedBlock, VaultItem, VaultCategory };

// [SCOPE] Detect language string from file extension
export function detectLanguage(ext: string): string {
  switch (ext) {
    case '.ts': case '.tsx': return 'typescript';
    case '.js': case '.jsx': return 'javascript';
    case '.py': return 'python';
    case '.md': return 'markdown';
    default: return 'text';
  }
}

// [SCOPE] Generate stable ID for a block based on file+name+type
export function generateId(filePath: string, name: string, type: string): string {
  const hash = crypto.createHash('md5').update(`${filePath}:${name}:${type}`).digest('hex');
  return hash.substring(0, 12);
}

// [SCOPE] Infer vault tags from file path and block metadata
export function inferTags(filePath: string, block: ExtractedBlock): string[] {
  const tags: string[] = [];
  const basename = path.basename(filePath, path.extname(filePath));
  if (basename.includes('test') || basename.includes('spec')) { tags.push('testing'); }
  if (block.type === 'component') { tags.push('component'); }
  if (block.name.toLowerCase().includes('api') || block.name.toLowerCase().includes('endpoint')) { tags.push('api'); }
  if (block.name.toLowerCase().includes('config')) { tags.push('config'); }
  if (block.name.toLowerCase().includes('auth')) { tags.push('auth'); }
  if (tags.length === 0) { tags.push('other'); }
  return tags;
}

// [SCOPE] Compute SHA-256 content hash for deduplication
export function computeContentHash(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// [SCOPE] Reject low-value single-return wrapper blocks
export function isSingleReturnWrapper(block: ExtractedBlock): boolean {
  const code = block.code.trim();
  const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 3) {
    const body = lines.join(' ');
    const patterns = [
      /^return\s+\w+\s*\(.*\)\s*;?$/,
      /^return\s+new\s+\w+\s*\(.*\)\s*;?$/,
      /^(return\s+)?\{?\s*\w+\s*:\s*\w+\s*,?\s*\}?\s*;?$/,
    ];
    return patterns.some(p => p.test(body));
  }
  return false;
}

// [SCOPE] Quality filter — returns skip reason or false
export function shouldSkipBlock(block: ExtractedBlock, filePath: string): { skip: boolean; reason?: string } {
  const testPatterns = /\.(test|spec)\.|__tests__|__mocks__|e2e|\.e2e\./i;
  if (testPatterns.test(filePath)) { return { skip: true, reason: 'test-file' }; }
  const lineCount = block.lines[1] - block.lines[0] + 1;
  if (block.type === 'function' && lineCount < 5) { return { skip: true, reason: 'too-short' }; }
  if (block.type === 'function' && (block.name === 'unnamed' || /^[a-z]$/.test(block.name) || block.name.startsWith('_'))) {
    return { skip: true, reason: 'anonymous' };
  }
  if (isSingleReturnWrapper(block)) { return { skip: true, reason: 'wrapper' }; }
  return { skip: false };
}

// [SCOPE] Extract function/class/interface blocks from TS/JS source
export function extractTSJS(lines: string[], filePath: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  const language = detectLanguage(path.extname(filePath));

  const extractBraceBlock = (startLine: number): number => {
    let braceCount = 0;
    for (let j = startLine; j < lines.length; j++) {
      for (const char of lines[j]) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      if (braceCount <= 0) { return j + 1; }
    }
    return startLine;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match any function declaration: function Name(, export function Name(, export default function Name(
    const fnRegex = /^(export\s+(default\s+)?)?(async\s+)?function\s+\w+/;
    // Match const/let/var declarations with arrow functions or regular assignments: const Name = ...
    const constRegex = /^(export\s+)?(const|let|var)\s+\w+\s*[=:]/;
    // Match React hooks: useHookName
    const hookRegex = /^(export\s+)?(const|let|var)\s+use[A-Z]\w+\s*=/;
    // Match React components (capitalized name after function/const)
    const compRegex = /^(export\s+)?(const|let|var|function)\s+[A-Z][a-zA-Z0-9_]*\b/;
    // Match class methods and getters/setters
    const methodRegex = /^(async\s+)?(get\s+|set\s+)?\w+\s*\([^)]*\)\s*\{/i;
    const fnMatch = line.match(fnRegex);
    if (fnMatch) {
      const name = line.match(/function\s+(\w+)/)?.[1] || line.match(/(?:const|let|var)\s+(\w+)/)?.[1] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'function', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    const constMatch = line.match(constRegex);
    if (constMatch) {
      const name = line.match(/(?:const|let|var)\s+(\w+)/)?.[1] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'function', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    const hookMatch = line.match(hookRegex);
    if (hookMatch) {
      const name = line.match(/use[A-Z]\w+/)?.[0] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'function', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    const compMatch = line.match(compRegex);
    if (compMatch) {
      const name = line.match(/[A-Z][a-zA-Z0-9_]*\b/)?.[0] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'component', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    const methodMatch = line.match(methodRegex);
    if (methodMatch) {
      const name = line.match(/\w+\s*\([^)]*\)\s*\{/i)?.[0] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'method', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    // [WARN] Regex for class matching can miss decorators
    const classMatch = line.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[3];
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'class', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    // [WARN] Regex for interface matching can be brittle
    const ifaceMatch = line.match(/^(export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      const name = ifaceMatch[2];
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'interface', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
  }
  // [SCOPE] Filter to only vault-worthy, reusable code blocks
  return blocks.filter(b => isVaultWorthy(b.code, b.name, filePath));
}

/**
 * Determines if a code block is genuinely vault-worthy — reusable, non-trivial, well-structured.
 * Rejects one-liners, empty functions, trivial wrappers, logs, tests, generated code.
 */
function isVaultWorthy(code: string, name: string, filePath: string): boolean {
  const trimmed = code.trim();
  const lines = trimmed.split('\n').filter(l => l.trim());

  // Reject test/spec files entirely
  if (/\.(test|spec)\.[tj]sx?$/.test(filePath) || /__tests__/.test(filePath)) {
    return false;
  }

  // Reject generated/minified code (single very long line)
  if (lines.length === 1 && trimmed.length > 300 && !trimmed.includes('\n')) {
    return false;
  }

  // Must have at least 3 lines of actual code (not just declarations)
  if (lines.length < 3) {
    return false;
  }

  // Must be at least 80 chars — rejects trivial one-liners disguised as blocks
  if (trimmed.length < 80) {
    return false;
  }

  // Reject trivial patterns (only if the entire body is trivial)
  const trivialPatterns = [
    /^\s*console\.(log|warn|error|info|debug)\s*\(/im,
    /^\s*return\s+\w+\s*;?\s*$/m,
    /^\s*throw\s+new\s+Error\s*\(/im,
    /^\s*return\s*(null|undefined|false|true)\s*;?\s*$/m,
    /^\s*return\s*\[\s*\]\s*;?\s*$/m,
    /^\s*return\s*\{\s*\}\s*;?\s*$/m,
  ];
  const bodyOnly = trimmed.replace(/^[^{]*\{/, '').replace(/\}\s*$/, '').trim();
  for (const p of trivialPatterns) {
    if (p.test(bodyOnly)) {
      const bodyLines = bodyOnly.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
      if (bodyLines.length <= 2) { return false; }
    }
  }

  // Reject generic throwaway names on small blocks
  const genericNames = ['fn', 'func', 'callback', 'cb', 'tmp', 'temp', 'handler', 'onClick', 'onChange'];
  if (genericNames.includes(name) && lines.length < 8) {
    return false;
  }

  // Must contain actual logic — conditionals, loops, async, try/catch, assignments, calls
  const hasLogic = /\b(if|else|for|while|switch|try|catch|async|await|map|filter|reduce|\.then\b)/.test(trimmed);
  const hasSubstantialCalls = /[.;]\w+\s*\([^)]*\)/.test(trimmed);
  const hasAssignments = /\b(const|let|var)\s+\w+/.test(trimmed);
  const score = (hasLogic ? 1 : 0) + (hasSubstantialCalls ? 1 : 0) + (hasAssignments ? 1 : 0);
  if (score < 2) {
    return false;
  }

  return true;
}

// [SCOPE] Extract function/class blocks from Python source using indent-based parsing
export function extractPython(lines: string[], filePath: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];

  const extractIndentBlock = (startLine: number): number => {
    let indentLevel = 0;
    let end = startLine;
    for (let j = startLine; j < lines.length; j++) {
      const indent = lines[j].search(/\S/);
      if (j === startLine) { indentLevel = indent; }
      else if (indent <= indentLevel && lines[j].trim().length > 0) { return j; }
      end = j + 1;
    }
    return end;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // [WARN] Regex for Python function matching can miss some styles
    const fnMatch = line.match(/^(def\s+(\w+)\s*\()/);
    if (fnMatch) {
      const end = extractIndentBlock(i);
      if (end > i) { blocks.push({ filePath, name: fnMatch[2], type: 'function', code: lines.slice(i, end).join('\n'), language: 'python', lines: [i + 1, end] }); }
    }
    const classMatch = line.match(/^(class\s+(\w+))/);
    if (classMatch) {
      const end = extractIndentBlock(i);
      if (end > i) { blocks.push({ filePath, name: classMatch[2], type: 'class', code: lines.slice(i, end).join('\n'), language: 'python', lines: [i + 1, end] }); }
    }
  }
  return blocks.filter(b => isVaultWorthy(b.code, b.name, filePath));
}

// [SCOPE] Extract fenced code blocks from Markdown
export function extractMarkdown(lines: string[], filePath: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) {
      const langMatch = lines[i].match(/```(\w+)/);
      const codeLang = langMatch?.[1] || 'text';
      let end = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('```')) { end = j; break; }
        end = j + 1;
      }
      if (end > i + 1) {
        blocks.push({ filePath, name: `code-block-${i}`, type: 'custom', code: lines.slice(i + 1, end).join('\n'), language: codeLang, lines: [i + 1, end] });
      }
    }
  }
  return blocks;
}

// [SCOPE] Keyword-based category suggestion per spec
export function suggestCategory(name: string, code: string): VaultCategory {
  const text = (name + ' ' + code).toLowerCase();
  const rules: { keywords: string[]; category: VaultCategory }[] = [
    { keywords: ['auth', 'login', 'token', 'session', 'password', 'credential', 'jwt', 'oauth', 'permission', 'role'], category: 'auth' },
    { keywords: ['fetch', 'api', 'request', 'endpoint', 'http', 'axios', 'graphql', 'rest', 'client', 'url'], category: 'api' },
    { keywords: ['db', 'database', 'query', 'sql', 'table', 'insert', 'select', 'update', 'delete', 'schema', 'model', 'orm', 'mongoose', 'prisma'], category: 'database' },
    { keywords: ['component', 'render', 'view', 'screen', 'button', 'modal', 'card', 'list', 'form', 'input', 'page', 'ui', 'widget', 'layout'], category: 'component' },
    { keywords: ['util', 'helper', 'format', 'parse', 'convert', 'transform', 'sanitize', 'normalize', 'encode', 'decode', 'slugify', 'camelize'], category: 'utility' },
    { keywords: ['validate', 'check', 'verify', 'sanitize', 'schema', 'zod', 'joi', 'yup', 'validator', 'regex'], category: 'validation' },
    { keywords: ['error', 'exception', 'catch', 'throw', 'fail', 'handler', 'guard', 'try', 'reject'], category: 'error' },
    { keywords: ['test', 'spec', 'mock', 'expect', 'assert', 'jest', 'mocha', 'cypress', 'e2e', 'unit'], category: 'testing' },
    { keywords: ['socket', 'websocket', 'p2p', 'network', 'connect', 'tcp', 'udp', 'stream', 'pipe', 'download', 'upload'], category: 'network' },
    { keywords: ['sort', 'search', 'filter', 'algorithm', 'calculate', 'compute', 'matrix', 'graph', 'tree', 'cache', 'memoize', 'hash', 'crypto'], category: 'algorithm' },
    { keywords: ['config', 'setting', 'env', 'option', 'preference', 'constant', 'define', 'preset', 'theme'], category: 'config' },
    { keywords: ['pattern', 'factory', 'singleton', 'observer', 'middleware', 'decorator', 'strategy', 'proxy', 'builder'], category: 'pattern' },
  ];
  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) return rule.category;
  }
  return 'other';
}

/** Generate one-line description from code */
function generateDescription(name: string, code: string): string {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const commentMatch = code.match(/\/\*\*?\s*(.+?)\*\//);
  if (commentMatch) return commentMatch[1].trim();
  const lineComment = code.match(/\/\/\s*(.+)/);
  if (lineComment && !firstLine.includes('import')) return lineComment[1].trim();
  return `${name} — extracted code block`;
}

/** Get source project name from file path */
function getSourceProject(filePath: string): string {
  const parts = filePath.split('/');
  // Find common project root indicators
  for (let i = parts.length - 2; i >= 0; i--) {
    if (['src', 'lib', 'app', 'packages'].includes(parts[i])) {
      return parts[i - 1] || parts[i];
    }
  }
  return parts[parts.length - 2] || 'unknown';
}

// [SCOPE] Main entry — extract all blocks from a file and apply quality filters
export function extractFromFile(filePath: string, content: string): { items: VaultItem[]; filteredCount: number } {
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();
  let rawBlocks: ExtractedBlock[] = [];
  switch (ext) {
    case '.ts': case '.tsx': case '.js': case '.jsx': rawBlocks = extractTSJS(lines, filePath); break;
    case '.py': rawBlocks = extractPython(lines, filePath); break;
    case '.md': rawBlocks = extractMarkdown(lines, filePath); break;
    case '.html': case '.htm': case '.css': case '.svg':
      // Whole-file capture — these can't be parsed for functions, save entire file as one block
      if (content.trim().length > 50) {
        rawBlocks = [{ name: path.basename(filePath, ext), type: 'component', code: content, lines: [1, lines.length], filePath, language: ext.replace('.', '') }];
      }
      break;
    default: rawBlocks = [];
  }

  const items: VaultItem[] = [];
  let filteredCount = 0;
  const seenHashes = new Set<string>();
  const sourceProject = getSourceProject(filePath);

  for (const block of rawBlocks) {
    const quality = shouldSkipBlock(block, filePath);
    if (quality.skip) { filteredCount++; continue; }
    const contentHash = computeContentHash(block.code);
    if (seenHashes.has(contentHash)) { filteredCount++; continue; }
    seenHashes.add(contentHash);

    const category = suggestCategory(block.name, block.code);
    const lineCount = block.lines[1] - block.lines[0] + 1;

    items.push({
      id: contentHash.substring(0, 16),
      name: block.name,
      code: block.code,
      language: detectLanguage(ext),
      category,
      description: generateDescription(block.name, block.code),
      sourceProject,
      sourceFile: filePath,
      tags: inferTags(filePath, block),
      lineCount,
      importCount: 0,
      createdAt: new Date().toISOString(),
      contentHash,
    });
  }
  return { items, filteredCount };
}
