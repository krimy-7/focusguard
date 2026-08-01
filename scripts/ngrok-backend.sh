#!/usr/bin/env bash
# FocusGuard — expose the backend over ngrok for the demo.
# Usage: ./scripts/ngrok-backend.sh
set -e

PORT="${1:-8000}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed. Install it from https://ngrok.com/download"
  exit 1
fi

echo "Opening ngrok tunnel -> http://127.0.0.1:$PORT"
ngrok http "$PORT"
