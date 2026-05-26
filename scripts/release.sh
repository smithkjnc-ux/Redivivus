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

TAG="v$NEW_VERSION"
echo "▶  Creating GitHub release $TAG..."
gh release create "$TAG" "$TARBALL" \
  --repo "$REPO" \
  --title "Redivivus IDE $TAG" \
  --notes "Standalone Linux x64 build. Download, extract, and run.

## Install
\`\`\`
tar -xzf redivivus-${NEW_VERSION}.tar.gz
cd redivivus-${NEW_VERSION} && ./redivivus
\`\`\`"

echo "▶  Updating web app download link to $NEW_VERSION..."
node -e "
const fs = require('fs');
const file = '$WEB_DIR/src/lib/latest-release.ts';
const content = \`export const LATEST_VERSION = '$NEW_VERSION'\nexport const DOWNLOAD_URL = \\\`https://github.com/smithkjnc-ux/Redivivus/releases/latest/download/redivivus-\\\${LATEST_VERSION}.tar.gz\\\`\n\`;
fs.writeFileSync(file, content);
"
cd "$WEB_DIR" && npm run deploy 2>&1 | grep -E "✨|Deployed|Error|error" | tail -5

# Update developer's local stable symlink so the .desktop launcher always works
STABLE_LINK="$HOME/.local/opt/redivivus"
rm -f "$STABLE_LINK"
ln -s "$BUILD_DIR" "$STABLE_LINK"
ICON_SRC="$BUILD_DIR/resources/app/resources/linux/redivivus.png"
ICON_DEST="$HOME/.local/share/icons/redivivus.png"
if [ -f "$ICON_SRC" ]; then cp -f "$ICON_SRC" "$ICON_DEST"; fi
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "▶  Desktop launcher updated → $STABLE_LINK"

echo "✓  Released $TAG — users will get the update on next download"
echo "   https://github.com/$REPO/releases/tag/$TAG"
