# ============================================================
# FocusGuard - one-command dev startup.
# Usage (PowerShell):
#   .\scripts\dev.ps1
#
# Does everything, in order:
#   1. Ensures PostgreSQL is running
#   2. Starts the ngrok tunnel for the backend (reuses an existing one)
#   3. Auto-wires the tunnel URL into .env and backend/.env (CORS)
#   4. Opens the backend (uvicorn) in its own terminal
#   5. Opens the Expo dev server in its own terminal
# ============================================================

$ErrorActionPreference = "Stop"

$root   = Split-Path $PSScriptRoot -Parent
$envRoot = Join-Path $root ".env"
$backendEnv = Join-Path $root "backend\.env"
$backendDir = Join-Path $root "backend"
$port = "8000"

function Set-EnvValue([string]$path, [string]$key, [string]$value) {
  $lines = Get-Content $path
  $lines = $lines | ForEach-Object {
    if ($_ -match "^$key=") { "$key=$value" } else { $_ }
  }
  Set-Content -Path $path -Value $lines
}

function Ensure-NgrokUrl {
  # Reuse a running tunnel, otherwise start one. Returns the https URL.
  $attempts = 0
  while ($attempts -lt 20) {
    try {
      $t = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
      foreach ($tun in $t.tunnels) {
        if ($tun.public_url -like "https://*") { return $tun.public_url }
      }
    } catch { }
    if ($attempts -eq 0) {
      Write-Host "Starting ngrok tunnel for port $port ..."
      Start-Process ngrok -ArgumentList "http", $port -WindowStyle Hidden
    }
    Start-Sleep -Seconds 1
    $attempts++
  }
  throw "ngrok tunnel could not be established. Is ngrok installed and authed?"
}

# --- 1. Postgres -----------------------------------------------------------
Write-Host ""
Write-Host "[1/5] Ensuring PostgreSQL is running ..."
$pg = Get-Service | Where-Object { $_.Name -like "postgresql*" } | Select-Object -First 1
if ($pg) {
  if ($pg.Status -ne "Running") { Start-Service -Name $pg.Name }
  Write-Host "       PostgreSQL service: $($pg.Name) is running."
} else {
  Write-Host "       No PostgreSQL service found - backend uses its auto-start/SQLite fallback." -ForegroundColor Yellow
}

# --- 2. ngrok --------------------------------------------------------------
Write-Host "[2/5] Setting up ngrok tunnel ..."
$tunnelUrl = Ensure-NgrokUrl
Write-Host "       Tunnel: $tunnelUrl"

# --- 3. Wire env files -----------------------------------------------------
Write-Host "[3/5] Wiring the tunnel URL into .env files ..."
Set-EnvValue $envRoot "EXPO_PUBLIC_API_URL" $tunnelUrl
Set-EnvValue $envRoot "EXPO_PUBLIC_WS_URL"  (($tunnelUrl -replace "^https", "wss") + "/ws")

$corsLine = (Get-Content $backendEnv) | Where-Object { $_ -match "^CORS_ORIGINS=" } | Select-Object -First 1
if (-not $corsLine) {
  Add-Content $backendEnv "`nCORS_ORIGINS=$tunnelUrl"
} elseif ($corsLine -notmatch [regex]::Escape($tunnelUrl)) {
  Set-EnvValue $backendEnv "CORS_ORIGINS" ($corsLine.Substring("CORS_ORIGINS=".Length) + "," + $tunnelUrl)
}
Write-Host "       Mobile app will call: $tunnelUrl"

# --- 4. Backend ------------------------------------------------------------
Write-Host "[4/5] Opening the backend (uvicorn) ..."
Start-Process powershell -WorkingDirectory $backendDir -ArgumentList `
  "-NoExit", "-Command", "python -m uvicorn app.main:app --reload --port $port"

# --- 5. Expo ---------------------------------------------------------------
Write-Host "[5/5] Opening the Expo dev server ..."
Start-Process powershell -WorkingDirectory $root -ArgumentList `
  "-NoExit", "-Command", "npx expo start"

Write-Host ""
Write-Host "All set. Scan the QR code in the Expo terminal, or open http://localhost:8081."
Write-Host "Keep this window (and the ngrok process) open - the tunnel must stay up for the demo."
Write-Host ""
