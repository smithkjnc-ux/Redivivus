#!/bin/bash
# Redivivus Quick Deploy — copies compiled extension to the IDE build
# Usage: bash scripts/deploy.sh

SRC=~/projects/redivivus
DEST=~/projects/redivivus-build/VSCode-linux-x64/resources/app/extensions/redivivus

echo "▸ Compiling..."
cd "$SRC" && npm run compile || { echo "❌ Compile failed"; exit 1; }

echo "▸ Deploying to Redivivus IDE (clean)..."
rm -rf "$DEST/out/"
cp -r "$SRC/out/" "$DEST/out/"
cp "$SRC/package.json" "$DEST/package.json"
cp -r "$SRC/resources/"* "$DEST/resources/" 2>/dev/null

echo "✅ Deployed — restart Redivivus to apply"
