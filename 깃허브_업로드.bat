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
echo (처음 한 번 브라우저 로그인 창이 뜨면 [Authorize/Sign in]을 눌러주세요!)
echo.

cd /d "%~dp0"
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo [성공] GitHub에 코드가 성공적으로 업로드되었습니다!
    echo 이제 넷리파이(Netlify) 화면을 새로고침하고 배포를 진행하세요.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo [오류] 푸시 중 문제가 발생했습니다. (오류 코드: %ERRORLEVEL%)
    echo GitHub 권한 또는 네트워크 상태를 확인해주세요.
    echo ========================================================
)

echo.
pause
