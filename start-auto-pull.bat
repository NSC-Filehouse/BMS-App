@echo off
setlocal
title Auto-Pull - BMS-App

pushd "%~dp0"
if errorlevel 1 (
    echo FEHLER: Projektverzeichnis konnte nicht geoeffnet werden.
    pause
    exit /b 1
)

if not exist "scripts\auto-pull-loop.ps1" (
    echo FEHLER: scripts\auto-pull-loop.ps1 fehlt. Bitte das Projekt zuerst aktualisieren.
    popd
    pause
    exit /b 1
)

echo Auto-Pull fuer "%CD%"
echo Pruefung sofort und danach alle 30 Minuten. Beenden mit Strg+C.
echo Dieses Fenster geoeffnet lassen.
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "scripts\auto-pull-loop.ps1" -RepoPath "%CD%"
set "autoPullExitCode=%ERRORLEVEL%"
popd
echo.
echo Auto-Pull wurde beendet. Exitcode: %autoPullExitCode%
pause
exit /b %autoPullExitCode%
