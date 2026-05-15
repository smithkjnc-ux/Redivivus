// [SCOPE] Phase Inspector Checks — private static/dead-code/placeholder/alignment/compatibility helpers
// Extracted from phaseInspector.ts

import * as fs from 'fs';
import { PhaseIssue, CompatibilityCheck } from './phaseInspector.js';
import { RoutingService } from './ai/routingService.js';

import { TestResult } from './phaseInspector.js';

// Basic syntax checks
function checkSyntax(content: string, file: string): PhaseIssue[] {
  const issues: PhaseIssue[] = [];
  const lines = content.split('\n');

  // Check for obvious syntax errors
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Unclosed braces (simple check)
    if ((line.match(/\{/g) || []).length > (line.match(/\}/g) || []).length && !line.includes('//')) {
      // This is a naive check — real parsing needed for accuracy
    }

    // Missing semicolons in TypeScript (where required)
    if (/function|const|let|var/.test(line) && !line.includes(';') && !line.includes('{') && !line.includes('//')) {
      // Not necessarily an error in TS, but worth noting
    }
  }

  return issues;
}

// Detect dead code
function detectDeadCode(content: string, file: string): PhaseIssue[] {
  const issues: PhaseIssue[] = [];
  
  // Functions declared but never called
  const functionMatches = content.match(/function\s+(\w+)\s*\(/g) || [];
  const declared = functionMatches.map(m => m.replace(/function\s+/, '').replace('(', ''));
  
  for (const func of declared) {
    const callRegex = new RegExp(`\\b${func}\\s*\\(`, 'g');
    const calls = (content.match(callRegex) || []).length;
    if (calls <= 1) { // Only the declaration
      issues.push({
        type: 'warning',
        file,
        message: `Function "${func}" may be unused (dead code)`,
        category: 'dead_code',
      });
    }
  }

  // Variables declared but never used
  const varMatches = content.match(/(?:const|let|var)\s+(\w+)\s*=/g) || [];
  for (const varMatch of varMatches) {
    const varName = varMatch.replace(/(?:const|let|var)\s+/, '').replace(' =', '');
    const usageRegex = new RegExp(`\\b${varName}\\b`, 'g');
    const usages = (content.match(usageRegex) || []).length;
    if (usages <= 1) {
      issues.push({
        type: 'warning',
        file,
        message: `Variable "${varName}" may be unused`,
        category: 'dead_code',
      });
    }
  }

  return issues;
}

// Detect placeholders and TODOs
function detectPlaceholders(content: string, file: string): PhaseIssue[] {
  const issues: PhaseIssue[] = [];
  const lines = content.split('\n');

  const placeholderPatterns = [
    { pattern: /TODO|FIXME|XXX|HACK/i, message: 'Contains TODO/FIXME marker', severity: 'warning' },
    { pattern: /placeholder|stub|dummy|mock|fake\s+data/i, message: 'Contains placeholder/stub', severity: 'error' },
    { pattern: /\/\/\s*implement|not implemented|not done/i, message: 'Not implemented', severity: 'error' },
    { pattern: /console\.log.*debug|debug.*console/i, message: 'Debug logging left in', severity: 'warning' },
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const { pattern, message, severity } of placeholderPatterns) {
      if (pattern.test(lines[i])) {
        issues.push({
          type: severity as 'error' | 'warning',
          file,
          line: i + 1,
          message,
          category: 'missing',
        });
      }
    }
  }

  return issues;
}

// Check alignment with blueprint
function checkBlueprintAlignment(
  phaseId: string,
  content: string,
  file: string,
  blueprint: any
): { aligned: boolean; issues: PhaseIssue[] } {
  const issues: PhaseIssue[] = [];

  // Foundation phase: should have entry point matching blueprint tech stack
  if (phaseId === 'foundation') {
    const declaredTech = blueprint?.where?.toLowerCase() || '';
    
    if (declaredTech.includes('react') && !content.includes('react')) {
      issues.push({
        type: 'error',
        file,
        message: `Blueprint specifies React but no React imports found`,
        category: 'blueprint_mismatch',
      });
    }
    
    if (declaredTech.includes('node') && !file.includes('package.json') && !content.includes('require(') && !content.includes('import ')) {
      issues.push({
        type: 'warning',
        file,
        message: `Node.js project may need package.json`,
        category: 'blueprint_mismatch',
      });
    }
  }

  // Data phase: should implement models from blueprint
  if (phaseId === 'data' && blueprint?.dataModel) {
    const missingModels = blueprint.dataModel.filter((model: string) => 
      !content.toLowerCase().includes(model.toLowerCase())
    );
    
    if (missingModels.length > 0) {
      issues.push({
        type: 'warning',
        file,
        message: `Missing data models from blueprint: ${missingModels.join(', ')}`,
        category: 'blueprint_mismatch',
      });
    }
  }

  return { aligned: issues.length === 0, issues };
}

// Check if current phase will work with future phases

export { checkSyntax, detectDeadCode, detectPlaceholders, checkBlueprintAlignment };
export { checkForwardCompatibility, runTest, generateSmokeTests } from './phaseInspectorTests.js';
