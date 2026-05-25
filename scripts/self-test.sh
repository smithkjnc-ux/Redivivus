#!/bin/bash
# Redivivus Self-Test — run after reorgs, big feature adds, or "something broke"
# Usage: bash scripts/self-test.sh

cd "$(dirname "$0")/.." || exit 1
ERRORS=0
WARNS=0

echo "═══════════════════════════════════════"
echo "  Redivivus Self-Test v1.0"
echo "═══════════════════════════════════════"
echo ""

# ── 1. TypeScript Compilation ──
echo "▸ [1/7] TypeScript compilation..."
TSC_OUT=$(npx tsc --noEmit 2>&1)
if [ $? -eq 0 ]; then
  echo "  ✅ Zero compilation errors"
else
  ERR_COUNT=$(echo "$TSC_OUT" | grep -c "error TS")
  echo "  ❌ $ERR_COUNT compilation errors"
  echo "$TSC_OUT" | grep "error TS" | head -10
  ERRORS=$((ERRORS + ERR_COUNT))
fi
echo ""

# ── 2. Broken Imports (files that import non-existent paths) ──
echo "▸ [2/7] Checking for broken import targets..."
BROKEN=0
while IFS= read -r line; do
  FILE=$(echo "$line" | cut -d: -f1)
  IMPORT_PATH=$(echo "$line" | grep -oP "from ['\"]\\K[^'\"]+")
  if [[ "$IMPORT_PATH" == .* ]]; then
    DIR=$(dirname "$FILE")
    RESOLVED="$DIR/${IMPORT_PATH%.js}"
    if [[ ! -f "${RESOLVED}.ts" && ! -f "${RESOLVED}/index.ts" && ! -f "${RESOLVED}.js" ]]; then
      echo "  ❌ $FILE → $IMPORT_PATH (not found)"
      BROKEN=$((BROKEN + 1))
    fi
  fi
done < <(grep -rn "from ['\"]\./" src/ --include="*.ts" 2>/dev/null)
if [ $BROKEN -eq 0 ]; then
  echo "  ✅ All relative imports resolve"
else
  ERRORS=$((ERRORS + BROKEN))
fi
echo ""

# ── 3. Ghost directories (brace expansion artifacts, empty dirs) ──
echo "▸ [3/7] Checking for ghost/junk directories..."
GHOSTS=0
while IFS= read -r dir; do
  if [[ "$dir" == *"{"* || "$dir" == *"}"* ]]; then
    echo "  ❌ Ghost dir: $dir"
    GHOSTS=$((GHOSTS + 1))
  fi
done < <(find src/ -type d 2>/dev/null)
EMPTY=$(find src/ -type d -empty 2>/dev/null)
if [ -n "$EMPTY" ]; then
  while IFS= read -r d; do
    echo "  ⚠️  Empty dir: $d"
    WARNS=$((WARNS + 1))
  done <<< "$EMPTY"
fi
if [ $GHOSTS -eq 0 ] && [ -z "$EMPTY" ]; then
  echo "  ✅ No ghost or empty directories"
fi
ERRORS=$((ERRORS + GHOSTS))
echo ""

# ── 4. Duplicate files (old + new location both exist) ──
echo "▸ [4/7] Checking for duplicates (src/ vs src.bak/)..."
if [ -d "src.bak" ]; then
  echo "  ✅ src.bak/ exists (backup intact)"
else
  echo "  ⚠️  No src.bak/ backup found"
  WARNS=$((WARNS + 1))
fi
echo ""

# ── 5. Entry point integrity ──
echo "▸ [5/7] Entry point checks..."
EP_OK=1
if ! grep -q "export function activate" src/extension.ts 2>/dev/null; then
  echo "  ❌ extension.ts missing activate() export"
  EP_OK=0
  ERRORS=$((ERRORS + 1))
fi
if ! grep -q "export function deactivate" src/extension.ts 2>/dev/null; then
  echo "  ❌ extension.ts missing deactivate() export"
  EP_OK=0
  ERRORS=$((ERRORS + 1))
fi
MAIN=$(grep -oP '"main"\s*:\s*"\K[^"]+' package.json 2>/dev/null)
if [ -n "$MAIN" ]; then
  echo "  ℹ️  package.json main: $MAIN"
else
  echo "  ❌ No 'main' field in package.json"
  ERRORS=$((ERRORS + 1))
  EP_OK=0
fi
[ $EP_OK -eq 1 ] && echo "  ✅ Entry points intact"
echo ""

# ── 6. Key service files exist ──
echo "▸ [6/7] Core file existence check..."
MISSING=0
CORE_FILES=(
  "src/extension.ts"
  "src/services/redivivusService.ts"
  "src/services/project/redivivusInit.ts"
  "src/services/project/redivivusPaths.ts"
  "src/services/project/templateRegistry.ts"
  "src/services/ai/routingService.ts"
  "src/ui/chat/chatPanel.ts"
  "src/ui/chat/chatPanelOrchestrator.ts"
  "src/ui/sidebar/sidebarProvider.ts"
)
for f in "${CORE_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ❌ Missing: $f"
    MISSING=$((MISSING + 1))
  fi
done
if [ $MISSING -eq 0 ]; then
  echo "  ✅ All core files present"
else
  ERRORS=$((ERRORS + MISSING))
fi
echo ""

# ── 7. VSIX build test ──
echo "▸ [7/7] VSIX package test..."
VSIX_OUT=$(npx vsce package --no-dependencies 2>&1)
if echo "$VSIX_OUT" | grep -q "\.vsix"; then
  VSIX_FILE=$(echo "$VSIX_OUT" | grep -oP 'redivivus-[\d.]+\.vsix')
  echo "  ✅ VSIX built: $VSIX_FILE"
else
  echo "  ❌ VSIX build failed"
  echo "$VSIX_OUT" | tail -5
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── Summary ──
echo "═══════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
  echo "  ✅ ALL CLEAR — $WARNS warning(s)"
else
  echo "  ❌ $ERRORS error(s), $WARNS warning(s)"
fi
echo "═══════════════════════════════════════"

# Output for Windsurf paste
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "── Copy below into Windsurf ──"
  echo "Redivivus self-test found $ERRORS errors. Fix these issues:"
  echo "$TSC_OUT" | grep "error TS" | head -20
fi
