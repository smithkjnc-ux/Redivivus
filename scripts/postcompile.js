// [SCOPE] This script runs after compilation to perform post-build tasks, including packaging extensions, updating build info, checking roadmap freshness, and managing auto-commits based on CHASSIS configuration.
// Post-compile script: packages extension and installs to Windsurf

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.chassis', 'config.json');

// Check if CHASSIS_ROADMAP.md has been updated recently
const roadmapPath = path.join(workspaceRoot, 'CHASSIS_ROADMAP.md');
// [WARN] File system operation: `fs.existsSync` can fail due to permissions or path issues.
if (fs.existsSync(roadmapPath)) {
  // [WARN] File system operation: `fs.readFileSync` can fail due to permissions or path issues.
  const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
  const match = roadmap.match(/\*Last updated: (.+?) —/);
  if (match) {
    const lastUpdated = new Date(match[1]);
    const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 1) {
      console.warn(`⚠️  CHASSIS_ROADMAP.md last updated ${Math.floor(daysSince)} day(s) ago. Update it before ending your session.`);
    }
  }
}

// Write build timestamp for visual verification
const buildTimestamp = new Date().toISOString();
const buildInfoPath = path.join(workspaceRoot, '.chassis', 'build-info.json');
// [WARN] File system operation: `fs.writeFileSync` can fail due to permissions or disk space issues.
fs.writeFileSync(buildInfoPath, JSON.stringify({ timestamp: buildTimestamp, version: '0.3.4' }, null, 2));

// Auto-commit logic
try {
  // [WARN] File system operation: `fs.existsSync` can fail due to permissions or path issues.
  if (!fs.existsSync(configPath)) {
    process.exit(0);
  }

  // [WARN] File system operation: `fs.readFileSync` can fail.
  // [WARN] JSON parsing: `JSON.parse` can throw an error if the content is not valid JSON.
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const mode = config.autoCommit || 'prompt';

  if (mode === 'off') {
    process.exit(0);
  }

  try {
    // [WARN] External process execution: `execSync` can block the event loop and depends on `git` being installed and accessible.
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: workspaceRoot });
    if (!status.trim()) {
      process.exit(0);
    }
  } catch (e) {
    process.exit(0);
  }

  const timestamp = new Date().toISOString();
  const sessionsDir = path.join(workspaceRoot, '.chassis', 'sessions');
  let sessionGoal = 'no session';

  // [WARN] File system operation: `fs.existsSync` can fail due to permissions or path issues.
  if (fs.existsSync(sessionsDir)) {
    // [WARN] File system operation: `fs.readdirSync` can fail due to permissions or path issues.
    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    if (sessionFiles.length > 0) {
      const lastSessionFile = sessionFiles[sessionFiles.length - 1];
      // [WARN] File system operation: `fs.readFileSync` can fail.
      // [WARN] JSON parsing: `JSON.parse` can throw an error if the content is not valid JSON.
      const lastSession = JSON.parse(fs.readFileSync(path.join(sessionsDir, lastSessionFile), 'utf-8'));
      sessionGoal = lastSession.goal || 'no session';
    }
  }

  const commitMessage = `CHASSIS checkpoint: ${timestamp} — ${sessionGoal}`;

  if (mode === 'auto') {
    try {
      // [WARN] External process execution: `execSync` can block and depends on `git`.
      execSync('git add -A', { cwd: workspaceRoot, stdio: 'pipe' });
      // [WARN] External process execution: `execSync` can block and depends on `git`.
      execSync(`git commit -m "${commitMessage}"`, { cwd: workspaceRoot, stdio: 'pipe' });
      console.log('✓ Auto-committed successfully');
    } catch (e) {
      console.error('Auto-commit failed:', e.message);
    }
  } else if (mode === 'prompt') {
    console.log('CHASSIS: Ready to commit');
    console.log('Message:', commitMessage);
    console.log('Run "chassis.autoCommit" command to complete commit');
  }
} catch (e) {
  console.error('Post-compile error:', e.message);
  process.exit(0);
}