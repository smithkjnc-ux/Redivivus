// [SCOPE] Phase Inspector Service — quality gates between build phases
// Like engine testing before installation: verify, test, validate before proceeding

import * as fs from 'fs';
import * as path from 'path';
import type { RoutingService } from '../../../../features/ai/data/routingService.js';

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

import { checkSyntax, detectDeadCode, detectPlaceholders, checkBlueprintAlignment, checkForwardCompatibility, runTest, generateSmokeTests } from './phaseInspectorChecks.js';
