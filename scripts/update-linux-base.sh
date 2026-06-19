#!/bin/bash
# Updates the VSCodium Linux base in redivivus-build/ to the latest pre-built release.
# Run this before release.sh when VSCodium has a new version.
set -e

BUILD_DIR="$HOME/projects/redivivus-build"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Find latest VSCodium Linux x64 release
echo "▶  Finding latest VSCodium Linux release..."
RELEASE_JSON=$(curl -s "https://api.github.com/repos/VSCodium/vscodium/releases")
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o "https://github.com/VSCodium/vscodium/releases/download/[^\"]*VSCodium-linux-x64[^\"]*\.tar\.gz" | head -n 1)
VSCODIUM_VERSION=$(echo "$DOWNLOAD_URL" | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+' | head -1)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "❌ Could not find VSCodium Linux release"; exit 1
fi

CURRENT=$(node -p "require('$BUILD_DIR/upstream/stable.json').tag" 2>/dev/null || echo "unknown")
echo "   Current base: $CURRENT"
echo "   Latest available: $VSCODIUM_VERSION"

if [ "$CURRENT" = "$VSCODIUM_VERSION" ]; then
  echo "✓  Already up to date — nothing to do"; exit 0
fi

echo "▶  Downloading VSCodium Linux $VSCODIUM_VERSION..."
TMPDIR=$(mktemp -d)
curl -L -o "$TMPDIR/vscodium.tar.gz" "$DOWNLOAD_URL"

echo "▶  Extracting..."
mkdir -p "$TMPDIR/vscodium"
tar -xzf "$TMPDIR/vscodium.tar.gz" -C "$TMPDIR/vscodium"

echo "▶  Replacing VSCode-linux-x64 base..."
rm -rf "$BUILD_DIR/VSCode-linux-x64"
if [ -d "$TMPDIR/vscodium/VSCodium-linux-x64" ]; then
  mv "$TMPDIR/vscodium/VSCodium-linux-x64" "$BUILD_DIR/VSCode-linux-x64"
else
  mv "$TMPDIR/vscodium" "$BUILD_DIR/VSCode-linux-x64"
fi

# [C2] A fresh VSCodium base ships an unpatched product.json (VSCodium branding, dataFolderName
# .vscode-oss). Re-apply the Redivivus debrand immediately so the base is never left un-debranded —
# this is the step that was missing on Linux (only build-windows.sh had it).
echo "▶  Debranding Linux product.json..."
node "$PROJECT_DIR/scripts/debrand-linux-product.js" "$BUILD_DIR/VSCode-linux-x64/resources/app/product.json"

echo "▶  Injecting Redivivus extension..."
EXT_DST="$BUILD_DIR/VSCode-linux-x64/resources/app/extensions/redivivus"
mkdir -p "$EXT_DST"

EXT_SRC="$BUILD_DIR/dev/redivivus"
if [ -d "$EXT_SRC" ]; then
  cp -r "$EXT_SRC"/* "$EXT_DST/"
  echo "   Extension injected from $EXT_SRC"
fi

# Copy compiled extension output and package
OUT_SRC="$PROJECT_DIR/out"
if [ -d "$OUT_SRC" ]; then
  mkdir -p "$EXT_DST/out"
  cp -r "$OUT_SRC"/* "$EXT_DST/out/"
fi
if [ -f "$PROJECT_DIR/package.json" ]; then
  cp "$PROJECT_DIR/package.json" "$EXT_DST/"
fi

# Update stable.json to record new base version
echo "{\"tag\":\"$VSCODIUM_VERSION\",\"commit\":\"\"}" > "$BUILD_DIR/upstream/stable.json"
echo "▶  Updated stable.json to $VSCODIUM_VERSION"

rm -rf "$TMPDIR"
echo "✓  Linux base updated to VSCodium $VSCODIUM_VERSION"
