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
import { parseJestOutput, parsePytestOutput, parseCargoOutput, parseGoOutput, parseGenericOutput } from './testOutputParsers.js';
