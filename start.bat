@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM FocusGuard AI — single entry point to run every server.
REM   - FastAPI backend (with auto venv setup)
REM   - Expo dev server (web + native)
REM   - optional ngrok tunnel
REM ============================================================

cd /d "%~dp0"
set "ROOT=%CD%"

echo.
echo  ==========================================
echo   FocusGuard AI — starting servers...
echo  ==========================================
echo.

REM ---------- 1) Backend setup (venv) ----------
set "VENV_PY=%ROOT%\backend\.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo  [setup] Creating Python venv...
    python -m venv "%ROOT%\backend\.venv"
    if errorlevel 1 (
        echo  [error] Could not create venv. Is Python installed and on PATH?
        pause
        exit /b 1
    )
    echo  [setup] Installing backend dependencies...
    "%VENV_PY%" -m pip install --disable-pip-version-check -q -r "%ROOT%\backend\requirements.txt"
    if errorlevel 1 (
        echo  [error] pip install failed.
        pause
        exit /b 1
    )
)

REM ---------- 2) Backend ----------
echo  [start] FastAPI backend  ^(port 8000^)
start "FocusGuard AI Backend" /D "%ROOT%\backend" cmd /k ""%ROOT%\backend\.venv\Scripts\python.exe" -m alembic upgrade head && "%ROOT%\backend\.venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

REM ---------- 3) Expo ----------
echo  [start] Expo dev server  ^(web + native^)
start "FocusGuard Expo" /D "%ROOT%" cmd /k "npx expo start"

REM ---------- 4) Optional ngrok ----------
set /p TUNNEL=Start ngrok tunnel for the backend? [y/N]: 
if /i "%TUNNEL%"=="y" (
    where ngrok >nul 2>nul
    if errorlevel 1 (
        echo  [warn] ngrok not found on PATH - skipping.
    ) else (
        echo  [start] ngrok tunnel  ^(port 8000^)
        start "FocusGuard ngrok" /D "%ROOT%" cmd /k "ngrok http 8000"
    )
)

echo.
echo  ==========================================
echo   Servers launching in separate windows:
echo    Backend : http://localhost:8000/api/health
echo    Expo    : http://localhost:8081
echo  ==========================================
echo.

endlocal
