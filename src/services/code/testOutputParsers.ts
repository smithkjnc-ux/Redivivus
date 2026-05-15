// [SCOPE] Test Output Parsers — parse Jest/Vitest/Pytest/Cargo/Go/generic test output
// Extracted from testExecutionService.ts

import * as path from 'path';
import { TestResult, TestFailure } from './testExecutionService.js';

export function parseJestOutput(output: string, duration: number): TestResult {
  const lines = output.split('\n');
  const failures: TestFailure[] = [];
  let currentFailure: Partial<TestFailure> | null = null;
  
  // Pattern: Test Suites: X passed, Y failed
  const summaryMatch = output.match(/Test Suites:\s*(\d+)\s*passed,?\s*(\d+)\s*failed/);
  const testMatch = output.match(/Tests:\s*(\d+)\s*passed,?\s*(\d+)\s*failed,?\s*(\d+)?\s*skipped/);
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  if (testMatch) {
    passedTests = parseInt(testMatch[1]) || 0;
    failedTests = parseInt(testMatch[2]) || 0;
    totalTests = passedTests + failedTests + (parseInt(testMatch[3]) || 0);
  } else if (summaryMatch) {
    // Fallback to suite counts
    passedTests = parseInt(summaryMatch[1]) || 0;
    failedTests = parseInt(summaryMatch[2]) || 0;
    totalTests = passedTests + failedTests;
  }
  
  // Parse individual failures
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Failure header: "  ✕ Component renders (5ms)"
    const failMatch = line.match(/^\s*[✕×]\s+(.+?)\s*(?:\(\d+ms\))?$/);
    if (failMatch) {
      if (currentFailure) {
        failures.push(currentFailure as TestFailure);
      }
      currentFailure = { testName: failMatch[1] };
    }
    
    // Stack trace line: "    at functionName (path/to/file:line:col)"
    const stackMatch = line.match(/^\s+at\s+.+?\s*\((.+?):(\d+):(\d+)\)/);
    if (stackMatch && currentFailure) {
      currentFailure.filePath = stackMatch[1];
      currentFailure.lineNumber = parseInt(stackMatch[2]);
      currentFailure.columnNumber = parseInt(stackMatch[3]);
      
      // Build stack trace
      if (!currentFailure.stackTrace) {
        currentFailure.stackTrace = '';
      }
      currentFailure.stackTrace += line + '\n';
    }
    
    // Error message: "    Error: expected X but got Y"
    const errorMatch = line.match(/^\s+(Error:|expect\(|AssertionError).+/);
    if (errorMatch && currentFailure) {
      currentFailure.message = line.trim();
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
 * Parse Pytest output
 */
export function parsePytestOutput(output: string, duration: number): TestResult {
  // Pattern: "X passed, Y failed, Z skipped"
  const match = output.match(/(\d+)\s*passed,?\s*(\d+)\s*failed,?\s*(\d+)?\s*(?:skipped|error)?/);
  
  let passedTests = 0;
  let failedTests = 0;
  
  if (match) {
    passedTests = parseInt(match[1]) || 0;
    failedTests = parseInt(match[2]) || 0;
  }
  
  const totalTests = passedTests + failedTests;
  
  // Parse failures from output
  const failures: TestFailure[] = [];
  const lines = output.split('\n');
  let currentFailure: Partial<TestFailure> | null = null;
  
  for (const line of lines) {
    // Failure header: "FAILED test_file.py::test_name - message"
    const failMatch = line.match(/^FAILED\s+(\S+)::(\S+)\s*-?\s*(.*)/);
    if (failMatch) {
      if (currentFailure) {
        failures.push(currentFailure as TestFailure);
      }
      currentFailure = {
        testName: failMatch[2],
        filePath: failMatch[1],
        message: failMatch[3],
      };
    }
    
    // Stack trace file reference
    const stackMatch = line.match(/^\s*File\s+"(.+?)",\s*line\s*(\d+)/);
    if (stackMatch && currentFailure) {
      currentFailure.filePath = stackMatch[1];
      currentFailure.lineNumber = parseInt(stackMatch[2]);
      if (!currentFailure.stackTrace) currentFailure.stackTrace = '';
      currentFailure.stackTrace += line + '\n';
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
 * Parse Cargo test output
 */

export { parseCargoOutput, parseGoOutput, parseGenericOutput, formatTestResultsForChat } from './testOutputParsersExt.js';
