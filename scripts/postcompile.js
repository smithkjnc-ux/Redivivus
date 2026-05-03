#!/usr/bin/env node
// Post-compile script: packages extension and installs to Windsurf

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.chassis', 'config.json');

// Write build timestamp for visual verification
const buildTimestamp = new Date().toISOString();
const buildInfoPath = path.join(workspaceRoot, '.chassis', 'build-info.json');
fs.writeFileSync(buildInfoPath, JSON.stringify({ timestamp: buildTimestamp, version: '0.2.0' }, null, 2));

// Package extension with vsce
try {
  console.log('Packaging extension with vsce...');
  execSync('npx vsce package --allow-missing-repository', { cwd: workspaceRoot, stdio: 'inherit' });
  console.log('✓ Extension packaged');
} catch (e) {
  console.error('Failed to package extension:', e.message);
  process.exit(0);
}

// Install to Windsurf
try {
  console.log('Installing to Windsurf...');
  execSync('windsurf --install-extension chassis-0.2.0.vsix --force', { cwd: workspaceRoot, stdio: 'inherit' });
  console.log('✓ Installed to Windsurf');
} catch (e) {
  console.error('Failed to install to Windsurf:', e.message);
  process.exit(0);
}

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
