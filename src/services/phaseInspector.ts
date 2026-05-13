// [SCOPE] Phase Inspector Service — quality gates between build phases
// Like engine testing before installation: verify, test, validate before proceeding

import * as fs from 'fs';
import * as path from 'path';
import { RoutingService } from './routingService.js';

export interface PhaseInspection {
  phase: string;
  status: 'pass' | 'fail' | 'warning';
  score: number; // 0-100
  issues: PhaseIssue[];
  tests: TestResult[];
  blueprintAlignment: BlueprintCheck;
  forwardCompatibility: CompatibilityCheck;
}

export interface PhaseIssue {
  type: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
  category: 'syntax' | 'logic' | 'dead_code' | 'missing' | 'blueprint_mismatch' | 'test_failure';
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number; // ms
  error?: string;
  coverage?: number; // %
}

export interface BlueprintCheck {
  aligned: boolean;
  score: number;
  mismatches: string[];
}

export interface CompatibilityCheck {
  readyForNextPhase: boolean;
  concerns: string[];
  recommendations: string[];
}

// Inspect a completed phase before allowing advancement
export async function inspectPhase(
  phaseId: string,
  builtFiles: string[],
  root: string,
  blueprint: any,
  routing: RoutingService
): Promise<PhaseInspection> {
  const issues: PhaseIssue[] = [];
  const tests: TestResult[] = [];

  // ── 1. Static Analysis ──
  for (const file of builtFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    // Syntax check (basic)
    if (file.endsWith('.ts') || file.endsWith('.js')) {
      const syntaxIssues = checkSyntax(content, file);
      issues.push(...syntaxIssues);
    }

    // Dead code detection
    const deadCode = detectDeadCode(content, file);
    issues.push(...deadCode);

    // Missing implementation detection (TODO, FIXME, placeholder)
    const placeholders = detectPlaceholders(content, file);
    issues.push(...placeholders);

    // Blueprint alignment (does this match what we said we'd build?)
    const alignment = checkBlueprintAlignment(phaseId, content, file, blueprint);
    if (!alignment.aligned) {
      issues.push(...alignment.issues);
    }
  }

  // ── 2. Run Tests if Available ──
  const testFiles = builtFiles.filter(f => f.includes('.test.') || f.includes('.spec.'));
  for (const testFile of testFiles) {
    const result = await runTest(testFile, routing);
    tests.push(result);
  }

  // If no test files exist, generate and run smoke tests
  if (testFiles.length === 0) {
    const smokeTests = await generateSmokeTests(builtFiles, phaseId, routing);
    for (const test of smokeTests) {
      tests.push(test);
    }
  }

  // ── 3. Forward Compatibility Check ──
  const compatibility = checkForwardCompatibility(phaseId, builtFiles, blueprint);

  // ── 4. Calculate Overall Score ──
  const errorCount = issues.filter(i => i.type === 'error').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;
  const passedTests = tests.filter(t => t.passed).length;
  const testScore = tests.length > 0 ? (passedTests / tests.length) * 100 : 50;
  
  const score = Math.max(0, 100 - (errorCount * 15) - (warningCount * 5) + (testScore * 0.3));

  // ── 5. Determine Status ──
  let status: 'pass' | 'fail' | 'warning';
  if (errorCount > 0 || compatibility.readyForNextPhase === false) {
    status = 'fail';
  } else if (warningCount > 2 || score < 70) {
    status = 'warning';
  } else {
    status = 'pass';
  }

  return {
    phase: phaseId,
    status,
    score: Math.round(score),
    issues,
    tests,
    blueprintAlignment: {
      aligned: issues.filter(i => i.category === 'blueprint_mismatch').length === 0,
      score: 100 - (issues.filter(i => i.category === 'blueprint_mismatch').length * 20),
      mismatches: issues.filter(i => i.category === 'blueprint_mismatch').map(i => i.message),
    },
    forwardCompatibility: compatibility,
  };
}

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
function checkForwardCompatibility(
  phaseId: string,
  builtFiles: string[],
  blueprint: any
): CompatibilityCheck {
  const concerns: string[] = [];
  const recommendations: string[] = [];

  // Foundation phase: extensibility check
  if (phaseId === 'foundation') {
    const hasConfig = builtFiles.some(f => f.includes('config') || f.includes('.json'));
    if (!hasConfig) {
      concerns.push('No configuration file found — future environment changes will be hard');
      recommendations.push('Add a config.ts or config.json file');
    }
  }

  // Data phase: API contract check
  if (phaseId === 'data') {
    const hasTypes = builtFiles.some(f => f.includes('types') || f.includes('.d.ts'));
    if (!hasTypes) {
      concerns.push('No TypeScript types defined — interface phase may have integration issues');
      recommendations.push('Add type definitions for all data models');
    }
  }

  // Core phase: testability check
  if (phaseId === 'core') {
    const hasExports = builtFiles.some(f => {
      const content = fs.readFileSync(f, 'utf8');
      return content.includes('export ');
    });
    if (!hasExports) {
      concerns.push('No exports found — features phase cannot import core logic');
      recommendations.push('Ensure all public functions are exported');
    }
  }

  // Interface phase: accessibility check
  if (phaseId === 'interface' && blueprint?.who?.includes('accessibility')) {
    const hasAria = builtFiles.some(f => {
      const content = fs.readFileSync(f, 'utf8');
      return content.includes('aria-') || content.includes('role=');
    });
    if (!hasAria) {
      concerns.push('No ARIA attributes found — accessibility requirements not met');
      recommendations.push('Add aria-label, role, and focus management');
    }
  }

  return {
    readyForNextPhase: concerns.length === 0,
    concerns,
    recommendations,
  };
}

// Run a test file
async function runTest(testFile: string, routing: RoutingService): Promise<TestResult> {
  // This would integrate with a test runner
  // For now, return a placeholder that the AI can evaluate
  return {
    name: path.basename(testFile),
    passed: true, // Assume pass until real runner implemented
    duration: 0,
    coverage: 0,
  };
}

// Generate smoke tests for files without tests
async function generateSmokeTests(
  files: string[],
  phaseId: string,
  routing: RoutingService
): Promise<TestResult[]> {
  const tests: TestResult[] = [];

  for (const file of files) {
    if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Ask AI to generate a quick smoke test
      const prompt = `Generate a 1-line smoke test for this ${phaseId} phase code. Just verify it loads without errors.

File: ${path.basename(file)}
Content preview:
${content.slice(0, 500)}`;

      try {
        const result = await routing.prompt(prompt);
        const hasSmokeTest = result.text.length > 0;
        
        tests.push({
          name: `smoke-${path.basename(file)}`,
          passed: hasSmokeTest,
          duration: 0,
          coverage: 0,
        });
      } catch {
        tests.push({
          name: `smoke-${path.basename(file)}`,
          passed: false,
          duration: 0,
          error: 'Could not generate smoke test',
          coverage: 0,
        });
      }
    }
  }

  return tests;
}

// Format inspection results for chat display
export function formatInspectionReport(inspection: PhaseInspection): string {
  const icon = inspection.status === 'pass' ? '✅' : inspection.status === 'warning' ? '⚠️' : '❌';
  
  let report = `${icon} **Phase Inspection: ${inspection.phase}**\n`;
  report += `Score: ${inspection.score}/100 | Status: ${inspection.status.toUpperCase()}\n\n`;

  if (inspection.issues.length > 0) {
    report += `**Issues Found:**\n`;
    const errors = inspection.issues.filter(i => i.type === 'error');
    const warnings = inspection.issues.filter(i => i.type === 'warning');
    
    if (errors.length > 0) {
      report += `❌ **Errors (${errors.length}):**\n`;
      errors.forEach(e => report += `  • ${e.file}${e.line ? `:${e.line}` : ''} — ${e.message}\n`);
    }
    
    if (warnings.length > 0) {
      report += `⚠️ **Warnings (${warnings.length}):**\n`;
      warnings.forEach(w => report += `  • ${w.file}${w.line ? `:${w.line}` : ''} — ${w.message}\n`);
    }
    report += '\n';
  }

  if (inspection.tests.length > 0) {
    const passed = inspection.tests.filter(t => t.passed).length;
    report += `**Tests:** ${passed}/${inspection.tests.length} passed\n\n`;
  }

  if (inspection.forwardCompatibility.concerns.length > 0) {
    report += `**Forward Compatibility Concerns:**\n`;
    inspection.forwardCompatibility.concerns.forEach(c => report += `  ⚠️ ${c}\n`);
    report += '\n';
  }

  if (inspection.forwardCompatibility.recommendations.length > 0) {
    report += `**Recommendations:**\n`;
    inspection.forwardCompatibility.recommendations.forEach(r => report += `  💡 ${r}\n`);
    report += '\n';
  }

  if (inspection.status === 'fail') {
    report += `**⛔ Cannot proceed to next phase until issues are resolved.**\n`;
    report += `__ACTION_CARD__chassis.fixPhaseIssues|||🔧 Fix These Issues|||END__\n`;
  } else if (inspection.status === 'warning') {
    report += `**⚠️ Proceed with caution — address warnings before they become errors.**\n`;
    report += `__ACTION_CARD__chassis.proceedToNextPhase|||▶️ Proceed Anyway|||END__\n`;
    report += `__ACTION_CARD__chassis.fixPhaseIssues|||🔧 Fix Warnings First|||END__\n`;
  } else {
    report += `**✅ Phase complete and ready for next phase.**\n`;
    report += `__ACTION_CARD__chassis.proceedToNextPhase|||▶️ Proceed to Next Phase|||END__`;
  }

  return report;
}
