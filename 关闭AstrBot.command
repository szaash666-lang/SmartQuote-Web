#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if "$PROJECT_DIR/scripts/astrbot.sh" stop; then
    if command -v osascript >/dev/null 2>&1; then
        osascript -e 'display notification "AstrBot has stopped." with title "AstrBot"'
    fi
else
    if command -v osascript >/dev/null 2>&1; then
        osascript -e \
            'display alert "AstrBot could not be stopped. Check the Terminal output." as critical'
    fi
    printf '\nPress Enter to close this window...'
    read -r
    exit 1
fi
