#!/bin/zsh

APP_DIR="/Users/vanderleineto/Desktop/UniFTC/sistema_demandas_bilioteca/api-demandas"
PID_FILE="$APP_DIR/.local-server.pid"

cd "$APP_DIR" || exit 1

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# fallback por porta/processo
a=$(lsof -ti tcp:3000)
if [ -n "$a" ]; then
  kill $a 2>/dev/null
fi

pkill -f "node server.js" 2>/dev/null

echo "Sistema parado."
osascript -e 'display notification "Sistema parado" with title "API Demandas"'
