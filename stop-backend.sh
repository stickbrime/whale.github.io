#!/usr/bin/env bash
# Stop the Whale Coffee Shop backend running on port 8002.

lsof -ti:8002 2>/dev/null | xargs -r kill -9 2>/dev/null
if [ $? -eq 0 ]; then
  echo "Backend stopped."
else
  echo "No backend process found on port 8002."
fi
