// [SCOPE] CHASSIS Test Utility - Mocha Global Hooks for Log Dumping
import * as fs from 'fs';
import * as path from 'path';

export const mochaHooks = {
  async afterEach(this: any) {
    if (this.currentTest && this.currentTest.state === 'failed') {
      // Wait for masterLogger to flush its 50ms buffer
      await new Promise(resolve => setTimeout(resolve, 60));

      const testFile = this.currentTest.file || '';
      let targetDomain = 'UNKNOWN';
      
      // Infer domain from test file path
      if (testFile.includes('/core/ai/')) {targetDomain = 'AI';}
      else if (testFile.includes('/core/build/')) {targetDomain = 'BUILD';}
      else if (testFile.includes('/ui/panels/chat/')) {targetDomain = 'CHAT';}

      const logsDir = path.join(process.cwd(), '.chassis', 'logs', 'master');
      if (!fs.existsSync(logsDir)) {return;}

      const files = fs.readdirSync(logsDir)
        .filter(f => f.startsWith('chassis-master-') && f.endsWith('.log'))
        .sort()
        .reverse();
      
      if (files.length === 0) {return;}
      const latestLog = path.join(logsDir, files[0]);
      
      try {
        const logContent = fs.readFileSync(latestLog, 'utf-8');
        const lines = logContent.split('\n');
        const domainLines = lines.filter(l => l.includes(`[${targetDomain}]`));
        
        process.stdout.write(`\n================= TEST FAILED =================\n`);
        process.stdout.write(`Test: ${this.currentTest.title}\n`);
        process.stdout.write(`Target Domain: ${targetDomain}\n`);
        process.stdout.write(`\n--- ${targetDomain} Domain Logs (Current Session) ---\n`);
        process.stdout.write(domainLines.join('\n') + '\n');
        process.stdout.write(`===============================================\n\n`);
      } catch (e) {
        process.stderr.write(`Failed to dump logs: ${e}\n`);
      }
    }
  }
};
