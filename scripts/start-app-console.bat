@echo off
setlocal DisableDelayedExpansion

rem Keep npm and all inherited Node processes in this window on the same title.
set "BMS_CONSOLE_TITLE=%~1"
title %BMS_CONSOLE_TITLE%
cd /d "%~dp0..\apps\%~2"
if errorlevel 1 exit /b 1

rem NODE_OPTIONS treats backslashes as escapes inside quotes. Use forward slashes
rem and preserve existing options, including when the project path contains spaces.
set "BMS_TITLE_PRELOAD=%~dp0console-title.cjs"
set "BMS_TITLE_PRELOAD=%BMS_TITLE_PRELOAD:\=/%"
set "NODE_OPTIONS=%NODE_OPTIONS% --require="%BMS_TITLE_PRELOAD%""
call npm run dev
set "APP_EXIT_CODE=%ERRORLEVEL%"
title %BMS_CONSOLE_TITLE%
endlocal & exit /b %APP_EXIT_CODE%
