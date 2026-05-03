#!/usr/bin/env node
// Post-compile script: triggers CHASSIS auto-commit if configured

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.chassis', 'config.json');

try {
  // Check if CHASSIS is initialized
  if (!fs.existsSync(configPath)) {
    process.exit(0); // No CHASSIS config, skip auto-commit
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const mode = config.autoCommit || 'prompt';

  if (mode === 'off') {
    process.exit(0); // Auto-commit disabled
  }

  // Check if there are changes to commit
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: workspaceRoot });
    if (!status.trim()) {
      process.exit(0); // No changes to commit
    }
  } catch (e) {
    process.exit(0); // Git check failed, skip
  }

  // Generate commit message
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
  process.exit(0); // Don't fail the build
}
