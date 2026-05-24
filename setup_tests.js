const fs = require('fs');
const path = require('path');

const dirs = [
  'src/tests',
  'src/tests/__mocks__',
  'src/tests/__baselines__',
  'src/tests/utils',
  'src/tests/core/ai',
  'src/tests/core/build',
  'src/tests/ui/panels/chat'
];

dirs.forEach(d => fs.mkdirSync(path.join(process.cwd(), d), { recursive: true }));

const baselineTs = `// [SCOPE] CHASSIS Test Utility - Strict Baseline Validation
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

const baselinesDir = path.join(__dirname, '..', '__baselines__');

export function assertMatchesBaseline(testName: string, actualOutput: unknown): void {
  const safeName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const baselinePath = path.join(baselinesDir, \`\${safeName}.json\`);
  const actualStr = JSON.stringify(actualOutput, null, 2);

  if (!fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, actualStr, 'utf-8');
    console.log(\`[BASELINE] Created new baseline for \${testName}\`);
    return; // Pass on first run
  }

  const expectedStr = fs.readFileSync(baselinePath, 'utf-8');
  assert.strictEqual(actualStr, expectedStr, \`Output diverges from baseline for \${testName}\`);
}
`;

const logDumperTs = `// [SCOPE] CHASSIS Test Utility - Mocha Global Hooks for Log Dumping
import * as fs from 'fs';
import * as path from 'path';

export const mochaHooks = {
  afterEach(this: any) {
    if (this.currentTest && this.currentTest.state === 'failed') {
      const testFile = this.currentTest.file || '';
      let targetDomain = 'UNKNOWN';
      
      // Infer domain from test file path
      if (testFile.includes('/core/ai/')) targetDomain = 'AI';
      else if (testFile.includes('/core/build/')) targetDomain = 'BUILD';
      else if (testFile.includes('/ui/panels/chat/')) targetDomain = 'CHAT';

      const logsDir = path.join(process.cwd(), '.chassis', 'logs', 'master');
      if (!fs.existsSync(logsDir)) return;

      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('chassis-master-') && f.endsWith('.log'))
        .sort()
        .reverse();
      
      if (files.length === 0) return;
      const latestLog = path.join(logsDir, files[0]);
      
      try {
        const logContent = fs.readFileSync(latestLog, 'utf-8');
        const lines = logContent.split('\\n');
        const domainLines = lines.filter(l => l.includes(\`[\${targetDomain}]\`));
        
        console.error(\`\\n================= TEST FAILED =================\`);
        console.error(\`Test: \${this.currentTest.title}\`);
        console.error(\`Target Domain: \${targetDomain}\`);
        console.error(\`\\n--- \${targetDomain} Domain Logs (Current Session) ---\`);
        console.error(domainLines.join('\\n'));
        console.error(\`===============================================\\n\`);
      } catch (e) {
        console.error('Failed to dump logs:', e);
      }
    }
  }
};
`;

const nockMockTs = `// [SCOPE] CHASSIS Test Utility - HTTP Interceptor Setup using Nock
import * as fs from 'fs';
import * as path from 'path';
import nock from 'nock';

const mocksDir = path.join(__dirname, '..', '__mocks__');

export function setupNockMock(domain: string, endpoint: string, responseFixtureName: string): void {
  const fixturePath = path.join(mocksDir, \`\${domain}_\${responseFixtureName}.json\`);
  
  if (!fs.existsSync(fixturePath)) {
    // Create a dummy fixture if it doesn't exist so developers know the structure
    fs.writeFileSync(fixturePath, JSON.stringify({ mocked: true, message: "Add real mock here" }, null, 2), 'utf-8');
  }

  const responseData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Assuming Google Gemini endpoint format since CHASSIS uses Gemini
  nock('https://generativelanguage.googleapis.com')
    .post(endpoint)
    .reply(200, responseData);
}

export function cleanNockMocks(): void {
  nock.cleanAll();
}
`;

const sampleTest = `// [SCOPE] Unit Test for Routing Complexity (Example)
import * as assert from 'assert';
import { assertMatchesBaseline } from '../../utils/baseline.js';

suite('Core AI Routing Unit Tests', () => {
  test('should return correct complexity score for dummy input', () => {
    // This is a dummy unit test to prove baseline validation works
    const fakeRoutingResult = { complexity: 'low', model: 'gemini-1.5-flash', route: 'OBD1' };
    
    assertMatchesBaseline('routing_complexity_low', fakeRoutingResult);
  });
  
  test('should fail and trigger log dump (Uncomment to test log dump)', () => {
    // To see logDumper in action, uncomment the next line
    // assert.strictEqual(1, 2);
  });
});
`;

fs.writeFileSync(path.join(process.cwd(), 'src/tests/utils/baseline.ts'), baselineTs, 'utf8');
fs.writeFileSync(path.join(process.cwd(), 'src/tests/utils/logDumper.ts'), logDumperTs, 'utf8');
fs.writeFileSync(path.join(process.cwd(), 'src/tests/utils/nockHelper.ts'), nockMockTs, 'utf8');
fs.writeFileSync(path.join(process.cwd(), 'src/tests/core/ai/routing.test.ts'), sampleTest, 'utf8');

console.log('Testing infrastructure created successfully.');
