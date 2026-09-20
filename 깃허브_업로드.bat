@echo off
chcp 65001 > nul
title 깃허브 업로드 (Git Push to GitHub)

echo ========================================================
echo        SensTalk GitHub 업로드 도우미
echo ========================================================
echo.
echo [*] 원격 저장소: https://github.com/Han-jinwook/SensTalk.git
echo [*] 브랜치: main
echo.
echo [*] GitHub로 코드를 푸시합니다...
echo.

cd /d "%~dp0"
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [성공] GitHub에 코드가 성공적으로 업로드되었습니다!
    echo 넷리파이(Netlify)가 5~10초 내에 자동으로 새 버전을 배포합니다.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo [오류] 푸시 중 문제가 발생했습니다. (오류 코드: %ERRORLEVEL%)
    echo ========================================================
)

echo.
pause
