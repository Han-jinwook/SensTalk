import zipfile
import os
import time

version = '2.5'
zip_name_ver = f'ui/SenseTalk_Engine_v{version}.zip'
zip_name_compat = 'ui/SenseTalk_Engine.zip'
folder_name = f'SenseTalk_Engine_v{version}'

files_to_pack = [
    ('bot/sensebot.py', 'sensebot.py'),
    ('bot/requirements.txt', 'requirements.txt'),
    ('bot/run_bot.bat', 'run_bot.bat'),
    ('sample_명단.csv', 'sample_명단.csv'),
]

readme_content = ("""========================================================
   SensTalk PC 가속 엔진 v2.5 (SenseBot Daemon)
========================================================

■ 3초 시작 가이드:
1. '센스톡_실행.bat' 파일을 더블 클릭하여 실행합니다.
   (검은색 콘솔 창이 열리며 포트 28888 서버가 가동됩니다)
   * 이전 실행 중이던 구버전 엔진 창이 열려있더라도 새 실행 파일이 알아서 자동 교체합니다.

2. PC 카카오톡을 실행하고 로그인해 둡니다.

3. 웹브라우저(PWA) 센스톡 화면에서 좌하단 [엔진 연결됨 v2.5] 녹색불을 확인합니다.

4. 이제 카카오톡 대화창에서 오직 [Enter] 키만 치면
   눈으로 직접 확인하며 어뷰징 없이 연속 발송됩니다!

■ 단축키:
- [F9]: 연속 발송 일시정지 (Pause)
- [Enter]: 발송 확정 및 다음 사람 자동 장전
""".replace('\r\n', '\n').replace('\n', '\r\n')).encode('utf-8-sig')

bat_content = ("""@echo off
setlocal
title SensTalk PC Engine Launcher

echo ========================================================
echo        SensTalk PC Engine Launcher
echo ========================================================
echo.

cd /d "%~dp0"

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [오류] Python이 설치되어 있지 않거나 환경변수 PATH에 등록되지 않았습니다.
    echo https://www.python.org 에서 Python 3를 설치할 때
    echo "Add Python to PATH" 체크박스를 반드시 체크해주세요.
    echo.
    pause
    exit /b 1
)

:: 기존 28888 포트 점유 중인 이전 엔진 자동 종료 (중복 실행/포트 충돌 방지)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :28888 ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo [*] 이전 실행 중인 엔진(PID %%a)을 종료하고 새로 시작합니다...
        taskkill /f /pid %%a >nul 2>&1
    )
)

if exist "sensebot.py" (
    echo [*] 센스톡 PC 가속 엔진 가동 중... (포트 28888)
    python sensebot.py
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [안내] 엔진이 종료되었습니다.
        pause
    )
    exit /b 0
)

echo [오류] sensebot.py 파일을 찾을 수 없습니다.
pause
""".replace('\r\n', '\n').replace('\n', '\r\n')).encode('cp949', errors='replace')

def add_file_to_zip(z, arcname, data):
    zinfo = zipfile.ZipInfo(arcname, date_time=time.localtime()[:6])
    zinfo.flag_bits |= 0x800  # Set UTF-8 bit for zip filename encoding
    zinfo.compress_type = zipfile.ZIP_DEFLATED
    zinfo.external_attr = 0o644 << 16
    z.writestr(zinfo, data)

def build_zip(zip_path):
    with zipfile.ZipFile(zip_path, 'w') as z:
        for src, arc in files_to_pack:
            with open(src, 'rb') as f:
                content = f.read()
            add_file_to_zip(z, f'{folder_name}/{arc}', content)
            add_file_to_zip(z, arc, content)
        add_file_to_zip(z, f'{folder_name}/센스톡_실행.bat', bat_content)
        add_file_to_zip(z, '센스톡_실행.bat', bat_content)
        add_file_to_zip(z, f'{folder_name}/README.txt', readme_content)
        add_file_to_zip(z, 'README.txt', readme_content)

build_zip(zip_name_ver)
build_zip(zip_name_compat)
print('Zips created successfully:', os.path.getsize(zip_name_ver), os.path.getsize(zip_name_compat))
