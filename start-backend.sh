#!/usr/bin/env bash
# Start the Whale Coffee Shop backend as a persistent background process.
# Usage: ./start-backend.sh
# Survives SSH disconnection via nohup + disown. Logs to logs/backend.log.

set -e
cd "$(dirname "$0")"

mkdir -p logs

# Kill any existing backend on port 8002
lsof -ti:8002 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

# Use venv uvicorn if it actually works, else fall back to system python3
if [ -x ".venv/bin/uvicorn" ] && .venv/bin/python -c "import uvicorn" 2>/dev/null; then
  nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8002 > logs/backend.log 2>&1 &
else
  nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8002 > logs/backend.log 2>&1 &
fi

# Detach from shell so it survives SSH disconnect / script exit
disown

echo "Backend started. PID: $!"
echo "Logs: logs/backend.log"
sleep 5
if curl -sf http://127.0.0.1:8002/health > /dev/null; then
  echo "Health check: OK"
else
  echo "Health check: FAILED — check logs/backend.log"
fi
