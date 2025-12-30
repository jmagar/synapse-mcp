#!/usr/bin/env bash
# homelab-mcp-server runner script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/.server.log"

# Load environment variables
load_env() {
    if [[ -f "$SCRIPT_DIR/.env" ]]; then
        set -a
        source "$SCRIPT_DIR/.env"
        set +a
    fi
}

# Check if server is running
is_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
        rm -f "$PID_FILE"
    fi
    return 1
}

# Start the server
start() {
    if is_running; then
        echo "Server already running (PID: $(cat "$PID_FILE"))"
        return 1
    fi

    load_env

    local transport="${1:-http}"
    echo "Starting homelab-mcp-server (--$transport)..."

    if [[ "$transport" == "stdio" ]]; then
        exec node "$SCRIPT_DIR/dist/index.js" --stdio
    else
        nohup node "$SCRIPT_DIR/dist/index.js" --http >> "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 1

        if is_running; then
            echo "Server started (PID: $(cat "$PID_FILE"))"
            echo "Listening on http://${SYNAPSE_HOST:-127.0.0.1}:${SYNAPSE_PORT:-3000}/mcp"
            echo "Logs: $LOG_FILE"
        else
            echo "Failed to start server. Check $LOG_FILE"
            return 1
        fi
    fi
}

# Stop the server
stop() {
    if ! is_running; then
        echo "Server not running"
        return 0
    fi

    local pid
    pid=$(cat "$PID_FILE")
    echo "Stopping server (PID: $pid)..."
    kill "$pid" 2>/dev/null || true

    # Wait for graceful shutdown
    for i in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            echo "Server stopped"
            return 0
        fi
        sleep 0.5
    done

    # Force kill if still running
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Server force stopped"
}

# Restart the server
restart() {
    stop
    sleep 1
    start "${1:-http}"
}

# Show server status
status() {
    if is_running; then
        local pid
        pid=$(cat "$PID_FILE")
        echo "Server running (PID: $pid)"

        load_env
        local url="http://${SYNAPSE_HOST:-127.0.0.1}:${SYNAPSE_PORT:-3000}/health"

        if command -v curl &>/dev/null; then
            echo -n "Health: "
            curl -sf "$url" 2>/dev/null || echo "unreachable"
        fi
    else
        echo "Server not running"
        return 1
    fi
}

# Show logs
logs() {
    local lines="${1:-50}"
    if [[ -f "$LOG_FILE" ]]; then
        tail -n "$lines" "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Follow logs
follow() {
    if [[ -f "$LOG_FILE" ]]; then
        tail -f "$LOG_FILE"
    else
        echo "No log file found"
    fi
}

# Build the project
build() {
    echo "Building..."
    pnpm run build
}

# Show usage
usage() {
    cat <<EOF
Usage: $0 <command> [options]

Commands:
  start [http|stdio]  Start the server (default: http)
  stop                Stop the server
  restart             Restart the server
  status              Show server status
  logs [n]            Show last n log lines (default: 50)
  follow              Follow log output
  build               Build the TypeScript project

Environment:
  Configure via .env file (see .env.example)

EOF
}

# Main
case "${1:-}" in
    start)   start "${2:-http}" ;;
    stop)    stop ;;
    restart) restart "${2:-http}" ;;
    status)  status ;;
    logs)    logs "${2:-50}" ;;
    follow)  follow ;;
    build)   build ;;
    *)       usage ;;
esac
