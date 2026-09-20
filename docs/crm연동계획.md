# 🚀 Sense CRM & FamilyHub ➔ 센스톡(SenseTalk) 투트랙(Two-Track) 연동 계획서

> **최종 갱신일:** 2026-09-18  
> **상태:** 대표님 확인 및 아키텍처 확정 완료 (구글 주소록 동기화, 패밀리허브 이원화 구조, 독립 Supabase 반영)

---

## 1. 연동 배경 및 핵심 원칙

### 1.1 투트랙(Two-Track) 전략
- **트랙 1 (실시간 이메일 발송)**: 
  - 결제, 가입, 만료 등 이벤트 발생 즉시 기존 인프라대로 고객에게 이메일 영수증/증빙 즉시 발송.
- **트랙 2 (센스톡 대기열 누적 & 반자동 카카오톡 발송)**:
  - 카카오톡 계정 제재(스팸 차단)를 완벽히 우회하기 위해, 발송 데이터를 센스톡 전용 Supabase 대기열(`notification_queue`)에 누적.
  - 대표님/사모님이 원하실 때 센스톡을 열어 **유형별 탭 단위로 배치(Batch) 로드 ➔ 센스봇(ASDF 릴레이)으로 안전하게 발송.**

### 1.2 서비스 간 이원화 구조 및 전용 DB 정책
- **트리거 및 발송 주체**:
  - **이벤트 발생(트리거)**: 썬드리머(루미노트) 앱
  - **실제 알림 발송 및 관리**: 패밀리허브 앱
- **독립 Supabase DB 운영**:
  - 썬드리머나 패밀리허브의 기존 코어 DB와 결속시키지 않고, **센스톡 관련 데이터는 독립된 Supabase 프로젝트로 분리 관리**하여 안정성과 확장성을 확보.

### 1.3 카카오톡 친구 검색 100% 매칭 메커니즘
- CRM에서 고객 등록/수정 시 **'주소록 네이밍 규칙'**에 맞추어 변환.
- 구글 주소록(Google Contacts) 동기화를 통해 대표님 및 사모님 스마트폰/PC 카톡과 100% 실시간 동기화 유지.
- **결과**: 센스톡의 Supabase 대기열 `target_name`에 바로 이 **'주소록 변환 네이밍'**이 저장되므로, PC 카카오톡 검색창에서 100% 오차 없이 대화방 진입 가능.

---

## 2. 전체 시스템 아키텍처

```mermaid
flowchart TD
    subgraph Trigger ["썬드리머 (루미노트)"]
        Event["이벤트 발생\n(결제/가입/만료 등)"]
    end

    subgraph FamilyHub ["패밀리허브 (알림 허브)"]
        Email["1. 이메일 즉시 발송 (트랙 1)"]
        SyncRule["2. 고객명 ➔ 주소록 네이밍 규칙 변환"]
        GoogleSync["구글 주소록 자동 동기화\n(나 / 와이프 스마트폰 & 카톡)"]
        InsertQueue["3. 센스톡 전용 Supabase 비동기 적재\n(target_name = 주소록 네이밍)"]
        
        Event --> Email
        Event --> SyncRule
        SyncRule --> GoogleSync
        SyncRule --> InsertQueue
    end

    subgraph DedicatedDB ["센스톡 전용 Supabase DB (독립 프로젝트)"]
        QueueTable[("notification_queue 테이블\n- noti_type: 유형별 분류\n- target_name: 주소록 이름\n- status: pending / sent / sync_error\n- variables: JSONB")]
        InsertQueue -.->|Insert| QueueTable
    end

    subgraph SenseTalk ["센스톡 (PWA & SenseBot)"]
        LoadBtn["[📥 CRM 대기열 불러오기]\n유형별 탭 선택 (결제/만료/가입)"]
        QueueTable -->|조회 (status=pending)| LoadBtn
        BotRelay["센스봇 ASDF 릴레이 발송\n(PC 카톡 검색 ➔ 전송)"]
        LoadBtn --> BotRelay
        
        SuccessUpdate["발송 성공: status = 'sent'"]
        FailHandle["발송 실패: status = 'sync_error'\n(주소록 미동기화 알림/점검 유도)"]
        
        BotRelay -->|성공| SuccessUpdate
        BotRelay -->|실패| FailHandle
        SuccessUpdate -.->|Update| QueueTable
        FailHandle -.->|Update| QueueTable
    end

    style Event fill:#2563eb,stroke:#1d4ed8,color:#fff
    style Email fill:#059669,stroke:#047857,color:#fff
    style SyncRule fill:#0891b2,stroke:#0e7490,color:#fff
    style QueueTable fill:#7c3aed,stroke:#6d28d9,color:#fff
    style LoadBtn fill:#f59e0b,stroke:#d97706,color:#fff
    style BotRelay fill:#ef4444,stroke:#dc2626,color:#fff
    style FailHandle fill:#dc2626,stroke:#991b1b,color:#fff
```

---

## 3. Supabase 데이터베이스 설계 (센스톡 전용 독립 프로젝트)

### 3.1 `notification_queue` 테이블 DDL

```sql
-- 1. 대기열 테이블 생성
CREATE TABLE public.notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- 알림 분류 (유형별 탭 분류용: PAYMENT_SUCCESS, EXPIRE_D7, WELCOME 등)
    noti_type VARCHAR(50) NOT NULL,
    
    -- 수신자 정보 (※ 구글 주소록 동기화 네이밍 규칙 적용 완료된 이름)
    target_name VARCHAR(100) NOT NULL,
    target_phone VARCHAR(50),
    customer_id VARCHAR(100),
    
    -- 발송 주체 구분 (선택: 'me', 'wife', 'all' 등)
    sender_tag VARCHAR(20) DEFAULT 'all',
    
    -- 치환 변수 (블록의 #{변수}와 1:1 매핑)
    -- 예: {"고객명": "[VIP]홍길동", "결제금액": "55,000원", "만료일": "2026-10-15"}
    variables JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- 처리 상태: pending(대기), processing(발송중), sent(완료), sync_error(주소록 미동기 오류), skipped(건너뜀)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_log TEXT,
    
    -- 메타데이터
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. 인덱스 (유형별 탭 조회 및 대기열 조회 최적화)
CREATE INDEX idx_noti_queue_lookup 
ON public.notification_queue (status, noti_type, created_at DESC);

-- 3. RLS 정책 (전용 프로젝트이므로 서비스 롤 또는 인증 키 적용)
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service and app access"
ON public.notification_queue
FOR ALL
USING (true)
WITH CHECK (true);
```

---

## 4. 실패 및 동기화 에러 처리 정책 (`sync_error`)

1. **상시 100% 동기화 원칙**:
   - 구글 주소록 동기화가 상시 유지되므로 대다수는 카톡 검색창에서 완벽히 매칭되어 전송됩니다.
2. **카톡 친구 미발견(검색 실패) 시 대응 프로토콜**:
   - 센스봇이 PC 카카오톡에서 `target_name`으로 검색했으나 대화방/친구가 검색되지 않는 경우:
     - 상태를 즉시 `sync_error`로 변경하고 `error_log`에 기록.
     - 센스톡 화면에 **"⚠️ 주소록 미동기화 의심 대상 발견: [고객명] - 구글 주소록/카톡 동기화를 점검해주세요."** 경고 안내 모달/뱃지 출력.
     - 전체 배치가 멈추지 않고 다음 고객으로 안전하게 스킵 진행.
3. **사후 보정 지원**:
   - 주소록 동기화 확인 후, 센스톡의 `[동기화 오류 목록]` 탭에서 `[재시도 (pending으로 복구)]` 버튼으로 손쉽게 다시 발송 대기열로 환원.

---

## 5. 센스톡 PWA UI/UX 연동 상세

1. **대기열 로드 버튼**:
   - 상단 툴바에 `[📥 CRM 대기열 불러오기 (N건)]` 배지 버튼.
2. **유형별 탭 모달**:
   - `[전체 (12)]`, `[💳 결제완료 (8)]`, `[⏰ 만료예정 (4)]`, `[⚠️ 동기화오류 (0)]`
   - 원하는 탭을 선택하면 센스톡 내 저장된 템플릿(결제 템플릿, 만료 템플릿 등)과 자동 매칭.
3. **발송자 선택 (필요 시)**:
   - "나의 카톡" 또는 "와이프 카톡" 기기 환경에 맞춰 대상 필터링 지원 가능.

---

## 6. 전체 개발 로드맵 및 단계별 순서

대표님의 지침에 따라 아래의 확실한 단계 순서로 진행합니다:

```
[현재 단계] 센스톡 UI / UX / 기능 완벽 구현 (블록 편집기, 미리보기, 이미지 3-way 입력 등)
     ▼
[1단계] GitHub 저장소 푸시 & Netlify 웹 배포 (PWA 호스팅)
     ▼
[2단계] 센스톡 전용 독립 Supabase DB 프로젝트 생성 및 스키마(`notification_queue`, `saved_templates`) 셋업
     ▼
[3단계] 패밀리허브(CRM) ➔ Supabase 비동기 적재 연동
     ▼
[4단계] 센스톡 PWA 내 대기열 조회, 템플릿 자동 매핑 & 센스봇 발송/에러처리 최종 완성
     ▼
[5단계] 자주 쓰는 메시지(상용구) 보관소 서랍 & 레고 블록 믹스 기능 탑재
```

---

## 7. [차기 확장 기능] 자주 쓰는 메시지(상용구) 블록 믹스 (Lego Assembly)

### 7.1 기획 의도 및 가치
> **"기계적인 단체문자 탈피 + 타이핑 공수 90% 절감"**

- 매번 인사말, 계좌번호, 장비 사용법, 택배 안내 등을 처음부터 타이핑할 필요 없이, **미리 만들어둔 상용구 블록을 서랍에서 꺼내어 고객별 맞춤형 커스텀 멘트와 결합(Lego Assembly)**하는 방식입니다.
- 아내분(사모님)이나 관리자가 썬드림 고객과 소통할 때, 스몰토크(개인화된 안부)는 손쉽게 직접 작성하고, 나머지 정형화된 안내는 클릭 한 번으로 조립하여 완성형 메시지를 전송합니다.

### 7.2 조립 시나리오 예시
```
[블록 1: 상용구] 기본 환영/인사 템플릿
     ➕
[블록 2: 직접 작성] "사장님, 저번 주 제주도 폴로 경기 잘 다녀오셨어요? 날씨가 참 좋았죠!"
     ➕
[블록 3: 상용구] FT-1801 램프 교체 주기 및 정기점검 매뉴얼 안내 블록
     ➕
[블록 4: 상용구] 결제 계좌 및 세금계산서 발행 안내 블록
```
➔ 발송 시 이 블록들의 내용이 순서대로 줄바꿈(`\n\n`)과 함께 하나의 자연스러운 메시지로 결합되어 카카오톡으로 발송됩니다.

---

### 7.3 Supabase DB 설계 (`saved_templates` 테이블)

```sql
-- 자주 쓰는 메시지(상용구) 보관함 테이블
CREATE TABLE public.saved_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- 상용구 제목 (예: '기본 인사말', 'FT-1801 사용법', '국민은행 계좌안내')
    title VARCHAR(100) NOT NULL,
    
    -- 분류 카테고리 (예: '인사', '제품안내', '결제/계좌', 'A/S')
    category VARCHAR(50) DEFAULT '일반',
    
    -- 실제 메시지 내용 (치환자 #{고객명} 등 포함 가능)
    content TEXT NOT NULL,
    
    -- UI 서랍 노출 순서
    order_num INT DEFAULT 0,
    
    -- 즐겨찾기 고정 여부
    is_favorite BOOLEAN DEFAULT false,
    
    -- 작성자/소유자 구분 (예: 'all', 'me', 'wife')
    owner VARCHAR(20) DEFAULT 'all'
);

-- 인덱스
CREATE INDEX idx_saved_templates_order 
ON public.saved_templates (category, order_num ASC);
```

---

### 7.4 PWA UI/UX 및 기능 구현 명세

1. **상용구 서랍 (Drawer / Panel)**:
   - 캔버스 좌측(또는 블록 추가 툴바 영역)에 **[📂 자주 쓰는 상용구]** 패널 배치.
   - 카테고리별 탭(`전체`, `인사`, `장비매뉴얼`, `계좌/결제`) 및 검색 필터 지원.
   - 상용구 신규 생성/수정/삭제(CRUD) 모달 지원.
2. **원클릭 / 드래그 앤 드롭 삽입**:
   - 서랍 내 상용구 카드를 클릭(또는 캔버스로 드래그)하면 캔버스에 즉시 **'상용구 블록'**으로 추가.
3. **자유로운 순서 변경 & 인라인 수정(Inline Editing)**:
   - 캔버스 내의 [직접 작성 텍스트 블록], [상용구 블록], [이미지 블록]을 기존 위/아래 이동 버튼(▲/▼) 및 드래그로 자유롭게 믹스.
   - 상용구 블록 삽입 후, 이번 발송 건에서만 특정 단어를 살짝 수정해도 원본 템플릿에는 영향을 주지 않는 **'복사본 기반 즉석 편집'** 구조 지원.
4. **발송 시 자동 결합 (String Concatenation)**:
   - 발송 실행(클립보드 복사 또는 센스봇 전송) 시 캔버스에 나열된 순서대로 각 블록의 텍스트를 줄바꿈과 함께 하나의 완성된 카카오톡 메시지로 합성.

