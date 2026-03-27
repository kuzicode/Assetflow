#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/assetflow.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "assetflow is already running (PID $(cat "$PID_FILE"))"
  exit 1
fi

cd "$SCRIPT_DIR"
NODE_ENV=production nohup node server/dist/index.js > logs/assetflow.log 2>&1 &
echo $! > "$PID_FILE"
echo "assetflow started (PID $!), logs: logs/assetflow.log"
