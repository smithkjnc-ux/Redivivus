// [SCOPE] Vault code extraction — Python, Markdown, and category helpers
import * as path from 'path';
import { ExtractedBlock, VaultCategory } from './vaultTypes.js';
import { isVaultWorthy } from './vaultExtractorQuality.js';

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
    const fnMatch = lines[i].match(/^(def\s+(\w+)\s*\()/);
    if (fnMatch) {
      const end = extractIndentBlock(i);
      if (end > i) { blocks.push({ filePath, name: fnMatch[2], type: 'function', code: lines.slice(i, end).join('\n'), language: 'python', lines: [i + 1, end] }); }
    }
    const classMatch = lines[i].match(/^(class\s+(\w+))/);
    if (classMatch) {
      const end = extractIndentBlock(i);
      if (end > i) { blocks.push({ filePath, name: classMatch[2], type: 'class', code: lines.slice(i, end).join('\n'), language: 'python', lines: [i + 1, end] }); }
    }
  }
  return blocks.filter(b => isVaultWorthy(b.code, b.name, filePath));
}

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

export function generateDescription(name: string, code: string): string {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const commentMatch = code.match(/\/\*\*?\s*(.+?)\*\//);
  if (commentMatch) return commentMatch[1].trim();
  const lineComment = code.match(/\/\/\s*(.+)/);
  if (lineComment && !firstLine.includes('import')) return lineComment[1].trim();
  return `${name} — extracted code block`;
}

export function getSourceProject(filePath: string): string {
  const parts = filePath.split('/');
  for (let i = parts.length - 2; i >= 0; i--) {
    if (['src', 'lib', 'app', 'packages'].includes(parts[i])) {
      return parts[i - 1] || parts[i];
    }
  }
  return parts[parts.length - 2] || 'unknown';
}
