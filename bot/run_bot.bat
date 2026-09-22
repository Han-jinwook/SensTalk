@echo off
@chcp 65001 >nul
title SensTalk PC Engine Launcher v2.7

echo ========================================================
echo        SensTalk PC Engine Launcher v2.7
echo ========================================================
echo.

cd /d "%~dp0"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
    echo https://www.python.org 에서 Python을 설치 후 "Add to PATH"를 체크해주세요.
    echo.
    pause
    exit /b 1
)

:: 기존 28888 포트 점유 프로세스 정리
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :28888 ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo [*] 이전 실행 중인 엔진(PID %%a) 정리 중...
        taskkill /f /pid %%a >nul 2>&1
    )
)

if exist "sensebot.py" (
    echo [*] 센스톡 PC 엔진을 시작합니다... (포트 28888)
    echo [*] 브라우저(SensTalk)에서 [연결 확인]을 눌러주세요.
    echo [*] 이 콘솔 창을 닫으면 엔진이 종료됩니다.
    echo.
    python sensebot.py
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [오류] 엔진 실행 중 오류가 발생했습니다.
        pause
    )
    exit /b 0
)

echo [오류] sensebot.py 파일을 찾을 수 없습니다.
pause