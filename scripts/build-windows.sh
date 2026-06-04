#!/bin/bash
# Redivivus Windows Build Pipeline
# Downloads VSCodium Windows release, injects Redivivus, and packages it.
# Usage: ./scripts/build-windows.sh

set -e

REPO="smithkjnc-ux/Redivivus"
WEB_DIR="$HOME/projects/redivivus-web"
BUILD_DIR="$HOME/projects/redivivus-build"
TEMP_DIR="/tmp/redivivus-win-build"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# 1. Get current version and target VSCodium version
PKG_VERSION=$(node -p "require('./package.json').version")
VSCODIUM_VERSION=$(node -p "require('../redivivus-build/upstream/stable.json').tag")
echo "▶  Building Redivivus Windows v$PKG_VERSION (VSCodium $VSCODIUM_VERSION)"

# 2. Compile Redivivus extension
if [ "$1" != "--skip-compile" ]; then
    echo "▶  Compiling extension..."
    npm run compile
else
    echo "▶  Skipping compilation..."
fi

# 3. Setup temp directory
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# 4. Fetch VSCodium Windows Release
echo "▶  Fetching VSCodium Windows release..."
# Use GitHub API to find the exact asset URL for VSCodium-win32-x64 matching VSCODIUM_VERSION
RELEASE_JSON=$(curl -s "https://api.github.com/repos/VSCodium/vscodium/releases")
# The VSCodium release tags are like 1.96.2.24355, we want to match the 1.96.2 part (VSCODIUM_VERSION)
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o "https://github.com/VSCodium/vscodium/releases/download/[^\"]*VSCodium-win32-x64-${VSCODIUM_VERSION}[^\"]*\.zip" | head -n 1 || true)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "⚠️  Could not find exact version match for $VSCODIUM_VERSION. Looking for any tag starting with $VSCODIUM_VERSION..."
    # Fallback to match just the prefix in the asset name
    DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o "https://github.com/VSCodium/vscodium/releases/download/[^\"]*VSCodium-win32-x64-${VSCODIUM_VERSION}[^\"]*\.zip" | head -n 1 || true)
    
    if [ -z "$DOWNLOAD_URL" ]; then
        echo "❌ Failed to find VSCodium Windows release for $VSCODIUM_VERSION"
        exit 1
    fi
fi

echo "   Downloading $DOWNLOAD_URL..."
curl -L -o vscodium.zip "$DOWNLOAD_URL"

# 5. Extract
echo "▶  Extracting VSCodium..."
unzip -q vscodium.zip -d VSCode-win32-x64
rm vscodium.zip

# 6. Inject Redivivus Extension
echo "▶  Injecting Redivivus extension..."
EXT_DIR="VSCode-win32-x64/resources/app/extensions/redivivus"
mkdir -p "$EXT_DIR"

cp -r "$PROJECT_DIR/out" "$EXT_DIR/"
cp "$PROJECT_DIR/package.json" "$EXT_DIR/"
cp -r "$PROJECT_DIR/resources" "$EXT_DIR/"

# 7. Override product.json and Branding
echo "▶  Applying branding..."
node -e "
const fs = require('fs');
const winProdPath = 'VSCode-win32-x64/resources/app/product.json';
const extraProdPath = '$BUILD_DIR/product.json';
const winP = JSON.parse(fs.readFileSync(winProdPath, 'utf8'));
const extraP = JSON.parse(fs.readFileSync(extraProdPath, 'utf8'));
Object.assign(winP, extraP);
winP.nameShort = 'Redivivus';
winP.nameLong = 'Redivivus IDE';
winP.applicationName = 'redivivus';
winP.dataFolderName = '.redivivus';
winP.win32MutexName = 'redivivus';
winP.win32DirName = 'Redivivus';
winP.win32NameVersion = 'Redivivus';
winP.win32RegValueName = 'Redivivus';
winP.win32AppUserModelId = 'Redivivus.Redivivus';
winP.win32ShellNameShort = 'Redivivus';
winP.win32TunnelServiceMutex = 'redivivus-tunnelservice';
winP.win32TunnelMutex = 'redivivus-tunnel';
winP.win32ContextMenu = 'Open with Redivivus';
fs.writeFileSync(winProdPath, JSON.stringify(winP, null, 2));
"
# Copy Redivivus PNG icons for Windows resources
cp "$PROJECT_DIR/resources/redivivus-icon-512.png" "VSCode-win32-x64/resources/app/resources/win32/redivivus.png" 2>/dev/null || true
cp "$PROJECT_DIR/resources/redivivus-icon-256.png" "VSCode-win32-x64/resources/app/resources/win32/redivivus256.png" 2>/dev/null || true
# Generate .ico from PNG (multi-resolution for proper Windows taskbar/title bar icon)
if command -v convert &>/dev/null; then
    convert "$PROJECT_DIR/resources/redivivus-icon-512.png" \
        -define icon:auto-resize=256,128,64,48,32,16 \
        "VSCode-win32-x64/resources/app/resources/win32/code.ico" 2>/dev/null || true
    cp "VSCode-win32-x64/resources/app/resources/win32/code.ico" \
       "VSCode-win32-x64/resources/app/resources/win32/redivivus.ico" 2>/dev/null || true
fi

# Rename executable to redivivus.exe
if [ -f "VSCode-win32-x64/VSCodium.exe" ]; then
    mv "VSCode-win32-x64/VSCodium.exe" "VSCode-win32-x64/redivivus.exe"
fi
if [ -f "VSCode-win32-x64/bin/codium.cmd" ]; then
    sed -i 's/VSCodium\.exe/redivivus.exe/g' "VSCode-win32-x64/bin/codium.cmd"
    mv "VSCode-win32-x64/bin/codium.cmd" "VSCode-win32-x64/bin/redivivus.cmd"
fi
if [ -f "VSCode-win32-x64/bin/codium" ]; then
    sed -i 's/VSCodium/redivivus/g' "VSCode-win32-x64/bin/codium"
    sed -i 's/codium/redivivus/g' "VSCode-win32-x64/bin/codium"
    mv "VSCode-win32-x64/bin/codium" "VSCode-win32-x64/bin/redivivus"
fi

# 8. Package
echo "▶  Packaging Windows zip..."
ZIP_NAME="redivivus-win32-x64-v$PKG_VERSION.zip"
ZIP_PATH="$HOME/$ZIP_NAME"
# Rename folder so it extracts nicely
mv VSCode-win32-x64 "redivivus-$PKG_VERSION"
zip -qr "$ZIP_PATH" "redivivus-$PKG_VERSION"

echo "✓  Windows package created at $ZIP_PATH"

# Cleanup
cd "$PROJECT_DIR"
rm -rf "$TEMP_DIR"
