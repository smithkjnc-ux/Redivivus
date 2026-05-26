// [SCOPE] This script runs after compilation to perform post-build tasks, including packaging extensions, updating build info, checking roadmap freshness, and managing auto-commits based on Redivivus configuration.
// Post-compile script: packages extension and installs to Windsurf

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

// Write build timestamp for visual verification
const buildTimestamp = new Date().toISOString();
const pkgVersion = (() => { try { return JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8')).version; } catch { return '0.0.0'; } })();
const buildInfo = { timestamp: buildTimestamp, version: pkgVersion };
// [WARN] Write to both .redivivus/ (project tooling) and out/data/ (deployed with extension, readable at runtime)
const buildInfoPath = path.join(workspaceRoot, '.redivivus', 'build-info.json');
fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
const outDataDir = path.join(workspaceRoot, 'out', 'data');
if (fs.existsSync(outDataDir)) { fs.writeFileSync(path.join(outDataDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2)); }

// Sync brand media overrides (letterpress SVGs, code-icon) into the build shell.
// Stored in resources/media/ so they survive a fresh build deploy.
const home = require('os').homedir();
const mediaSrc = path.join(workspaceRoot, 'resources', 'media');
const mediaDest = path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'out', 'media');
if (fs.existsSync(mediaSrc) && fs.existsSync(mediaDest)) {
  try {
    execSync(`rsync -a "${mediaSrc}/" "${mediaDest}/"`, { stdio: 'pipe' });
    console.log('✓ Brand media synced to build');
  } catch (e) {
    console.warn('⚠️  Brand media sync failed:', e.stderr?.toString()?.trim() || e.message);
  }
}

// Deploy compiled out/ to all known extension locations — runs unconditionally so every compile stays in sync.
// Prevents zombie bugs where a source fix is compiled but never reaches the running build.
const deployTargets = [
  // Baked extension (custom VSCode build)
  path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'extensions', 'redivivus'),
];

// Also sync to any installed redivivus extension in ~/.vscode/extensions/ (takes priority over baked in VS Code/Cursor)
const vscodeExts = path.join(home, '.vscode', 'extensions');
if (fs.existsSync(vscodeExts)) {
  for (const entry of fs.readdirSync(vscodeExts)) {
    if (/^papajoe\.redivivus-/.test(entry)) {
      deployTargets.push(path.join(vscodeExts, entry));
    }
  }
}

let deployed = 0;
for (const target of deployTargets) {
  if (!fs.existsSync(target)) { continue; }
  try {
    // Sync compiled output
    execSync(`rsync -a --delete "${path.join(workspaceRoot, 'out')}/" "${path.join(target, 'out')}/"`, { stdio: 'pipe' });
    // Sync package.json and resources so extension identity + icons stay current
    execSync(`cp "${path.join(workspaceRoot, 'package.json')}" "${target}/"`, { stdio: 'pipe' });
    if (fs.existsSync(path.join(workspaceRoot, 'resources'))) {
      execSync(`rsync -a --delete "${path.join(workspaceRoot, 'resources')}/" "${path.join(target, 'resources')}/"`, { stdio: 'pipe' });
    }
    deployed++;
  } catch (e) {
    console.warn(`⚠️  Deploy to ${path.basename(target)} failed:`, e.stderr?.toString()?.trim() || e.message);
  }
}
if (deployed > 0) {
  console.log(`✓ Deployed out/ → ${deployed} extension location(s)`);
} else {
  console.log('ℹ  No extension locations found — skipping deploy (non-fatal)');
}

// Copy Redivivus icon into the Linux resources folder of the build shell
const iconSrc = path.join(workspaceRoot, 'resources', 'redivivus-icon-512.png');
const iconDest = path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'resources', 'linux', 'redivivus.png');
if (fs.existsSync(iconSrc)) {
  try { fs.copyFileSync(iconSrc, iconDest); } catch {}
}

// Write install.sh into the build root so users get a desktop shortcut
// Uses a stable symlink at ~/.local/opt/redivivus so future re-installs don't break the .desktop file
const installSh = `#!/bin/bash
# Redivivus install — creates a stable symlink + desktop shortcut
set -e
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
STABLE_LINK="$HOME/.local/opt/redivivus"
ICON_DEST="$HOME/.local/share/icons/redivivus.png"
DESKTOP_FILE="$HOME/.local/share/applications/redivivus.desktop"

mkdir -p "$HOME/.local/opt" "$HOME/.local/share/icons" "$HOME/.local/share/applications"

# Point stable link to this extracted directory — survives version bumps
rm -f "$STABLE_LINK"
ln -s "$INSTALL_DIR" "$STABLE_LINK"

# Copy icon to a stable path so the .desktop file never breaks
ICON_SRC="$INSTALL_DIR/resources/app/resources/linux/redivivus.png"
if [ -f "$ICON_SRC" ]; then cp "$ICON_SRC" "$ICON_DEST"; fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Redivivus IDE
Comment=AI-powered code editor
Exec=$STABLE_LINK/redivivus --no-sandbox %U
Icon=$ICON_DEST
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=redivivus
MimeType=text/plain;inode/directory;
EOF
chmod +x "$DESKTOP_FILE"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "✓ Redivivus installed! Launch from your application menu."
echo "  To update: extract the new tarball and run ./install.sh again."
`;
const installShDest = path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'install.sh');
try {
  fs.writeFileSync(installShDest, installSh);
  fs.chmodSync(installShDest, 0o755);
} catch {}

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