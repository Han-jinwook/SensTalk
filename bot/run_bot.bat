@echo off
chcp 65001 > nul
title SensTalk Engine

cd /d "%~dp0"
python sensebot.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Error] Python execution failed. Please check if Python is installed and added to PATH.
    pause
)
