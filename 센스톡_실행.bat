@echo off
chcp 65001 > nul
title SensTalk Engine

echo ========================================================
echo        SensTalk PC Engine Launcher
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"

if exist "%SCRIPT_DIR%ui\index.html" (
    echo [*] Opening SensTalk Web App...
    start "" "%SCRIPT_DIR%ui\index.html"
)

if exist "%SCRIPT_DIR%sensebot.py" (
    echo [*] Starting SensTalk PC Engine...
    start "SensTalk Engine" cmd /k "python "%SCRIPT_DIR%sensebot.py""
    exit /b 0
)

if exist "%SCRIPT_DIR%bot\sensebot.py" (
    echo [*] Starting SensTalk PC Engine...
    start "SensTalk Engine" cmd /k "cd /d "%SCRIPT_DIR%bot" && python sensebot.py"
    exit /b 0
)

echo [Error] Cannot find sensebot.py
pause
