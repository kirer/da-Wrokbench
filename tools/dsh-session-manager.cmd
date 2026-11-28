@echo off
chcp 65001 >nul
setlocal
set "SCRIPT=%~dp0dsh-session-manager.ps1"
where pwsh >nul 2>nul
if errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" menu
) else (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" menu
)
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
