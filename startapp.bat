@echo off
setlocal enabledelayedexpansion

REM ==========================================================
REM BMS-App - Start Frontend + Backend (DEV)
REM - Opens two separate terminal windows
REM - Run this from the project root (where package.json is)
REM ==========================================================

REM Ensure we run from the folder where this .bat is located
cd /d "%~dp0"

echo Starting BMS-App (DEV)...
echo.

REM --- Backend (Port 3091) ---
start "BMS Backend" cmd /k "cd /d apps\backend && npm run dev"

REM --- Frontend (Port 3090) ---
start "BMS Frontend" cmd /k "cd /d apps\frontend && npm run dev"

echo.
echo Started.
echo Backend:  http://localhost:3091/api
echo Frontend: http://localhost:3090/bms-app
echo.
echo Close the opened windows to stop the processes.
endlocal
