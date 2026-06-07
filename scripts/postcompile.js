// [SCOPE] Post-compile checks: validates ROADMAP.md freshness, enforces the 200-line file size rule on src/, and handles auto-commit based on .redivivus/config.json settings.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, '.redivivus', 'config.json');

// Check if REDIVIVUS_ROADMAP.md has been updated recently
const roadmapPath = path.join(workspaceRoot, 'REDIVIVUS_ROADMAP.md');
// [WARN] File system operation: `fs.existsSync` can fail due to permissions or path issues.
if (fs.existsSync(roadmapPath)) {
  // [WARN] File system operation: `fs.readFileSync` can fail due to permissions or path issues.
  const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
  const match = roadmap.match(/\*Last updated:\*?\s*([A-Z][a-z]+ \d+, \d{4})/);
  if (match) {
    const lastUpdated = new Date(match[1]);
    const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 1) {
      console.warn(`⚠️  REDIVIVUS_ROADMAP.md last updated ${Math.floor(daysSince)} day(s) ago. Update it before ending your session.`);
    }
  }
}

// Line-count enforcer — warn on any src/*.ts file over 200 lines (CLAUDE.md Rule 9)
const srcDir = path.join(workspaceRoot, 'src');
if (fs.existsSync(srcDir)) {
  const walkTs = (dir) => {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') { results = results.concat(walkTs(full)); }
      else if (entry.isFile() && entry.name.endsWith('.ts')) { results.push(full); }
    }
    return results;
  };
  const overLimit = walkTs(srcDir).filter(f => {
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      const count = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
      return count > 200;
    } catch { return false; }
  });
  for (const f of overLimit) {
    const rel = path.relative(workspaceRoot, f);
    const lines = fs.readFileSync(f, 'utf-8').split('\n').length;
    console.warn(`[Redivivus RULE 9] ${rel} is ${lines} lines -- split required before editing`);
  }
}

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
  const sessionsDir = path.join(workspaceRoot, '.redivivus', 'sessions');
  let sessionGoal = 'no session';

  // [WARN] File system operation: `fs.existsSync` can fail due to permissions or path issues.
  if (fs.existsSync(sessionsDir)) {
    const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    // Only pick up an ACTIVE session (no endedAt). Closed sessions are historical — don't surface their goal.
    for (const f of sessionFiles) {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8'));
        if (s && !s.endedAt && s.goal) { sessionGoal = s.goal; }
      } catch { /* skip malformed */ }
    }
  }

  const commitMessage = `Redivivus checkpoint: ${timestamp} — ${sessionGoal}`;

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
    console.log('Redivivus: Ready to commit');
    console.log('Message:', commitMessage);
    console.log('Run "redivivus.autoCommit" command to complete commit');
  }
} catch (e) {
  console.error('Post-compile error:', e.message);
  process.exit(0);
}
