import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'out');
const baselinesDir = path.join(projectRoot, 'src', 'tests', '__baselines__');
const metricsFile = path.join(baselinesDir, 'metrics.json');

// Helper to get total size of a directory recursively
function getDirectorySize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      size += getDirectorySize(fullPath);
    } else if (stats.isFile() && fullPath.endsWith('.js')) {
      size += stats.size;
    }
  }
  return size;
}

// 1. Check Bundle Size
console.log('\n================ QUALITY GATES ================');
console.log('[1/3] Checking bundle size...');
const currentSize = getDirectorySize(outDir);
let baselineSize = currentSize;

if (!fs.existsSync(baselinesDir)) {
  fs.mkdirSync(baselinesDir, { recursive: true });
}

if (fs.existsSync(metricsFile)) {
  try {
    const data = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    if (data.bundleSize) {
      baselineSize = data.bundleSize;
    }
  } catch (e) {
    console.error('Error reading metrics.json, creating new baseline.');
  }
} else {
  console.log(`Creating new baseline bundle size: ${currentSize} bytes`);
  fs.writeFileSync(metricsFile, JSON.stringify({ bundleSize: currentSize }, null, 2));
}

const diff = currentSize - baselineSize;
const percentChange = baselineSize === 0 ? 0 : (diff / baselineSize) * 100;

console.log(`Current size: ${currentSize} bytes`);
console.log(`Baseline size: ${baselineSize} bytes`);
console.log(`Change: ${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%`);

if (percentChange > 5) {
  console.error(`\n[FATAL] Bundle size grew by more than 5% (Growth: ${percentChange.toFixed(2)}%)!`);
  process.exit(1);
} else if (currentSize < baselineSize) {
  // Update baseline if it shrank!
  console.log('Bundle size shrank! Updating baseline.');
  fs.writeFileSync(metricsFile, JSON.stringify({ bundleSize: currentSize }, null, 2));
}

// 2. Dead Code Check via ts-prune
console.log('\n[2/3] Checking for dead code via ts-prune...');
try {
  const pruneOutput = execSync('npx ts-prune', { cwd: projectRoot, encoding: 'utf-8' });
  const unusedExports = pruneOutput.split('\n').filter(line => line.trim().length > 0);
  if (unusedExports.length > 0) {
    console.warn('\x1b[33m%s\x1b[0m', `[WARNING] Found ${unusedExports.length} unused exports. Please review them:`);
    // Print just the first 10 so we don't spam the console too much
    unusedExports.slice(0, 10).forEach(line => console.warn(`  ${line}`));
    if (unusedExports.length > 10) {
      console.warn(`  ...and ${unusedExports.length - 10} more.`);
    }
  } else {
    console.log('No unused exports found.');
  }
} catch (e) {
  // ts-prune exits with 0 even if it finds issues, but just in case
  console.error('Error running ts-prune:', e.message);
}

// 3. Package.json vs Roadmap dependency diff check
console.log('\n[3/3] Checking for undocumented dependency changes...');
try {
  // Check if package.json has uncommitted changes or was modified in the last commit
  // Using git diff HEAD --name-only to check for uncommitted changes
  const statusOutput = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8' });
  const modifiedFiles = statusOutput.split('\n').map(line => line.slice(3).trim());
  
  if (modifiedFiles.includes('package.json')) {
    if (!modifiedFiles.includes('REDIVIVUS_ROADMAP.md')) {
      console.warn('\x1b[31m%s\x1b[0m', '\n[Redivivus WARNING] package.json was modified but REDIVIVUS_ROADMAP.md was NOT updated!');
      console.warn('Every dependency change MUST be logged in the roadmap per Rule 9 / Project Rules.');
    } else {
      console.log('Dependencies changed and roadmap was correctly updated.');
    }
  } else {
    console.log('No uncommitted dependency changes detected.');
  }
} catch (e) {
  console.error('Error checking git status:', e.message);
}

console.log('===============================================\n');
