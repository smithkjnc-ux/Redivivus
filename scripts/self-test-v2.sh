#!/bin/bash
# CHASSIS Self-Test v2.0 — Deep logic, wiring, and feature checks
# Usage: bash scripts/self-test-v2.sh
# Outputs Windsurf-ready error report at bottom

cd "$(dirname "$0")/.." || exit 1
ERRORS=0
WARNS=0
ERROR_LOG=""

log_error() {
  echo "  ❌ $1"
  ERROR_LOG+="- $1"$'\n'
  ERRORS=$((ERRORS + 1))
}
log_warn() {
  echo "  ⚠️  $1"
  WARNS=$((WARNS + 1))
}

echo "═══════════════════════════════════════════"
echo "  CHASSIS Self-Test v2.0 (Deep Scan)"
echo "═══════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════
# 1. COMMAND REGISTRATION AUDIT
# Are all package.json commands implemented in code?
# ═══════════════════════════════════════════
echo "▸ [1/10] Command registration audit..."
CMD_OK=0
CMD_FAIL=0
while IFS= read -r cmd; do
  # Check if command handler exists anywhere in src/
  if ! grep -rq "registerCommand\|commands\.register.*['\"]${cmd}['\"]" src/ --include="*.ts" 2>/dev/null; then
    # Also check for shorthand registration
    CMD_SHORT="${cmd#chassis.}"
    if ! grep -rq "'${cmd}'\|\"${cmd}\"" src/ --include="*.ts" 2>/dev/null; then
      log_error "Command '${cmd}' in package.json but no handler found in src/"
      CMD_FAIL=$((CMD_FAIL + 1))
    else
      CMD_OK=$((CMD_OK + 1))
    fi
  else
    CMD_OK=$((CMD_OK + 1))
  fi
done < <(grep -oP '"command"\s*:\s*"\K[^"]+' package.json 2>/dev/null | sort -u)
[ $CMD_FAIL -eq 0 ] && echo "  ✅ All $CMD_OK commands have handlers"
echo ""

# ═══════════════════════════════════════════
# 2. PROVIDER REGISTRATION CHECK
# Are sidebar/webview providers registered?
# ═══════════════════════════════════════════
echo "▸ [2/10] Provider registration check..."
PROV_OK=1
# Check viewContainer/view IDs in package.json vs code
while IFS= read -r viewId; do
  if ! grep -rq "'${viewId}'\|\"${viewId}\"" src/ --include="*.ts" 2>/dev/null; then
    log_error "View '${viewId}' in package.json but not referenced in code"
    PROV_OK=0
  fi
done < <(grep -oP '"id"\s*:\s*"\K[^"]+' package.json 2>/dev/null | grep -i "chassis\|sidebar\|chat\|vault" | sort -u)
[ $PROV_OK -eq 1 ] && echo "  ✅ All view providers wired"
echo ""

# ═══════════════════════════════════════════
# 3. WEBVIEW RESOURCE PATH CHECK
# Do webview providers reference paths that exist?
# ═══════════════════════════════════════════
echo "▸ [3/10] Webview resource path check..."
WV_OK=1
# Find all extensionPath/asWebviewUri/localResourceRoots references
while IFS= read -r line; do
  FILE=$(echo "$line" | cut -d: -f1)
  # Extract path segments from join() or path.join() calls near webview references
  PATHS=$(echo "$line" | grep -oP "['\"](resources|media|dist|out|src)[/\\\\][^'\"]*['\"]" | tr -d "'\"")
  for p in $PATHS; do
    if [ ! -e "$p" ] && [ ! -e "$(dirname "$FILE")/$p" ]; then
      log_warn "Possible missing webview resource: $p (referenced in $FILE)"
      WV_OK=0
    fi
  done
done < <(grep -rn "asWebviewUri\|localResourceRoots\|extensionPath.*join" src/ --include="*.ts" 2>/dev/null)
[ $WV_OK -eq 1 ] && echo "  ✅ Webview resource paths look OK"
echo ""

# ═══════════════════════════════════════════
# 4. SYSTEM PROMPT / IDENTITY CHECK
# Does the chat system actually inject CHASSIS identity?
# ═══════════════════════════════════════════
echo "▸ [4/10] Chat system prompt / identity check..."
SP_OK=1
# Look for system prompt, identity, or role injection
if ! grep -rq "system.*prompt\|systemPrompt\|system.*message\|CHASSIS.*assistant\|you are CHASSIS\|role.*system" src/ --include="*.ts" 2>/dev/null; then
  log_error "No system prompt / CHASSIS identity injection found in codebase"
  SP_OK=0
fi
# Check if system prompt references capabilities
if grep -rl "systemPrompt\|system_prompt\|getSystemPrompt\|buildSystemPrompt" src/ --include="*.ts" 2>/dev/null | head -1 > /dev/null 2>&1; then
  SP_FILE=$(grep -rl "systemPrompt\|system_prompt\|getSystemPrompt\|buildSystemPrompt" src/ --include="*.ts" 2>/dev/null | head -1)
  echo "  ℹ️  System prompt found in: $SP_FILE"
else
  log_warn "Could not locate system prompt builder file"
  SP_OK=0
fi
[ $SP_OK -eq 1 ] && echo "  ✅ CHASSIS identity injection present"
echo ""

# ═══════════════════════════════════════════
# 5. API KEY / CONFIG VALIDATION
# Are required config keys declared and used consistently?
# ═══════════════════════════════════════════
echo "▸ [5/10] Configuration key consistency..."
CFG_OK=1
# Extract config keys from package.json
PKG_CONFIGS=$(grep -oP '"chassis\.[^"]+' package.json 2>/dev/null | tr -d '"' | sort -u)
# Extract config keys used in code
CODE_CONFIGS=$(grep -roP "getConfiguration\(['\"][^'\"]*['\"]\)\|get\(['\"]chassis\.[^'\"]*['\"]\)" src/ --include="*.ts" 2>/dev/null | grep -oP "chassis\.[^'\"]*" | sort -u)
# Find configs used in code but not in package.json
for cfg in $CODE_CONFIGS; do
  if ! echo "$PKG_CONFIGS" | grep -qF "$cfg"; then
    log_warn "Config key '$cfg' used in code but not declared in package.json"
    CFG_OK=0
  fi
done
[ $CFG_OK -eq 1 ] && echo "  ✅ Config keys consistent"
echo ""

# ═══════════════════════════════════════════
# 6. DEAD EXPORTS (exported but never imported)
# ═══════════════════════════════════════════
echo "▸ [6/10] Dead export scan (sampling top files)..."
DEAD=0
# Sample: check key service files for unused exports
SAMPLE_FILES=(
  "src/services/chassisService.ts"
  "src/services/project/chassisInit.ts"
  "src/services/ai/routingService.ts"
  "src/ui/chat/chatPanel.ts"
)
for sf in "${SAMPLE_FILES[@]}"; do
  [ ! -f "$sf" ] && continue
  while IFS= read -r exp; do
    # Clean export name
    NAME=$(echo "$exp" | sed 's/export //;s/function //;s/class //;s/const //;s/let //;s/var //;s/enum //;s/interface //;s/type //;s/async //;s/{.*//;s/(.*//;s/ .*//' | tr -d ' ')
    [ -z "$NAME" ] && continue
    [ "$NAME" = "default" ] && continue
    [ ${#NAME} -lt 2 ] && continue
    # Check if it's imported anywhere else
    IMPORT_COUNT=$(grep -rl "$NAME" src/ --include="*.ts" 2>/dev/null | grep -v "$sf" | wc -l)
    if [ "$IMPORT_COUNT" -eq 0 ]; then
      log_warn "Dead export: '$NAME' from $sf (never imported)"
      DEAD=$((DEAD + 1))
    fi
  done < <(grep -P "^export (function|class|const|let|var|enum|interface|type|async function) " "$sf" 2>/dev/null)
done
[ $DEAD -eq 0 ] && echo "  ✅ No dead exports in sampled files"
echo ""

# ═══════════════════════════════════════════
# 7. CIRCULAR DEPENDENCY CHECK
# ═══════════════════════════════════════════
echo "▸ [7/10] Circular dependency spot-check..."
CIRC=0
# Check if any file imports from a file that imports back
for f in src/services/chassisService.ts src/extension.ts src/ui/chat/chatPanel.ts; do
  [ ! -f "$f" ] && continue
  # Get files this file imports
  IMPORTS=$(grep -oP "from ['\"](\./[^'\"]+)['\"]" "$f" 2>/dev/null | grep -oP "\./[^'\"]+")
  for imp in $IMPORTS; do
    RESOLVED_DIR=$(dirname "$f")
    RESOLVED_FILE="${RESOLVED_DIR}/${imp%.js}.ts"
    [ ! -f "$RESOLVED_FILE" ] && continue
    # Does the imported file import back?
    BASENAME=$(basename "$f" .ts)
    if grep -q "from.*${BASENAME}" "$RESOLVED_FILE" 2>/dev/null; then
      log_warn "Potential circular: $f ↔ $RESOLVED_FILE"
      CIRC=$((CIRC + 1))
    fi
  done
done
[ $CIRC -eq 0 ] && echo "  ✅ No circular dependencies detected in spot-check"
echo ""

# ═══════════════════════════════════════════
# 8. EVENT HANDLER WIRING
# Commands registered but not actually connected to handlers
# ═══════════════════════════════════════════
echo "▸ [8/10] Event handler wiring..."
EH_OK=1
# Find all registerCommand calls and verify they have callbacks
ORPHAN_CMDS=$(grep -rn "registerCommand" src/ --include="*.ts" 2>/dev/null | grep -v "context\|disposable\|push\|subscribe" | grep -P "registerCommand\(['\"][^'\"]+['\"]\s*\)" | head -5)
if [ -n "$ORPHAN_CMDS" ]; then
  while IFS= read -r line; do
    log_warn "Possible orphan registerCommand (no callback): $line"
    EH_OK=0
  done <<< "$ORPHAN_CMDS"
fi
[ $EH_OK -eq 1 ] && echo "  ✅ All registerCommand calls have callbacks"
echo ""

# ═══════════════════════════════════════════
# 9. FEATURE INVENTORY
# Quick inventory of what's wired vs what's declared
# ═══════════════════════════════════════════
echo "▸ [9/10] Feature inventory..."
echo "  ── Registered commands: $(grep -c '"command"' package.json 2>/dev/null)"
echo "  ── TypeScript files: $(find src/ -name '*.ts' -type f | wc -l)"
echo "  ── Service domains: $(ls -d src/services/*/ 2>/dev/null | wc -l)"
echo "  ── UI domains: $(ls -d src/ui/*/ 2>/dev/null | wc -l)"
echo "  ── Test files: $(find tests/ -name '*.ts' -o -name '*.js' 2>/dev/null | wc -l)"

# Check key features exist
echo "  ── Feature flags:"
for feat in "createFile\|Create File" "saveAll\|Save All" "openProject\|Open.*Project" "vault\|Vault" "blueprint\|Blueprint" "guardian\|Guardian" "failover\|Failover\|fallback"; do
  LABEL=$(echo "$feat" | head -c 20 | sed 's/\\|.*//;s/^ *//')
  if grep -rq "$feat" src/ --include="*.ts" 2>/dev/null; then
    echo "     ✅ $LABEL"
  else
    echo "     ❌ $LABEL — not found in codebase"
  fi
done
echo ""

# ═══════════════════════════════════════════
# 10. RUNTIME SMOKE — check extension can load
# ═══════════════════════════════════════════
echo "▸ [10/10] Build output freshness..."
if [ -f "out/extension.js" ]; then
  SRC_NEWEST=$(find src/ -name '*.ts' -newer out/extension.js -type f 2>/dev/null | wc -l)
  if [ "$SRC_NEWEST" -gt 0 ]; then
    log_warn "$SRC_NEWEST source file(s) newer than out/extension.js — rebuild needed (npm run compile)"
  else
    echo "  ✅ Build output is up to date"
  fi
else
  log_error "out/extension.js missing — extension won't load (run npm run compile)"
fi
echo ""

# ═══════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════
echo "═══════════════════════════════════════════"
if [ $ERRORS -eq 0 ] && [ $WARNS -eq 0 ]; then
  echo "  ✅ ALL CLEAR"
elif [ $ERRORS -eq 0 ]; then
  echo "  ⚠️  PASS with $WARNS warning(s)"
else
  echo "  ❌ $ERRORS error(s), $WARNS warning(s)"
fi
echo "═══════════════════════════════════════════"

# Windsurf-ready output
if [ $ERRORS -gt 0 ] || [ $WARNS -gt 0 ]; then
  echo ""
  echo "══ WINDSURF PASTE (copy everything below) ══"
  echo ""
  echo "CHASSIS self-test v2 found $ERRORS errors and $WARNS warnings."
  echo ""
  if [ -n "$ERROR_LOG" ]; then
    echo "ERRORS (must fix):"
    echo "$ERROR_LOG"
  fi
  echo "Run 'bash scripts/self-test-v2.sh' for full output."
  echo ""
  echo "══ END WINDSURF PASTE ══"
fi
