@echo off
chcp 65001 >nul
setlocal
set "SCRIPT=%~dp0dsh-session-manager.ps1"
where pwsh >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" restore
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" restore
)
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
