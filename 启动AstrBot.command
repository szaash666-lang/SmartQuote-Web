#!/usr/bin/env bash

set -euo pipefail

PATH="$HOME/.local/bin:$HOME/Library/pnpm:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_URL="${ASTRBOT_DASHBOARD_URL:-http://localhost:6185/#/chat}"

printf 'Preparing the AstrBot Plugin Edition...\n'
if "$PROJECT_DIR/scripts/astrbot.sh" start; then
    if command -v open >/dev/null 2>&1; then
        open "$DASHBOARD_URL"
    fi
    if command -v osascript >/dev/null 2>&1; then
        osascript -e 'display notification "AstrBot is ready." with title "AstrBot"'
    fi
else
    if command -v osascript >/dev/null 2>&1; then
        osascript -e \
            'display alert "AstrBot failed to start. Check the Terminal output." as critical'
    fi
    printf '\nPress Enter to close this window...'
    read -r
    exit 1
fi
