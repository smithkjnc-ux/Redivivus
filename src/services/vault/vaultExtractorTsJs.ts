// [SCOPE] Vault code extraction — TypeScript/JavaScript block extraction
import * as path from 'path';
import { ExtractedBlock } from './vaultTypes.js';
import { detectLanguage } from './vaultExtractor.js';
import { isVaultWorthy } from './vaultExtractorQuality.js';

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
    const fnRegex = /^(export\s+(default\s+)?)?(async\s+)?function\s+\w+/;
    const constRegex = /^(export\s+)?(const|let|var)\s+\w+\s*[=:]/;
    const hookRegex = /^(export\s+)?(const|let|var)\s+use[A-Z]\w+\s*=/;
    const compRegex = /^(export\s+)?(const|let|var|function)\s+[A-Z][a-zA-Z0-9_]*\b/;
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
    const classMatch = line.match(/^(export\s+)?(abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[3];
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'class', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
    const ifaceMatch = line.match(/^(export\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      const name = ifaceMatch[2];
      const end = extractBraceBlock(i);
      if (end > i) { blocks.push({ filePath, name, type: 'interface', code: lines.slice(i, end).join('\n'), language, lines: [i + 1, end] }); }
    }
  }
  return blocks.filter(b => isVaultWorthy(b.code, b.name, filePath));
}
