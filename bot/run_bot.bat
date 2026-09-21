@echo off
setlocal
title SensTalk Engine Launcher

cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :28888 ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo [*] 이전 실행 중인 엔진(PID %%a) 정리 중...
        taskkill /f /pid %%a >nul 2>&1
    )
)

python sensebot.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Error] Python execution failed. Please check if Python is installed and added to PATH.
    pause
)
