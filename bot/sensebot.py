# -*- coding: utf-8 -*-
"""
SensTalk (센스톡) - SenseBot 로컬 가상 딥링크 데몬 v2.3
=====================================================
핵심 아키텍처: [엔터(Enter) 1회 타건 연속 발송 엔진]
- 유저 동선: 오직 [Enter] 키 1개만 타건! (마우스 클릭 0회, 다른 키 입력 0회)
- 프로세스:
  1. 봇이 카카오톡 친구 검색(Ctrl+F) -> 대상 검색 -> 1:1 대화방 오픈 -> 메시지 붙여넣기(Ctrl+V)
  2. 유저: 대화창과 메시지를 눈으로 확인하고 [Enter] 타건! (발송 확정 및 어뷰징 방지)
  3. 봇: 유저의 [Enter] 타건 감지 (Key-Up)
     -> 0.35초 대기(전송 애니메이션)
     -> ESC 타건(현재 1:1 대화방 닫기)
     -> 다음 대기자 즉시 검색 및 메시지 장전
  4. 유저: 다시 [Enter] 타건! (무한 연속 발송 달성)

- 보조 기능:
  - F9: 자동 진행 일시정지 (Pause)
  - F8: 전역 핫키를 통한 수동 1회 장전 또는 시작/재개
  - PWA와 실시간 양방향 동기화 (/sync, /poll, /start, /pause)
"""

import os
import sys
import time
import json
import random
import ctypes
import winsound
import threading
import re
import urllib.parse
from datetime import date
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from ctypes import wintypes
import base64
import io
try:
    import psutil
except ImportError:
    psutil = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import win32clipboard
    import win32con
except ImportError:
    win32clipboard = None
    win32con = None

# 윈도우 콘솔 UTF-8 강제 설정
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

SENSEBOT_VERSION = "2.3"

# ==========================================
# 1. 64비트 Windows Win32 API 선언
# ==========================================
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

GlobalAlloc = kernel32.GlobalAlloc
GlobalAlloc.restype = ctypes.c_void_p
GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]

GlobalLock = kernel32.GlobalLock
GlobalLock.restype = ctypes.c_void_p
GlobalLock.argtypes = [ctypes.c_void_p]

GlobalUnlock = kernel32.GlobalUnlock
GlobalUnlock.argtypes = [ctypes.c_void_p]

SetClipboardData = user32.SetClipboardData
SetClipboardData.restype = ctypes.c_void_p
SetClipboardData.argtypes = [wintypes.UINT, ctypes.c_void_p]

GetForegroundWindow = user32.GetForegroundWindow
GetForegroundWindow.restype = wintypes.HWND

GetWindowTextW = user32.GetWindowTextW
GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]

GetClassNameW = user32.GetClassNameW
GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]

SetForegroundWindow = user32.SetForegroundWindow
SetForegroundWindow.argtypes = [wintypes.HWND]

ShowWindow = user32.ShowWindow
ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]

BringWindowToTop = user32.BringWindowToTop
BringWindowToTop.argtypes = [wintypes.HWND]

AttachThreadInput = user32.AttachThreadInput
AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]

GetWindowThreadProcessId = user32.GetWindowThreadProcessId
GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]

OpenInputDesktop = user32.OpenInputDesktop
OpenInputDesktop.restype = wintypes.HANDLE
OpenInputDesktop.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]

SetThreadDesktop = user32.SetThreadDesktop
SetThreadDesktop.argtypes = [wintypes.HANDLE]

EnumDesktopWindows = user32.EnumDesktopWindows
EnumDesktopWindows.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.LPARAM]

RegisterHotKey = user32.RegisterHotKey
RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]

UnregisterHotKey = user32.UnregisterHotKey
UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]

GetMessageW = user32.GetMessageW
GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]

# 가상 키 코드 및 상수
VK_ESCAPE = 0x1B   # ESC (대화방 닫기)
VK_RETURN = 0x0D   # Enter (유저 발송 타건)
VK_CONTROL = 0x11  # Ctrl
VK_MENU = 0x12     # Alt
VK_F = 0x46        # F (Ctrl+F 검색)
VK_V = 0x56        # V (Ctrl+V 붙여넣기)
VK_F8 = 0x77       # F8 (전역 단축키)
VK_F9 = 0x78       # F9 (일시정지 단축키)
VK_DOWN = 0x28     # Down Arrow (방향키 아래)
KEYEVENTF_KEYUP = 0x0002
SW_RESTORE = 9
SW_MINIMIZE = 6
HOTKEY_ID_F8 = 9001
WM_HOTKEY = 0x0312

# ==========================================
# 2. 전역 상태 (PWA 실시간 연동 큐 및 엔터 루프)
# ==========================================
SYNCED_STATE = {
    "recipients": [],
    "blocks": [],
    "currentIndex": 0,
    "mode": "classic",
    "channel": "kakao"
}
BOT_RUNNING = False              # 연속 발송 모드 가동 여부
WAITING_FOR_USER_ENTER = False   # 현재 대화방에서 유저의 [Enter] 대기 상태
CURRENT_TARGET_REC = None        # 현재 카톡에 장전된 대상 수신자
CURRENT_REC_BLOCKS = []          # 현재 대상 수신자에게 순차 발송할 블록 리스트
CURRENT_BLOCK_INDEX = 0          # 현재 발송 대기 중인 블록 인덱스 (0-based)
CURRENT_CHAT_HWND = None         # 현재 대상의 카카오톡 1:1 대화방 HWND
CURRENT_POPUP_HWND = None        # 카카오톡 [클립보드 이미지 전송] 팝업 모달 HWND
LAST_EVENT = None
STATE_LOCK = threading.Lock()

# ==========================================
# 3. 윈도우 OS 데스크톱 및 포커스 헬퍼
# ==========================================
def ensure_desktop_attached():
    try:
        hDesk = OpenInputDesktop(0, False, 0x01FF)
        if hDesk:
            SetThreadDesktop(hDesk)
            return hDesk
    except Exception:
        pass
    return None

def force_foreground(hwnd):
    if not hwnd or not user32.IsWindow(hwnd):
        return False

    ensure_desktop_attached()
    fg_hwnd = GetForegroundWindow()
    fg_tid = GetWindowThreadProcessId(fg_hwnd, None)
    cur_tid = kernel32.GetCurrentThreadId()

    attached = False
    if fg_tid and fg_tid != cur_tid:
        attached = bool(AttachThreadInput(cur_tid, fg_tid, True))

    try:
        ShowWindow(hwnd, SW_RESTORE)
        SetForegroundWindow(hwnd)
        BringWindowToTop(hwnd)
        # 윈도우 시스템 메뉴(Alt 메뉴) 모드 잔여 상태 원천 해제
        user32.SendMessageW(hwnd, 0x001F, 0, 0) # WM_CANCELMODE
    finally:
        if attached:
            AttachThreadInput(cur_tid, fg_tid, False)

    time.sleep(random.uniform(0.09, 0.16))
    return GetForegroundWindow() == hwnd

def find_kakaotalk_window():
    hDesk = ensure_desktop_attached()
    kakao_candidates = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def enum_proc(hwnd, lParam):
        buff = ctypes.create_unicode_buffer(512)
        GetWindowTextW(hwnd, buff, 512)
        cls_buff = ctypes.create_unicode_buffer(512)
        GetClassNameW(hwnd, cls_buff, 512)
        title = buff.value
        cls = cls_buff.value

        if cls.startswith('EVA_Window'):
            if '카카오톡' in title or 'KakaoTalk' in title or 'īī' in title:
                kakao_candidates.insert(0, hwnd)
            elif not title:
                kakao_candidates.append(hwnd)
        return True

    cb = WNDENUMPROC(enum_proc)
    if hDesk:
        EnumDesktopWindows(hDesk, cb, 0)
    else:
        user32.EnumWindows(cb, 0)

    return kakao_candidates[0] if kakao_candidates else None

def ensure_friends_tab(kakao_hwnd):
    """카카오톡 메인창이 확실하게 '친구' 탭을 보도록 보장 (단톡방/채팅탭 검색 원천 차단)"""
    ensure_desktop_attached()
    force_foreground(kakao_hwnd)
    time.sleep(random.uniform(0.09, 0.16))

    # 1. 혹시 열려있던 검색창이나 팝업을 ESC 2회로 초기화
    press_key(VK_ESCAPE)
    time.sleep(random.uniform(0.06, 0.12))
    press_key(VK_ESCAPE)
    time.sleep(random.uniform(0.06, 0.12))

    # 2. OnlineMainView, ContactListView, 검색창 Edit HWND 찾기
    WS_VISIBLE = 0x10000000
    GWL_STYLE = -16
    online_main_hwnd = None
    contact_hwnd = None
    search_edit_hwnd = None

    def enum_child(hwnd, lparam):
        nonlocal online_main_hwnd, contact_hwnd, search_edit_hwnd
        t = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, t, 256)
        c = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, c, 256)
        if 'OnlineMainView' in t.value:
            online_main_hwnd = hwnd
        elif 'ContactListView' in t.value:
            contact_hwnd = hwnd
        elif c.value == 'Edit' and contact_hwnd and not search_edit_hwnd:
            search_edit_hwnd = hwnd
        return True

    WNDENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumChildWindows(kakao_hwnd, WNDENUM(enum_child), 0)

    is_contact_visible = False
    if contact_hwnd:
        is_contact_visible = bool(user32.GetWindowLongW(contact_hwnd, GWL_STYLE) & WS_VISIBLE)

    # 친구 탭이 아닐 경우(채팅 탭 등에 있을 경우), 좌측 레일의 '친구' 아이콘(X=33, Y=50)을 PostMessage로 정밀 클릭!
    if not is_contact_visible:
        target_tab_window = online_main_hwnd if online_main_hwnd else kakao_hwnd
        lparam_friends = (50 << 16) | 33
        user32.PostMessageW(target_tab_window, 0x0201, 1, lparam_friends) # WM_LBUTTONDOWN
        time.sleep(random.uniform(0.03, 0.06))
        user32.PostMessageW(target_tab_window, 0x0202, 0, lparam_friends) # WM_LBUTTONUP
        time.sleep(random.uniform(0.18, 0.32))

    # 이전 검색어가 남아있으면 완전히 비우기
    if search_edit_hwnd:
        user32.SendMessageW(search_edit_hwnd, 0x000C, 0, '') # WM_SETTEXT ''
        user32.SendMessageW(search_edit_hwnd, 0x00B1, 0, -1) # EM_SETSEL all

    return search_edit_hwnd

def paste_message_to_chat(chat_hwnd, message: str):
    """카카오톡 대화방 입력창(RICHEDIT50W)에 메시지를 100% 확실하게 복사/주입하고 입력 포커스 활성화"""
    force_foreground(chat_hwnd)
    time.sleep(random.uniform(0.09, 0.16))
    set_clipboard_text(message)
    time.sleep(random.uniform(0.04, 0.08))

    # 대화창 내부의 RICHEDIT50W 컨트롤 탐색
    re_hwnds = []
    def find_re(h, lp):
        c = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(h, c, 256)
        if 'RICHEDIT' in c.value:
            re_hwnds.append(h)
        return True

    WNDENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumChildWindows(chat_hwnd, WNDENUM(find_re), 0)

    if re_hwnds:
        re_hwnd = re_hwnds[0]
        # 1. 입력창 내부를 클릭하여 키보드 포커스를 100% 안착시키고 시스템 메뉴 모드 원천 해제
        rect_re = wintypes.RECT()
        user32.GetWindowRect(re_hwnd, ctypes.byref(rect_re))
        click_x = rect_re.left + 35
        click_y = rect_re.top + 15
        user32.SetCursorPos(click_x, click_y)
        time.sleep(random.uniform(0.015, 0.035))
        user32.mouse_event(0x0002, 0, 0, 0, 0) # LEFTDOWN
        time.sleep(random.uniform(0.015, 0.035))
        user32.mouse_event(0x0004, 0, 0, 0, 0) # LEFTUP
        time.sleep(random.uniform(0.04, 0.08))

        # 2. AttachThreadInput으로 SetFocus 명시
        cur_tid = kernel32.GetCurrentThreadId()
        chat_tid = user32.GetWindowThreadProcessId(chat_hwnd, None)
        user32.AttachThreadInput(cur_tid, chat_tid, True)
        user32.SetFocus(re_hwnd)
        user32.AttachThreadInput(cur_tid, chat_tid, False)

        # 3. Ctrl+A ➔ Delete로 혹시 남아있을 수 있는 placeholder 텍스트 비우기
        press_hotkey(VK_CONTROL, 0x41) # Ctrl + A
        time.sleep(random.uniform(0.03, 0.06))
        press_key(0x2E) # Delete
        time.sleep(random.uniform(0.04, 0.08))

        # 4. 키보드 Ctrl + V로 메시지 붙여넣기 (카카오톡 EVA 프레임워크가 텍스트 입력을 인지하여 '전송' 버튼을 노란색으로 활성화!)
        press_hotkey(VK_CONTROL, VK_V)
        time.sleep(random.uniform(0.14, 0.24))

        # 5. 혹시 모를 시스템 메뉴 상태 완벽 취소
        user32.SendMessageW(chat_hwnd, 0x001F, 0, 0) # WM_CANCELMODE
    else:
        # 보조: 키보드 Ctrl + V
        press_hotkey(VK_CONTROL, VK_V)
        time.sleep(random.uniform(0.12, 0.20))

def set_clipboard_text(text: str) -> bool:
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002

    opened = False
    for _ in range(15):
        if user32.OpenClipboard(None):
            opened = True
            break
        time.sleep(0.03)
    if not opened:
        return False
    try:
        user32.EmptyClipboard()
        if not text:
            return True
        bytes_data = (text + '\0').encode('utf-16-le')
        h_mem = GlobalAlloc(GMEM_MOVEABLE, len(bytes_data))
        if not h_mem:
            return False
        ptr = GlobalLock(h_mem)
        if not ptr:
            return False
        ctypes.memmove(ptr, bytes_data, len(bytes_data))
        GlobalUnlock(h_mem)
        SetClipboardData(CF_UNICODETEXT, h_mem)
        return True
    finally:
        user32.CloseClipboard()

def set_clipboard_image_from_dataurl(data_url_str: str) -> bool:
    """Base64 dataUrl 또는 이미지 파일 경로를 Windows 클립보드 CF_DIB 형식으로 복사"""
    if not data_url_str:
        return False

    try:
        if os.path.exists(data_url_str):
            with open(data_url_str, "rb") as f:
                img_bytes = f.read()
        else:
            if ',' in data_url_str:
                b64_data = data_url_str.split(',', 1)[1]
            else:
                b64_data = data_url_str
            img_bytes = base64.b64decode(b64_data)

        if not Image:
            print("⚠️ PIL(Pillow) 라이브러리가 필요합니다.")
            return False

        im = Image.open(io.BytesIO(img_bytes))
        output = io.BytesIO()
        im.convert("RGB").save(output, "BMP")
        bmp_data = output.getvalue()[14:]  # 14-byte BITMAPFILEHEADER 제거 -> CF_DIB
        output.close()

        if win32clipboard and win32con:
            for _ in range(15):
                try:
                    win32clipboard.OpenClipboard()
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardData(win32con.CF_DIB, bmp_data)
                    win32clipboard.CloseClipboard()
                    return True
                except Exception:
                    time.sleep(0.04)
            return False
        else:
            CF_DIB = 8
            GMEM_MOVEABLE = 0x0002
            opened = False
            for _ in range(15):
                if user32.OpenClipboard(None):
                    opened = True
                    break
                time.sleep(0.03)
            if not opened:
                return False
            try:
                user32.EmptyClipboard()
                h_mem = GlobalAlloc(GMEM_MOVEABLE, len(bmp_data))
                if not h_mem:
                    return False
                ptr = GlobalLock(h_mem)
                if not ptr:
                    return False
                ctypes.memmove(ptr, bmp_data, len(bmp_data))
                GlobalUnlock(h_mem)
                SetClipboardData(CF_DIB, h_mem)
                return True
            finally:
                user32.CloseClipboard()
    except Exception as e:
        print(f"⚠️ 클립보드 이미지 변환/복사 실패: {e}")
        return False

def find_and_focus_image_popup():
    """카카오톡 [클립보드 이미지 전송] 팝업 모달창을 찾아 포그라운드 활성화"""
    hDesk = ensure_desktop_attached()
    popup_hwnd = None

    def enum_pop(h, _):
        nonlocal popup_hwnd
        if user32.IsWindowVisible(h):
            c = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(h, c, 256)
            if 'EVA' in c.value:
                r = wintypes.RECT()
                user32.GetWindowRect(h, ctypes.byref(r))
                w = r.right - r.left
                h_val = r.bottom - r.top
                # 클립보드 이미지 전송 팝업은 통상 300~450 x 350~500 크기
                if 250 <= w <= 500 and 250 <= h_val <= 550:
                    edit_found = False
                    def check_edit(ch, _):
                        nonlocal edit_found
                        ec = ctypes.create_unicode_buffer(256)
                        user32.GetClassNameW(ch, ec, 256)
                        if ec.value == 'Edit':
                            edit_found = True
                        return True
                    user32.EnumChildWindows(h, ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(check_edit), 0)
                    if edit_found:
                        popup_hwnd = h
        return True

    user32.EnumDesktopWindows(hDesk, ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)(enum_pop), 0)
    if popup_hwnd:
        force_foreground(popup_hwnd)
        return popup_hwnd
    return None

def paste_image_to_chat(chat_hwnd, data_url_str: str):
    """카카오톡 대화방 입력창에 이미지를 붙여넣어 [클립보드 이미지 전송] 팝업을 띄우고 포커스를 안착"""
    global CURRENT_POPUP_HWND
    ensure_desktop_attached()

    if not set_clipboard_image_from_dataurl(data_url_str):
        print("⚠️ 이미지 클립보드 장전 실패")
        return False

    force_foreground(chat_hwnd)
    time.sleep(0.12)

    re_hwnds = []
    def find_re(h, lp):
        c = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(h, c, 256)
        if 'RICHEDIT' in c.value:
            re_hwnds.append(h)
        return True

    WNDENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumChildWindows(chat_hwnd, WNDENUM(find_re), 0)

    if re_hwnds:
        re_hwnd = re_hwnds[0]
        rect_re = wintypes.RECT()
        user32.GetWindowRect(re_hwnd, ctypes.byref(rect_re))
        click_x = rect_re.left + 35
        click_y = rect_re.top + 15
        user32.SetCursorPos(click_x, click_y)
        time.sleep(random.uniform(0.015, 0.035))
        user32.mouse_event(0x0002, 0, 0, 0, 0)
        time.sleep(random.uniform(0.015, 0.035))
        user32.mouse_event(0x0004, 0, 0, 0, 0)
        time.sleep(random.uniform(0.04, 0.08))

        cur_tid = kernel32.GetCurrentThreadId()
        chat_tid = user32.GetWindowThreadProcessId(chat_hwnd, None)
        user32.AttachThreadInput(cur_tid, chat_tid, True)
        user32.SetFocus(re_hwnd)
        user32.AttachThreadInput(cur_tid, chat_tid, False)

    press_hotkey(VK_CONTROL, VK_V)
    time.sleep(random.uniform(0.28, 0.45))

    popup = find_and_focus_image_popup()
    CURRENT_POPUP_HWND = popup
    if popup:
        force_foreground(popup)
        time.sleep(random.uniform(0.08, 0.15))
    return True

def press_key(key_code: int):
    user32.keybd_event(key_code, 0, 0, 0)
    time.sleep(random.uniform(0.025, 0.065))
    user32.keybd_event(key_code, 0, KEYEVENTF_KEYUP, 0)

def press_hotkey(mod_code: int, key_code: int):
    user32.keybd_event(mod_code, 0, 0, 0)
    time.sleep(random.uniform(0.02, 0.05))
    user32.keybd_event(key_code, 0, 0, 0)
    time.sleep(random.uniform(0.025, 0.065))
    user32.keybd_event(key_code, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(mod_code, 0, KEYEVENTF_KEYUP, 0)

def get_active_window_title() -> str:
    hwnd = GetForegroundWindow()
    if not hwnd:
        return ""
    length = 512
    buff = ctypes.create_unicode_buffer(length)
    GetWindowTextW(hwnd, buff, length)
    return buff.value

def get_foreground_process_name(hwnd=None) -> str:
    try:
        if not hwnd:
            hwnd = GetForegroundWindow()
        if not hwnd or not user32.IsWindow(hwnd):
            return ""
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value and psutil:
            return psutil.Process(pid.value).name().lower()
    except Exception:
        pass
    return ""

def is_kakao_image_popup(hwnd) -> bool:
    if not hwnd or not user32.IsWindow(hwnd) or not user32.IsWindowVisible(hwnd):
        return False
    c = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, c, 256)
    if 'EVA' in c.value:
        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        w = r.right - r.left
        h_val = r.bottom - r.top
        if 250 <= w <= 500 and 250 <= h_val <= 550:
            return True
    return False

def is_valid_messenger_window(hwnd, channel: str = "kakao") -> bool:
    if not hwnd or not user32.IsWindow(hwnd):
        return False

    if channel == "kakao":
        if is_chat_window(hwnd):
            return True
        if CURRENT_POPUP_HWND and hwnd == CURRENT_POPUP_HWND:
            return True
        if is_kakao_image_popup(hwnd):
            return True
        return False

    pname = get_foreground_process_name(hwnd)
    if not pname:
        return False

    if channel == "telegram":
        return pname == "telegram.exe"

    if channel == "line":
        return pname == "line.exe"

    if channel == "wechat":
        return pname in ("wechat.exe", "wechatapp.exe")

    if channel == "whatsapp":
        if pname == "whatsapp.exe":
            return True
        if pname in ("chrome.exe", "whale.exe", "msedge.exe", "firefox.exe", "brave.exe"):
            t = get_active_window_title().lower()
            return "whatsapp" in t or "왓츠앱" in t
        return False

    if channel == "sms":
        return pname in ("phoneexperiencehost.exe", "yourphone.exe", "yourphoneappproxy.exe")

    all_known = ("kakaotalk.exe", "telegram.exe", "line.exe", "wechat.exe", "whatsapp.exe", "phoneexperiencehost.exe", "yourphone.exe")
    return pname in all_known

def get_recipient_phone(rec: dict) -> str:
    if not rec or not isinstance(rec, dict):
        return ""
    for k in ["phone", "전화번호", "연락처", "휴대폰", "핸드폰", "mobile", "tel"]:
        val = rec.get(k)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""

def normalize_korean_phone_intl(phone_str: str) -> str:
    digits = re.sub(r'[^0-9]', '', str(phone_str))
    if digits.startswith("0"):
        return "82" + digits[1:]
    return digits

def find_wechat_window():
    hDesk = ensure_desktop_attached()
    w_hwnd = None
    def cb(h, _):
        nonlocal w_hwnd
        if user32.IsWindowVisible(h):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
            if pid.value and psutil:
                try:
                    pname = psutil.Process(pid.value).name().lower()
                    if pname in ("wechat.exe", "wechatapp.exe"):
                        w_hwnd = h
                        return False
                except Exception:
                    pass
        return True
    WNDENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    if hDesk:
        user32.EnumDesktopWindows(hDesk, WNDENUM(cb), 0)
    else:
        user32.EnumWindows(WNDENUM(cb), 0)
    return w_hwnd

def find_telegram_window():
    hDesk = ensure_desktop_attached()
    w_hwnd = None
    def cb(h, _):
        nonlocal w_hwnd
        if user32.IsWindowVisible(h):
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
            if pid.value and psutil:
                try:
                    pname = psutil.Process(pid.value).name().lower()
                    if pname == "telegram.exe":
                        t = ctypes.create_unicode_buffer(512)
                        user32.GetWindowTextW(h, t, 512)
                        if t.value and "telegram" in t.value.lower():
                            w_hwnd = h
                            return False
                except Exception:
                    pass
        return True
    WNDENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    if hDesk:
        user32.EnumDesktopWindows(hDesk, WNDENUM(cb), 0)
    else:
        user32.EnumWindows(WNDENUM(cb), 0)
    return w_hwnd

def open_channel_chat_or_link(channel: str, rec: dict, first_block: dict):
    """
    채널별 최적화된 방식으로 대화방을 열고 첫 번째 블록(텍스트/사진)을 장전
    """
    name = str(rec.get("name") or rec.get("이름") or "")
    phone = get_recipient_phone(rec)
    intl_phone = normalize_korean_phone_intl(phone)
    b_type = first_block.get("type", "text")

    if channel == "kakao":
        chat_hwnd, pre_opened = open_or_focus_chat_window(name)
        if chat_hwnd:
            dispatch_single_block(chat_hwnd, first_block)
        return chat_hwnd, pre_opened

    elif channel == "telegram":
        if b_type == "text":
            txt = first_block.get("content", "")
            q_txt = urllib.parse.quote(txt)
            try:
                os.startfile(f"tg://msg?text={q_txt}")
            except Exception as e:
                print(f"[텔레그램 딥링크] {e}")
                set_clipboard_text(txt)
        else:
            set_clipboard_image_from_dataurl(first_block.get("dataUrl", ""))
            try:
                os.startfile("tg://msg")
            except Exception:
                pass
            time.sleep(random.uniform(0.45, 0.75))
            press_hotkey(VK_CONTROL, VK_V)
        return None, False

    elif channel == "line":
        if b_type == "text":
            txt = first_block.get("content", "")
            q_txt = urllib.parse.quote(txt)
            try:
                os.startfile(f"https://line.me/R/msg/text/?{q_txt}")
            except Exception as e:
                print(f"[라인 딥링크] {e}")
                set_clipboard_text(txt)
        else:
            set_clipboard_image_from_dataurl(first_block.get("dataUrl", ""))
            time.sleep(random.uniform(0.45, 0.75))
            press_hotkey(VK_CONTROL, VK_V)
        return None, False

    elif channel == "whatsapp":
        if b_type == "text":
            txt = first_block.get("content", "")
            q_txt = urllib.parse.quote(txt)
            url = f"https://wa.me/{intl_phone}?text={q_txt}" if intl_phone else f"https://wa.me/?text={q_txt}"
            try:
                os.startfile(url)
            except Exception as e:
                print(f"[왓츠앱 링크] {e}")
                set_clipboard_text(txt)
        else:
            set_clipboard_image_from_dataurl(first_block.get("dataUrl", ""))
            url = f"https://wa.me/{intl_phone}" if intl_phone else "https://web.whatsapp.com"
            try:
                os.startfile(url)
            except Exception:
                pass
            time.sleep(random.uniform(0.70, 1.05))
            press_hotkey(VK_CONTROL, VK_V)
        return None, False

    elif channel == "sms":
        if b_type == "text":
            txt = first_block.get("content", "")
            q_txt = urllib.parse.quote(txt)
            uri = f"sms:{phone}?body={q_txt}" if phone else f"sms:?body={q_txt}"
            try:
                os.startfile(uri)
            except Exception as e:
                print(f"[SMS 링크] {e}")
                set_clipboard_text(txt)
        else:
            set_clipboard_image_from_dataurl(first_block.get("dataUrl", ""))
            uri = f"sms:{phone}" if phone else "sms:"
            try:
                os.startfile(uri)
            except Exception:
                pass
            time.sleep(random.uniform(0.50, 0.85))
            press_hotkey(VK_CONTROL, VK_V)
        return None, False

    elif channel == "wechat":
        wechat_hwnd = find_wechat_window()
        if wechat_hwnd:
            force_foreground(wechat_hwnd)
            time.sleep(random.uniform(0.18, 0.32))
        if b_type == "text":
            set_clipboard_text(first_block.get("content", ""))
            press_hotkey(VK_CONTROL, VK_V)
        else:
            set_clipboard_image_from_dataurl(first_block.get("dataUrl", ""))
            time.sleep(random.uniform(0.18, 0.32))
            press_hotkey(VK_CONTROL, VK_V)
        return wechat_hwnd, False

    return None, False

# ==========================================
# 4. 일일 발송 카운트 관리
# ==========================================
STATS_FILE = os.path.join(os.path.dirname(__file__), "bot_stats.json")
DAILY_LIMIT = 500

def get_today_stats():
    today_str = str(date.today())
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("date") == today_str:
                    return data.get("count", 0)
        except Exception:
            pass
    return 0

def increment_today_stats():
    today_str = str(date.today())
    count = get_today_stats() + 1
    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump({"date": today_str, "count": count}, f, ensure_ascii=False)
    except Exception as e:
        print(f"[경고] 통계 파일 저장 실패: {e}")
    return count

def is_chat_window(hwnd):
    if not hwnd or not user32.IsWindow(hwnd) or not user32.IsWindowVisible(hwnd):
        return False
    c = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, c, 256)
    cls_name = c.value
    if not cls_name.startswith('EVA_Window'):
        return False
    t = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(hwnd, t, 512)
    title = t.value
    # 메인창("카카오톡", "KakaoTalk") 제외
    if '카카오톡' in title or title.strip().lower() == 'kakaotalk' or 'īī' in title:
        return False
    # MOMENT 광고 배너창(높이 90px 내외) 및 보이지 않는 0px 창 제외
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    height = rect.bottom - rect.top
    width = rect.right - rect.left
    if height < 180 or width < 180:
        return False
    return True

def find_open_chat_window(target_name: str = ""):
    hDesk = ensure_desktop_attached()
    matched = []
    any_chat = []
    fg = GetForegroundWindow()
    clean_target = target_name.strip().lower()

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd, lParam):
        if is_chat_window(hwnd):
            t = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, t, 512)
            title = t.value.strip().lower()
            if clean_target and (clean_target in title or (title and title in clean_target)):
                matched.append(hwnd)
            any_chat.append(hwnd)
        return True

    cb = WNDENUMPROC(enum_proc)
    if hDesk:
        EnumDesktopWindows(hDesk, cb, 0)
    else:
        user32.EnumWindows(cb, 0)

    # 1. 이름이 매칭된 대화창이 있는 경우 최우선 반환
    if matched:
        if fg in matched:
            return fg
        return matched[0]

    # [핵심] 대상 친구 이름(target_name)이 지정되어 있는데 매칭 창이 없다면,
    # 엉뚱한 단톡방이나 이전 대화창을 매칭하지 않고 반드시 None을 반환해야 함!
    if clean_target:
        return None

    # target_name이 비어있을 때만 범용 fallback
    if fg and is_chat_window(fg):
        return fg
    if len(any_chat) == 1:
        return any_chat[0]

    return None

# ==========================================
# 5. 핵심 발송 파이프라인 (Multi-Block Sequential Dispatch Engine)
# ==========================================
def open_or_focus_chat_window(target_name: str):
    """
    대상 친구와의 1:1 대화방을 찾거나 검색하여 열고 포커스 활성화
    반환: (chat_hwnd, pre_opened)
    """
    time.sleep(random.uniform(0.08, 0.15))

    # 1. 대상 친구와의 1:1 대화창이 이미 열려있는 경우 (0초 즉시 직통)
    existing_chat = find_open_chat_window(target_name)
    if existing_chat:
        force_foreground(existing_chat)
        return existing_chat, True

    # 2. 카카오톡 메인창 탐색 및 활성화
    kakao_hwnd = find_kakaotalk_window()
    if not kakao_hwnd:
        return None, False

    # 3. [친구 탭 강제 전환] 단톡방/오픈채팅/채팅방 검색 원천 차단!
    search_edit = ensure_friends_tab(kakao_hwnd)
    force_foreground(kakao_hwnd)
    time.sleep(random.uniform(0.08, 0.15))

    # 4. 친구 검색창 커서 활성화 및 기존 텍스트 비우기
    if search_edit:
        user32.SendMessageW(search_edit, 0x000C, 0, '') # WM_SETTEXT ''
        time.sleep(random.uniform(0.03, 0.07))

    press_hotkey(VK_CONTROL, VK_F)
    time.sleep(random.uniform(0.09, 0.16))

    # 5. 친구 이름 입력 (Ctrl+V 1회)
    set_clipboard_text(target_name)
    time.sleep(random.uniform(0.04, 0.08))
    press_hotkey(VK_CONTROL, VK_V)
    time.sleep(random.uniform(0.28, 0.45))

    # 6. [Enter] 타건하여 친구 1:1 대화방 오픈
    press_key(VK_RETURN)
    time.sleep(random.uniform(0.42, 0.65))

    # 7. 1:1 대화방 오픈 확인 및 대기
    chat_hwnd = None
    start_wait = time.time()
    while time.time() - start_wait < 1.5:
        chat_hwnd = find_open_chat_window(target_name)
        if chat_hwnd:
            break
        fg_hwnd = GetForegroundWindow()
        if fg_hwnd and fg_hwnd != kakao_hwnd and is_chat_window(fg_hwnd):
            t = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(fg_hwnd, t, 512)
            clean_t = t.value.strip().lower()
            clean_tgt = target_name.strip().lower()
            if clean_tgt in clean_t or (clean_t and clean_t in clean_tgt):
                chat_hwnd = fg_hwnd
                break
        time.sleep(random.uniform(0.08, 0.14))

    if not chat_hwnd:
        # 보조 시도: 방향키 아래(Down) ➔ Enter
        press_key(VK_DOWN)
        time.sleep(random.uniform(0.06, 0.12))
        press_key(VK_RETURN)
        time.sleep(random.uniform(0.42, 0.65))
        chat_hwnd = find_open_chat_window(target_name)

    if chat_hwnd:
        force_foreground(chat_hwnd)
        return chat_hwnd, False

    return None, False

def execute_dispatch(target_name: str, message: str, mode: str = "classic"):
    """단일 메시지 하위 호환 발송 인터페이스"""
    today_count = get_today_stats()
    if today_count >= DAILY_LIMIT:
        return {
            "status": "limit_exceeded",
            "message": f"1일 최대 안전 발송량({DAILY_LIMIT}건) 도달로 차단되었습니다."
        }

    chat_hwnd, pre_opened = open_or_focus_chat_window(target_name)
    if chat_hwnd:
        paste_message_to_chat(chat_hwnd, message)
        return {
            "status": "success",
            "message": f"'{target_name}' 대화방에 메시지가 장전되었습니다.",
            "pre_opened": pre_opened
        }

    return {
        "status": "not_found",
        "message": f"카톡에서 친구 '{target_name}' 님을 찾지 못했습니다. 친구 이름이 정확한지 확인하세요."
    }

# ==========================================
# 6. 블록 시퀀스 구성 및 엔터 연속 발송 루프
# ==========================================
def get_blocks_for_recipient(blocks, rec):
    """
    수신자에게 순차적으로 발송할 유효 블록 리스트 생성 (텍스트, 사진 등 순서 완벽 유지)
    """
    valid_blocks = []
    name_val = str(rec.get("name") or rec.get("이름") or "")
    title_val = str(rec.get("title") or rec.get("직함") or rec.get("직책") or "")
    org_val = str(rec.get("org") or rec.get("소속") or rec.get("회사") or "")
    phone_val = str(rec.get("phone") or rec.get("전화번호") or rec.get("연락처") or rec.get("휴대폰") or "")
    memo_val = str(rec.get("memo") or rec.get("메모") or rec.get("비고") or "")

    if blocks and isinstance(blocks, list):
        for b in blocks:
            b_type = b.get("type", "text")
            if b_type == "text":
                txt = b.get("content", "")
                if not txt or not txt.strip():
                    continue
                # 개인화 동적 변수 치환
                txt = txt.replace("#{이름}", name_val)
                txt = txt.replace("#{직함}", title_val)
                txt = txt.replace("#{소속}", org_val)
                txt = txt.replace("#{전화번호}", phone_val)
                txt = txt.replace("#{메모}", memo_val)

                for k, v in rec.items():
                    if k not in ("message", "msg") and not str(k).startswith("_"):
                        if v is not None and v != "":
                            txt = txt.replace(f"#{{{k}}}", str(v))

                if b.get("isAd"):
                    if not txt.startswith("(광고)"):
                        txt = f"(광고)\n{txt}"
                    opt = f"\n\n무료수신거부: {b.get('optOutNum', '080-880-7766')}"
                    if "무료수신거부" not in txt:
                        txt += opt

                valid_blocks.append({
                    "type": "text",
                    "content": txt,
                    "title": b.get("title", "텍스트 블록")
                })

            elif b_type == "image":
                data_url = b.get("dataUrl", "")
                if data_url and (data_url.startswith("data:image") or len(data_url) > 100 or os.path.exists(data_url)):
                    valid_blocks.append({
                        "type": "image",
                        "dataUrl": data_url,
                        "fileName": b.get("fileName", "image.png"),
                        "title": b.get("title", "이미지 블록")
                    })

    # 만약 유효 블록이 하나도 없다면, 사전 조합된 message 또는 기본 텍스트 1개로 fallback
    if not valid_blocks:
        fallback_msg = rec.get("message", "").strip()
        if fallback_msg:
            valid_blocks.append({
                "type": "text",
                "content": fallback_msg,
                "title": "텍스트 블록"
            })

    return valid_blocks

def dispatch_single_block(chat_hwnd, block):
    """대화방에 단일 블록(텍스트 또는 사진)을 장전"""
    b_type = block.get("type", "text")
    if b_type == "image":
        return paste_image_to_chat(chat_hwnd, block.get("dataUrl", ""))
    else:
        paste_message_to_chat(chat_hwnd, block.get("content", ""))
        return True

def load_and_dispatch_next():
    """다음 대기자를 카카오톡에 장전하고 유저의 엔터 대기 상태로 전환"""
    global WAITING_FOR_USER_ENTER, BOT_RUNNING, CURRENT_TARGET_REC, LAST_EVENT
    global CURRENT_REC_BLOCKS, CURRENT_BLOCK_INDEX, CURRENT_CHAT_HWND, CURRENT_POPUP_HWND

    today_count = get_today_stats()
    if today_count >= DAILY_LIMIT:
        with STATE_LOCK:
            BOT_RUNNING = False
            WAITING_FOR_USER_ENTER = False
            LAST_EVENT = {
                "type": "paused",
                "message": f"1일 최대 안전 발송량({DAILY_LIMIT}건) 도달로 중단되었습니다.",
                "timestamp": time.time()
            }
        return False

    with STATE_LOCK:
        recipients = SYNCED_STATE.get("recipients", [])
        blocks = SYNCED_STATE.get("blocks", [])
        curr_idx = SYNCED_STATE.get("currentIndex", 0)

        target_rec = None
        target_idx = -1

        # 현재 인덱스부터 대기자(pending) 탐색
        for i in range(curr_idx, len(recipients)):
            if recipients[i].get("status") == "pending":
                target_rec = recipients[i]
                target_idx = i
                break

        # 없으면 0번부터 다시 탐색
        if not target_rec:
            for i in range(0, curr_idx):
                if recipients[i].get("status") == "pending":
                    target_rec = recipients[i]
                    target_idx = i
                    break

        if not target_rec:
            BOT_RUNNING = False
            WAITING_FOR_USER_ENTER = False
            CURRENT_TARGET_REC = None
            CURRENT_REC_BLOCKS = []
            CURRENT_BLOCK_INDEX = 0
            CURRENT_POPUP_HWND = None
            print("\n" + "=" * 60)
            print("   🎉 [축하] 모든 수신자에게 발송이 완료되었습니다!")
            print("=" * 60)
            LAST_EVENT = {
                "type": "all_completed",
                "timestamp": time.time()
            }
            return False

        SYNCED_STATE["currentIndex"] = target_idx
        CURRENT_TARGET_REC = target_rec
        name = target_rec.get("name", "")
        CURRENT_REC_BLOCKS = get_blocks_for_recipient(blocks, target_rec)
        CURRENT_BLOCK_INDEX = 0
        CURRENT_POPUP_HWND = None

    if not CURRENT_REC_BLOCKS:
        print(f"⚠️ '{name}' 대상에게 보낼 블록(메시지)이 없습니다. 완료 처리합니다.")
        with STATE_LOCK:
            target_rec["status"] = "done"
        load_and_dispatch_next()
        return False

    channel = SYNCED_STATE.get("channel", "kakao")
    total_b = len(CURRENT_REC_BLOCKS)
    print(f"\n[🚀 장전 시작] {target_idx + 1}번째 대상: '{name}' (총 {total_b}개 블록) [{channel.upper()}] 호출 중...")

    # 1:1 대화방 열기 or 딥링크 호출 및 첫 블록 장전
    chat_hwnd, pre_opened = open_channel_chat_or_link(channel, target_rec, CURRENT_REC_BLOCKS[0])
    if channel == "kakao" and not chat_hwnd:
        print(f"⚠️ 카톡에서 '{name}' 대화방을 열지 못했습니다.")
        with STATE_LOCK:
            BOT_RUNNING = False
            WAITING_FOR_USER_ENTER = False
            LAST_EVENT = {
                "type": "paused",
                "message": f"카톡에서 친구 '{name}' 님을 찾지 못했습니다.",
                "timestamp": time.time()
            }
        return False

    target_rec["_pre_opened"] = pre_opened
    CURRENT_CHAT_HWND = chat_hwnd

    WAITING_FOR_USER_ENTER = True
    first_block = CURRENT_REC_BLOCKS[0]
    with STATE_LOCK:
        LAST_EVENT = {
            "type": "loaded_waiting_enter",
            "id": target_rec.get("id"),
            "name": name,
            "currentIndex": target_idx,
            "blockIndex": 0,
            "totalBlocks": total_b,
            "blockType": first_block["type"],
            "channel": channel,
            "timestamp": time.time()
        }

    b_type_kr = "사진(이미지)" if first_block["type"] == "image" else "텍스트"
    print(f"👉 [입력 대기] '{name}' 대화방에 [1/{total_b} {b_type_kr}] 장전 완료!")
    print(f"   메신저 화면을 보며 [Enter]만 치세요! (다중 블록인 경우 엔터 시 다음 블록이 연속 자동 붙여넣기됩니다)")
    return True

def enter_listener_loop():
    """
    메신저 대화방에서 유저의 [Enter] 타건을 감지하여
    동일 대화방 내 다중 블록(텍스트/사진) 순차 장전 및 다음 대상을 연속 장전하는 핵심 루프 (전 채널 지원)
    """
    global WAITING_FOR_USER_ENTER, BOT_RUNNING, CURRENT_TARGET_REC, LAST_EVENT
    global CURRENT_REC_BLOCKS, CURRENT_BLOCK_INDEX, CURRENT_CHAT_HWND, CURRENT_POPUP_HWND
    ensure_desktop_attached()
    print("[*] ✅ 센스봇 [Enter] 연속 발송 감지 엔진 가동 중... (전 채널 다중 블록 순차 지원)")

    while True:
        time.sleep(0.02)

        # F9 키 감지 시 일시정지
        if user32.GetAsyncKeyState(VK_F9) & 0x8000:
            while user32.GetAsyncKeyState(VK_F9) & 0x8000:
                time.sleep(0.02)
            if BOT_RUNNING:
                BOT_RUNNING = False
                WAITING_FOR_USER_ENTER = False
                print("\n[⏸️ 일시정지] 센스봇 자동 루프가 일시정지되었습니다. (PWA [발송 시작] 또는 F8로 재개)")
                with STATE_LOCK:
                    LAST_EVENT = {"type": "paused", "timestamp": time.time()}
                continue

        if not BOT_RUNNING or not WAITING_FOR_USER_ENTER:
            continue

        # 유저가 Enter 키를 눌렀는지 확인 (최상위 비트 0x8000)
        if user32.GetAsyncKeyState(VK_RETURN) & 0x8000:
            fg = GetForegroundWindow()
            channel = SYNCED_STATE.get("channel", "kakao")
            is_valid_fg = is_valid_messenger_window(fg, channel)
            if not is_valid_fg:
                time.sleep(0.05)
                continue

            # 키를 뗄 때까지 대기 (Key-Up 시점에 발송 확정)
            while user32.GetAsyncKeyState(VK_RETURN) & 0x8000:
                time.sleep(0.01)

            WAITING_FOR_USER_ENTER = False
            CURRENT_POPUP_HWND = None

            rec = CURRENT_TARGET_REC
            name = rec.get("name", "") if rec else ""
            total_b = len(CURRENT_REC_BLOCKS)
            curr_b_idx = CURRENT_BLOCK_INDEX

            b_type_kr = "사진" if (curr_b_idx < total_b and CURRENT_REC_BLOCKS[curr_b_idx]["type"] == "image") else "텍스트"
            print(f"   [타건 감지] '{name}'님 [{curr_b_idx + 1}/{total_b} {b_type_kr}] 전송 확정! ({channel})")

            # 1. 다음 블록이 더 남아있는 경우: 동일 대화방에서 다음 블록(사진 등) 연속 장전!
            if curr_b_idx + 1 < total_b:
                CURRENT_BLOCK_INDEX += 1
                next_b_idx = CURRENT_BLOCK_INDEX
                next_block = CURRENT_REC_BLOCKS[next_b_idx]
                next_b_kr = "사진(이미지)" if next_block["type"] == "image" else "텍스트"

                # 이전 말풍선 전송 안정화 및 어뷰징 패턴 탐지 방어 지터 (0.4 ~ 1.0초 무작위 지연)
                block_delay = random.uniform(0.4, 1.0)
                time.sleep(block_delay)

                if channel == "kakao":
                    chat_h = CURRENT_CHAT_HWND if (CURRENT_CHAT_HWND and user32.IsWindow(CURRENT_CHAT_HWND)) else find_open_chat_window(name)
                    if chat_h:
                        CURRENT_CHAT_HWND = chat_h
                        dispatch_single_block(chat_h, next_block)
                    else:
                        print(f"⚠️ 대화방을 찾을 수 없어 '{name}' 대상의 남은 블록 장전을 건너뜁니다.")
                else:
                    # 비카카오 채널: 활성화된 메신저 창에 다음 블록(사진/텍스트) Ctrl+V 자동 주입!
                    if next_block["type"] == "image":
                        set_clipboard_image_from_dataurl(next_block["dataUrl"])
                    else:
                        set_clipboard_text(next_block["content"])

                    if fg and user32.IsWindow(fg):
                        force_foreground(fg)
                    time.sleep(random.uniform(0.1, 0.18))
                    press_hotkey(VK_CONTROL, VK_V)

                WAITING_FOR_USER_ENTER = True
                with STATE_LOCK:
                    LAST_EVENT = {
                        "type": "loaded_waiting_enter",
                        "id": rec.get("id") if rec else "",
                        "name": name,
                        "blockIndex": next_b_idx,
                        "totalBlocks": total_b,
                        "blockType": next_block["type"],
                        "channel": channel,
                        "timestamp": time.time()
                    }
                print(f"👉 [입력 대기] '{name}' 대화방에 [{next_b_idx + 1}/{total_b} {next_b_kr}] 자동 장전 완료! (텀: {block_delay:.2f}초)")
                print(f"   메신저 화면에서 [Enter]를 치세요.")
                continue

            # 2. 모든 블록 발송 완료: 해당 수신자 완료 처리 및 다음 대상 전진
            new_count = increment_today_stats()
            print(f"[✅ 발송 완료] '{name}' 님께 모든 블록({total_b}개) 발송 완료! (금일 {new_count}/{DAILY_LIMIT}건)")

            with STATE_LOCK:
                if rec:
                    rec["status"] = "done"
                LAST_EVENT = {
                    "type": "sent_and_advancing",
                    "id": rec.get("id") if rec else "",
                    "name": name,
                    "channel": channel,
                    "timestamp": time.time()
                }

            # 메시지 전송 완료 및 어뷰징 방어 자연스러운 지터 (0.35 ~ 0.75초 무작위 지연)
            time.sleep(random.uniform(0.35, 0.75))

            has_more = False
            with STATE_LOCK:
                recipients = SYNCED_STATE.get("recipients", [])
                has_more = any(r.get("status") == "pending" for r in recipients)

            pre_opened = rec.get("_pre_opened", False) if rec else False
            if channel == "kakao" and not pre_opened and has_more:
                press_key(VK_ESCAPE)
                time.sleep(random.uniform(0.18, 0.35))

            # 다음 대기자 즉시 자동 장전!
            if BOT_RUNNING:
                if has_more:
                    load_and_dispatch_next()
                else:
                    time.sleep(1.0)
                    with STATE_LOCK:
                        BOT_RUNNING = False
                        WAITING_FOR_USER_ENTER = False
                        CURRENT_TARGET_REC = None
                        CURRENT_REC_BLOCKS = []
                        CURRENT_BLOCK_INDEX = 0
                        LAST_EVENT = {
                            "type": "all_completed",
                            "timestamp": time.time()
                        }
                    print("\n" + "=" * 60)
                    print("   🎉 [축하] 모든 수신자에게 발송이 완료되었습니다!")
                    print("=" * 60)

def hotkey_listener_thread():
    """Windows 메시지 루프를 돌며 F8 전역 핫키 감지 (수동 시작/재개용)"""
    global BOT_RUNNING
    ensure_desktop_attached()
    if not RegisterHotKey(None, HOTKEY_ID_F8, 0, VK_F8):
        print(f"[경고] F8 전역 핫키 등록 실패. 관리자 권한이나 충돌 여부를 확인하세요.")
        return

    msg = wintypes.MSG()
    while GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        if msg.message == WM_HOTKEY:
            if msg.wParam == HOTKEY_ID_F8:
                if not BOT_RUNNING:
                    print("\n[⚡ F8 감지] 센스봇 엔터 발송 모드를 시작합니다!")
                    BOT_RUNNING = True
                    threading.Thread(target=load_and_dispatch_next, daemon=True).start()
                else:
                    # 이미 실행 중이면 다음 대상으로 강제 전진
                    threading.Thread(target=load_and_dispatch_next, daemon=True).start()

    UnregisterHotKey(None, HOTKEY_ID_F8)

# ==========================================
# 7. HTTP REST API & 동기화 서버
# ==========================================
class SenseBotRequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/health", "/status"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()

            res = {
                "status": "ok",
                "service": "SenseBot Local Daemon",
                "version": SENSEBOT_VERSION,
                "bot_running": BOT_RUNNING,
                "waiting_enter": WAITING_FOR_USER_ENTER,
                "today_sent": get_today_stats(),
                "daily_limit": DAILY_LIMIT,
                "kakao_running": find_kakaotalk_window() is not None,
                "workflow": "one_enter_continuous"
            }
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))

        elif parsed.path == "/poll":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()

            with STATE_LOCK:
                res = {
                    "last_event": LAST_EVENT,
                    "version": SENSEBOT_VERSION,
                    "bot_running": BOT_RUNNING,
                    "waiting_enter": WAITING_FOR_USER_ENTER,
                    "currentIndex": SYNCED_STATE.get("currentIndex", 0),
                    "recipients": SYNCED_STATE.get("recipients", []),
                    "channel": SYNCED_STATE.get("channel", "kakao"),
                    "today_sent": get_today_stats(),
                    "daily_limit": DAILY_LIMIT
                }
            self.wfile.write(json.dumps(res, ensure_ascii=False).encode("utf-8"))

        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def do_POST(self):
        global BOT_RUNNING, WAITING_FOR_USER_ENTER
        parsed = urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8")
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        if parsed.path == "/sync":
            with STATE_LOCK:
                if "recipients" in data:
                    SYNCED_STATE["recipients"] = data["recipients"]
                if "blocks" in data:
                    SYNCED_STATE["blocks"] = data["blocks"]
                if "currentIndex" in data:
                    SYNCED_STATE["currentIndex"] = data["currentIndex"]
                if "mode" in data:
                    SYNCED_STATE["mode"] = data["mode"]
                if "channel" in data:
                    SYNCED_STATE["channel"] = data["channel"]

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "synced", "count": len(SYNCED_STATE['recipients'])}, ensure_ascii=False).encode("utf-8"))

        elif parsed.path == "/start":
            BOT_RUNNING = True
            threading.Thread(target=load_and_dispatch_next, daemon=True).start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "started"}, ensure_ascii=False).encode("utf-8"))

        elif parsed.path == "/pause":
            BOT_RUNNING = False
            WAITING_FOR_USER_ENTER = False
            with STATE_LOCK:
                LAST_EVENT = {"type": "paused", "timestamp": time.time()}

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "paused"}, ensure_ascii=False).encode("utf-8"))

        elif parsed.path == "/dispatch":
            target_name = data.get("name", "")
            message = data.get("message", "")
            mode = data.get("mode", "classic")

            if not target_name or not message:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": "name과 message는 필수입니다."}, ensure_ascii=False).encode("utf-8"))
                return

            result = execute_dispatch(target_name, message, mode)
            if result.get("status") == "success":
                WAITING_FOR_USER_ENTER = True

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def log_message(self, format, *args):
        pass

# ==========================================
# 8. 메인 실행 함수
# ==========================================
def main():
    host = "127.0.0.1"
    port = 28888
    server = ThreadingHTTPServer((host, port), SenseBotRequestHandler)

    # 1. 엔터 1회 연속 발송 리스너 스레드 가동
    t_enter = threading.Thread(target=enter_listener_loop, daemon=True)
    t_enter.start()

    # 2. 보조 F8 전역 핫키 리스너 스레드 가동
    t_hotkey = threading.Thread(target=hotkey_listener_thread, daemon=True)
    t_hotkey.start()

    kakao_hwnd = find_kakaotalk_window()
    print("=" * 68)
    print(f"   🤖 [SensTalk] 센스봇(SenseBot) 로컬 데몬 v{SENSEBOT_VERSION} (엔터 1회 연속 발송)")
    print("=" * 68)
    print(f" - 포트 번호: http://{host}:{port}")
    print(f" - 카카오톡 감지: {'[ON] 탐색 성공 (HWND=' + str(kakao_hwnd) + ')' if kakao_hwnd else '[OFF] 카카오톡 미실행'}")
    print(f" - 오늘 발송량: {get_today_stats()} / {DAILY_LIMIT}건 (안전 하드 리밋)")
    print(" - ⭐ 핵심 동선: 카카오톡 화면에서 오직 [Enter]만 치면 연속 자동 발송!")
    print("   (루프: 유저 [Enter] -> 봇이 ESC 닫고 다음 사람 장전 -> 유저 [Enter])")
    print(" - 일시정지: 키보드 [F9] 키 또는 PWA [일시정지] 버튼")
    print(" - 데몬 종료: 키보드 Ctrl + C")
    print("=" * 68)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] 센스봇 데몬을 안전하게 종료합니다.")
        server.server_close()

if __name__ == "__main__":
    main()
