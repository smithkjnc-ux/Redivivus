#!/bin/bash
# Redivivus release pipeline — bump version, compile, package, upload to GitHub
# Usage: ./scripts/release.sh
set -e

REPO="smithkjnc-ux/Redivivus"
BUILD_DIR="$HOME/projects/redivivus-build/VSCode-linux-x64"
WEB_DIR="$HOME/projects/redivivus-web"
TARBALL_NAME=""  # set after version bump
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Bump patch version in package.json before compile so build-info.json picks it up
NEW_VERSION=$(node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = \`\${major}.\${minor}.\${patch + 1}\`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(pkg.version);
")
TARBALL="$HOME/redivivus-$NEW_VERSION.tar.gz"
echo "▶  Version bumped to $NEW_VERSION"

echo "▶  Compiling..."
npm run compile

echo "▶  Packaging tarball..."
cd "$HOME/projects/redivivus-build"
FOLDER="redivivus-$NEW_VERSION"
mv VSCode-linux-x64 "$FOLDER"
tar -czf "$TARBALL" "$FOLDER"
mv "$FOLDER" VSCode-linux-x64

cd "$PROJECT_DIR"
echo "▶  Building Windows zip..."
./scripts/build-windows.sh --skip-compile
WIN_ZIP="$HOME/redivivus-win32-x64-v$NEW_VERSION.zip"

TAG="v$NEW_VERSION"
echo "▶  Creating GitHub release $TAG..."
gh release create "$TAG" "$TARBALL" "$WIN_ZIP" \
  --repo "$REPO" \
  --title "Redivivus IDE $TAG" \
  --notes "Standalone builds for Linux and Windows. Download, extract, and run.

## Linux Install
\`\`\`
tar -xzf redivivus-${NEW_VERSION}.tar.gz
cd redivivus-${NEW_VERSION} && ./redivivus
\`\`\`

## Windows Install
Extract the zip and double-click \`redivivus.exe\`"

echo "▶  Uploading to R2 (downloads.redivivus.dev)..."
# Delete previous version files before uploading new ones
PREV_VERSION=$(node -e "
const [major, minor, patch] = '$NEW_VERSION'.split('.').map(Number);
console.log(major + '.' + minor + '.' + (patch - 1));
")
wrangler r2 object delete "redivivus-downloads/redivivus-$PREV_VERSION.tar.gz" --remote 2>/dev/null || true
wrangler r2 object delete "redivivus-downloads/redivivus-win32-x64-v$PREV_VERSION.zip" --remote 2>/dev/null || true
echo "   Removed v$PREV_VERSION from R2"
wrangler r2 object put "redivivus-downloads/redivivus-$NEW_VERSION.tar.gz" \
  --file="$TARBALL" --content-type="application/gzip" --remote
wrangler r2 object put "redivivus-downloads/redivivus-win32-x64-v$NEW_VERSION.zip" \
  --file="$WIN_ZIP" --content-type="application/zip" --remote
echo "▶  R2 upload complete — https://downloads.redivivus.dev/redivivus-$NEW_VERSION.tar.gz"

echo "▶  Updating web app download link to $NEW_VERSION..."
node -e "
const fs = require('fs');
const file = '$WEB_DIR/src/lib/latest-release.ts';
const content = \`export const LATEST_VERSION = '$NEW_VERSION'\nexport const DOWNLOAD_URL_LINUX = \\\`https://downloads.redivivus.dev/redivivus-\\\${LATEST_VERSION}.tar.gz\\\`\nexport const DOWNLOAD_URL_WINDOWS = \\\`https://downloads.redivivus.dev/redivivus-win32-x64-v\\\${LATEST_VERSION}.zip\\\`\n\`;
fs.writeFileSync(file, content);
"
cd "$WEB_DIR" && fly deploy -a redivivus-backend 2>&1 | grep -E "✓|deployed|Error|error|v[0-9]" | tail -5
echo "▶  Deploying web app to Cloudflare Workers (redivivus.dev)..."
cd "$WEB_DIR" && npm run deploy 2>&1 | grep -E "✓|Deployed|Error|error|success|worker" | tail -5

# Update developer's local stable symlink so the .desktop launcher always works
STABLE_LINK="$HOME/.local/opt/redivivus"
rm -f "$STABLE_LINK"
ln -s "$BUILD_DIR" "$STABLE_LINK"
ICON_SRC="$BUILD_DIR/resources/app/resources/linux/redivivus.png"
ICON_DEST="$HOME/.local/share/icons/redivivus.png"
if [ -f "$ICON_SRC" ]; then cp -f "$ICON_SRC" "$ICON_DEST"; fi
DESKTOP_FILE="$HOME/.local/share/applications/redivivus.desktop"
cat > "$DESKTOP_FILE" <<DESKTOPEOF
[Desktop Entry]
Name=Redivivus IDE
Comment=AI-powered code editor
Exec=$STABLE_LINK/codium --no-sandbox --reuse-window %U
Icon=$ICON_DEST
Terminal=false
Type=Application
Categories=Development;IDE;
StartupWMClass=codium
MimeType=text/plain;inode/directory;
DESKTOPEOF
chmod +x "$DESKTOP_FILE"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "▶  Desktop launcher updated → $STABLE_LINK"

echo "✓  Released $TAG — users will get the update on next download"
echo "   https://github.com/$REPO/releases/tag/$TAG"
