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
    // [WARN] Regex-based parsing can miss complex arrow functions and decorated exports
    const fnMatch = line.match(/^(export\s+)?(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/);
    if (fnMatch) {
      const name = line.match(/function\s+(\w+)/)?.[1] || line.match(/(?:const|let|var)\s+(\w+)/)?.[1] || 'unnamed';
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'function', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
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
  return blocks;
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
  return blocks;
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

// [SCOPE] Main entry — extract all blocks from a file and apply quality filters
export function extractFromFile(filePath: string, content: string): { items: VaultItem[]; filteredCount: number } {
  const lines = content.split('\n');
  const ext = path.extname(filePath).toLowerCase();
  let rawBlocks: ExtractedBlock[] = [];
  switch (ext) {
    case '.ts': case '.tsx': case '.js': case '.jsx': rawBlocks = extractTSJS(lines, filePath); break;
    case '.py': rawBlocks = extractPython(lines, filePath); break;
    case '.md': rawBlocks = extractMarkdown(lines, filePath); break;
    default: rawBlocks = [];
  }

  const items: VaultItem[] = [];
  let filteredCount = 0;
  const seenHashes = new Set<string>();

  for (const block of rawBlocks) {
    const quality = shouldSkipBlock(block, filePath);
    if (quality.skip) { filteredCount++; continue; }
    const contentHash = computeContentHash(block.code);
    if (seenHashes.has(contentHash)) { filteredCount++; continue; }
    seenHashes.add(contentHash);
    items.push({ id: generateId(filePath, block.name, block.type), block, tags: inferTags(filePath, block), contentHash });
  }
  return { items, filteredCount };
}
