// [SCOPE] Test Output Parsers (Cargo/Go/Generic) + chat formatter
// Extracted from testOutputParsers.ts

import * as path from 'path';
import { TestResult, TestFailure } from './testExecutionService.js';

export function parseCargoOutput(output: string, duration: number): TestResult {
  // Pattern: "test result: ok. X passed; Y failed"
  const match = output.match(/test result:\s*(ok|FAILED)\.\s*(\d+)\s*passed;\s*(\d+)\s*failed/);
  
  let passedTests = 0;
  let failedTests = 0;
  
  if (match) {
    passedTests = parseInt(match[2]) || 0;
    failedTests = parseInt(match[3]) || 0;
  }
  
  const totalTests = passedTests + failedTests;
  
  // Parse failure details
  const failures: TestFailure[] = [];
  const lines = output.split('\n');
  let inFailure = false;
  let currentFailure: Partial<TestFailure> | null = null;
  
  for (const line of lines) {
    // Failure start: "---- test_name stdout ----"
    const failStart = line.match(/^----\s*(.+?)\s*stdout\s*----/);
    if (failStart) {
      if (currentFailure) {
        failures.push(currentFailure as TestFailure);
      }
      currentFailure = { testName: failStart[1] };
      inFailure = true;
    }
    
    // End of failure section
    if (line.match(/^failures:/)) {
      inFailure = false;
    }
    
    // Capture failure output
    if (inFailure && currentFailure && line.trim()) {
      if (!currentFailure.message) currentFailure.message = '';
      currentFailure.message += line + '\n';
    }
  }
  
  if (currentFailure) {
    failures.push(currentFailure as TestFailure);
  }
  
  return {
    passed: failedTests === 0,
    summary: `Tests: ${passedTests} passed, ${failedTests} failed`,
    totalTests,
    passedTests,
    failedTests,
    failures,
    duration,
    rawOutput: output,
  };
}

/**
 * Parse Go test output
 */
export function parseGoOutput(output: string, duration: number): TestResult {
  // Pattern: "PASS" or "FAIL"
  const passed = output.includes('PASS') && !output.includes('FAIL');
  
  // Count tests: "--- PASS: TestName (0.00s)"
  const passMatches = output.match(/---\s*PASS:\s*(\w+)/g) || [];
  const failMatches = output.match(/---\s*FAIL:\s*(\w+)/g) || [];
  
  const passedTests = passMatches.length;
  const failedTests = failMatches.length;
  const totalTests = passedTests + failedTests;
  
  // Parse failures
  const failures: TestFailure[] = [];
  const lines = output.split('\n');
  let currentFailure: Partial<TestFailure> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Failure line: "--- FAIL: TestName (0.00s)"
    const failMatch = line.match(/---\s*FAIL:\s*(\w+)/);
    if (failMatch) {
      if (currentFailure) {
        failures.push(currentFailure as TestFailure);
      }
      currentFailure = { testName: failMatch[1] };
    }
    
    // File reference: "    file_test.go:42: error message"
    const fileMatch = line.match(/^\s*(\S+_test\.go):(\d+):\s*(.+)/);
    if (fileMatch && currentFailure) {
      currentFailure.filePath = fileMatch[1];
      currentFailure.lineNumber = parseInt(fileMatch[2]);
      currentFailure.message = fileMatch[3];
    }
  }
  
  if (currentFailure) {
    failures.push(currentFailure as TestFailure);
  }
  
  return {
    passed,
    summary: `Tests: ${passedTests} passed, ${failedTests} failed`,
    totalTests,
    passedTests,
    failedTests,
    failures,
    duration,
    rawOutput: output,
  };
}

/**
 * Generic parser for unknown frameworks
 */
export function parseGenericOutput(output: string, duration: number, passed = true): TestResult {
  // Try to find any pass/fail indicators
  const passCount = (output.match(/pass|passed/gi) || []).length;
  const failCount = (output.match(/fail|failed|error/gi) || []).length;
  
  return {
    passed: passed && failCount === 0,
    summary: 'Test execution complete',
    totalTests: passCount + failCount,
    passedTests: passCount,
    failedTests: failCount,
    failures: [],
    duration,
    rawOutput: output,
  };
}

/**
 * Format test results for chat display
 */
export function formatTestResultsForChat(result: TestResult, rootPath: string): string {
  const emoji = result.passed ? '✅' : '❌';
  const duration = (result.duration / 1000).toFixed(2);
  
  let output = `${emoji} **Test Results** (${duration}s)\n\n`;
  output += `📊 ${result.summary}\n`;
  output += `⏱️ Duration: ${duration}s\n\n`;
  
  if (result.failures.length > 0) {
    output += `**${result.failures.length} Failure${result.failures.length !== 1 ? 's' : ''}:**\n\n`;
    
    for (let i = 0; i < result.failures.length; i++) {
      const failure = result.failures[i];
      output += `${i + 1}. **${failure.testName}**\n`;
      
      if (failure.message) {
        output += `   📝 ${failure.message.substring(0, 200)}${failure.message.length > 200 ? '...' : ''}\n`;
      }
      
      if (failure.filePath && failure.lineNumber) {
        // Make clickable link
        const absPath = path.resolve(rootPath, failure.filePath);
        output += `   📍 [${failure.filePath}:${failure.lineNumber}](command:vscode.open?${encodeURIComponent(JSON.stringify([absPath, { selection: { start: { line: failure.lineNumber - 1, character: 0 } } }]))})\n`;
      }
      
      output += '\n';
    }
  }
  
  return output;
}
