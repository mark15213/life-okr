#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${PROJECT_DIR}/scripts/com.life-okr.token-reporter.plist.template"
SCRIPT="${PROJECT_DIR}/scripts/report-tokens.ts"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/com.life-okr.token-reporter.plist"
LOG_DIR="${HOME}/.local/state/life-okr"
LOG_PATH="${LOG_DIR}/reporter.log"

if [[ ! -f "$TEMPLATE" ]]; then
    echo "❌ Template not found at $TEMPLATE" >&2
    exit 1
fi

NODE_BIN="$(command -v node || true)"
TSX_BIN="${PROJECT_DIR}/node_modules/.bin/tsx"
if [[ -z "$NODE_BIN" ]]; then
    echo "❌ node not found in PATH" >&2
    exit 1
fi
if [[ ! -x "$TSX_BIN" ]]; then
    echo "❌ tsx not found at $TSX_BIN — run 'npm install' first" >&2
    exit 1
fi

mkdir -p "$PLIST_DIR" "$LOG_DIR"

sed \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    -e "s|__TSX_BIN__|${TSX_BIN}|g" \
    -e "s|__SCRIPT__|${SCRIPT}|g" \
    -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
    -e "s|__LOG__|${LOG_PATH}|g" \
    "$TEMPLATE" > "$PLIST_PATH"

# Bootstrap (will fail harmlessly if already loaded; bootout first for clean reload).
if launchctl print "gui/$(id -u)/com.life-okr.token-reporter" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)" "$PLIST_PATH" || true
fi
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "✅ Installed launchd job: com.life-okr.token-reporter"
echo "   plist:  $PLIST_PATH"
echo "   log:    $LOG_PATH"
echo "   To disable: launchctl bootout gui/$(id -u) \"$PLIST_PATH\""
echo "   To run now: launchctl kickstart -k gui/$(id -u)/com.life-okr.token-reporter"
