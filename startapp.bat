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

REM Stop the previous startapp consoles, including npm/nodemon, before relaunching.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev-instances.ps1" -RepoPath "%~dp0."
if errorlevel 1 (
    echo BMS-App wurde nicht gestartet. Bitte die obige Meldung pruefen.
    pause
    exit /b 1
)

REM --- Backend (Port 3091) ---
start "BMS-App - Backend - Port 3091" cmd /d /k call "%~dp0scripts\start-app-console.bat" "BMS-App - Backend - Port 3091" backend

REM --- Frontend (Port 3090) ---
start "BMS-App - Frontend - Port 3090" cmd /d /k call "%~dp0scripts\start-app-console.bat" "BMS-App - Frontend - Port 3090" frontend

echo.
echo Started.
echo Backend:  http://localhost:3091/api
echo Frontend: http://localhost:3090/bms-app
echo.
echo Close the opened windows to stop the processes.
endlocal
