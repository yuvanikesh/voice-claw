#!/bin/sh
# Start FastAPI backend in the background on localhost
echo "[Startup] Launching FastAPI backend on 127.0.0.1:8000..."
cd /app/backend

if [ -d "/home/LogFiles" ]; then
    UVICORN_LOG="/home/LogFiles/uvicorn.log"
else
    UVICORN_LOG="/app/uvicorn.log"
fi

uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 > "$UVICORN_LOG" 2>&1 &

# Start Node.js Express server in the foreground
echo "[Startup] Launching Express server..."
cd /app
exec node dist/server.cjs
