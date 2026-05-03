// [SCOPE] Measure Twice, Cut Once — validates AI output before applying

import * as vscode from 'vscode';

interface ValidationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  codeRemoved: boolean;
  codeDuplicated: boolean;
  linesBefore: number;
  linesAfter: number;
  diff: string;
}

export class MeasureTwiceService {

  validate(originalContent: string, modifiedContent: string, filePath: string): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    const origLines = originalContent.split('\n');
    const modLines = modifiedContent.split('\n');

    // ── Pass 1: Syntax Check ──

    // check for empty/garbage output
    if (modifiedContent.trim().length < 10) {
      issues.push('AI returned empty or near-empty content');
    }

    // check for markdown fences left in (common AI mistake)
    if (modifiedContent.startsWith('```') || modifiedContent.includes('\n```\n')) {
      issues.push('AI output contains markdown code fences — likely not clean code');
    }

    // check for wrong comment style
    if (['py', 'sh', 'bash', 'yaml', 'yml', 'rb'].includes(ext)) {
      const jsComments = (modifiedContent.match(/^\/\//gm) || []).length;
      if (jsComments > 0) {
        issues.push('Found ' + jsComments + ' lines with // comments in a ' + ext + ' file — wrong syntax');
      }
    }
    if (['js', 'jsx', 'ts', 'tsx', 'java', 'c', 'cpp', 'cs'].includes(ext)) {
      // check for # comments that arent preprocessor directives
      const pyComments = (modifiedContent.match(/^\s*#(?!include|define|ifdef|ifndef|endif|pragma|!)/gm) || []).length;
      if (pyComments > 3) {
        warnings.push('Found ' + pyComments + ' lines with # comments in a ' + ext + ' file — possibly wrong syntax');
      }
    }

    // check matching brackets/parens/braces
    if (['js', 'jsx', 'ts', 'tsx', 'java', 'c', 'cpp', 'cs', 'py'].includes(ext)) {
      const brackets = this.countBrackets(modifiedContent);
      if (brackets.parens !== 0) {
        warnings.push('Unmatched parentheses: ' + (brackets.parens > 0 ? brackets.parens + ' unclosed' : Math.abs(brackets.parens) + ' extra closing'));
      }
      if (brackets.braces !== 0 && ext !== 'py') {
        warnings.push('Unmatched braces: ' + (brackets.braces > 0 ? brackets.braces + ' unclosed' : Math.abs(brackets.braces) + ' extra closing'));
      }
      if (brackets.squares !== 0) {
        warnings.push('Unmatched brackets: ' + (brackets.squares > 0 ? brackets.squares + ' unclosed' : Math.abs(brackets.squares) + ' extra closing'));
      }
    }

    // ── Pass 2: Logic Check ──

    // check for significant code removal (more than 10% of lines gone)
    const codeRemoved = modLines.length < origLines.length * 0.85;
    if (codeRemoved) {
      issues.push('Significant code removed: ' + origLines.length + ' → ' + modLines.length + ' lines (' + Math.round((1 - modLines.length / origLines.length) * 100) + '% reduction)');
    }

    // check for duplication (file grew more than 30% from just adding comments)
    const codeDuplicated = modLines.length > origLines.length * 1.3;
    if (codeDuplicated) {
      warnings.push('File grew significantly: ' + origLines.length + ' → ' + modLines.length + ' lines (' + Math.round((modLines.length / origLines.length - 1) * 100) + '% increase) — check for duplicated code');
    }

    // check for double annotations
    const scopeCount = (modifiedContent.match(/\[SCOPE\]/g) || []).length;
    if (scopeCount > 3) {
      warnings.push('Multiple [SCOPE] tags found (' + scopeCount + ') — should usually be 1 per file');
    }

    // check that original code is preserved (sample key lines)
    const origCodeLines = origLines.filter(l => {
      const t = l.trim();
      return t.length > 20 && !t.startsWith('#') && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('<!--');
    });
    let missingLines = 0;
    // sample up to 20 lines
    const sample = origCodeLines.filter((_, i) => i % Math.max(1, Math.floor(origCodeLines.length / 20)) === 0);
    for (const line of sample) {
      if (!modifiedContent.includes(line.trim())) {
        missingLines++;
      }
    }
    if (missingLines > sample.length * 0.2) {
      issues.push('Original code may have been modified: ' + missingLines + '/' + sample.length + ' sampled code lines are missing or changed');
    }

    // generate simple diff summary
    const added = modLines.length - origLines.length;
    const diff = added >= 0
      ? '+' + added + ' lines added (annotations)'
      : Math.abs(added) + ' lines removed ⚠️';

    return {
      passed: issues.length === 0,
      issues,
      warnings,
      codeRemoved,
      codeDuplicated,
      linesBefore: origLines.length,
      linesAfter: modLines.length,
      diff,
    };
  }

  formatReport(result: ValidationResult, filePath: string): string {
    let report = '## Measure Twice — ' + filePath + '\n\n';

    if (result.passed) {
      report += '✅ **PASSED** — Safe to apply\n\n';
    } else {
      report += '❌ **FAILED** — Do NOT apply without review\n\n';
    }

    report += '**Lines:** ' + result.linesBefore + ' → ' + result.linesAfter + ' (' + result.diff + ')\n\n';

    if (result.issues.length > 0) {
      report += '### ❌ Issues (blocking)\n\n';
      for (const i of result.issues) {
        report += '- ' + i + '\n';
      }
      report += '\n';
    }

    if (result.warnings.length > 0) {
      report += '### ⚠️ Warnings\n\n';
      for (const w of result.warnings) {
        report += '- ' + w + '\n';
      }
      report += '\n';
    }

    if (result.issues.length === 0 && result.warnings.length === 0) {
      report += '✅ No issues found. Code integrity verified.\n';
    }

    return report;
  }

  private countBrackets(content: string): { parens: number; braces: number; squares: number } {
    let parens = 0, braces = 0, squares = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      const prev = i > 0 ? content[i-1] : '';

      if (inString) {
        if (ch === stringChar && prev !== '\\') { inString = false; }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true; stringChar = ch; continue;
      }

      if (ch === '(') parens++;
      else if (ch === ')') parens--;
      else if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') squares++;
      else if (ch === ']') squares--;
    }

    return { parens, braces, squares };
  }
}
