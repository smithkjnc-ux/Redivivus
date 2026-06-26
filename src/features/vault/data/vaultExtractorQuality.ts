// [SCOPE] Vault code extraction — quality filters
import type { ExtractedBlock } from './vaultTypes.js';

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

export function isVaultWorthy(code: string, name: string, filePath: string): boolean {
  const trimmed = code.trim();
  const lines = trimmed.split('\n').filter(l => l.trim());

  if (/\.(test|spec)\.[tj]sx?$/.test(filePath) || /__tests__/.test(filePath)) { return false; }
  if (lines.length === 1 && trimmed.length > 300 && !trimmed.includes('\n')) { return false; }
  if (lines.length < 3) { return false; }
  if (trimmed.length < 80) { return false; }

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

  const genericNames = ['fn', 'func', 'callback', 'cb', 'tmp', 'temp', 'handler', 'onClick', 'onChange'];
  if (genericNames.includes(name) && lines.length < 8) { return false; }

  const hasLogic = /\b(if|else|for|while|switch|try|catch|async|await|map|filter|reduce|\.then\b)/.test(trimmed);
  const hasSubstantialCalls = /[.;]\w+\s*\([^)]*\)/.test(trimmed);
  const hasAssignments = /\b(const|let|var)\s+\w+/.test(trimmed);
  const score = (hasLogic ? 1 : 0) + (hasSubstantialCalls ? 1 : 0) + (hasAssignments ? 1 : 0);
  if (score < 2) { return false; }

  return true;
}
