@echo off
title SensTalk PC Engine Launcher v2.7
cd /d "%~dp0"
echo ========================================================
echo        SensTalk PC Engine Launcher v2.7
echo ========================================================
echo.
python sensebot.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Python execution failed.
    pause
)