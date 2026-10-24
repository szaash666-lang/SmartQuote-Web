#!/usr/bin/env bash

set -euo pipefail

PATH="$HOME/.local/bin:$HOME/Library/pnpm:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

ASTRBOT_UPDATES_DISABLED="${ASTRBOT_UPDATES_DISABLED:-1}"
export ASTRBOT_UPDATES_DISABLED

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$PROJECT_DIR/data/temp"
PID_FILE="$RUNTIME_DIR/astrbot.pid"
LOG_FILE="$RUNTIME_DIR/astrbot.log"
DASHBOARD_SOURCE_DIR="$PROJECT_DIR/dashboard"
DASHBOARD_TARGET_DIR="$PROJECT_DIR/data/dist"
DASHBOARD_URL="${ASTRBOT_DASHBOARD_URL:-http://localhost:6185}"

usage() {
    printf '%s\n' \
        "Usage: $0 [start|stop|restart|status|logs]" \
        "" \
        "Commands:" \
        "  start    Build the local Dashboard when needed, then start AstrBot (default)." \
        "  stop     Stop the AstrBot process started by this script." \
        "  restart  Restart AstrBot." \
        "  status   Show the managed process status." \
        "  logs     Follow the AstrBot log."
}

prepare_dashboard() {
    local source_candidates=(
        "$DASHBOARD_SOURCE_DIR/src"
        "$DASHBOARD_SOURCE_DIR/public"
        "$DASHBOARD_SOURCE_DIR/scripts"
        "$DASHBOARD_SOURCE_DIR/index.html"
        "$DASHBOARD_SOURCE_DIR/package.json"
        "$DASHBOARD_SOURCE_DIR/pnpm-lock.yaml"
        "$DASHBOARD_SOURCE_DIR/tsconfig.json"
        "$DASHBOARD_SOURCE_DIR/vite.config.ts"
    )
    local existing_sources=()
    local source_path
    for source_path in "${source_candidates[@]}"; do
        if [[ -e "$source_path" ]]; then
            existing_sources+=("$source_path")
        fi
    done

    local build_index="$DASHBOARD_SOURCE_DIR/dist/index.html"
    local target_index="$DASHBOARD_TARGET_DIR/index.html"
    local newer_source=""
    if [[ -f "$build_index" && "${#existing_sources[@]}" -gt 0 ]]; then
        newer_source="$(find "${existing_sources[@]}" -type f -newer "$build_index" -print -quit)"
    fi

    local dashboard_built=0
    if [[ ! -f "$build_index" || -n "$newer_source" ]]; then
        local install_command=()
        local build_command=()
        if command -v pnpm >/dev/null 2>&1; then
            install_command=(pnpm)
            build_command=(pnpm build)
        elif command -v node >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
            install_command=(corepack pnpm)
            build_command=(corepack pnpm build)
        elif [[ -d "$DASHBOARD_SOURCE_DIR/node_modules" ]] \
            && command -v npm >/dev/null 2>&1; then
            build_command=(npm run build)
        else
            printf 'Cannot build the Dashboard: install Node.js and pnpm first.\n' >&2
            return 1
        fi

        if [[ ! -d "$DASHBOARD_SOURCE_DIR/node_modules" ]]; then
            if [[ "${#install_command[@]}" -eq 0 ]]; then
                printf 'Dashboard dependencies are missing. Install pnpm and try again.\n' >&2
                return 1
            fi
            printf 'Dashboard dependencies are missing; running pnpm install...\n'
            (cd "$DASHBOARD_SOURCE_DIR" && "${install_command[@]}" install --frozen-lockfile)
        fi

        printf 'Dashboard source changed; building the local Plugin Edition...\n'
        (cd "$DASHBOARD_SOURCE_DIR" && "${build_command[@]}")
        dashboard_built=1
    fi

    if [[ ! -f "$build_index" ]]; then
        printf 'Dashboard build did not produce %s.\n' "$build_index" >&2
        return 1
    fi

    local dashboard_version
    dashboard_version="$(
        sed -n 's/^[[:space:]]*version[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' \
            "$PROJECT_DIR/pyproject.toml" | sed -n '1p'
    )"
    if [[ -z "$dashboard_version" ]]; then
        printf 'Cannot determine the Dashboard version from pyproject.toml.\n' >&2
        return 1
    fi

    local build_version_file="$DASHBOARD_SOURCE_DIR/dist/assets/version"
    local target_version_file="$DASHBOARD_TARGET_DIR/assets/version"
    mkdir -p "$(dirname "$build_version_file")"
    printf '%s\n' "$dashboard_version" > "$build_version_file"

    # Vite can keep index.html byte-identical while changing lazy-loaded page
    # chunks, so compare the complete build before skipping deployment.
    if [[ "$dashboard_built" -eq 0 && -f "$target_index" \
        && -f "$target_version_file" ]] \
        && diff -qr "$DASHBOARD_SOURCE_DIR/dist" "$DASHBOARD_TARGET_DIR" \
            >/dev/null 2>&1; then
        return
    fi

    local dashboard_stage
    dashboard_stage="$(mktemp -d "$RUNTIME_DIR/dashboard-dist.XXXXXX")"
    if ! cp -R "$DASHBOARD_SOURCE_DIR/dist/." "$dashboard_stage/"; then
        rm -rf "$dashboard_stage"
        printf 'Failed to stage the Dashboard build.\n' >&2
        return 1
    fi

    local dashboard_backup="$RUNTIME_DIR/dashboard-dist.previous.$$"
    if [[ -d "$DASHBOARD_TARGET_DIR" ]]; then
        mv "$DASHBOARD_TARGET_DIR" "$dashboard_backup"
    fi
    if ! mv "$dashboard_stage" "$DASHBOARD_TARGET_DIR"; then
        if [[ -d "$dashboard_backup" ]]; then
            mv "$dashboard_backup" "$DASHBOARD_TARGET_DIR"
        fi
        rm -rf "$dashboard_stage"
        printf 'Failed to activate the Dashboard build; the previous copy was restored.\n' >&2
        return 1
    fi
    if [[ -d "$dashboard_backup" ]]; then
        rm -rf "$dashboard_backup"
    fi
    printf 'Dashboard Plugin Edition is ready.\n'
}

read_pid() {
    if [[ ! -f "$PID_FILE" ]]; then
        return 1
    fi

    local pid
    pid="$(tr -d '[:space:]' < "$PID_FILE")"
    if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
        return 1
    fi

    printf '%s' "$pid"
}

is_managed_process() {
    local pid="$1"
    local command_line
    local process_dir=""

    if ! kill -0 "$pid" 2>/dev/null; then
        return 1
    fi

    command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command_line" != *"main.py"* ]]; then
        return 1
    fi

    if [[ -e "/proc/$pid/cwd" ]]; then
        process_dir="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    elif command -v lsof >/dev/null 2>&1; then
        process_dir="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    fi

    [[ -z "$process_dir" || "$process_dir" == "$PROJECT_DIR" ]]
}

start_astrbot() {
    mkdir -p "$RUNTIME_DIR"
    prepare_dashboard

    local pid=""
    if pid="$(read_pid)"; then
        if is_managed_process "$pid"; then
            printf 'AstrBot is already running (PID %s).\n' "$pid"
            printf 'Dashboard: %s\n' "$DASHBOARD_URL"
            return
        fi

        if kill -0 "$pid" 2>/dev/null; then
            printf 'Refusing to overwrite %s: PID %s belongs to another process.\n' \
                "$PID_FILE" "$pid" >&2
            return 1
        fi

        rm -f "$PID_FILE"
    elif [[ -f "$PID_FILE" ]]; then
        printf 'Removing invalid PID file: %s\n' "$PID_FILE"
        rm -f "$PID_FILE"
    fi

    if command -v curl >/dev/null 2>&1 \
        && curl --silent --fail --max-time 2 "$DASHBOARD_URL" >/dev/null 2>&1; then
        printf 'A service is already responding at %s but is not managed by this script.\n' \
            "$DASHBOARD_URL" >&2
        return 1
    fi

    if [[ ! -d "$PROJECT_DIR/.venv" ]]; then
        if ! command -v uv >/dev/null 2>&1; then
            printf "Cannot create the Python environment: 'uv' is not in PATH.\n" >&2
            return 1
        fi
        printf 'Python environment not found; running uv sync...\n'
        (cd "$PROJECT_DIR" && uv sync)
    fi

    local python_bin="$PROJECT_DIR/.venv/bin/python"
    if [[ ! -x "$python_bin" && -x "$PROJECT_DIR/.venv/Scripts/python.exe" ]]; then
        python_bin="$PROJECT_DIR/.venv/Scripts/python.exe"
    fi
    if [[ ! -x "$python_bin" ]]; then
        printf 'Cannot start AstrBot: virtual-environment Python was not found.\n' >&2
        return 1
    fi

    printf '\n[%s] Starting AstrBot\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"
    pid="$("$python_bin" -c '
import subprocess
import sys

project_dir, log_file = sys.argv[1:]
with open(log_file, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=project_dir,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
print(process.pid)
' "$PROJECT_DIR" "$LOG_FILE")"
    printf '%s\n' "$pid" > "$PID_FILE"

    local ready=0
    local attempt=0
    while [[ "$attempt" -lt 30 ]]; do
        if ! is_managed_process "$pid"; then
            printf 'AstrBot exited during startup. Recent log output:\n' >&2
            tail -n 30 "$LOG_FILE" >&2 || true
            rm -f "$PID_FILE"
            return 1
        fi

        if ! command -v curl >/dev/null 2>&1 \
            || curl --silent --fail --max-time 2 "$DASHBOARD_URL" >/dev/null 2>&1; then
            ready=1
            break
        fi

        sleep 1
        attempt=$((attempt + 1))
    done

    printf 'AstrBot started (PID %s).\n' "$pid"
    printf 'Dashboard: %s\n' "$DASHBOARD_URL"
    printf 'Log: %s\n' "$LOG_FILE"
    if [[ "$ready" -eq 0 ]]; then
        printf 'Dashboard readiness timed out; AstrBot is still running. Check the log.\n'
    fi
}

stop_astrbot() {
    local pid=""
    if ! pid="$(read_pid)"; then
        if [[ -f "$PID_FILE" ]]; then
            printf 'Cannot stop AstrBot: invalid PID file %s.\n' "$PID_FILE" >&2
            return 1
        fi

        printf 'AstrBot is not running under this script.\n'
        return
    fi

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$PID_FILE"
        printf 'AstrBot is not running; removed the stale PID file.\n'
        return
    fi

    if ! is_managed_process "$pid"; then
        printf 'Refusing to stop PID %s because it is not AstrBot from this repository.\n' \
            "$pid" >&2
        return 1
    fi

    printf 'Stopping AstrBot (PID %s)...\n' "$pid"
    kill "$pid"

    local attempt=0
    while kill -0 "$pid" 2>/dev/null && [[ "$attempt" -lt 15 ]]; do
        sleep 1
        attempt=$((attempt + 1))
    done

    if kill -0 "$pid" 2>/dev/null; then
        printf 'AstrBot did not stop within 15 seconds; sending SIGKILL.\n' >&2
        kill -KILL "$pid"
    fi

    rm -f "$PID_FILE"
    printf 'AstrBot stopped.\n'
}

show_status() {
    local pid=""
    if ! pid="$(read_pid)"; then
        if [[ -f "$PID_FILE" ]]; then
            printf 'AstrBot status is unknown: invalid PID file %s.\n' "$PID_FILE"
            return 1
        fi

        printf 'AstrBot is not running under this script.\n'
        return 1
    fi

    if is_managed_process "$pid"; then
        printf 'AstrBot is running (PID %s).\n' "$pid"
        printf 'Dashboard: %s\n' "$DASHBOARD_URL"
        printf 'Log: %s\n' "$LOG_FILE"
        return
    fi

    if kill -0 "$pid" 2>/dev/null; then
        printf 'PID %s is running but does not match AstrBot from this repository.\n' \
            "$pid" >&2
    else
        printf 'AstrBot is not running; PID file is stale.\n'
    fi
    return 1
}

command="${1:-start}"
case "$command" in
    start)
        start_astrbot
        ;;
    stop)
        stop_astrbot
        ;;
    restart)
        stop_astrbot
        start_astrbot
        ;;
    status)
        show_status
        ;;
    logs)
        if [[ ! -f "$LOG_FILE" ]]; then
            printf 'Log file does not exist yet: %s\n' "$LOG_FILE" >&2
            exit 1
        fi
        tail -n 100 -f "$LOG_FILE"
        ;;
    -h|--help|help)
        usage
        ;;
    *)
        printf 'Unknown command: %s\n\n' "$command" >&2
        usage >&2
        exit 2
        ;;
esac
