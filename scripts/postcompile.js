#!/usr/bin/env node
// Post-compile script: packages extension and installs to Windsurf

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.chassis', 'config.json');

// Check if CHASSIS_ROADMAP.md has been updated recently
const roadmapPath = path.join(workspaceRoot, 'CHASSIS_ROADMAP.md');
if (fs.existsSync(roadmapPath)) {
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
fs.writeFileSync(buildInfoPath, JSON.stringify({ timestamp: buildTimestamp, version: '0.2.0' }, null, 2));

// Auto-commit logic
try {
  if (!fs.existsSync(configPath)) {
    process.exit(0);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const mode = config.autoCommit || 'prompt';

  if (mode === 'off') {
    process.exit(0);
  }

  try {
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

  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    if (sessionFiles.length > 0) {
      const lastSessionFile = sessionFiles[sessionFiles.length - 1];
      const lastSession = JSON.parse(fs.readFileSync(path.join(sessionsDir, lastSessionFile), 'utf-8'));
      sessionGoal = lastSession.goal || 'no session';
    }
  }

  const commitMessage = `CHASSIS checkpoint: ${timestamp} — ${sessionGoal}`;

  if (mode === 'auto') {
    try {
      execSync('git add -A', { cwd: workspaceRoot, stdio: 'pipe' });
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
