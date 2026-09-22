# ⚡ 센스톡(SenseTalk) x 허브앱(Hub App) 전용 Supabase 통합 DB 스키마 명세서

> **문서 대상:** 허브앱(Hub App) 백엔드/DB 담당 AI 엔지니어  
> **작성 일시:** 2026-09-22  
> **스키마 버전:** v1.0.0 (Production-Ready)  
> **기술 스택:** Supabase (PostgreSQL 15+), Row Level Security(RLS), Supabase Storage, Supabase Auth  
> **연동 목적:** 센스톡(웹 캔버스 + 센스봇)의 로컬스토리지 기반 데이터를 Supabase 클라우드로 영구 동기화하고, 허브앱의 공통 회원/구독/인증 체계와 완벽 통합

---

## 1. 아키텍처 및 데이터 흐름 요약

```
┌────────────────────────────────────────────────────────────────────────┐
│                        허브앱 (Hub App) 중앙 통합 계층                  │
│   - auth.users (Supabase Auth: 이메일/카카오/구글 통합 로그인)           │
│   - public.profiles / subscriptions (통합 구독 및 단일 크레딧 과금)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ user_id (UUID)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     센스톡 (SenseTalk) 서비스 데이터 모델                │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ 1. 상용구 & 서랍   │ 2. 캔버스 블록     │ 3. 명단 & 수신자                │
│  - snippet_cats   │  - templates      │  - recipient_groups            │
│  - snippets       │  - (blocks JSONB) │  - recipients (동적 컬럼 지원)  │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ 4. 발송 로그/이력 │ 5. 구글 시트 연동 │ 6. 센스봇 PC 페어링             │
│  - send_logs      │  - sheets_sync    │  - bot_pairing (데몬 상태)      │
└───────────────────┴───────────────────┴────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Supabase Storage: [sensetalk-media]                  │
│   - 상용구 사진, 캔버스 첨부 이미지, 스크린샷 영구 CDN 호스팅            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 테이블 목록 및 핵심 역할

| # | 테이블명 | 설명 | 비고 |
|---|---|---|---|
| **1** | `sensetalk_user_settings` | 센스톡 개인화 환경설정, 발송 채널, 구독 한도 캐시 | 1 유저 당 1 레코드 |
| **2** | `sensetalk_snippet_categories` | 상용구 서랍 탭 카테고리 (`전체`, `이미지`, `일반` 고정 탭 보호) | 정렬 순서 및 고정 여부 |
| **3** | `sensetalk_snippets` | 자주 쓰는 상용구 본문(텍스트 치환변수) 및 이미지 에셋 | 텍스트/이미지 통합 지원 |
| **4** | `sensetalk_templates` | 메시지 블록 조립(레고 구조) 템플릿 프리셋 | JSONB 블록 배열 저장 |
| **5** | `sensetalk_recipient_groups` | 수신자 명단 그룹 프리셋 (엑셀/시트별 장부) | 동적 헤더 스키마 포함 |
| **6** | `sensetalk_recipients` | 그룹에 속한 개별 수신자 행 (이름, 전화번호, 상태, 커스텀 필드) | JSONB extra_data 확장 |
| **7** | `sensetalk_send_logs` | [Enter] 타건 발송 성공/실패 이력 및 실제 치환 본문 로그 | 통계 및 리포트용 |
| **8** | `sensetalk_google_sheets` | 차기 로드맵: 구글 스프레드시트 실시간 양방향 연동 장부 설정 | Read-Only & Two-Way |
| **9** | `sensetalk_bot_pairing` | 유저 로컬 PC의 센스봇(SenseBot 2.3+) 클라이언트 연결 상태 | 하트비트 및 데몬 제어 |

---

## 3. 완전한 Supabase SQL DDL (복사하여 바로 실행 가능)

```sql
-- ============================================================================
-- 0. 타임스탬프 자동 갱신 트리거 함수
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sensetalk_handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. 센스톡 유저 환경설정 테이블
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_channel VARCHAR(30) NOT NULL DEFAULT 'kakao', -- kakao, line, telegram, whatsapp, wechat
  recipient_view_mode VARCHAR(20) NOT NULL DEFAULT 'card', -- card, table
  bot_mode VARCHAR(20) NOT NULL DEFAULT 'classic', -- classic, safety
  bot_url VARCHAR(255) NOT NULL DEFAULT 'http://127.0.0.1:28888',
  is_drawer_open BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sensetalk_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sensetalk settings"
  ON public.sensetalk_user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own sensetalk settings"
  ON public.sensetalk_user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_user_settings_updated_at
  BEFORE UPDATE ON public.sensetalk_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 2. 상용구 카테고리 탭 (고정 탭 보호 및 순서 관리)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_snippet_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL, -- '전체', '이미지', '일반', '인사', '계좌' 등
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(50) NOT NULL DEFAULT 'label', -- Material Symbols icon name
  is_fixed BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE: 전체, 이미지, 일반 (임의 삭제 불가)
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, code)
);

CREATE INDEX idx_sensetalk_cat_user_sort ON public.sensetalk_snippet_categories(user_id, sort_order ASC);

ALTER TABLE public.sensetalk_snippet_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own snippet categories"
  ON public.sensetalk_snippet_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_snippet_categories_updated_at
  BEFORE UPDATE ON public.sensetalk_snippet_categories
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 3. 상용구 서랍 아이템 (텍스트 치환 문구 + 이미지 에셋)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_code VARCHAR(50) NOT NULL DEFAULT '일반', -- '이미지', '일반', '인사' 등
  type VARCHAR(20) NOT NULL DEFAULT 'text', -- 'text' | 'image'
  title VARCHAR(120) NOT NULL,
  content TEXT DEFAULT '', -- 텍스트 상용구 본문 (#{이름}, #{전화번호} 등 치환변수)
  image_url TEXT DEFAULT '', -- Supabase Storage 미디어 URL
  file_name VARCHAR(255) DEFAULT '',
  file_size VARCHAR(50) DEFAULT '',
  dimensions VARCHAR(50) DEFAULT '',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensetalk_snip_user_cat ON public.sensetalk_snippets(user_id, category_code);
CREATE INDEX idx_sensetalk_snip_fav ON public.sensetalk_snippets(user_id, is_favorite);

ALTER TABLE public.sensetalk_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own snippets"
  ON public.sensetalk_snippets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_snippets_updated_at
  BEFORE UPDATE ON public.sensetalk_snippets
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 4. 메시지 조립 템플릿 (레고 블록 구조)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(255) DEFAULT '',
  channel VARCHAR(30) NOT NULL DEFAULT 'kakao',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of block objects [{id, type, title, content, isAd, optOutNum, dataUrl, ...}]
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensetalk_tpl_user ON public.sensetalk_templates(user_id, created_at DESC);

ALTER TABLE public.sensetalk_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON public.sensetalk_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_templates_updated_at
  BEFORE UPDATE ON public.sensetalk_templates
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 5. 수신자 명단 그룹 (엑셀 / 시트 장부 단위 프리셋)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_recipient_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL, -- 예: "9월 VIP 환우 고객", "2차 세미나 대기자"
  custom_fields JSONB NOT NULL DEFAULT '["이름", "전화번호", "직함", "소속"]'::jsonb, -- 동적 컬럼 헤더 배열
  total_count INT NOT NULL DEFAULT 0,
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual', -- 'manual', 'excel', 'google_sheets'
  google_sheet_id VARCHAR(255) DEFAULT NULL, -- 구글 시트 연계 시 문서 ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensetalk_grp_user ON public.sensetalk_recipient_groups(user_id, updated_at DESC);

ALTER TABLE public.sensetalk_recipient_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recipient groups"
  ON public.sensetalk_recipient_groups FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_recipient_groups_updated_at
  BEFORE UPDATE ON public.sensetalk_recipient_groups
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 6. 그룹별 수신자 행 데이터 (동적 커스텀 변수 완벽 대응)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.sensetalk_recipient_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_index INT NOT NULL DEFAULT 0, -- 명단 내 순서
  name VARCHAR(80) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT '대기', -- '대기', '전송중', '발송완료', '실패'
  extra_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- 동적 컬럼 치환값 매핑 (예: {"직함": "팀장", "포인트": "5,000P"})
  sent_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensetalk_rcp_group_order ON public.sensetalk_recipients(group_id, row_index ASC);
CREATE INDEX idx_sensetalk_rcp_user_status ON public.sensetalk_recipients(user_id, status);

ALTER TABLE public.sensetalk_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own recipients"
  ON public.sensetalk_recipients FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_recipients_updated_at
  BEFORE UPDATE ON public.sensetalk_recipients
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 7. 발송 로그 및 전송 결과 리포트
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.sensetalk_recipient_groups(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES public.sensetalk_recipients(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'kakao',
  recipient_name VARCHAR(80) NOT NULL DEFAULT '',
  recipient_phone VARCHAR(50) NOT NULL DEFAULT '',
  message_preview TEXT NOT NULL DEFAULT '', -- 실제 고객 변수가 치환된 최종 발송 텍스트
  has_image BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'success', -- 'success', 'failed'
  error_message TEXT DEFAULT NULL,
  engine_version VARCHAR(20) DEFAULT '2.3',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensetalk_log_user_date ON public.sensetalk_send_logs(user_id, sent_at DESC);

ALTER TABLE public.sensetalk_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own send logs"
  ON public.sensetalk_send_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own send logs"
  ON public.sensetalk_send_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 8. 구글 스프레드시트 라이브 연동 설정 (차기 로드맵)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_google_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.sensetalk_recipient_groups(id) ON DELETE SET NULL,
  sheet_id VARCHAR(255) NOT NULL, -- Google Spreadsheet ID
  sheet_name VARCHAR(120) NOT NULL DEFAULT 'Sheet1',
  sync_mode VARCHAR(20) NOT NULL DEFAULT 'read_only', -- 'read_only' | 'two_way'
  status_column VARCHAR(50) NOT NULL DEFAULT '상태', -- 발송 완료 도장 찍을 열 이름
  column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb, -- 시트 컬럼 헤더 <-> 치환변수 매핑
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sensetalk_google_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sheet configs"
  ON public.sensetalk_google_sheets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_google_sheets_updated_at
  BEFORE UPDATE ON public.sensetalk_google_sheets
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 9. 센스봇 (PC 로컬 데몬) 페어링 및 헬스체크
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sensetalk_bot_pairing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pairing_token VARCHAR(128) NOT NULL, -- 로컬 PC 센스봇 인증용 토큰
  engine_version VARCHAR(20) DEFAULT '2.3',
  bot_mode VARCHAR(20) DEFAULT 'classic', -- 'classic' | 'safety'
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected', -- 'connected' | 'disconnected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sensetalk_bot_pairing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bot pairing"
  ON public.sensetalk_bot_pairing FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_sensetalk_bot_pairing_updated_at
  BEFORE UPDATE ON public.sensetalk_bot_pairing
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_handle_updated_at();

-- ============================================================================
-- 10. 신규 유저 최초 가입 시 기본 카테고리 & 기본 상용구 자동 프로비저닝 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sensetalk_provision_new_user_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. 유저 환경설정 기본값 생성
  INSERT INTO public.sensetalk_user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. 기본 카테고리 8종 생성 (고정 탭 3개: 전체, 이미지, 일반 맨 앞)
  INSERT INTO public.sensetalk_snippet_categories (user_id, code, name, icon, is_fixed, sort_order)
  VALUES
    (NEW.id, '전체', '전체', 'apps', TRUE, 10),
    (NEW.id, '이미지', '이미지', 'image', TRUE, 20),
    (NEW.id, '일반', '일반', 'folder', TRUE, 30),
    (NEW.id, '인사', '기본인사', 'chat', FALSE, 40),
    (NEW.id, '계좌', '계좌/결제', 'account_balance', FALSE, 50),
    (NEW.id, '앱가입', '썬드리머앱', 'smartphone', FALSE, 60),
    (NEW.id, '제품', '램프/제품', 'lightbulb', FALSE, 70),
    (NEW.id, 'AS', 'AS/점검', 'build', FALSE, 80)
  ON CONFLICT (user_id, code) DO NOTHING;

  -- 3. 기본 대표 상용구 4종 자동 등록
  INSERT INTO public.sensetalk_snippets (user_id, category_code, type, title, content, is_favorite, sort_order)
  VALUES
    (NEW.id, '인사', 'text', '정중한 첫인사 및 일정 안내', '안녕하세요 #{이름} #{직함}님! (#{소속})\n요청해주신 자료 안내드립니다. 확인 후 편하게 말씀해주세요 :)', TRUE, 10),
    (NEW.id, '계좌', 'text', '공식 무통장 입금 계좌 안내', '💳 [공식 입금 계좌 안내]\n국민은행 123456-04-987654 (예금주: 센스톡)\n입금자명을 "#{이름}"으로 입력해주시면 3분 내 자동 입금 확인 처리됩니다.', TRUE, 20),
    (NEW.id, '앱가입', 'text', '썬드리머 간편가입 & 5000P 혜택', '📱 [썬드리머 공식 웹앱 오픈 안내]\n#{이름} 고객님, 썬드림 공식 웹앱 "썬드리머"가 오픈되었습니다!\n🔗 앱 바로가기: https://sundreamer.app\n✨ 가입 즉시 5,000P 웰컴 포인트 지급!', TRUE, 30),
    (NEW.id, 'AS', 'text', '광선치료기 램프 교체 접수 안내', '🔧 [AS 및 정기점검 접수 안내]\n#{이름} 고객님, 사용 중이신 장비의 정기 점검이 필요하신가요?\n아래 주소로 증상 메모와 함께 장비를 보내주시면 입고 즉시 엔지니어가 점검 후 연락드립니다.\n📍 보내실 곳: 서울특별시 강남구 테헤란로 123 센스톡 AS센터 (02-1234-5678)', FALSE, 40);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.users에 신규 유저 생성 시 센스톡 기본 데이터 자동 배포
DROP TRIGGER IF EXISTS on_auth_user_created_sensetalk ON auth.users;
CREATE TRIGGER on_auth_user_created_sensetalk
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sensetalk_provision_new_user_defaults();

-- ============================================================================
-- 11. Supabase Storage Bucket 생성 및 정책 (이미지/미디어용)
-- ============================================================================
-- 버킷이 없을 경우 생성: 'sensetalk-media' (공개 읽기 가능)
INSERT INTO storage.buckets (id, name, public)
VALUES ('sensetalk-media', 'sensetalk-media', true)
ON CONFLICT (id) DO NOTHING;

-- 유저 본인 폴더(user_id/*)에만 업로드/수정/삭제 허용 RLS
CREATE POLICY "SensTalk User Media Upload Policy"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sensetalk-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "SensTalk User Media Update Policy"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'sensetalk-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "SensTalk User Media Delete Policy"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'sensetalk-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "SensTalk Public Media View Policy"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'sensetalk-media');
```

---

## 4. 허브앱(Hub App) 담당 AI를 위한 연동 인터페이스 가이드

### 4.1 허브앱과의 권한 & 사용자 식별 매핑
- 센스톡의 모든 테이블은 `auth.users(id)`를 외래키(`user_id UUID`)로 직접 참조합니다.
- 허브앱에서 이미 구글/카카오 소셜 로그인 또는 이메일 로그인을 Supabase Auth로 처리하고 있다면, **센스톡은 동일한 Supabase 세션(JWT Access Token)을 헤더(`Bearer <token>`)로 전달받아 자동 인증**됩니다.
- RLS가 완전히 켜져 있으므로 다른 사용자의 상용구나 수신자 명단 데이터에 접근할 수 없습니다.

### 4.2 올인원 단일 구독 및 크레딧(Quota) 차감 흐름
1. **구독 정보 조회**:
   - 허브앱의 `subscriptions` 테이블 또는 유저 메타데이터를 통해 현재 요금제(`free`, `starter`, `pro`, `business`)와 월 잔여 한도를 센스톡 프론트에 제공합니다.
2. **발송 성공 시 건수 차감 (RPC 추천)**:
   - 센스톡 클라이언트가 [Enter] 키를 쳐서 메시지 발송이 1건 성공할 때마다 `sensetalk_send_logs`에 INSERT를 수행합니다.
   - 이때 허브앱의 크레딧 테이블에서 `remaining_quota = remaining_quota - 1`로 동기화하는 DB RPC 함수(`sensetalk_consume_credit()`)를 함께 호출하면 트랜잭션 안전성이 보장됩니다.

### 4.3 이미지 파일 업로드 경로 규약 (Storage)
- 버킷명: `sensetalk-media`
- 저장 경로 구조:
  ```
  sensetalk-media/
  └── {user_id}/
      ├── snippets/
      │   └── snippet_{timestamp}_{filename}
      └── templates/
          └── block_img_{timestamp}_{filename}
  ```
- 이 구조를 통해 Storage RLS가 `(storage.foldername(name))[1] = auth.uid()::text` 조건으로 각 유저의 파일 소유권을 엄격히 통제합니다.

### 4.4 구글 시트 라이브 연동(양방향) 확장 시 주의점
- `sensetalk_recipients.extra_data (JSONB)`는 구글 시트의 모든 동적 열(`#{포인트}`, `#{만료일}` 등)을 별도 스키마 변경 없이 그대로 key-value로 담을 수 있도록 최적화되어 있습니다.
- 시트에서 발송 대상 행을 필터링할 때는 `status = '대기'` 조건을 사용하며, 발송이 완료되면 `status = '발송완료'`, `sent_at = NOW()`로 UPDATE한 뒤 해당 행의 정보를 구글 시트 Write-back API로 전송하면 됩니다.
