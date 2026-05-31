// [SCOPE] Post-compile deploy step: writes build-info, syncs brand media, deploys extension output to all IDE locations, copies the app icon, creates the redivivus→codium launch symlink, and writes install.sh into the build root.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const home = require('os').homedir();

const workspaceRoot = process.cwd();

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
const mediaSrc = path.join(workspaceRoot, 'resources', 'media');
const mediaDest = path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'out', 'media');
const mediaTargets = [mediaDest];
try {
  const runningMedia = path.join(fs.realpathSync(path.join(home, '.local', 'opt', 'redivivus')), 'resources', 'app', 'out', 'media');
  if (fs.existsSync(runningMedia) && runningMedia !== mediaDest) mediaTargets.push(runningMedia);
} catch {}
for (const mt of mediaTargets) {
  if (!fs.existsSync(mt)) continue;
  try {
    execSync(`rsync -a "${mediaSrc}/" "${mt}/"`, { stdio: 'pipe' });
  } catch (e) {
    console.warn('⚠️  Brand media sync failed:', e.stderr?.toString()?.trim() || e.message);
  }
}
if (fs.existsSync(mediaSrc)) console.log('✓ Brand media synced to build');

// Deploy compiled out/ to all known extension locations — runs unconditionally so every compile stays in sync.
// Prevents zombie bugs where a source fix is compiled but never reaches the running build.
const deployTargets = [
  // Baked extension (custom VSCode build)
  path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64', 'resources', 'app', 'extensions', 'redivivus'),
];

// [WARN] Resolve the actual running IDE via the stable symlink — this is where the user's desktop icon points.
// Without this, postcompile deploys to the wrong location and fixes never reach the running IDE.
try {
  const stableLink = path.join(home, '.local', 'opt', 'redivivus');
  const resolved = fs.realpathSync(stableLink);
  const symlinkExt = path.join(resolved, 'resources', 'app', 'extensions', 'redivivus');
  if (fs.existsSync(symlinkExt) && !deployTargets.includes(symlinkExt)) {
    deployTargets.unshift(symlinkExt); // Highest priority — this is the running IDE
  }
} catch {}

// Also sync to any installed redivivus extension in ~/.vscode/extensions/
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
    execSync(`rsync -a --delete "${path.join(workspaceRoot, 'out')}/" "${path.join(target, 'out')}/"`, { stdio: 'pipe' });
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
const buildRoot = path.join(home, 'projects', 'redivivus-build', 'VSCode-linux-x64');
const iconDest = path.join(buildRoot, 'resources', 'app', 'resources', 'linux', 'redivivus.png');
const codeIconDest = path.join(buildRoot, 'resources', 'app', 'resources', 'linux', 'code.png');
if (fs.existsSync(iconSrc)) {
  try {
    fs.copyFileSync(iconSrc, iconDest);
    fs.copyFileSync(iconSrc, codeIconDest);
  } catch {}
}

// [WARN] The packaged binary is named 'codium' (VSCodium base). The 'redivivus' symlink makes the
// Exec= path in install.sh work and survives tarball extraction since tar preserves symlinks.
const buildCodium = path.join(buildRoot, 'codium');
const buildRedivivus = path.join(buildRoot, 'redivivus');
if (fs.existsSync(buildCodium) && !fs.existsSync(buildRedivivus)) {
  try { fs.symlinkSync('codium', buildRedivivus); } catch {}
}

// Write install.sh into the build root so users get a desktop shortcut.
// Uses a stable symlink at ~/.local/opt/redivivus so future re-installs don't break the .desktop file.
// [WARN] StartupWMClass must be 'codium' — the app's actual WM_CLASS is set by the VSCodium binary, not the launch filename.
const installSh = `#!/bin/bash
# Redivivus install -- creates a stable symlink + desktop shortcut
set -e
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
STABLE_LINK="$HOME/.local/opt/redivivus"
ICON_DEST="$HOME/.local/share/icons/redivivus.png"
DESKTOP_FILE="$HOME/.local/share/applications/redivivus.desktop"

mkdir -p "$HOME/.local/opt" "$HOME/.local/share/icons" "$HOME/.local/share/applications"

rm -f "$STABLE_LINK"
ln -s "$INSTALL_DIR" "$STABLE_LINK"

# Create redivivus launch alias -- underlying binary is codium (VSCodium base)
if [ -f "$INSTALL_DIR/codium" ] && [ ! -e "$INSTALL_DIR/redivivus" ]; then
  ln -sf codium "$INSTALL_DIR/redivivus"
fi

ICON_SRC="$INSTALL_DIR/resources/app/resources/linux/redivivus.png"
if [ -f "$ICON_SRC" ]; then cp "$ICON_SRC" "$ICON_DEST"; fi

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Redivivus IDE
Comment=AI-powered code editor
Exec=$STABLE_LINK/redivivus --no-sandbox --reuse-window %U
Icon=$ICON_DEST
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=codium
MimeType=text/plain;inode/directory;
EOF
chmod +x "$DESKTOP_FILE"

# Required on GNOME 40+ for .desktop files to appear and launch from the app menu
gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache -f -t "$HOME/.local/share/icons" 2>/dev/null || true

echo "Redivivus installed! Launch from your application menu."
echo "  If the icon does not appear immediately, log out and back in once."
echo "  To update: extract the new tarball and run ./install.sh again."
`;
const installShDest = path.join(buildRoot, 'install.sh');
try {
  fs.writeFileSync(installShDest, installSh);
  fs.chmodSync(installShDest, 0o755);
} catch {}
