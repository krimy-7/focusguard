# ============================================================
# FocusGuard — expose the backend over ngrok for the demo.
# Usage (PowerShell):
#   .\scripts\ngrok-backend.ps1
#
# After it starts, copy the https://<sub>.ngrok.io forward URL into:
#   - backend/.env        -> CORS_ORIGINS
#   - extension/config.js -> FOCUSGUARD_CONFIG.BASE_URL
#   - mobile/app config   -> EXPO_PUBLIC_API_URL
# ============================================================

$ErrorActionPreference = "Stop"

$port = "8000"

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  Write-Host "ngrok was not found on PATH." -ForegroundColor Yellow
  Write-Host "Install it:  choco install ngrok  (or https://ngrok.com/download)" -ForegroundColor Yellow
  exit 1
}

Write-Host "Starting backend on 127.0.0.1:$port ..."
Write-Host "Starting ngrok tunnel for port $port ..."
ngrok http $port
