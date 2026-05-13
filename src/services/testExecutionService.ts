// [SCOPE] Test Execution Service — Run tests and parse results for chat display
// Detects test framework, executes tests, formats output with clickable stack traces

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface TestFramework {
  name: string;
  command: string;
  detectFile: string;
}

export interface TestResult {
  passed: boolean;
  summary: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  failures: TestFailure[];
  duration: number;
  rawOutput: string;
}

export interface TestFailure {
  testName: string;
  message: string;
  filePath?: string;
  lineNumber?: number;
  columnNumber?: number;
  stackTrace?: string;
}

// Known test frameworks and their detection patterns
const TEST_FRAMEWORKS: TestFramework[] = [
  { name: 'jest', command: 'npm test', detectFile: 'package.json' },
  { name: 'vitest', command: 'npm run test', detectFile: 'package.json' },
  { name: 'mocha', command: 'npm test', detectFile: 'package.json' },
  { name: 'pytest', command: 'pytest', detectFile: 'requirements.txt' },
  { name: 'unittest', command: 'python -m unittest discover', detectFile: 'requirements.txt' },
  { name: 'cargo', command: 'cargo test', detectFile: 'Cargo.toml' },
  { name: 'go', command: 'go test ./...', detectFile: 'go.mod' },
  { name: 'dotnet', command: 'dotnet test', detectFile: '.csproj' },
  { name: 'gradle', command: './gradlew test', detectFile: 'build.gradle' },
  { name: 'maven', command: 'mvn test', detectFile: 'pom.xml' },
];

/**
 * Detect which test framework is being used in the project
 */
export async function detectTestFramework(rootPath: string): Promise<TestFramework | null> {
  for (const framework of TEST_FRAMEWORKS) {
    const detectPath = path.join(rootPath, framework.detectFile);
    if (fs.existsSync(detectPath)) {
      // For package.json, check if it has a test script
      if (framework.detectFile === 'package.json') {
        const pkg = JSON.parse(fs.readFileSync(detectPath, 'utf8'));
        if (pkg.scripts?.test) {
          // Check for specific test runner in dependencies
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          if (framework.name === 'jest' && deps.jest) return framework;
          if (framework.name === 'vitest' && deps.vitest) return framework;
          if (framework.name === 'mocha' && deps.mocha) return framework;
          // Default to jest if test script exists
          if (framework.name === 'jest') return framework;
        }
      } else {
        return framework;
      }
    }
  }
  return null;
}

/**
 * Run tests using the detected framework
 */
export async function runTests(
  rootPath: string,
  framework: TestFramework
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const { stdout, stderr } = await execAsync(framework.command, {
      cwd: rootPath,
      timeout: 120000, // 2 minute timeout
      env: { ...process.env, CI: 'true' }, // CI mode for cleaner output
    });
    
    const output = stdout + stderr;
    const duration = Date.now() - startTime;
    
    // Parse based on framework
    switch (framework.name) {
      case 'jest':
      case 'vitest':
        return parseJestOutput(output, duration);
      case 'pytest':
        return parsePytestOutput(output, duration);
      case 'cargo':
        return parseCargoOutput(output, duration);
      case 'go':
        return parseGoOutput(output, duration);
      default:
        return parseGenericOutput(output, duration);
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const output = error.stdout + error.stderr || error.message;
    
    // Tests failed but we still got output
    switch (framework.name) {
      case 'jest':
      case 'vitest':
        return parseJestOutput(output, duration);
      case 'pytest':
        return parsePytestOutput(output, duration);
      case 'cargo':
        return parseCargoOutput(output, duration);
      case 'go':
        return parseGoOutput(output, duration);
      default:
        return parseGenericOutput(output, duration, false);
    }
  }
}

/**
 * Parse Jest/Vitest output
 */
function parseJestOutput(output: string, duration: number): TestResult {
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
function parsePytestOutput(output: string, duration: number): TestResult {
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
function parseCargoOutput(output: string, duration: number): TestResult {
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
function parseGoOutput(output: string, duration: number): TestResult {
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
function parseGenericOutput(output: string, duration: number, passed = true): TestResult {
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
