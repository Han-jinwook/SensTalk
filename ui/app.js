/**
 * SensTalk (센스톡) PWA Core Engine - app.js
 */

// ==========================================
// 0. 엔진 버전 및 배포 설정
// ==========================================
const LATEST_ENGINE_VERSION = '2.7';
const ENGINE_ZIP_FILENAME = `SenseTalk_Engine_v${LATEST_ENGINE_VERSION}.zip`;

// 🚀 센스톡 Supabase 클라우드 설정 (CRM 연동 & 영구 보관용)
const SENSETALK_SUPABASE_URL = 'https://mjjkacatvgooxwmuzmko.supabase.co';
const SENSETALK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qamthY2F0dmdvb3h3bXV6bWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjUzNjUsImV4cCI6MjEwNTYwMTM2NX0.ZimkOqSJLqlxTmnoZJslKT3L444W6VSwJztbfJh6QDg';

function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const cleanV1 = String(v1).replace(/^v/i, '').trim();
  const cleanV2 = String(v2).replace(/^v/i, '').trim();
  const parts1 = cleanV1.split('.').map(Number);
  const parts2 = cleanV2.split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = isNaN(parts1[i]) ? 0 : parts1[i];
    const num2 = isNaN(parts2[i]) ? 0 : parts2[i];
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function openEngineUpdateModal() {
  const modal = document.getElementById('engineUpdateModal');
  const curVerEl = document.getElementById('updateModalCurrentVer');
  const latVerEl = document.getElementById('updateModalLatestVer');
  const changeTitleEl = document.getElementById('updateModalChangelogTitle');
  const zipNameEl = document.getElementById('updateModalZipName');
  const dlBtnTextEl = document.getElementById('updateModalDownloadBtnText');

  if (curVerEl) {
    curVerEl.innerText = SENSE_STATE.connectedEngineVersion ? `v${SENSE_STATE.connectedEngineVersion}` : '구버전 또는 미연결';
  }
  if (latVerEl) {
    latVerEl.innerText = `v${LATEST_ENGINE_VERSION} (최신)`;
  }
  if (changeTitleEl) {
    changeTitleEl.innerText = `v${LATEST_ENGINE_VERSION} 주요 변경 사항`;
  }
  if (zipNameEl) {
    zipNameEl.innerText = ENGINE_ZIP_FILENAME;
  }
  if (dlBtnTextEl) {
    dlBtnTextEl.innerText = `최신 엔진 v${LATEST_ENGINE_VERSION} 다운로드`;
  }
  if (modal) modal.classList.remove('hidden');
}

function closeEngineUpdateModal() {
  const modal = document.getElementById('engineUpdateModal');
  if (modal) modal.classList.add('hidden');
}

// ==========================================
// 1. 상태(State) 관리
// ==========================================
const SENSE_STATE = {
  // 수신자 명단 (초기 빈 배열 - 최신 저장된 명단 그룹이 자동으로 복원됨)
  recipients: [],
  currentIndex: 0,
  customFields: null, // 동적 컬럼명 배열 (null이면 getActiveRecipientFields()로 자동 유추)
  recipientViewMode: localStorage.getItem('sensetalk_recipient_view_mode') || 'card', // 'card' (디자인된 UI) | 'table' (표 뷰)

  // 메시지 블록 구성
  blocks: [
    {
      id: 'block-1',
      type: 'text',
      title: '기본 인사 및 미팅 안내',
      content: '안녕하세요 #{이름} #{직함}님! (#{소속})\n요청해주신 오늘 3시 미팅 안내자료 전달드립니다. 확인 후 회신 부탁드립니다!',
      isAd: false,
      optOutNum: '080-880-7766'
    },
    {
      id: 'block-2',
      type: 'image',
      title: 'JPG / PNG 사진',
      fileName: 'meeting_overview_v2.png',
      fileSize: '142KB',
      dimensions: '1200 x 800px',
      dataUrl: ''
    }
  ],

  // 설정 및 활성 채널 (글로벌 5대 SNS 메신저)
  activeChannel: 'kakao', // 'kakao' (디폴트) | 'line' | 'telegram' | 'whatsapp' | 'wechat'

  // JIT & 올인원 정기구독 상태 (최초 100건 무료 체험 -> 월 3,000 / 6,000 / 12,000원 정기구독)
  subscriptionPlan: localStorage.getItem('sensetalk_plan') || 'free', // 'free' | 'starter' | 'pro' | 'business'
  planName: localStorage.getItem('sensetalk_plan_name') || '무료 체험',
  monthlyQuota: parseInt(localStorage.getItem('sensetalk_monthly_quota') ?? '100', 10),
  remainingQuota: parseInt(localStorage.getItem('sensetalk_remaining_quota') ?? '100', 10),
  freeCredits: parseInt(localStorage.getItem('sensetalk_remaining_quota') ?? '100', 10), // 하위 호환
  coins: 0,
  isLoggedIn: localStorage.getItem('sensetalk_logged_in') === 'true',

  // 센스봇 로컬 데몬 연동
  botStatus: 'disconnected', // 'connected' | 'disconnected'
  connectedEngineVersion: null, // 현재 연결된 로컬 PC 엔진 버전 (예: '2.2', '2.3')
  botMode: 'classic', // 'classic' (대기) | 'safety' (사이렌/메모장 튕김)
  botUrl: 'http://127.0.0.1:28888',

  // 다중 명단(그룹) 프리셋 관리
  recipientGroups: [],
  activeGroupName: localStorage.getItem('sensetalk_active_group_name') || '',
  activeGroupId: localStorage.getItem('sensetalk_last_group_id') || '',
  isRecipientsSaved: false, // 명단 저장 상태 관리 (불러오거나 수정 시 false: 활성화, 저장 완료 시 true: 비활성화)

  // 메시지 템플릿(텍스트+사진) 보관함
  templates: [],
  activeTemplateName: localStorage.getItem('sensetalk_active_template_name') || '',

  // 자주 쓰는 상용구(텍스트 + 이미지) 서랍 보관함
  snippets: [],
  activeSnippetCategory: '전체',
  isSnippetDrawerOpen: localStorage.getItem('sensetalk_snippet_drawer_open') === 'true',

  // 오디오 컨텍스트 (사이렌 알람용)
  audioCtx: null,
  sirenInterval: null
};

// ==========================================
// 2. 초기화 (Initialization)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 최초 사용 시에만 100건 기본값 세팅 (이미 차감된 잔여량이 있으면 보존)
  if (localStorage.getItem('sensetalk_remaining_quota') === null) {
    try {
      localStorage.setItem('sensetalk_remaining_quota', '100');
      localStorage.setItem('sensetalk_free_credits', '100');
    } catch (e) {}
  }

  initRecipientGroups();
  initTemplates();
  initSnippets();
  initUrlHashTemplate();
  checkSenseBotHealth();
  initBotPolling();
  setupEventListeners();
  renderAll();
  applyJitState();
  initOnboardingTour();
  initDraggablePreviewPopup();
  initWorkspaceSplitter();
  initDraggableOnboardingCard();
  
  // 🚀 CRM 대기열 수신 카운트 최초 조회 및 10초 주기 체크
  checkCrmQueueCount();
  setInterval(checkCrmQueueCount, 10000);
});

function renderAll() {
  renderRecipients();
  renderBlocks();
  renderKakaoPreview();
  renderCounters();
  updateGroupBadges();
  updateTemplateBadges();
  renderSnippetDrawer();
  updateSaveRecipientsBtn();
  updateDispatchConditionBar();
  syncStateToBot();
}

/**
 * 현재 명단에서 실제 데이터가 존재하는 유효 필드(컬럼) 목록만 동적 추출
 * - 빈 고정 항목(직함, 소속, 전화번호, 메모 등) 강제 삽입 완전 제거
 * - 명단 내 실제 값이 1건이라도 존재하는 필드만 스마트하게 추출
 */
function getActiveRecipientFields() {
  const systemKeys = ['id', 'status', 'extra', 'message', 'msg', 'raw', 'is_joined', 'hub_uuid', 'phone', '가입링크', '지급포인트', '포인트'];

  // customFields가 명시적으로 지정된 경우 해당 필드만 엄격하게 반환 (불필요한 내부 필드 노출 차단)
  if (SENSE_STATE.customFields && Array.isArray(SENSE_STATE.customFields) && SENSE_STATE.customFields.length > 0) {
    const defined = SENSE_STATE.customFields.filter(f => !systemKeys.includes(f) && !String(f).startsWith('_'));
    if (defined.length > 0) {
      return defined;
    }
  }

  if (!SENSE_STATE.recipients || SENSE_STATE.recipients.length === 0) {
    return ['이름'];
  }

  // 전체 명단에서 실제 데이터(공백 아님, '-' 아님)가 존재하는 필드만 수집
  const populatedFieldSet = new Set();

  SENSE_STATE.recipients.forEach(rec => {
    if (rec.message !== undefined) delete rec.message;
    if (rec.msg !== undefined) delete rec.msg;

    Object.keys(rec).forEach(key => {
      if (systemKeys.includes(key) || String(key).startsWith('_')) return;
      const val = String(rec[key] !== undefined && rec[key] !== null ? rec[key] : '').trim();
      if (val !== '' && val !== '-') {
        const displayKey = (key === 'name' ? '이름' : key === 'title' ? '직함' : key === 'org' ? '소속' : key === 'phone' ? '전화번호' : key === 'memo' ? '메모' : key);
        populatedFieldSet.add(displayKey);
      }
    });
  });

  const activeFields = [];
  populatedFieldSet.forEach(f => {
    if (!activeFields.includes(f) && !systemKeys.includes(f) && !String(f).startsWith('_')) {
      activeFields.push(f);
    }
  });

  if (activeFields.length === 0) {
    activeFields.push('이름');
  }

  return activeFields;
}

/**
 * 수신자 필드 값 추출 헬퍼 (별칭 및 표준 필드 매핑)
 */
function getRecipientFieldValue(rec, field) {
  if (!rec) return '';
  if (rec[field] !== undefined && rec[field] !== null) return String(rec[field]).trim();
  if (field === '이름' || field === 'name') return String(rec.name || rec['이름'] || '').trim();
  if (field === '직함' || field === 'title') return String(rec.title || '').trim();
  if (field === '소속' || field === 'org' || field === '회사') return String(rec.org || '').trim();
  if (field === '전화번호' || field === 'phone' || field === '연락처') return String(rec.phone || '').trim();
  if (field === '메모' || field === 'memo' || field === '비고') return String(rec.memo || '').trim();
  return '';
}

/**
 * 수신자 이름 클립보드 복사
 */
function copyRecipientNameDirect(name) {
  if (!name) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(name).then(() => {
      showToast(`📋 수신자 이름 [${name}] 복사 완료!`);
    }).catch(() => {
      fallbackCopyText(name);
      showToast(`📋 수신자 이름 [${name}] 복사 완료!`);
    });
  } else {
    fallbackCopyText(name);
    showToast(`📋 수신자 이름 [${name}] 복사 완료!`);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {}
  document.body.removeChild(ta);
}

/**
 * 특정 텍스트 블록의 커서 위치에 동적 맞춤 변수 (#{필드명}) 삽입
 */
function insertDynamicVariable(blockIdx, fieldName) {
  const block = SENSE_STATE.blocks[blockIdx];
  if (!block || block.type !== 'text') return;

  const textarea = document.getElementById(`block_textarea_${block.id}`);
  const tag = `#{${fieldName}}`;

  if (textarea) {
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : textarea.value.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : textarea.value.length;
    const oldVal = textarea.value;
    textarea.value = oldVal.substring(0, start) + tag + oldVal.substring(end);
    block.content = textarea.value;
    textarea.focus();
    const newPos = start + tag.length;
    textarea.setSelectionRange(newPos, newPos);
  } else {
    block.content = (block.content || '') + ' ' + tag;
  }

  renderKakaoPreview();
  showToast(`📋 변수 [${tag}] 본문에 삽입됨`);
}

/**
 * 테이블 헤더 또는 동적 항목 뱃지 클릭 시 활성(첫 번째) 텍스트 블록에 변수 삽입
 */
function insertDynamicVariableToActiveBlock(fieldName) {
  const textBlockIdx = SENSE_STATE.blocks.findIndex(b => b.type === 'text');
  if (textBlockIdx >= 0) {
    insertDynamicVariable(textBlockIdx, fieldName);
  } else {
    showToast('⚠️ 텍스트 블록이 존재하지 않습니다.');
  }
}

/**
 * 수신자 명단 렌더링 (모던 강조 헤더 & 깔끔한 표 UI)
 * - 선택 라디오 컬럼 제거 (행 클릭으로 직관적 선택)
 * - 헤더 변수 선택 기능 및 #{..} 제거
 * - 제목줄(헤더) 강조 및 세련된 표 UI
 */
function renderRecipients() {
  const scrollWrapper = document.getElementById('recipientListScrollWrapper');
  if (!scrollWrapper) return;

  // 렌더링 전 혹시 유입된 내부 message 속성 일괄 정제
  if (Array.isArray(SENSE_STATE.recipients)) {
    SENSE_STATE.recipients.forEach(r => {
      if (r && r.message !== undefined) delete r.message;
      if (r && r.msg !== undefined) delete r.msg;
    });
  }

  const fields = getActiveRecipientFields();
  const total = SENSE_STATE.recipients.length;
  const doneCount = SENSE_STATE.recipients.filter(r => r.status === 'done').length;
  const skippedCount = SENSE_STATE.recipients.filter(r => r.status === 'skipped').length;
  const pendingCount = SENSE_STATE.recipients.filter(r => r.status === 'pending').length;
  const isAllDone = total > 0 && doneCount === total;
  const isAllProcessed = total > 0 && pendingCount === 0;

  const badgeCountEl = document.getElementById('recipientsBadgeCount');
  if (badgeCountEl) badgeCountEl.innerText = `${total}명`;

  // 메인 발송 버튼 상태 동기화
  updateMainDispatchBtnState();

  // 명단이 비어있는 경우 안내 UI
  if (total === 0) {
    scrollWrapper.innerHTML = `
      <div class="py-14 px-4 text-center text-slate-400 select-none">
        <span class="material-symbols-outlined text-4xl mb-1.5 text-slate-300 block">group_off</span>
        <p class="text-xs font-bold text-slate-600">등록된 수신자 명단이 없습니다.</p>
        <p class="text-[11px] text-slate-400 mt-1">상단의 <strong class="text-secondary">[📂 불러오기]</strong>에서 저장된 명단을 열거나, <strong class="text-primary">[📥 엑셀/가져오기]</strong>로 명단을 추가하세요.</p>
      </div>
    `;
    return;
  }

  // 상태 칼럼 헤더: 전체 완료 시 전체완료/초기화가 천천히 번갈아 노출되는 부드러운 애니메이션 뱃지
  let statusColHeaderHtml = '<span>상태</span>';
  if (isAllDone) {
    statusColHeaderHtml = `
      <button onclick="handleResetAllStatus()" class="status-cycle-btn group relative inline-flex items-center justify-center overflow-hidden px-2.5 py-0.5 rounded-full shadow-2xs font-bold text-[11px] cursor-pointer transition-all duration-300 h-6 min-w-[82px] select-none" title="모든 수신자 발송 완료! 클릭 시 대기 상태로 초기화">
        <span class="status-cycle-view-done inline-flex items-center justify-center gap-1 whitespace-nowrap">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span>
          <span>전체 완료</span>
        </span>
        <span class="status-cycle-view-reset absolute inset-0 inline-flex items-center justify-center gap-1 whitespace-nowrap">
          <span class="material-symbols-outlined text-[13px]">restart_alt</span>
          <span>초기화</span>
        </span>
      </button>
    `;
  } else if (isAllProcessed) {
    statusColHeaderHtml = `
      <button onclick="handleResetAllStatus()" class="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs font-bold text-[10.5px] cursor-pointer transition-all" title="발송 마침 (${doneCount}명 완료, ${skippedCount}명 패스) - 클릭 시 대기 초기화">
        <span>발송 마침 (${doneCount}/${total})</span>
        <span class="material-symbols-outlined text-[13px] text-amber-700">restart_alt</span>
      </button>
    `;
  } else if (doneCount > 0 || skippedCount > 0) {
    statusColHeaderHtml = `
      <button onclick="handleResetAllStatus()" class="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs font-bold text-[10.5px] cursor-pointer transition-all" title="${doneCount}명 완료, ${skippedCount}명 패스 (클릭 시 대기 초기화)">
        <span>진행 ${doneCount}/${total}</span>
        <span class="material-symbols-outlined text-[13px] text-slate-500">restart_alt</span>
      </button>
    `;
  }

  // 1. 강조된 테이블 헤더 (선택 컬럼 제거, 변수 기능 제거, 상태 컬럼에 전체 완료 표시)
  const tableHeaderHtml = `
    <thead class="bg-slate-100 sticky top-0 border-b-2 border-slate-300/90 text-slate-800 select-none z-10 shadow-2xs">
      <tr>
        ${fields.map((field, fIdx) => `
          <th class="py-2.5 px-3.5 text-left text-xs font-black text-slate-800 tracking-tight whitespace-nowrap">
            ${escapeHtml(field)}
          </th>
        `).join('')}
        <th class="py-2 px-2 text-center text-xs font-black text-slate-800 tracking-tight whitespace-nowrap w-28">
          ${statusColHeaderHtml}
        </th>
        <th class="py-2.5 px-2 text-center text-xs font-black text-slate-800 tracking-tight whitespace-nowrap w-12">
          ${total > 0 ? `
            <button onclick="clearAllRecipients()" class="w-6 h-6 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 inline-flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95" title="명단 전체 비우기">
              <span class="material-symbols-outlined text-[16px]">delete_sweep</span>
            </button>
          ` : ''}
        </th>
      </tr>
    </thead>
  `;

  // 2. 세련된 행 렌더링 (라디오 버튼 제거 -> 행 클릭으로 선택, 현재 행은 포인트 강조)
  const tableRowsHtml = SENSE_STATE.recipients.map((rec, idx) => {
    const isCurrent = idx === SENSE_STATE.currentIndex;
    const isDone = rec.status === 'done';
    const isSkipped = rec.status === 'skipped';

    const cellsHtml = fields.map((field, fIdx) => {
      const rawVal = getRecipientFieldValue(rec, field);
      const val = escapeHtml(rawVal || '-');

      if (field === '이름' || fIdx === 0) {
        return `
          <td class="py-2.5 px-3.5 whitespace-nowrap">
            <div class="flex items-center gap-2">
              ${isCurrent ? '<span class="w-2 h-2 rounded-full bg-primary shrink-0 ring-2 ring-primary/30"></span>' : '<span class="w-2 h-2 rounded-full bg-transparent shrink-0"></span>'}
              <span class="font-bold text-[13px] ${isDone ? 'line-through text-slate-400' : isSkipped ? 'text-amber-700 font-semibold' : isCurrent ? 'text-primary font-black' : 'text-slate-900'}">${val}</span>
            </div>
          </td>
        `;
      } else if (field === '전화번호' || /^01[0-9]/.test(String(rawVal))) {
        return `<td class="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600 text-[11.5px]">${val}</td>`;
      } else {
        return `<td class="py-2.5 px-3.5 text-slate-600 whitespace-nowrap max-w-[160px] truncate text-[11.5px]" title="${escapeHtml(rawVal || '')}">${val}</td>`;
      }
    }).join('');

    return `
      <tr onclick="selectRecipient(${idx})" class="h-10 cursor-pointer transition-all border-b border-slate-200/70 select-none group ${
        isCurrent
          ? 'bg-blue-50/90 font-medium text-slate-900 border-l-[3.5px] border-primary shadow-2xs'
          : isDone
          ? 'bg-slate-50/40 hover:bg-slate-100/50 text-slate-400'
          : isSkipped
          ? 'bg-amber-50/40 hover:bg-amber-100/50 text-slate-700'
          : 'bg-white hover:bg-slate-50/80 text-slate-800'
      }">
        ${cellsHtml}
        <td class="py-2 px-3 text-center whitespace-nowrap">
          <button onclick="event.stopPropagation(); toggleRecipientStatus(${idx});" type="button" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 ${
            isDone 
              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200/70' 
              : isSkipped
              ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200/80'
          }" title="클릭하여 대기/완료 상태 전환">
            <span class="w-1.5 h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : isSkipped ? 'bg-amber-500' : 'bg-slate-400'}"></span>
            ${isDone ? '완료' : isSkipped ? '패스' : '대기'}
          </button>
        </td>
        <td class="py-2 px-2 text-center whitespace-nowrap">
          <button class="w-7 h-7 rounded-lg hover:bg-rose-100 flex items-center justify-center text-slate-400 hover:text-rose-600 transition-all cursor-pointer hover:scale-110 active:scale-95" onclick="event.stopPropagation(); deleteRecipient(${idx});" title="명단에서 제외 (${escapeHtml(rec.name || '수신자')})">
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  scrollWrapper.innerHTML = `
    <table class="w-full text-left border-collapse text-xs">
      ${tableHeaderHtml}
      <tbody id="recipientTableBody">${tableRowsHtml}</tbody>
    </table>
  `;
}

/**
 * 개별 수신자 상태 토글 (완료/패스 -> 대기, 대기 -> 완료)
 */
function toggleRecipientStatus(idx) {
  const rec = SENSE_STATE.recipients[idx];
  if (!rec) return;
  if (rec.status === 'done' || rec.status === 'skipped') {
    rec.status = 'pending';
  } else {
    rec.status = 'done';
  }
  SENSE_STATE.currentIndex = idx;
  renderAll();
  syncStateToBot();
  const label = rec.status === 'done' ? '완료' : rec.status === 'skipped' ? '패스' : '대기';
  showToast(`"${rec.name}" 님 상태가 [${label}]로 변경되었습니다.`, 1500);
}

function selectRecipient(idx) {
  SENSE_STATE.currentIndex = idx;
  renderAll();
}

/**
 * 명단 전체 비우기
 */
function clearAllRecipients() {
  if (!Array.isArray(SENSE_STATE.recipients) || SENSE_STATE.recipients.length === 0) return;
  const count = SENSE_STATE.recipients.length;
  if (!confirm(`현재 명단의 모든 수신자(${count}명)를 비우시겠습니까?`)) {
    return;
  }
  SENSE_STATE.recipients = [];
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.activeGroupId = null;
  SENSE_STATE.activeGroupName = '명단 없음';
  SENSE_STATE.isRecipientsSaved = false;
  renderAll();
  syncStateToBot();
  showToast(`🗑️ 수신자 명단(${count}명)이 모두 비워졌습니다.`);
}

function deleteRecipient(idx) {
  if (!Array.isArray(SENSE_STATE.recipients) || idx < 0 || idx >= SENSE_STATE.recipients.length) return;
  const target = SENSE_STATE.recipients[idx];
  const targetName = target ? (target.name || target.고객명 || target.별명 || '수신자') : '수신자';
  SENSE_STATE.recipients.splice(idx, 1);
  if (SENSE_STATE.recipients.length === 0) {
    SENSE_STATE.currentIndex = 0;
  } else if (SENSE_STATE.currentIndex >= SENSE_STATE.recipients.length) {
    SENSE_STATE.currentIndex = SENSE_STATE.recipients.length - 1;
  }
  SENSE_STATE.isRecipientsSaved = false;
  renderAll();
  syncStateToBot();
  showToast(`🗑️ "${targetName}" 님이 명단에서 제외되었습니다.`, 1200);
}

/**
 * 메시지 블록 캔버스 렌더링
 */
function renderBlocks() {
  const container = document.getElementById('blocksCanvasContainer');
  if (!container) return;

  container.innerHTML = '';
  const currentRec = SENSE_STATE.recipients[SENSE_STATE.currentIndex] || {};

  // 상단 헤더 블록 카운트 배지 갱신
  const countBadge = document.getElementById('canvasBlockCountBadge');
  if (countBadge) {
    countBadge.innerText = `${SENSE_STATE.blocks.length}개`;
  }
  updateToggleAllBtn();

  SENSE_STATE.blocks.forEach((block, idx) => {
    // 접힘 상태 기본값 보장
    if (typeof block.isCollapsed === 'undefined') {
      block.isCollapsed = false;
    }

    const blockEl = document.createElement('div');
    blockEl.className = 'p-3.5 sm:p-4 rounded-xl bg-white border-2 border-slate-300 hover:border-indigo-400 shadow-sm transition-all space-y-3';
    blockEl.draggable = true;
    blockEl.dataset.idx = idx;

    // 드래그 앤 드롭 순서 변경 이벤트 바인딩
    blockEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
      window._dragSourceIdx = idx;
      blockEl.classList.add('opacity-40', 'scale-[0.99]', 'border-indigo-500');
    });

    blockEl.addEventListener('dragend', () => {
      blockEl.classList.remove('opacity-40', 'scale-[0.99]', 'border-indigo-500');
      document.querySelectorAll('#blocksCanvasContainer > div').forEach(el => {
        el.classList.remove('border-t-2', 'border-indigo-500', 'border-b-2');
      });
      window._dragSourceIdx = null;
    });

    blockEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const sourceIdx = window._dragSourceIdx;
      if (sourceIdx === null || sourceIdx === idx) return;

      const rect = blockEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        blockEl.classList.add('border-t-2', 'border-indigo-500');
        blockEl.classList.remove('border-b-2');
      } else {
        blockEl.classList.add('border-b-2', 'border-indigo-500');
        blockEl.classList.remove('border-t-2');
      }
    });

    blockEl.addEventListener('dragleave', () => {
      blockEl.classList.remove('border-t-2', 'border-b-2', 'border-indigo-500');
    });

    blockEl.addEventListener('drop', (e) => {
      e.preventDefault();
      blockEl.classList.remove('border-t-2', 'border-b-2', 'border-indigo-500');
      const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(sourceIdx) || sourceIdx === idx) return;

      const rect = blockEl.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let targetIdx = idx;
      if (e.clientY >= midY && sourceIdx < idx) {
        targetIdx = idx;
      } else if (e.clientY < midY && sourceIdx > idx) {
        targetIdx = idx;
      }

      // 블록 순서 재배열
      const [movedBlock] = SENSE_STATE.blocks.splice(sourceIdx, 1);
      SENSE_STATE.blocks.splice(targetIdx, 0, movedBlock);

      renderAll();
    });

    // 1. 헤더: 드래그 핸들 마크 + 순서 번호 + 제목 + (접혔을 때 한 줄 요약) + 우측 [+] 및 [접기/펼치기], [삭제]
    const headerEl = document.createElement('div');
    headerEl.className = 'flex items-center justify-between gap-2 select-none group pb-1';
    
    // 블록 아이콘 분기 (텍스트, 사진 2대 핵심 블록)
    const blockIcon = block.type === 'text' ? 'text_fields' : 'image';
    const blockName = block.type === 'text' ? '텍스트 블록' : '이미지 블록';
    const blockSummary = getBlockSummarySnippet(block);

    headerEl.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 cursor-pointer" onclick="toggleBlockCollapse(${idx})" title="클릭하여 접기 / 펼치기">
        <!-- 드래그 핸들 마크 (화살표 대체) -->
        <span class="material-symbols-outlined text-slate-400 hover:text-indigo-600 cursor-grab active:cursor-grabbing text-[19px] p-0.5 shrink-0 transition-colors" title="마우스로 끌어서 순서 변경" onmousedown="event.stopPropagation()">drag_indicator</span>
        
        <!-- 블록 고유 순서 번호 뱃지 (B1, B2, B3...) -->
        <span class="w-6 h-5 rounded-md bg-indigo-700 text-white flex items-center justify-center font-mono font-black text-[11px] shrink-0 shadow-2xs tracking-tight">B${idx + 1}</span>
        
        <!-- 블록 타입 타이틀 -->
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="material-symbols-outlined text-[17px] text-indigo-600">${blockIcon}</span>
          <span class="font-headline-sm text-xs sm:text-[13px] font-black text-slate-900 group-hover:text-indigo-600 transition-colors">${blockName}</span>
        </div>

        <!-- 상태 태그 or 접힘 시 한 줄 요약 미리보기 -->
        ${block.isCollapsed 
          ? `<div class="text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-[300px] font-medium pl-2 border-l border-slate-300 italic">
              ${escapeHtml(blockSummary)}
             </div>`
          : `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-label-status text-[10px] hidden sm:inline-block border border-slate-200">
              ${block.type === 'text' ? (block.isAd ? '🔒 (광고) 표기 모드' : '텍스트 본문') : 'JPG/PNG 사진 카드'}
             </span>`
        }
      </div>

      <!-- 우측 컨트롤 버튼들 (조건 패스 뱃지, 상용구 저장, 삭제, 접기/펼치기) -->
      <div class="flex items-center gap-1.5 text-slate-600 shrink-0">
        ${block.skipIfJoined ? `
          <span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-300 flex items-center gap-0.5 select-none" title="조건 만족 시 B${idx + 1} 블록은 발송에서 제외됩니다">
            <span class="material-symbols-outlined text-[11px] text-amber-600">filter_alt</span>
            <span>B${idx + 1} 패스 대상</span>
          </span>
        ` : ''}

        <!-- ⭐️ 현재 블록을 상용구 서랍에 저장 버튼 -->
        <button class="w-7 h-7 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition-colors text-slate-400 cursor-pointer" onclick="saveBlockAsSnippet(${idx})" title="이 블록을 상용구 서랍에 보관하기">
          <span class="material-symbols-outlined text-[16px]">bookmark_add</span>
        </button>

        <!-- 블록 삭제 버튼 (✕) -->
        <button class="w-7 h-7 rounded-lg hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors text-slate-400 cursor-pointer" onclick="removeBlock(${idx})" title="블록 삭제">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>

        <!-- 접기 / 펼치기 아코디언 버튼 -->
        <button class="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-700 cursor-pointer border border-slate-200" onclick="toggleBlockCollapse(${idx})" title="${block.isCollapsed ? '펼치기' : '접기'}">
          <span class="material-symbols-outlined text-[19px] text-slate-600 hover:text-slate-900 transition-transform duration-200">${block.isCollapsed ? 'expand_more' : 'expand_less'}</span>
        </button>
      </div>
    `;
    blockEl.appendChild(headerEl);

    // 접혀있을 경우 본문 컨텐츠 렌더링 스킵 (여유있는 화면 공간 확보)
    if (!block.isCollapsed) {
      // 구분선
      const divider = document.createElement('div');
      divider.className = 'border-b-2 border-slate-100 pt-1';
      blockEl.appendChild(divider);

      // 본문 들여쓰기 래퍼 (유저 요청: 제목줄과 확실히 구분되도록 보기 좋게 들여쓰기 적용)
      const bodyWrapper = document.createElement('div');
      bodyWrapper.className = 'pl-6 sm:pl-7 space-y-2 pt-1';

      // 본문 컨텐츠 분기
      if (block.type === 'text') {
        const textContainer = document.createElement('div');
        textContainer.className = 'space-y-2';

        // (광고) 컴플라이언스 토글 스위치
        const adToggleRow = document.createElement('div');
        adToggleRow.className = 'flex items-center justify-between p-2 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs';
        adToggleRow.innerHTML = `
          <label class="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
            <input type="checkbox" class="accent-indigo-600 cursor-pointer w-4 h-4 rounded" ${block.isAd ? 'checked' : ''} onchange="toggleBlockAd(${idx}, this.checked)">
            <span class="font-bold">📋 (광고) 표기 및 080 무료수신거부 자동 부착</span>
          </label>
          <span class="text-[10px] text-slate-500 font-label-mono-sm">정보통신망법 준수 안심 모드</span>
        `;
        textContainer.appendChild(adToggleRow);

        // 동적 맞춤 변수 칩 바 (유저 업로드 명단의 실제 필드명/컬럼명 기반)
        const fields = getActiveRecipientFields();
        const chipsBar = document.createElement('div');
        chipsBar.className = 'flex items-center gap-1.5 flex-wrap pt-0.5';

        const chipsHtml = fields.map(f => `
          <button type="button" class="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-label-mono-sm text-[11px] font-bold border border-indigo-200 shadow-2xs transition-all cursor-pointer flex items-center gap-0.5 group" onclick="insertDynamicVariable(${idx}, '${escapeHtml(f)}')" title="클릭 시 본문에 #{${escapeHtml(f)}} 삽입">
            <span class="opacity-60 group-hover:opacity-100">+</span>
            <span>#{${escapeHtml(f)}}</span>
          </button>
        `).join('');

        chipsBar.innerHTML = `
          <span class="text-[11px] font-bold text-slate-600 mr-0.5 flex items-center gap-0.5">
            <span class="material-symbols-outlined text-[13px] text-indigo-600">data_object</span>
            맞춤 변수:
          </span>
          ${chipsHtml}
        `;
        textContainer.appendChild(chipsBar);

        const textarea = document.createElement('textarea');
        textarea.id = `block_textarea_${block.id}`;
        textarea.className = 'w-full p-3 rounded-xl bg-slate-50/70 text-slate-900 font-mono text-[13px] leading-relaxed border-2 border-slate-200 outline-none focus:bg-white focus:border-indigo-500 transition-all resize-y min-h-[95px]';
        textarea.value = block.content;
        const sampleVars = fields.slice(0, 3).map(f => `#{${f}}`).join(', ');
        textarea.placeholder = `전달할 메시지를 입력하세요. 위 맞춤 변수(${sampleVars})를 클릭하거나 본문에 직접 적어두시면 수신자별로 자동 치환됩니다.`;
        textarea.oninput = (e) => {
          block.content = e.target.value;
          renderKakaoPreview();
        };
        textContainer.appendChild(textarea);
        bodyWrapper.appendChild(textContainer);

      } else if (block.type === 'image') {
        const imgContainer = document.createElement('div');
        imgContainer.id = `imageBlockDropZone_${idx}`;
        imgContainer.className = 'relative p-3 rounded-xl bg-slate-50/70 border-2 border-dashed border-slate-300 hover:border-indigo-500 transition-all space-y-2 overflow-visible';

        // 윈도우 탐색기 파일 드래그앤드롭 이벤트 바인딩
        imgContainer.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            imgContainer.classList.add('border-indigo-500', 'bg-indigo-50/30', 'scale-[1.005]');
          }
        });

        imgContainer.addEventListener('dragleave', (e) => {
          if (e.dataTransfer.types.includes('Files')) {
            imgContainer.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'scale-[1.005]');
          }
        });

        imgContainer.addEventListener('drop', (e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.stopPropagation();
            imgContainer.classList.remove('border-indigo-500', 'bg-indigo-50/30', 'scale-[1.005]');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              applyImageFileToBlock(idx, files[0]);
            }
          }
        });

        // 카드 어디서든 스크린샷 붙여넣기(Ctrl+V) 지원
        imgContainer.addEventListener('paste', (e) => {
          handleImageBlockPaste(idx, e);
        });

        imgContainer.innerHTML = `
          <!-- 사진 등록 및 에러 시 블록 주변에 이쁘게 뜨는 로컬 피드백 배지 컨테이너 -->
          <div id="imageBlockFeedback_${idx}" class="absolute -top-3 right-3 z-30 pointer-events-none transition-all"></div>

          <div class="flex items-center gap-3">
            <!-- 썸네일 미리보기 -->
            <div class="w-24 h-16 sm:w-28 sm:h-18 rounded-lg bg-slate-100 border-2 border-slate-200 flex items-center justify-center overflow-hidden shrink-0 relative group shadow-2xs">
              ${
                block.dataUrl
                  ? `<img src="${block.dataUrl}" class="w-full h-full object-cover">`
                  : `<div class="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 flex flex-col items-center justify-center text-primary p-1 text-center">
                      <span class="material-symbols-outlined text-[24px]">image</span>
                      <span class="text-[9px] font-bold mt-0.5 text-on-surface-variant truncate w-full">${block.fileName || '이미지 카드'}</span>
                    </div>`
              }
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity text-[9px] font-medium pointer-events-none">
                <span class="material-symbols-outlined text-[16px]">file_download</span>
                <span>탐색기 드롭</span>
              </div>
            </div>

            <!-- 우측 상세 및 3가지 입력 컨트롤 -->
            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="font-label-mono-sm text-xs font-bold text-on-surface truncate">${block.fileName || '미지정 사진'}</div>
                <span class="text-[10px] text-on-surface-variant font-mono shrink-0">${block.dimensions || '1200 x 800px'} · ${block.fileSize || '142KB'}</span>
              </div>

              <!-- 3대 입력 컨트롤 바 -->
              <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                <!-- 1. 파일 선택 버튼 -->
                <label class="px-2.5 py-1 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface text-[11px] font-bold border border-outline-variant/40 hover:border-primary cursor-pointer transition-all flex items-center gap-1 shadow-2xs">
                  <span class="material-symbols-outlined text-[14px] text-primary">folder_open</span>
                  <span>파일 선택</span>
                  <input type="file" accept="image/*" class="hidden" onchange="handleImageBlockUpload(${idx}, event)">
                </label>

                <!-- 2. 스샷 붙여넣기 커서 입력창 (유저 요청: '커서로 톡' 한 후 Ctrl+V) -->
                <div class="relative flex items-center">
                  <input type="text"
                         id="imagePasteInput_${idx}"
                         placeholder="📸 스샷 후 클릭 ➔ Ctrl+V"
                         class="px-2.5 py-1 text-[11px] rounded-lg bg-surface-container-lowest border border-dashed border-primary/40 hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary/40 focus:bg-primary/5 outline-none text-primary font-semibold transition-all w-44 sm:w-52 cursor-pointer text-center select-all placeholder:text-primary/70 placeholder:font-medium"
                         title="화면 캡처(Win+Shift+S) 후 여기를 클릭하고 Ctrl+V를 누르면 즉시 사진이 등록됩니다."
                         onpaste="handleImageBlockPaste(${idx}, event)">
                </div>
              </div>
            </div>
          </div>
        `;
        bodyWrapper.appendChild(imgContainer);

      }

      blockEl.appendChild(bodyWrapper);
    }

    container.appendChild(blockEl);
  });

  // 캔버스 맨 하단: 2대 핵심 블록(텍스트, 사진) 원클릭 추가 버튼 (가로 폭 줄여 우측 정렬)
  const addBtnCard = document.createElement('div');
  addBtnCard.className = 'pt-2 pb-6 flex items-center justify-end gap-2';
  addBtnCard.innerHTML = `
    <!-- 1. 텍스트 블록 추가 버튼 -->
    <button onclick="addTextBlock()" class="py-2 px-3.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] border border-white/20" title="새 텍스트 메시지 블록 추가">
      <span class="material-symbols-outlined text-[16px]">text_fields</span>
      <span>+ 텍스트 블록 추가</span>
    </button>

    <!-- 2. 이미지(사진) 블록 추가 버튼 -->
    <button onclick="addImageBlock()" class="py-2 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-primary hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] border border-white/20" title="새 이미지(사진) 블록 추가">
      <span class="material-symbols-outlined text-[16px]">image</span>
      <span>+ 이미지(사진) 추가</span>
    </button>
  `;
  container.appendChild(addBtnCard);
}

// ==========================================
// 채널별 스마트폰 미리보기 테마 정의
// ==========================================
const CHANNEL_PREVIEW_THEMES = {
  kakao: {
    name: '카카오톡',
    shortName: '카톡',
    label: '카톡 미리보기',
    iconSvg: '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 3c-5.52 0-10 3.58-10 8 0 2.83 1.83 5.32 4.62 6.72-.2.74-.75 2.76-.86 3.19-.14.54.2.53.42.38.17-.11 2.37-1.63 3.33-2.3.81.12 1.63.19 2.49.19 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg>',
    cardIconClass: 'w-8 h-8 rounded-xl bg-[#fee500] text-[#191919] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all',
    screenBg: 'bg-[#b2c7d9]',
    headerBg: 'bg-[#a1b8cb]',
    headerTextClass: 'flex items-center gap-1.5 text-slate-800',
    headerSearchClass: 'flex items-center gap-1.5 text-slate-700',
    headerCloseClass: 'px-2 py-0.5 rounded-md bg-black/10 hover:bg-black/20 text-slate-800 text-[10.5px] font-bold cursor-pointer',
    datePillClass: 'px-2 py-0.5 rounded-full bg-black/10 text-white text-[9px] font-label-mono-sm',
    sendCircleClass: 'w-5 h-5 rounded-full bg-[#fee500] flex items-center justify-center text-[#191919] transition-colors',
    popupActionBtnClass: 'flex-1 py-2 px-3 rounded-xl bg-[#fee500] hover:brightness-95 text-[#191919] font-headline-sm text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all',
    popupActionText: '카카오톡 바로 발송',
    bubbleClass: 'max-w-[90%] p-2 rounded-xl rounded-tr-xs bg-[#fee500] text-[#191919] font-body-md text-[11px] leading-relaxed shadow-sm whitespace-pre-wrap',
    timeClass: 'text-[9px] text-black/50 pr-1',
    tagClass: 'text-[9px] text-black/70 bg-[#fee500]/70 px-2 py-0.5 rounded-full border border-black/10 shadow-2xs',
    badgeClass: 'px-1 rounded bg-[#fee500] text-[7px] font-bold text-[#191919]'
  },
  line: {
    name: '라인 (LINE)',
    shortName: '라인',
    label: '라인 미리보기',
    iconSvg: '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324S.635 5.821.635 9.864c0 3.619 3.22 6.643 7.575 7.186.295.064.697.194.798.445.092.227.06.582.03.811l-.13.784c-.04.24-.185.941.823.513 1.008-.427 5.438-3.203 7.42-5.483 1.493-1.688 2.214-3.414 2.214-4.256z"/></svg>',
    cardIconClass: 'w-8 h-8 rounded-xl bg-[#06c755] text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all',
    screenBg: 'bg-[#7a8a9e]',
    headerBg: 'bg-[#273246]',
    headerTextClass: 'flex items-center gap-1.5 text-white',
    headerSearchClass: 'flex items-center gap-1.5 text-white/80',
    headerCloseClass: 'px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-[10.5px] font-bold cursor-pointer',
    datePillClass: 'px-2 py-0.5 rounded-full bg-black/20 text-white text-[9px] font-label-mono-sm',
    sendCircleClass: 'w-5 h-5 rounded-full bg-[#06c755] flex items-center justify-center text-white transition-colors',
    popupActionBtnClass: 'flex-1 py-2 px-3 rounded-xl bg-[#06c755] hover:brightness-105 text-white font-headline-sm text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all',
    popupActionText: '라인(LINE) 바로 발송',
    bubbleClass: 'max-w-[90%] p-2 rounded-xl rounded-tr-xs bg-[#06c755] text-white font-body-md text-[11px] leading-relaxed shadow-sm whitespace-pre-wrap',
    timeClass: 'text-[9px] text-white/70 pr-1',
    tagClass: 'text-[9px] text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs',
    badgeClass: 'px-1 rounded bg-[#06c755] text-[7px] font-bold text-white'
  },
  telegram: {
    name: '텔레그램',
    shortName: '텔레그램',
    label: '텔레그램 미리보기',
    iconSvg: '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>',
    cardIconClass: 'w-8 h-8 rounded-xl bg-[#229ed9] text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all',
    screenBg: 'bg-[#5b7a99]',
    headerBg: 'bg-[#517da2]',
    headerTextClass: 'flex items-center gap-1.5 text-white',
    headerSearchClass: 'flex items-center gap-1.5 text-white/80',
    headerCloseClass: 'px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-[10.5px] font-bold cursor-pointer',
    datePillClass: 'px-2 py-0.5 rounded-full bg-black/20 text-white text-[9px] font-label-mono-sm',
    sendCircleClass: 'w-5 h-5 rounded-full bg-[#229ed9] flex items-center justify-center text-white transition-colors',
    popupActionBtnClass: 'flex-1 py-2 px-3 rounded-xl bg-[#229ed9] hover:brightness-105 text-white font-headline-sm text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all',
    popupActionText: '텔레그램 바로 발송',
    bubbleClass: 'max-w-[90%] p-2 rounded-xl rounded-tr-xs bg-[#effdde] text-[#191919] font-body-md text-[11px] leading-relaxed shadow-sm whitespace-pre-wrap border border-[#cbe4a8]',
    timeClass: 'text-[9px] text-slate-500 pr-1',
    tagClass: 'text-[9px] text-sky-900 bg-sky-100 px-2 py-0.5 rounded-full border border-sky-300 shadow-2xs',
    badgeClass: 'px-1 rounded bg-[#229ed9] text-[7px] font-bold text-white'
  },
  whatsapp: {
    name: '왓츠앱 (WhatsApp)',
    shortName: '왓츠앱',
    label: '왓츠앱 미리보기',
    iconSvg: '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.971.53 1.769.814 2.796.815 3.183 0 5.769-2.587 5.77-5.766.001-3.18-2.585-5.766-5.77-5.766zm3.374 8.163c-.14.394-.805.748-1.127.79-.322.042-.71.06-2.033-.49-1.597-.665-2.613-2.298-2.693-2.404-.08-.106-.64-.852-.64-1.624 0-.772.404-1.152.548-1.304.144-.152.314-.19.418-.19.105 0 .21.001.302.006.098.005.228-.037.356.27.13.31.442 1.077.481 1.156.04.079.066.171.013.276-.053.106-.079.171-.157.263-.079.092-.165.205-.236.276-.079.079-.161.165-.069.323.092.158.409.675.877 1.092.602.536 1.109.702 1.267.781.158.079.25.066.342-.04.092-.105.394-.46.5-.618.105-.158.21-.132.355-.079.145.053.919.434 1.077.513.158.079.263.118.302.184.04.066.04.382-.1.776zM12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.176L2 22l4.966-1.302A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>',
    cardIconClass: 'w-8 h-8 rounded-xl bg-[#25d366] text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all',
    screenBg: 'bg-[#efeae2]',
    headerBg: 'bg-[#075e54]',
    headerTextClass: 'flex items-center gap-1.5 text-white',
    headerSearchClass: 'flex items-center gap-1.5 text-white/80',
    headerCloseClass: 'px-2 py-0.5 rounded-md bg-white/20 hover:bg-white/30 text-white text-[10.5px] font-bold cursor-pointer',
    datePillClass: 'px-2 py-0.5 rounded-full bg-black/20 text-white text-[9px] font-label-mono-sm',
    sendCircleClass: 'w-5 h-5 rounded-full bg-[#25d366] flex items-center justify-center text-white transition-colors',
    popupActionBtnClass: 'flex-1 py-2 px-3 rounded-xl bg-[#25d366] hover:brightness-105 text-white font-headline-sm text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all',
    popupActionText: '왓츠앱(WhatsApp) 바로 발송',
    bubbleClass: 'max-w-[90%] p-2 rounded-xl rounded-tr-xs bg-[#d9fdd3] text-[#111b21] font-body-md text-[11px] leading-relaxed shadow-sm whitespace-pre-wrap border border-[#c2efb9]',
    timeClass: 'text-[9px] text-[#667781] pr-1',
    tagClass: 'text-[9px] text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs',
    badgeClass: 'px-1 rounded bg-[#25d366] text-[7px] font-bold text-white'
  },
  wechat: {
    name: '위챗 (WeChat)',
    shortName: '위챗',
    label: '위챗 미리보기',
    iconSvg: '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M8.5 15.5c.3 0 .6 0 .9-.05.4.65 1.1 1.2 1.9 1.55l-.5 1.5 1.8-.9c.75.25 1.55.4 2.4.4 4.15 0 7.5-2.9 7.5-6.5S19.15 5 15 5c-4.15 0-7.5 2.9-7.5 6.5 0 1.5.6 2.9 1.6 4-.4 0-.8-.05-1.2-.05-4.4 0-8 3.1-8 7 0 2.1 1.1 4 2.8 5.3L2 23l3.5-1.7c.95.4 2 .7 3.1.7 4.4 0 8-3.1 8-7 0-.3 0-.6-.05-.9C15.65 14.7 14.4 15.5 13 15.5H8.5zM6 10.5c-.7 0-1.25-.55-1.25-1.25S5.3 8 6 8s1.25.55 1.25 1.25S6.7 10.5 6 10.5zm5 0c-.7 0-1.25-.55-1.25-1.25S10.3 8 11 8s1.25.55 1.25 1.25S11.7 10.5 11 10.5zm6.5 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm4 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>',
    cardIconClass: 'w-8 h-8 rounded-xl bg-[#07c160] text-white flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-all',
    screenBg: 'bg-[#ededed]',
    headerBg: 'bg-[#f7f7f7] border-b border-slate-200',
    headerTextClass: 'flex items-center gap-1.5 text-slate-900',
    headerSearchClass: 'flex items-center gap-1.5 text-slate-600',
    headerCloseClass: 'px-2 py-0.5 rounded-md bg-black/10 hover:bg-black/20 text-slate-800 text-[10.5px] font-bold cursor-pointer',
    datePillClass: 'px-2 py-0.5 rounded-full bg-black/10 text-slate-600 text-[9px] font-label-mono-sm',
    sendCircleClass: 'w-5 h-5 rounded-full bg-[#07c160] flex items-center justify-center text-white transition-colors',
    popupActionBtnClass: 'flex-1 py-2 px-3 rounded-xl bg-[#07c160] hover:brightness-105 text-white font-headline-sm text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all',
    popupActionText: '위챗(WeChat) 바로 발송',
    bubbleClass: 'max-w-[90%] p-2 rounded-xl rounded-tr-xs bg-[#95ec69] text-[#191919] font-body-md text-[11px] leading-relaxed shadow-sm whitespace-pre-wrap border border-[#7ed84f]',
    timeClass: 'text-[9px] text-slate-500 pr-1',
    tagClass: 'text-[9px] text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs',
    badgeClass: 'px-1 rounded bg-[#07c160] text-[7px] font-bold text-white'
  }
};

// ==========================================
// 채널별 일일 안티밴 안전 캡 (Anti-Ban Guard Caps)
// ==========================================
const CHANNEL_ANTIBAN_CAPS = {
  kakao: { limit: 500, label: '500건/일', desc: '카카오톡 계정 제재를 예방하기 위해 하루 500건 이상 연속 발송을 자동 제한합니다.' },
  line: { limit: 500, label: '500건/일', desc: '라인 계정 제재를 예방하기 위해 하루 500건 이상 연속 발송을 자동 제한합니다.' },
  telegram: { limit: 500, label: '500건/일', desc: '텔레그램 계정 제재를 예방하기 위해 하루 500건 이상 연속 발송을 자동 제한합니다.' },
  whatsapp: { limit: 300, label: '300건/일', desc: '왓츠앱 비즈니스/개인 번호 정지를 방지하기 위해 하루 300건 발송을 권장합니다.' },
  wechat: { limit: 150, label: '150건/일 (🛡️ 보안 계정보호)', desc: '텐센트(WeChat) 계정 동결 방지를 위해 키 인젝션을 차단하고 클립보드 안전 복사 모드로 하루 150건 이내 발송을 제한합니다.' }
};

/**
 * 채널별 실시간 미리보기 PiP 위젯 & 스마트폰 팝업 렌더링
 */
function renderKakaoPreview() {
  const currentRec = SENSE_STATE.recipients[SENSE_STATE.currentIndex] || { name: '수신자', title: '', org: '', memo: '' };
  const currentChannel = SENSE_STATE.activeChannel || 'kakao';
  const theme = CHANNEL_PREVIEW_THEMES[currentChannel] || CHANNEL_PREVIEW_THEMES.kakao;
  
  // 1. 좌하단 미니 미리보기 카드 동적 테마 갱신
  const cardLabelEl = document.getElementById('previewCardChannelLabel');
  if (cardLabelEl) cardLabelEl.innerText = theme.label;

  const cardIconEl = document.getElementById('previewCardIconWrapper');
  if (cardIconEl) {
    cardIconEl.className = theme.cardIconClass;
    cardIconEl.innerHTML = theme.iconSvg;
  }

  const cardTitleEl = document.getElementById('kakaoPreviewCardTargetTitle');
  if (cardTitleEl) {
    cardTitleEl.innerText = `${currentRec.name} ${currentRec.title || ''}`.trim();
  }

  const cardSnippetEl = document.getElementById('kakaoPreviewCardSnippet');
  if (cardSnippetEl) {
    const firstText = SENSE_STATE.blocks.find(b => b.type === 'text');
    if (firstText) {
      const snippet = buildInterpolatedMessage(firstText.content, currentRec, firstText.isAd, firstText.optOutNum);
      cardSnippetEl.innerText = snippet.replace(/\s+/g, ' ').slice(0, 36) + (snippet.length > 36 ? '...' : '');
    } else {
      cardSnippetEl.innerText = '메시지 블록 준비 완료';
    }
  }

  const previewCard = document.getElementById('kakaoPreviewCard');
  if (previewCard) {
    previewCard.title = `클릭 시 실제 스마트폰 ${theme.shortName} 미리보기 팝업 열기`;
  }

  // 2. 스마트폰 팝업 모달 내부 프레임 & 헤더 & 하단 액션 동적 테마 갱신
  const screenContainer = document.getElementById('previewPhoneScreenContainer');
  if (screenContainer) {
    screenContainer.className = `w-full h-full ${theme.screenBg} rounded-[30px] overflow-hidden flex flex-col relative pt-4 transition-colors duration-200`;
  }

  const headerBar = document.getElementById('previewPhoneHeaderBar');
  if (headerBar) {
    headerBar.className = `h-10 ${theme.headerBg} px-3 flex items-center justify-between shrink-0 shadow-2xs transition-colors duration-200`;
  }

  const headerLeft = document.getElementById('previewPhoneHeaderLeft');
  if (headerLeft) {
    headerLeft.className = theme.headerTextClass;
  }

  const headerRight = document.getElementById('previewPhoneHeaderRight');
  if (headerRight) {
    headerRight.className = theme.headerSearchClass;
  }

  const headerCloseBtn = document.getElementById('previewPhoneHeaderCloseBtn');
  if (headerCloseBtn) {
    headerCloseBtn.className = theme.headerCloseClass;
  }

  const titleEl = document.getElementById('kakaoPreviewTargetTitle');
  if (titleEl) {
    titleEl.innerText = `${currentRec.name} ${currentRec.title || ''}`.trim();
  }

  const sendCircle = document.getElementById('previewPhoneSendCircle');
  if (sendCircle) {
    sendCircle.className = theme.sendCircleClass;
  }

  const popupActionBtn = document.getElementById('previewPhoneBottomActionBtn');
  if (popupActionBtn) {
    popupActionBtn.className = theme.popupActionBtnClass;
  }

  const popupActionIcon = document.getElementById('previewPhoneBottomActionIcon');
  if (popupActionIcon) {
    popupActionIcon.innerHTML = theme.iconSvg;
  }

  const popupActionTitle = document.getElementById('previewPhoneBottomActionTitle');
  if (popupActionTitle) {
    popupActionTitle.innerText = theme.popupActionText;
  }

  // 3. 메시지 리스트 스크롤 영역 말풍선 렌더링
  const container = document.getElementById('kakaoPreviewChatMessages');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center">
      <span class="${theme.datePillClass}">오늘 (1:1 안심 전달)</span>
    </div>
  `;

  const isCurrentRecMatched = isRecipientMatchCondition(currentRec);

  // 각 블록별 채널 테마 말풍선 생성
  SENSE_STATE.blocks.forEach((block, bIdx) => {
    const isSkipThisBlock = isCurrentRecMatched && (_dispatchCondition.skipBlockIndices.includes(bIdx) || block.skipIfJoined === true);

    if (isSkipThisBlock) {
      // 🌟 조건 일치 회원일 경우: 해당 블록이 자동 패스됨을 시각적으로 명확히 표시
      const skipNotice = document.createElement('div');
      skipNotice.className = 'w-full py-1.5 px-2.5 my-1 rounded-xl bg-amber-50/90 border border-amber-300 text-slate-700 text-[10.5px] font-bold flex items-center justify-between select-none shadow-2xs';
      skipNotice.innerHTML = `
        <span class="flex items-center gap-1.5 truncate">
          <span class="material-symbols-outlined text-[15px] text-amber-600 shrink-0">filter_alt</span>
          <span class="truncate"><strong class="text-indigo-600 font-mono">B${bIdx + 1}</strong> (${escapeHtml(block.title || '블록')})은 <strong>조건 일치 자동 패스</strong></span>
        </span>
        <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-mono font-black shrink-0">발송 제외</span>
      `;
      container.appendChild(skipNotice);
      return;
    }

    if (block.type === 'text') {
      const interpolated = buildInterpolatedMessage(block.content, currentRec, block.isAd, block.optOutNum);
      const bubble = document.createElement('div');
      bubble.className = 'flex flex-col items-end gap-0.5';
      bubble.innerHTML = `
        <span class="${theme.timeClass}">오후 2:45</span>
        <div class="${theme.bubbleClass}">
          ${escapeHtml(interpolated)}
        </div>
      `;
      container.appendChild(bubble);

    } else if (block.type === 'image') {
      const imgBubble = document.createElement('div');
      imgBubble.className = 'flex flex-col items-end gap-0.5';
      imgBubble.innerHTML = `
        <div class="max-w-[85%] rounded-xl rounded-tr-xs overflow-hidden shadow-sm bg-surface-container-lowest border border-black/5">
          ${
            block.dataUrl
              ? `<img src="${block.dataUrl}" class="max-h-32 w-full object-cover">`
              : `<div class="h-20 bg-gradient-to-br from-primary to-secondary p-2 flex flex-col justify-between text-on-primary">
                  <div class="flex items-center justify-between">
                    <span class="text-[9px] font-bold opacity-90">MEETING BRIEF</span>
                    <span class="material-symbols-outlined text-[14px]">description</span>
                  </div>
                  <div>
                    <div class="font-bold text-[11px] truncate">${currentRec.org || '안내'} 회신 요약본</div>
                    <div class="text-[8px] opacity-80">${block.fileName || 'image.png'}</div>
                  </div>
                </div>`
          }
        </div>
      `;
      container.appendChild(imgBubble);
    }
  });

}

/**
 * 카운터 및 잔액 갱신
 */
function renderCounters() {
  const coinDisplay = document.getElementById('userCoinDisplay');
  if (coinDisplay) {
    if (SENSE_STATE.subscriptionPlan === 'free') {
      coinDisplay.innerHTML = `⚡ 무료 체험 <strong class="font-bold text-on-surface">(${SENSE_STATE.remainingQuota} / 100건)</strong>`;
    } else {
      coinDisplay.innerHTML = `👑 <strong>${SENSE_STATE.planName}</strong> (${SENSE_STATE.remainingQuota.toLocaleString()} / ${SENSE_STATE.monthlyQuota.toLocaleString()}건)`;
    }
  }
  applyJitState();
}

// ==========================================
// 4. 문자열 치환 및 컴플라이언스 엔진
// ==========================================
function buildInterpolatedMessage(template, recipient, isAd = false, optOutNum = '080-880-7766') {
  if (!template) return '';
  let text = template;
  const rec = recipient || {};

  // 동적 맞춤 변수 치환: #{필드명}
  text = text.replace(/#\{([^}]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (rec[key] !== undefined && rec[key] !== null && String(rec[key]).trim() !== '') {
      return String(rec[key]);
    }
    // 표준 명칭 폴백
    if (key === '이름' && rec.name) return rec.name;
    if (key === '직함' && rec.title) return rec.title;
    if (key === '소속' && rec.org) return rec.org;
    if (key === '전화번호' && rec.phone) return rec.phone;
    if (key === '메모' && rec.memo) return rec.memo;

    // 대소문자 무관 탐색
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(rec)) {
      if (k.toLowerCase() === lowerKey && v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v);
      }
    }
    return '';
  });

  // (광고) 컴플라이언스
  if (isAd) {
    if (!text.startsWith('(광고)')) {
      text = `(광고)\n${text}`;
    }
    const optOutText = `\n\n무료수신거부: ${optOutNum}`;
    if (!text.includes('무료수신거부')) {
      text += optOutText;
    }
  }

  return text;
}

/**
 * 현재 수신자 대상 전체 조립 메시지 생성 (모든 텍스트 블록 결합)
 * - 썬드리머 모드: 가입 회원일 경우 skipIfJoined 블록은 자동 제외(패스)
 */
function getFullMessageForRecipient(recipient) {
  const currentRec = recipient || SENSE_STATE.recipients[SENSE_STATE.currentIndex] || { name: '수신자', title: '', org: '', memo: '', phone: '' };
  const isMatch = isRecipientMatchCondition(currentRec);

  const textBlocks = SENSE_STATE.blocks.filter((b, bIdx) => {
    if (b.type !== 'text') return false;
    // 조건에 부합하는 수신자에게 해당 블록이 패스 대상으로 지정되어 있다면 발송 제외
    if (isMatch && (_dispatchCondition.skipBlockIndices.includes(bIdx) || b.skipIfJoined === true)) {
      return false;
    }
    return true;
  });

  if (textBlocks.length === 0) return '';

  const textParts = textBlocks
    .map(b => buildInterpolatedMessage(b.content, currentRec, b.isAd, b.optOutNum))
    .filter(t => t.trim().length > 0);

  return textParts.join('\n\n');
}

/**
 * 수신자 객체에서 다양한 전화번호 필드명(phone, 전화번호, 연락처, 휴대폰 등)을 통합 추출
 */
function getRecipientPhone(rec) {
  if (!rec) return '';
  return String(rec.phone || rec['전화번호'] || rec['연락처'] || rec['휴대폰'] || rec['핸드폰'] || rec['phone'] || rec['mobile'] || '').trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 바이트 단위 파일 크기를 읽기 쉬운 문자열(KB/MB)로 변환
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

// ==========================================
// 5. ASDF 워크플로우 & 핑퐁 클릭 엔진
// ==========================================
function setupEventListeners() {
  // 키보드 ASDF 감지
  window.addEventListener('keydown', (e) => {
    // ESC 키로 카톡 미리보기 팝업 모달 및 팝오버 닫기
    if (e.key === 'Escape') {
      closeKakaoPreviewModal();
      closeAllPopovers();
      return;
    }

    // F9 키: 발송 일시정지 / 재개
    if (e.key === 'F9') {
      e.preventDefault();
      if (SENSE_STATE.botRunning) {
        pauseSenseBot();
      } else {
        const mainBtn = document.getElementById('mainDispatchBtn');
        if (mainBtn && !mainBtn.disabled) {
          handleUnifiedDispatchClick();
        }
      }
      return;
    }

    // Delete 키: 텍스트 입력창이 아닐 때 현재 선택된 수신자 명단에서 즉시 제외
    if (!isInputFocused && (e.key === 'Delete' || e.key === 'Del')) {
      if (Array.isArray(SENSE_STATE.recipients) && SENSE_STATE.recipients.length > 0) {
        const curIdx = SENSE_STATE.currentIndex;
        if (curIdx >= 0 && curIdx < SENSE_STATE.recipients.length) {
          e.preventDefault();
          deleteRecipient(curIdx);
        }
      }
      return;
    }

    // Enter 키 또는 Space 키: 입력창에 포커스가 없을 때 단일 발송 시작/진행 트리거
    if (!isInputFocused && (e.key === 'Enter' || e.key === ' ' || e.code === 'Space')) {
      const mainBtn = document.getElementById('mainDispatchBtn');
      if (mainBtn && !mainBtn.disabled) {
        e.preventDefault();
        handleUnifiedDispatchClick();
      }
    }
  });

  // 외부 클릭 시 모든 열려있는 팝오버 닫기
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#blockAddPopover, #bottomBlockAddBtn, #profileAccountPopover, #profileAccountBtn, #hubAppSwitcherDropdown, #hubAppSwitcherBtn, #dispatchHelpPopover, #dispatchHelpBtn')) {
      closeAllPopovers();
    }
  });

  // 파일 업로드 모달 드롭존 드래그앤드롭 이벤트 바인딩
  const dropZone = document.getElementById('fileDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('border-primary', 'bg-primary/20');
    });
    dropZone.addEventListener('dragleave', (e) => {
      dropZone.classList.remove('border-primary', 'bg-primary/20');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-primary', 'bg-primary/20');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
        closeImportModal();
      }
    });
  }

  // 상용구 모달 이미지 드롭존 드래그앤드롭 이벤트 바인딩
  const snippetDropZone = document.getElementById('snippetImageDropZone');
  if (snippetDropZone) {
    snippetDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      snippetDropZone.classList.add('border-indigo-600', 'bg-indigo-100/50');
    });
    snippetDropZone.addEventListener('dragleave', (e) => {
      snippetDropZone.classList.remove('border-indigo-600', 'bg-indigo-100/50');
    });
    snippetDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      snippetDropZone.classList.remove('border-indigo-600', 'bg-indigo-100/50');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleSnippetImageUpload({ files: e.dataTransfer.files });
      }
    });
  }
}

/**
 * 수신자 이름 클립보드 복사
 */
function copyRecipientName(idx) {
  const rec = SENSE_STATE.recipients[idx];
  if (!rec || !rec.name) return;

  navigator.clipboard.writeText(rec.name).then(() => {
    showToast(`📋 이름 복사됨: "${rec.name}" (카톡 검색창에 붙여넣기)`);
  }).catch(err => {
    console.error('클립보드 복사 실패:', err);
  });
}

/**
 * [S키] 메시지 전체 복사 + 전달완료 처리 + 다음 자동 포커스
function copyToClipboardFallback(text) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (e) {
    console.warn('클립보드 fallback 복사 실패:', e);
    return false;
  }
}

/**
 * 메시지 클립보드 복사 및 다음 수신자 자동 이동
 */
function copyMessageAndAdvance() {
  const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
  if (!rec) return;

  // 모든 텍스트 블록 + 감성 꼬리표 조합
  const fullText = getFullMessageForRecipient(rec);

  const onCopied = () => {
    // 1. 완료 상태 업데이트
    rec.status = 'done';
    handleCreditDeduction();

    // 2. 다음 대기 수신자로 자동 이동
    if (SENSE_STATE.autoNextOnCopy !== false) {
      advanceToNextPending();
    }

    renderAll();
    showToast(`✅ "${rec.name}" 복사 완료! 다음 사람으로 이동했습니다.`);
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(fullText).then(onCopied).catch(err => {
      console.warn('navigator.clipboard 실패, fallback 사용:', err);
      copyToClipboardFallback(fullText);
      onCopied();
    });
  } else {
    copyToClipboardFallback(fullText);
    onCopied();
  }
}

/**
 * 무료 횟수 차감 및 JIT 과금 트리거
 */
function handleCreditDeduction() {
  if (SENSE_STATE.remainingQuota > 0) {
    SENSE_STATE.remainingQuota -= 1;
    SENSE_STATE.freeCredits = SENSE_STATE.remainingQuota;
    localStorage.setItem('sensetalk_remaining_quota', String(SENSE_STATE.remainingQuota));
    localStorage.setItem('sensetalk_free_credits', String(SENSE_STATE.remainingQuota));

    renderCounters();
    applyJitState();

    if (SENSE_STATE.remainingQuota === 0) {
      // 100건 무료 소진 또는 구독 한도 소진 시 즉시 JIT 모달 팝업
      openRechargeModal(true);
    }
  } else {
    openRechargeModal(true);
  }
}

/**
 * 봇 엔진 일일 발송 카운트(today_sent)와 프론트엔드 잔여 크레딧 실시간 동기화
 */
function syncCreditsFromStats(todaySent) {
  if (typeof todaySent === 'number' && SENSE_STATE.subscriptionPlan === 'free') {
    const calculatedRemaining = Math.max(0, 100 - todaySent);
    const targetQuota = Math.min(SENSE_STATE.remainingQuota, calculatedRemaining);
    if (SENSE_STATE.remainingQuota !== targetQuota) {
      SENSE_STATE.remainingQuota = targetQuota;
      SENSE_STATE.freeCredits = targetQuota;
      localStorage.setItem('sensetalk_remaining_quota', String(targetQuota));
      localStorage.setItem('sensetalk_free_credits', String(targetQuota));
      renderCounters();
      applyJitState();
    }
  }
}

/**
 * 다음 대기중인 수신자 찾아서 포커스 이동
 */
function advanceToNextPending() {
  const total = SENSE_STATE.recipients.length;
  let nextIdx = -1;

  // 현재 인덱스 이후에서 대기중 찾기
  for (let i = SENSE_STATE.currentIndex + 1; i < total; i++) {
    if (SENSE_STATE.recipients[i].status === 'pending') {
      nextIdx = i;
      break;
    }
  }

  // 없으면 처음부터 검색
  if (nextIdx === -1) {
    for (let i = 0; i < SENSE_STATE.currentIndex; i++) {
      if (SENSE_STATE.recipients[i].status === 'pending') {
        nextIdx = i;
        break;
      }
    }
  }

  if (nextIdx !== -1) {
    SENSE_STATE.currentIndex = nextIdx;
  } else {
    showToast('🎉 축하합니다! 모든 수신자에게 전송이 완료되었습니다.');
  }
}

// ==========================================
// 6. 만능 명단 인제스천 (Excel/CSV/TSV)
// ==========================================
function handleFileUpload(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      parseImportedRows(rows);
      showToast(`📊 엑셀/CSV 파일 "${file.name}"에서 명단을 성공적으로 불러왔습니다!`);
    } catch (err) {
      console.error('파일 파싱 실패:', err);
      showToast('❌ 파일 파싱 중 오류가 발생했습니다. 올바른 엑셀/CSV인지 확인해주세요.');
    }
  };

  reader.readAsArrayBuffer(file);
}

/**
 * 엑셀/CSV 2차원 배열 파싱 및 열 자동 매핑
 */
function parseImportedRows(rows) {
  if (!rows || rows.length < 2) {
    showToast('⚠️ 데이터가 비어있거나 제목 행만 있습니다.');
    return;
  }

  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  
  // 열 인덱스 자동 추론
  let nameCol = headers.findIndex(h => h.includes('이름') || h.includes('성명') || h.includes('name') || h.includes('고객'));
  let phoneCol = headers.findIndex(h => h.includes('전화') || h.includes('연락처') || h.includes('phone') || h.includes('핸드폰') || h.includes('휴대폰'));
  let titleCol = headers.findIndex(h => h.includes('직함') || h.includes('직책') || h.includes('title') || h.includes('포지션'));
  let orgCol = headers.findIndex(h => h.includes('소속') || h.includes('회사') || h.includes('부서') || h.includes('매장') || h.includes('org'));
  let memoCol = headers.findIndex(h => h.includes('메모') || h.includes('비고') || h.includes('memo') || h.includes('안내'));

  if (nameCol === -1) nameCol = 0; // 1열 기본 가정

  const newRecipients = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const name = row[nameCol] ? String(row[nameCol]).trim() : '';
    if (!name) continue;

    newRecipients.push({
      id: String(Date.now() + r),
      name: name,
      phone: phoneCol !== -1 && row[phoneCol] ? String(row[phoneCol]).trim() : '',
      title: titleCol !== -1 && row[titleCol] ? String(row[titleCol]).trim() : '',
      org: orgCol !== -1 && row[orgCol] ? String(row[orgCol]).trim() : '',
      memo: memoCol !== -1 && row[memoCol] ? String(row[memoCol]).trim() : '',
      status: 'pending'
    });
  }

  if (newRecipients.length > 0) {
    SENSE_STATE.recipients = newRecipients;
    SENSE_STATE.currentIndex = 0;
    renderAll();
  }
}

/**
 * 텍스트 직접 붙여넣기 (TSV) 파싱
 */
function handleTsvPaste(text) {
  if (!text) return;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return;

  const rows = lines.map(l => l.split('\t'));
  const firstRow = rows[0].map(c => String(c).trim().toLowerCase());
  const hasHeader = firstRow.some(h => h.includes('이름') || h.includes('성명') || h.includes('name') || h.includes('전화') || h.includes('연락처'));

  // 헤더 행이 포함된 엑셀 복사본인 경우 열 자동 매핑 활용
  if (hasHeader && rows.length > 1) {
    parseImportedRows(rows);
    showToast(`📋 클립보드 표에서 ${SENSE_STATE.recipients.length}명의 명단을 가져왔습니다!`);
    return;
  }

  // 헤더가 없는 순수 데이터 행들인 경우 순차 매핑
  const newRecipients = [];
  rows.forEach((parts, idx) => {
    if (parts.length > 0 && parts[0] && parts[0].trim()) {
      newRecipients.push({
        id: String(Date.now() + idx),
        name: parts[0].trim(),
        title: parts[1] ? parts[1].trim() : '',
        org: parts[2] ? parts[2].trim() : '',
        phone: parts[3] ? parts[3].trim() : '',
        memo: parts[4] ? parts[4].trim() : '',
        status: 'pending'
      });
    }
  });

  if (newRecipients.length > 0) {
    SENSE_STATE.recipients = newRecipients;
    SENSE_STATE.currentIndex = 0;
    renderAll();
    showToast(`📋 클립보드 표에서 ${newRecipients.length}명의 명단을 가져왔습니다!`);
  }
}

// ==========================================
// 7. 블록 조립 및 편집 컨트롤러
// ==========================================

/**
 * 명단 테이블 상단 동적 변수 칩 클릭 시 메시지 본문에 자동 삽입
 */
function insertVariableChip(token) {
  // 1. 현재 포커스된 textarea가 조립 캔버스 내에 있는지 확인
  const activeEl = document.activeElement;
  if (activeEl && activeEl.tagName === 'TEXTAREA' && activeEl.closest('#blocksCanvasContainer')) {
    const start = activeEl.selectionStart || 0;
    const end = activeEl.selectionEnd || 0;
    const val = activeEl.value || '';
    activeEl.value = val.substring(0, start) + token + val.substring(end);
    activeEl.selectionStart = activeEl.selectionEnd = start + token.length;
    activeEl.dispatchEvent(new Event('input'));
    activeEl.focus();
    return;
  }

  // 2. 포커스가 없으면 첫 번째 텍스트 블록 끝에 추가
  let targetBlock = SENSE_STATE.blocks.find(b => b.type === 'text');
  if (!targetBlock) {
    addTextBlock();
    targetBlock = SENSE_STATE.blocks.find(b => b.type === 'text');
  }

  if (targetBlock) {
    targetBlock.content = (targetBlock.content ? targetBlock.content.trim() + ' ' : '') + token;
    renderBlocks();
    renderKakaoPreview();
  }
}

function insertVariable(blockIdx, token) {
  const block = SENSE_STATE.blocks[blockIdx];
  if (!block || block.type !== 'text') return;

  block.content = (block.content || '') + ' ' + token;
  renderBlocks();
  renderKakaoPreview();
}

function toggleBlockAd(blockIdx, checked) {
  const block = SENSE_STATE.blocks[blockIdx];
  if (!block) return;
  block.isAd = checked;
  renderBlocks();
  renderKakaoPreview();
}

function scrollToLatestBlock() {
  setTimeout(() => {
    const container = document.getElementById('blocksCanvasContainer');
    if (container && container.children.length > 1) {
      const newBlockEl = container.children[container.children.length - 2];
      if (newBlockEl && typeof newBlockEl.scrollIntoView === 'function') {
        newBlockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, 60);
}

function addTextBlock() {
  SENSE_STATE.blocks.push({
    id: 'block-' + Date.now(),
    type: 'text',
    title: '추가 텍스트 블록',
    content: '안녕하세요 #{이름}님! 추가 안내사항입니다.',
    isAd: false,
    optOutNum: '080-880-7766'
  });
  renderAll();
  scrollToLatestBlock();
}

function addImageBlock() {
  SENSE_STATE.blocks.push({
    id: 'block-' + Date.now(),
    type: 'image',
    title: 'JPG / PNG 사진',
    fileName: 'attached_image.png',
    fileSize: '150KB',
    dimensions: '1000 x 800px',
    dataUrl: ''
  });
  renderAll();
  scrollToLatestBlock();
}

function moveBlock(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= SENSE_STATE.blocks.length) return;
  const temp = SENSE_STATE.blocks[idx];
  SENSE_STATE.blocks[idx] = SENSE_STATE.blocks[target];
  SENSE_STATE.blocks[target] = temp;
  renderAll();
}

function removeBlock(idx) {
  if (SENSE_STATE.blocks.length <= 1) {
    showToast('⚠️ 최소 1개의 메시지 블록은 존재해야 합니다.');
    return;
  }
  SENSE_STATE.blocks.splice(idx, 1);
  renderAll();
}

// ============================================================================
// 🎯 범용 스마트 조건부 발송 제어 (Universal Conditional Dispatch)
// - 명단 필드(컬럼) 1개 선택 + 연산자(== / !=) + 기준값 매칭 ➔ 지정 블록(B1, B2...) 자동 패스
// ============================================================================
let _dispatchCondition = {
  active: false,                 // 기본 비활성화 (전체 발송)
  field: '',                     // 수신자 명단 컬럼(필드)명
  operator: 'equals',            // 'equals' (일치), 'not_equals' (불일치)
  value: '',                     // 매칭할 기준값
  skipBlockIndices: []           // 조건 일치 시 패스할 블록 인덱스 (0-based)
};

/**
 * 수신자가 현재 설정된 타겟팅 조건과 일치하는지 판별
 */
function isRecipientMatchCondition(rec) {
  if (!_dispatchCondition.active) return false;
  const field = (_dispatchCondition.field || '').trim();
  const targetVal = String(_dispatchCondition.value !== undefined ? _dispatchCondition.value : '').trim();
  if (!field || !targetVal) return false;

  let actualVal = rec ? rec[field] : undefined;

  // 썬드리머 / 루미노트 CRM 호환 (가입여부 / 앱가입 / is_joined / hub_uuid)
  if (actualVal === undefined || actualVal === null || actualVal === '') {
    if ((field === '가입여부' || field === '앱가입' || field === '가입') && (rec.is_joined === true || !!rec.hub_uuid)) {
      actualVal = '가입';
    } else if (field === 'is_joined') {
      actualVal = rec.is_joined ? 'true' : 'false';
    }
  }
  actualVal = String(actualVal !== undefined && actualVal !== null ? actualVal : '').trim();

  if (_dispatchCondition.operator === 'equals') {
    return actualVal.toLowerCase() === targetVal.toLowerCase();
  } else if (_dispatchCondition.operator === 'not_equals') {
    return actualVal.toLowerCase() !== targetVal.toLowerCase();
  }
  return false;
}

/**
 * 하단 도크 스마트 조건부 발송 제어 바 UI 갱신
 */
function updateDispatchConditionBar() {
  const barEl = document.getElementById('dispatchConditionBar');
  const textEl = document.getElementById('dispatchConditionText');
  const toggleBtn = document.getElementById('dispatchConditionToggleBtn');
  if (!barEl || !textEl || !toggleBtn) return;

  const totalRec = SENSE_STATE.recipients ? SENSE_STATE.recipients.length : 0;
  if (totalRec === 0) {
    barEl.classList.add('hidden');
    return;
  }

  barEl.classList.remove('hidden');

  if (!_dispatchCondition.active || _dispatchCondition.skipBlockIndices.length === 0) {
    textEl.innerHTML = `<span class="text-slate-500 font-semibold">👥 모든 대상에게 모든 블록 동일 발송 (조건 없음)</span>`;
    barEl.className = 'mb-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-between gap-2 shadow-2xs transition-all text-xs select-none';
    toggleBtn.innerText = '조건 끔';
    toggleBtn.className = 'px-2 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10.5px] font-bold cursor-pointer shadow-2xs transition-colors';
  } else {
    const blockNames = _dispatchCondition.skipBlockIndices.length > 0
      ? _dispatchCondition.skipBlockIndices.map(i => `B${i + 1}`).join(', ')
      : 'B2';
    const fieldName = _dispatchCondition.field || '조건 필드';
    const opStr = _dispatchCondition.operator === 'not_equals' ? '!=' : '==';
    const valStr = _dispatchCondition.value || '';

    textEl.innerHTML = `🎯 <strong>[${escapeHtml(fieldName)}] ${opStr} '${escapeHtml(valStr)}'</strong> 일 때 ➔ <span class="text-amber-950 font-black font-mono underline decoration-amber-500 underline-offset-2">${blockNames}</span> 블록 패스`;
    barEl.className = 'mb-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-2 shadow-2xs transition-all text-xs select-none';
    toggleBtn.innerText = '적용 중';
    toggleBtn.className = 'px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[10.5px] font-bold cursor-pointer shadow-2xs transition-colors';
  }
}

/**
 * 조건 적용 토글 (적용 중 ➔ 끔 ➔ 적용 중)
 */
function toggleConditionActive() {
  if (!_dispatchCondition.active) {
    if (!_dispatchCondition.field || _dispatchCondition.skipBlockIndices.length === 0) {
      showToast('💡 먼저 [조건 설정]을 눌러 제외할 블록과 매칭할 명단 조건을 지정하세요.');
      openConditionSettingsModal();
      return;
    }
    _dispatchCondition.active = true;
  } else {
    _dispatchCondition.active = false;
  }
  applyConditionToBlocks();
  renderAll();
  showToast(_dispatchCondition.active ? '🎯 스마트 조건부 발송이 적용되었습니다.' : '👥 조건 없이 모든 블록 전체 발송으로 변경되었습니다.');
}

/**
 * 조건 설정에 따라 SENSE_STATE.blocks의 skipIfJoined 속성 일괄 동기화 (봇 호환)
 */
function applyConditionToBlocks() {
  if (!SENSE_STATE.blocks) return;
  if (!_dispatchCondition.active || _dispatchCondition.skipBlockIndices.length === 0) {
    SENSE_STATE.blocks.forEach(b => { b.skipIfJoined = false; });
  } else {
    SENSE_STATE.blocks.forEach((b, idx) => {
      b.skipIfJoined = _dispatchCondition.skipBlockIndices.includes(idx);
    });
  }
}

/**
 * 조건 설정 모달 열기
 * - 불러온 명단에 실제로 존재하는 필드만 드롭다운에 노출
 */
function openConditionSettingsModal() {
  const modal = document.getElementById('conditionSettingsModal');
  if (!modal) return;

  // 1. 명단 필드 셀렉트 박스 동적 구성 (오직 불러온 명단에 존재하는 컬럼만 노출)
  const fieldSelect = document.getElementById('condFieldSelect');
  if (fieldSelect) {
    const availableFields = getActiveRecipientFields();
    if (availableFields.length === 0) {
      fieldSelect.innerHTML = '<option value="">(불러온 명단 필드 없음)</option>';
    } else {
      let curField = _dispatchCondition.field;
      if (!curField || !availableFields.includes(curField)) {
        curField = availableFields[0];
        _dispatchCondition.field = curField;
      }
      fieldSelect.innerHTML = availableFields.map(f => {
        const isSel = (f === curField);
        return `<option value="${escapeHtml(f)}" ${isSel ? 'selected' : ''}>${escapeHtml(f)}</option>`;
      }).join('');
    }
  }

  // 2. 연산자 및 값 채우기
  const opSelect = document.getElementById('condOperatorSelect');
  if (opSelect) opSelect.value = _dispatchCondition.operator || 'equals';

  const valInput = document.getElementById('condValueInput');
  if (valInput) valInput.value = _dispatchCondition.value !== undefined ? _dispatchCondition.value : '';

  // 3. 블록 체크박스 렌더링 (B1, B2, B3...)
  renderCondBlockCheckboxes();

  modal.classList.remove('hidden');
}

/**
 * 조건 설정 모달 닫기
 */
function closeConditionSettingsModal() {
  const modal = document.getElementById('conditionSettingsModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * 커스텀 제외 블록 체크박스 목록 렌더링 (B1, B2, B3...)
 */
function renderCondBlockCheckboxes() {
  const container = document.getElementById('condBlockCheckboxList');
  if (!container) return;

  if (!SENSE_STATE.blocks || SENSE_STATE.blocks.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-1">캔버스에 등록된 블록이 없습니다.</p>';
    return;
  }

  container.innerHTML = SENSE_STATE.blocks.map((b, idx) => {
    const isChecked = _dispatchCondition.skipBlockIndices.includes(idx);
    const title = b.title || (b.type === 'text' ? '텍스트 본문' : '이미지 카드');
    return `
      <label class="flex items-center gap-2 p-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 cursor-pointer text-xs transition-colors">
        <input type="checkbox" class="condBlockCheck accent-amber-600 w-4 h-4 rounded cursor-pointer" data-index="${idx}" ${isChecked ? 'checked' : ''}>
        <span class="w-6 h-5 rounded bg-indigo-700 text-white font-mono font-black text-[11px] flex items-center justify-center shrink-0 shadow-2xs">B${idx + 1}</span>
        <span class="font-bold text-slate-800 shrink-0">블록:</span>
        <span class="text-slate-600 truncate">${escapeHtml(title)}</span>
      </label>
    `;
  }).join('');
}

/**
 * 모달에서 [설정 적용] 클릭 시 반영
 */
function applyConditionSettings() {
  const fieldSelect = document.getElementById('condFieldSelect');
  const opSelect = document.getElementById('condOperatorSelect');
  const valInput = document.getElementById('condValueInput');
  const checkedBoxes = document.querySelectorAll('.condBlockCheck:checked');

  const field = fieldSelect ? fieldSelect.value : '';
  const operator = opSelect ? opSelect.value : 'equals';
  const value = valInput ? valInput.value.trim() : '';
  const skipIndices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.index, 10));

  _dispatchCondition.field = field;
  _dispatchCondition.operator = operator;
  _dispatchCondition.value = value;
  _dispatchCondition.skipBlockIndices = skipIndices;
  _dispatchCondition.active = skipIndices.length > 0 && !!field;

  applyConditionToBlocks();
  renderAll();
  closeConditionSettingsModal();
  if (_dispatchCondition.active) {
    const opStr = operator === 'not_equals' ? '!=' : '==';
    const blockNames = skipIndices.map(i => `B${i + 1}`).join(', ');
    showToast(`🎯 발송 조건이 적용되었습니다: [${field}] ${opStr} '${value}' ➔ ${blockNames} 블록 패스`);
  } else {
    showToast('👥 모든 블록 전체 발송으로 설정되었습니다.');
  }
}

/**
 * 하위 호환용 블록 토글 (필요시 호출)
 */
function toggleBlockSkipIfJoined(idx) {
  const block = SENSE_STATE.blocks[idx];
  if (!block) return;
  block.skipIfJoined = !block.skipIfJoined;
  renderAll();
}

/**
 * 블록 접힘 상태일 때 표시할 한 줄 요약 텍스트 추출
 */
function getBlockSummarySnippet(block) {
  if (!block) return '';
  if (block.type === 'text') {
    const text = (block.content || '').replace(/\s+/g, ' ').trim();
    return text ? (text.length > 28 ? text.slice(0, 28) + '...' : text) : '(내용 없음)';
  } else if (block.type === 'image') {
    return `🖼️ ${block.fileName || '이미지'} (${block.fileSize || '크기 미상'})`;
  }
  return '';
}

/**
 * 특정 블록 접기/펼치기 토글
 */
function toggleBlockCollapse(idx) {
  const block = SENSE_STATE.blocks[idx];
  if (!block) return;
  block.isCollapsed = !block.isCollapsed;
  renderBlocks();
}

/**
 * 모든 블록 접기 / 펼치기 전체 토글
 */
function toggleAllBlocksCollapse() {
  const hasExpanded = SENSE_STATE.blocks.some(b => !b.isCollapsed);
  const newCollapsedState = hasExpanded; // 하나라도 펼쳐져 있으면 모두 접기, 전부 접혀있으면 모두 펼치기
  SENSE_STATE.blocks.forEach(b => {
    b.isCollapsed = newCollapsedState;
  });
  renderBlocks();
}

/**
 * 캔버스 헤더의 [모두 접기 / 모두 펼치기] 버튼 아이콘, 이모지 및 텍스트 갱신
 */
function updateToggleAllBtn() {
  const btn = document.getElementById('toggleAllBlocksBtn');
  const icon = document.getElementById('toggleAllBlocksIcon');
  const emoji = document.getElementById('toggleAllBlocksEmoji');
  const text = document.getElementById('toggleAllBlocksText');
  if (!text) return;

  const hasExpanded = SENSE_STATE.blocks.some(b => !b.isCollapsed);
  if (hasExpanded) {
    if (emoji) emoji.innerText = '🔼';
    if (icon) icon.innerText = 'unfold_less';
    text.innerText = '모두 접기';
    if (btn) btn.title = '모든 메시지 블록을 컴팩트하게 접기';
  } else {
    if (emoji) emoji.innerText = '🔽';
    if (icon) icon.innerText = 'unfold_more';
    text.innerText = '모두 펼치기';
    if (btn) btn.title = '모든 메시지 블록을 전체 내용으로 펼치기';
  }
}

/**
 * 이미지 블록 공통 파일 적용 함수
 * 지원: ① 파일 다이얼로그 선택, ② 윈도우 탐색기 파일 드래그앤드롭, ③ 클립보드 스크린샷 붙여넣기
 */
function applyImageFileToBlock(idx, file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    showLocalBlockFeedback(idx, '⚠️ 이미지 파일(PNG, JPG, GIF 등)만 등록 가능합니다', 'warn');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const dimensions = `${img.width} x ${img.height}px`;
      const timeStamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
      const fileName = file.name || `screenshot_${timeStamp}.png`;
      const fileSize = `${Math.round(file.size / 1024)}KB`;

      if (SENSE_STATE.blocks[idx]) {
        SENSE_STATE.blocks[idx].dataUrl = dataUrl;
        SENSE_STATE.blocks[idx].fileName = fileName;
        SENSE_STATE.blocks[idx].fileSize = fileSize;
        SENSE_STATE.blocks[idx].dimensions = dimensions;
        renderAll();
        // 유저 요청: 사진창 블록 주변에 이쁘게 로컬 피드백 배지 표시
        showLocalBlockFeedback(idx, `✓ 사진 등록 완료 (${dimensions})`, 'success');
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function handleImageBlockUpload(idx, event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  applyImageFileToBlock(idx, file);
}

function handleImageBlockPaste(idx, event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  const items = clipboardData.items;
  let imageFile = null;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') !== -1) {
        imageFile = items[i].getAsFile();
        break;
      }
    }
  }

  if (imageFile) {
    event.preventDefault();
    if (event.target && event.target.value !== undefined) {
      event.target.value = '';
    }
    applyImageFileToBlock(idx, imageFile);
  } else {
    const pasteInput = document.getElementById(`imagePasteInput_${idx}`);
    if (pasteInput) {
      showLocalElementFeedback(pasteInput, '⚠️ 클립보드에 사진이 없습니다 (Win+Shift+S 후 붙여넣기)', 'warn');
    } else {
      showLocalBlockFeedback(idx, '⚠️ 클립보드에 복사된 이미지가 없습니다', 'warn');
    }
  }
}

function updateEmoticonKeyword(idx, val) {
  if (SENSE_STATE.blocks[idx]) {
    SENSE_STATE.blocks[idx].keyword = val;
    renderKakaoPreview();
  }
}

function updateEmoticonMode(idx, mode) {
  if (SENSE_STATE.blocks[idx]) {
    SENSE_STATE.blocks[idx].mode = mode;
  }
}

function appendKeySequence(idx, key) {
  if (SENSE_STATE.blocks[idx] && SENSE_STATE.blocks[idx].sequence) {
    SENSE_STATE.blocks[idx].sequence.push(`[${key} 1회]`);
    renderBlocks();
  }
}

// ==========================================
// 8. Zero-DB URL 해시 템플릿 공유 (lz-string)
// ==========================================
function generateTemplateShareUrl() {
  if (typeof LZString === 'undefined') {
    showToast('❌ 압축 라이브러리가 로드되지 않았습니다.');
    return;
  }

  try {
    const payload = JSON.stringify(SENSE_STATE.blocks);
    const compressed = LZString.compressToEncodedURIComponent(payload);
    const url = `${window.location.origin}${window.location.pathname}#t=${compressed}`;

    navigator.clipboard.writeText(url).then(() => {
      showToast('🔗 [Zero-DB] 템플릿 번들 공유 URL이 복사되었습니다! 단톡방에 바로 붙여넣으세요.');
    });
  } catch (err) {
    console.error('URL 생성 실패:', err);
    showToast('❌ 템플릿 공유 URL 생성 실패');
  }
}

function initUrlHashTemplate() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('#t=')) return;

  try {
    const compressed = hash.split('#t=')[1];
    if (compressed && typeof LZString !== 'undefined') {
      const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
      if (decompressed) {
        const importedBlocks = JSON.parse(decompressed);
        if (Array.isArray(importedBlocks) && importedBlocks.length > 0) {
          SENSE_STATE.blocks = importedBlocks;
          showToast('✨ 링크를 통해 공유된 마법의 템플릿이 자동으로 로드되었습니다!');
        }
      }
    }
  } catch (err) {
    console.warn('URL 해시 템플릿 복원 실패:', err);
  }
}

// ==========================================
// 9. JIT 투명인간 UI & 과금 엔진
// ==========================================
function applyJitState() {
  const rechargeBtn = document.getElementById('headerRechargeBtn');
  if (!rechargeBtn) return;

  if (SENSE_STATE.subscriptionPlan === 'free') {
    if (SENSE_STATE.remainingQuota > 0) {
      rechargeBtn.className = 'flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-primary font-label-status text-label-status shadow-sm transition-all border border-primary/20 cursor-pointer';
      rechargeBtn.innerHTML = `
        <span class="material-symbols-outlined text-[18px] text-primary">verified</span>
        <span>⚡ 100건 무료 체험 <strong class="font-bold text-on-surface">(잔여: ${SENSE_STATE.remainingQuota}건)</strong></span>
      `;
    } else {
      // 100건 소진 시 정기구독 플랜 안내 모드로 전환
      rechargeBtn.className = 'flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-primary text-on-primary font-label-status text-label-status shadow-sm transition-all animate-bounce cursor-pointer';
      rechargeBtn.innerHTML = `
        <span class="material-symbols-outlined text-[18px]">workspace_premium</span>
        <span>👑 올인원 플랜 구독하기 (월 3,000원~)</span>
      `;
    }
  } else {
    // 구독 플랜 활성 상태
    rechargeBtn.className = 'flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-label-status text-label-status shadow-sm transition-all border border-primary/30 cursor-pointer';
    rechargeBtn.innerHTML = `
      <span class="material-symbols-outlined text-[18px] text-amber-500">workspace_premium</span>
      <span>👑 <strong>${SENSE_STATE.planName} 플랜</strong> (잔여: ${SENSE_STATE.remainingQuota.toLocaleString()} / ${SENSE_STATE.monthlyQuota.toLocaleString()}건)</span>
    `;
  }
}

function openRechargeModal(isExhausted = false) {
  const modal = document.getElementById('rechargeModal');
  if (!modal) return;

  const headerNotice = document.getElementById('modalCreditNotice');
  if (headerNotice) {
    if (isExhausted) {
      headerNotice.innerText = SENSE_STATE.subscriptionPlan === 'free'
        ? '⚡ 100건 무료 체험이 모두 소진되었습니다. 정기구독으로 제한 없이 이용하세요.'
        : `⚡ 이번 달 [${SENSE_STATE.planName} 플랜] ${SENSE_STATE.monthlyQuota.toLocaleString()}건 한도가 소진되었습니다.`;
    } else {
      headerNotice.innerText = SENSE_STATE.subscriptionPlan === 'free'
        ? `⚡ 현재 무료 체험 잔여: ${SENSE_STATE.remainingQuota}건 (신용카드 등록 없이 즉시 이용)`
        : `👑 현재 [${SENSE_STATE.planName} 플랜] 잔여: ${SENSE_STATE.remainingQuota.toLocaleString()} / ${SENSE_STATE.monthlyQuota.toLocaleString()}건`;
    }
  }

  modal.classList.remove('hidden');
}

function closeRechargeModal() {
  const modal = document.getElementById('rechargeModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * 올인원 단일 정기구독 신청 처리 (Starter 3,000 / Pro 6,000 / Business 12,000)
 */
function subscribePlan(planKey, price, quota, planName) {
  SENSE_STATE.subscriptionPlan = planKey;
  SENSE_STATE.planName = planName;
  SENSE_STATE.monthlyQuota = quota;
  SENSE_STATE.remainingQuota = quota;
  SENSE_STATE.freeCredits = quota;
  SENSE_STATE.isLoggedIn = true;

  localStorage.setItem('sensetalk_plan', planKey);
  localStorage.setItem('sensetalk_plan_name', planName);
  localStorage.setItem('sensetalk_monthly_quota', quota);
  localStorage.setItem('sensetalk_remaining_quota', quota);
  localStorage.setItem('sensetalk_free_credits', quota);
  localStorage.setItem('sensetalk_logged_in', 'true');

  closeRechargeModal();
  renderCounters();
  applyJitState();
  showToast(`🎉 [${planName} 플랜] 정기구독이 시작되었습니다! (월 ${price.toLocaleString()}원 / ${quota.toLocaleString()}건 한도)`);
}

// 하위 호환
function purchasePackage(coins, price) {
  subscribePlan('pro', 6000, 3000, '프로');
}

// ==========================================
// 10. 로컬 센스봇 (SenseBot) 연동 & 가상 딥링크
// ==========================================
let _lastBotEventTimestamp = 0;
let _botSyncDebounceTimer = null;
let _suppressBotDoneSyncUntil = 0;

function checkSenseBotHealth(isManualCheck = false) {
  fetch(`${SENSE_STATE.botUrl}/health`, { method: 'GET', mode: 'cors' })
    .then(res => res.json())
    .then(data => {
      if (data && data.status === 'ok') {
        SENSE_STATE.botStatus = 'connected';
        if (data.version) {
          SENSE_STATE.connectedEngineVersion = String(data.version);
        }
        if (typeof data.today_sent === 'number') {
          syncCreditsFromStats(data.today_sent);
        }
        updateBotIndicator(true);
        syncStateToBot();
        if (isManualCheck) {
          const verStr = SENSE_STATE.connectedEngineVersion ? ` v${SENSE_STATE.connectedEngineVersion}` : '';
          showToast(`✅ 센스봇 PC 엔진${verStr}이 성공적으로 연결되었습니다!`);
          closeBotGuideModal();
        }
      } else {
        SENSE_STATE.botStatus = 'disconnected';
        updateBotIndicator(false);
        if (isManualCheck) {
          showToast('⚠️ 엔진이 아직 켜지지 않았습니다. 센스톡_실행.bat을 실행 후 다시 눌러주세요.');
        }
      }
    })
    .catch(() => {
      SENSE_STATE.botStatus = 'disconnected';
      updateBotIndicator(false);
      if (isManualCheck) {
        showToast('⚠️ 엔진이 아직 켜지지 않았습니다. 센스톡_실행.bat을 실행 후 다시 눌러주세요.');
      }
    });
}

function updateBotIndicator(isConnected, isRunning = false, waitingEnter = false) {
  const dockBadge = document.getElementById('dockBotStatusBadge');
  const dockDot = document.getElementById('dockBotStatusDot');
  const dockText = document.getElementById('dockBotStatusText');
  const upgradeBtn = document.getElementById('dockEngineUpgradeBtn');
  const headerContainer = document.getElementById('headerEngineStatusContainer');

  const curVer = SENSE_STATE.connectedEngineVersion;
  const isOutdated = isConnected && curVer && compareVersions(curVer, LATEST_ENGINE_VERSION) < 0;

  // 1. 하단 도크 카톡 버튼 우측의 엔진 연결 상태 뱃지 (녹색불 / 빨간불)
  if (dockBadge) {
    if (isConnected) {
      dockBadge.className = 'py-2.5 px-2.5 sm:px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 font-bold text-xs transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer border border-emerald-500/20 shrink-0';
      if (dockDot) dockDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]';
      if (dockText) {
        dockText.innerText = curVer ? `엔진 연결됨 v${curVer}` : '엔진 연결됨';
      }
      dockBadge.title = `엔진 연결됨 (v${curVer || LATEST_ENGINE_VERSION}, 포트 28888)`;
    } else {
      dockBadge.className = 'py-2.5 px-2.5 sm:px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 font-bold text-xs transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer border border-rose-500/20 shrink-0';
      if (dockDot) dockDot.className = 'w-2 h-2 rounded-full bg-rose-500';
      if (dockText) dockText.innerText = '엔진 미연결';
      dockBadge.title = `엔진 미연결 (클릭 시 v${LATEST_ENGINE_VERSION} 실행 가이드)`;
    }
  }

  // 2. 하단 도크 업그레이드 알림 버튼 (구버전 감지 시 Antigravity 스타일 알림 표시)
  if (upgradeBtn) {
    if (isOutdated) {
      upgradeBtn.classList.remove('hidden');
      upgradeBtn.innerHTML = `
        <span class="material-symbols-outlined text-[14px]">upgrade</span>
        <span class="whitespace-nowrap">v${LATEST_ENGINE_VERSION} 업데이트</span>
      `;
      upgradeBtn.title = `현재 실행 버전: v${curVer} ➔ 최신 v${LATEST_ENGINE_VERSION} 업데이트 가능! 클릭하여 다운로드`;
    } else {
      upgradeBtn.classList.add('hidden');
    }
  }

  // 3. PWA 상단 헤더 알림 영역 (유저 요청: 하단 도크로 일원화하고 상단은 제거)
  if (headerContainer) {
    headerContainer.innerHTML = '';
  }

  // 모달 내부 상태 배지 실시간 동기화
  const modalBadge = document.getElementById('modalBotStatusBadge');
  if (modalBadge) {
    if (isConnected) {
      modalBadge.innerText = `✅ 연결 완료 (v${curVer || LATEST_ENGINE_VERSION} 준비됨)`;
      modalBadge.className = 'font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[11px]';
    } else {
      modalBadge.innerText = '⚠️ 미연결 (실행 필요)';
      modalBadge.className = 'font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 text-[11px]';
    }
  }

  // 4. 하단 도크 메인 발송 버튼: 발송 시작 시 일시정지 전환 / 명단 완료 시 흑백 비활성화
  updateMainDispatchBtnState(isRunning);
}

/**
 * 하단 도크 메인 발송 버튼 상태 통합 제어
 * - 봇 실행 중: 일시정지 버튼 (빨간 톤)
 * - 명단 대기 0명 (전부 완료): 흑백 비활성화 버튼 (글자는 선명하게 보이도록)
 * - 대기 명단 존재: 채널별 고유 브랜드 컬러 활성화 버튼
 */
function updateMainDispatchBtnState(overrideRunning) {
  const mainBtn = document.getElementById('mainDispatchBtn');
  const mainTitleEl = document.getElementById('mainDispatchBtnTitle');
  const badgeEl = document.getElementById('mainDispatchBadge');
  const iconWrapper = document.getElementById('mainDispatchIconWrapper');
  const helpTextEl = document.getElementById('dispatchHelpText');

  if (!mainBtn) return;

  const total = SENSE_STATE.recipients ? SENSE_STATE.recipients.length : 0;
  const doneCount = total > 0 ? SENSE_STATE.recipients.filter(r => r.status === 'done').length : 0;
  const skippedCount = total > 0 ? SENSE_STATE.recipients.filter(r => r.status === 'skipped').length : 0;
  const pendingCount = total > 0 ? SENSE_STATE.recipients.filter(r => r.status === 'pending').length : 0;
  const isAllDone = total > 0 && doneCount === total;
  const isAllProcessed = total > 0 && pendingCount === 0;
  const isRunning = overrideRunning !== undefined ? !!overrideRunning : !!SENSE_STATE.botRunning;
  const channel = SENSE_STATE.activeChannel || 'kakao';

  // 1. 발송 진행 중: 일시정지 토글 버튼 (붉은 계열)
  if (isRunning) {
    mainBtn.disabled = false;
    mainBtn.title = '발송 일시정지 (F9 키 또는 클릭)';
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-rose-100 hover:bg-rose-200 active:scale-[0.99] text-rose-800 font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-rose-300';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<span class="material-symbols-outlined text-[18px]">pause_circle</span>';
    }
    const chLabels = {
      kakao: '카카오톡',
      line: '라인(LINE)',
      telegram: '텔레그램',
      whatsapp: '왓츠앱',
      wechat: '위챗'
    };
    const chName = chLabels[channel] || '메신저';
    if (mainTitleEl) {
      mainTitleEl.innerText = `${chName} 발송 일시정지`;
    }
    if (badgeEl) {
      badgeEl.innerText = '[클릭 또는 F9]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-rose-200 text-rose-900 font-mono font-bold animate-pulse';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = `${chName} 대화창에서 <strong>[Enter]</strong>를 누르면 자동 전진합니다. 멈추려면 버튼 또는 <strong>[F9]</strong>를 누르세요.`;
    }
    return;
  }

  // 2. 일반 발송 준비/대기 상태
  mainBtn.disabled = false;
  mainBtn.title = isAllDone ? '모든 명단 발송 완료됨 (상단 초기화 버튼으로 재발송 가능)' : '';

  if (channel === 'kakao') {
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-[#fee500] hover:brightness-95 active:scale-[0.99] text-[#191919] font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-amber-400/30';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 3c-5.52 0-10 3.58-10 8 0 2.83 1.83 5.32 4.62 6.72-.2.74-.75 2.76-.86 3.19-.14.54.2.53.42.38.17-.11 2.37-1.63 3.33-2.3.81.12 1.63.19 2.49.19 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg>';
    }
    if (mainTitleEl) {
      mainTitleEl.innerText = '카카오톡 연속 발송 시작';
    }
    if (badgeEl) {
      badgeEl.innerText = '[Enter키]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-black/10 text-slate-800 font-mono font-bold';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = '발송 시작 후 카카오톡 대화창에서 <strong>[Enter]</strong>만 치면 자동으로 다음 사람이 장전됩니다. (마우스 0회)';
    }

  } else if (channel === 'line') {
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-[#06c755] hover:brightness-105 active:scale-[0.99] text-white font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-emerald-500/30';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19.365 9.864c0-4.043-4.195-7.324-9.365-7.324S.635 5.821.635 9.864c0 3.619 3.22 6.643 7.575 7.186.295.064.697.194.798.445.092.227.06.582.03.811l-.13.784c-.04.24-.185.941.823.513 1.008-.427 5.438-3.203 7.42-5.483 1.493-1.688 2.214-3.414 2.214-4.256z"/></svg>';
    }
    if (mainTitleEl) {
      mainTitleEl.innerText = '라인(LINE) 발송 시작';
    }
    if (badgeEl) {
      badgeEl.innerText = '[Enter키]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = '라인 발송 시작 시 맞춤 메시지가 라인 작성창에 <strong>자동으로 채워진 채로 호출</strong>됩니다. 대화창에서 <strong>[Enter]만 누르면 발송</strong>됩니다. (Ctrl+V 누를 필요 없음!)';
    }

  } else if (channel === 'telegram') {
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-[#229ed9] hover:brightness-105 active:scale-[0.99] text-white font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-sky-400/30';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>';
    }
    if (mainTitleEl) {
      mainTitleEl.innerText = '텔레그램 연속 발송 시작';
    }
    if (badgeEl) {
      badgeEl.innerText = '[Enter키]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = '발송 시작 후 텔레그램 대화창에서 <strong>[Enter]</strong>만 누르면 자동으로 다음 대화방이 장전됩니다. (마우스 0회)';
    }

  } else if (channel === 'whatsapp') {
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-[#25d366] hover:brightness-105 active:scale-[0.99] text-white font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-emerald-500/30';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.699c.971.53 1.769.814 2.796.815 3.183 0 5.769-2.587 5.77-5.766.001-3.18-2.585-5.766-5.77-5.766zm3.374 8.163c-.14.394-.805.748-1.127.79-.322.042-.71.06-2.033-.49-1.597-.665-2.613-2.298-2.693-2.404-.08-.106-.64-.852-.64-1.624 0-.772.404-1.152.548-1.304.144-.152.314-.19.418-.19.105 0 .21.001.302.006.098.005.228-.037.356.27.13.31.442 1.077.481 1.156.04.079.066.171.013.276-.053.106-.079.171-.157.263-.079.092-.165.205-.236.276-.079.079-.161.165-.069.323.092.158.409.675.877 1.092.602.536 1.109.702 1.267.781.158.079.25.066.342-.04.092-.105.394-.46.5-.618.105-.158.21-.132.355-.079.145.053.919.434 1.077.513.158.079.263.118.302.184.04.066.04.382-.1.776zM12 2C6.477 2 2 6.477 2 12c0 1.891.524 3.66 1.434 5.176L2 22l4.966-1.302A9.956 9.956 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>';
    }
    if (mainTitleEl) {
      mainTitleEl.innerText = '왓츠앱 연속 발송 시작';
    }
    if (badgeEl) {
      badgeEl.innerText = '[Enter키]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = '발송 시작 후 왓츠앱 대화창에서 <strong>[Enter]</strong>만 누르면 자동으로 다음 대화방이 장전됩니다. (마우스 0회)';
    }

  } else if (channel === 'wechat') {
    mainBtn.className = 'flex-1 py-2.5 px-3 rounded-xl bg-[#07c160] hover:brightness-105 active:scale-[0.99] text-white font-headline-sm text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer group border border-green-500/30';
    if (iconWrapper) {
      iconWrapper.innerHTML = '<span class="material-symbols-outlined text-[18px]">verified_user</span>';
    }
    if (mainTitleEl) {
      mainTitleEl.innerText = '위챗(WeChat) 안전 복사 발송';
    }
    if (badgeEl) {
      badgeEl.innerText = '[🛡️ 계정보호 안전모드]';
      badgeEl.className = 'text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white font-mono font-bold';
    }
    if (helpTextEl) {
      helpTextEl.innerHTML = '🛡️ <strong>텐센트 보안 정책(계정 동결 방지) 안전 모드</strong>: 키보드 강제 주입을 배제하고 클립보드에 안전 복사됩니다. 위챗 대화창에서 <strong>[Ctrl+V]</strong> 후 <strong>[Enter]</strong>로 안전하게 전송하세요. (150건/일 한도)';
    }
  }
}

/**
 * 센스톡 PC 가속 엔진 무설치 실행 패키지(.zip) 다운로드 트리거
 * (추후 Supabase Storage URL 또는 CDN 연동 지원)
 */
function downloadSenseBotPackage() {
  const targetUrl = window.SUPABASE_BOT_ZIP_URL || `./${ENGINE_ZIP_FILENAME}`;
  const a = document.createElement('a');
  a.href = targetUrl;
  a.download = ENGINE_ZIP_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(`📥 [엔진 다운로드] ${ENGINE_ZIP_FILENAME} 다운로드를 시작했습니다. 편한 폴더(바탕화면 등)에 압축을 풀어주세요!`);
}

/**
 * PWA 화면의 명단 및 블록 상태를 센스봇 로컬 데몬 큐에 동기화
 */
function syncStateToBot(isReset = false) {
  clearTimeout(_botSyncDebounceTimer);
  if (isReset) {
    _suppressBotDoneSyncUntil = Date.now() + 3000;
    _lastBotEventTimestamp = Date.now() / 1000;
  }
  const delay = isReset ? 0 : 250;

  _botSyncDebounceTimer = setTimeout(() => {
    if (SENSE_STATE.botStatus !== 'connected') return;

    const payloadRecipients = SENSE_STATE.recipients.map(r => ({
      ...r,
      status: isReset ? 'pending' : r.status,
      message: getFullMessageForRecipient(r)
    }));

    fetch(`${SENSE_STATE.botUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: payloadRecipients,
        blocks: SENSE_STATE.blocks,
        currentIndex: SENSE_STATE.currentIndex,
        mode: SENSE_STATE.botMode || 'classic',
        channel: SENSE_STATE.activeChannel || 'kakao',
        is_reset: isReset,
        condition: _dispatchCondition
      })
    })
      .then(res => res.json())
      .then(() => {
        if (isReset) {
          setTimeout(() => { _suppressBotDoneSyncUntil = 0; }, 600);
        }
      })
      .catch(() => {});
  }, delay);
}

/**
 * 백그라운드에서 센스봇 데몬 상태 및 엔터 발송 이벤트 폴링
 */
function initBotPolling() {
  setInterval(() => {
    fetch(`${SENSE_STATE.botUrl}/poll`, { method: 'GET' })
      .then(res => res.json())
      .then(data => {
        const wasDisconnected = SENSE_STATE.botStatus !== 'connected';
        SENSE_STATE.botStatus = 'connected';
        if (data.version) {
          SENSE_STATE.connectedEngineVersion = String(data.version);
        }
        SENSE_STATE.botRunning = !!data.bot_running;
        SENSE_STATE.waitingEnter = !!data.waiting_enter;

        if (typeof data.today_sent === 'number') {
          syncCreditsFromStats(data.today_sent);
        }

        if (wasDisconnected) {
          syncStateToBot();
        }
        updateBotIndicator(true, data.bot_running, data.waiting_enter);

        const isResetSuppressed = _suppressBotDoneSyncUntil && Date.now() < _suppressBotDoneSyncUntil;

        // 1. 수신자 완료 상태 실시간 동기화 (초기화 억제 기간이 아닐 때만 봇에서 완료된 대상 즉시 UI 반영)
        if (!isResetSuppressed && Array.isArray(data.recipients) && Array.isArray(SENSE_STATE.recipients) && data.recipients.length === SENSE_STATE.recipients.length) {
          let statusUpdated = false;
          data.recipients.forEach((dr, i) => {
            if (SENSE_STATE.recipients[i]) {
              const prevStatus = SENSE_STATE.recipients[i].status;
              if (dr.status === 'done' && prevStatus !== 'done') {
                SENSE_STATE.recipients[i].status = 'done';
                if (SENSE_STATE.recipients[i]._crm_queue_id) {
                  markCrmQueueAsSent(SENSE_STATE.recipients[i]._crm_queue_id);
                }
                delete SENSE_STATE.recipients[i].message;
                delete SENSE_STATE.recipients[i].msg;
                statusUpdated = true;
                handleCreditDeduction();
              }
            }
          });
          if (statusUpdated) {
            renderRecipients();
            renderKakaoPreview();
            renderCounters();
            updateSaveRecipientsBtn();
          }
        }

        // 2. 봇 이벤트 처리 (엔터 대기 안내, 다음 대상 안내, 전송 완료 등)
        if (data.last_event && data.last_event.timestamp > _lastBotEventTimestamp) {
          _lastBotEventTimestamp = data.last_event.timestamp;

          if (typeof data.currentIndex === 'number') {
            SENSE_STATE.currentIndex = data.currentIndex;
          }

          renderRecipients();
          renderKakaoPreview();
          renderCounters();

          if (data.last_event.type === 'loaded_waiting_enter') {
            dismissDispatchAlert();
            // 카톡/텔레그램 대화방 장전 완료: 유저가 엔터를 칠 때까지 토스트가 사라지지 않고 계속 유지 (duration=0)
            const currentBlock = (typeof data.last_event.blockIndex === 'number') ? data.last_event.blockIndex + 1 : 1;
            const totalBlocks = data.last_event.totalBlocks || 1;
            const blockType = data.last_event.blockType === 'image' ? '사진(이미지)' : '텍스트';

            if (totalBlocks > 1) {
              showToast(`👉 <strong class="text-amber-300 tracking-wider font-extrabold">STANDBY!</strong> [${currentBlock}/${totalBlocks} ${blockType}] 내용을 확인하고 <kbd class="px-1.5 py-0.5 rounded bg-white/20 font-mono text-[11px] font-bold">[Enter]</kbd>를 치세요`, 0);
            } else {
              showToast(`👉 <strong class="text-amber-300 tracking-wider font-extrabold">STANDBY!</strong> 전달 내용을 확인하고 <kbd class="px-1.5 py-0.5 rounded bg-white/20 font-mono text-[11px] font-bold">[Enter]</kbd>를 치세요`, 0);
            }
          } else if (data.last_event.type === 'sent_and_advancing') {
            const evName = data.last_event.name;
            const evId = data.last_event.id;
            if (Array.isArray(SENSE_STATE.recipients)) {
              const matched = SENSE_STATE.recipients.find(r => (evId && r.id === evId) || (evName && r.name === evName));
              if (matched && matched.status !== 'done') {
                matched.status = 'done';
                if (matched._crm_queue_id) {
                  markCrmQueueAsSent(matched._crm_queue_id);
                }
                handleCreditDeduction();
                renderRecipients();
                renderCounters();
                updateSaveRecipientsBtn();
              }
            }
            // 엔터 타건 후 전송 완료 시 가볍게 피드백 후 다음 대상 대기 토스트로 자연스럽게 전환
            showToast(`✅ <strong>"${escapeHtml(evName || '')}"</strong> 전송 완료! 다음 대상 자동 준비 중...`, 1200);
          } else if (data.last_event.type === 'all_completed') {
            hideToast();
            dismissDispatchAlert();
            if (!isResetSuppressed) {
              // 모든 수신자 발송 완료 확정: 대기 상태 남아있는 대상만 완료 처리 (패스된 대상 보존)
              if (Array.isArray(SENSE_STATE.recipients)) {
                SENSE_STATE.recipients.forEach(r => {
                  if (r.status === 'pending') {
                    r.status = 'done';
                    handleCreditDeduction();
                  }
                });
              }
              renderRecipients();
              renderKakaoPreview();
              renderCounters();
              updateSaveRecipientsBtn();
              showToast(`🎉 모든 명단에 발송을 성공적으로 마쳤습니다!`, 2500);
              SENSE_STATE.botRunning = false;
              updateBotIndicator(true, false, false);
            }
          } else if (data.last_event.type === 'reset') {
            _suppressBotDoneSyncUntil = 0;
            SENSE_STATE.botRunning = false;
            updateBotIndicator(true, false, false);
            hideToast();
            dismissDispatchAlert();
          } else if (data.last_event.type === 'paused') {
            hideToast();
            const msg = data.last_event.message || '발송이 일시정지되었습니다.';
            if (data.last_event.reason === 'not_found' || msg.includes('찾지 못했습니다')) {
              showDispatchAlert(msg, data.last_event.name);
            } else {
              showToast(`⏸️ [일시정지] ${escapeHtml(msg)}`, 2000);
            }
          }
        }
      })
      .catch(() => {
        if (SENSE_STATE.botStatus === 'connected') {
          SENSE_STATE.botStatus = 'disconnected';
          SENSE_STATE.botRunning = false;
          hideToast();
          updateBotIndicator(false);
        }
      });
  }, 350);
}

/**
 * 센스톡 엔터 1회 연속 발송 가속 모드 시작
 */
function startSenseBotEnterLoop() {
  if (SENSE_STATE.botStatus !== 'connected') {
    showToast('⚠️ 가속 엔진이 실행되어 있지 않습니다. d:\\SensTalk\\센스톡_실행.bat 을 실행해주세요.');
    return;
  }

  // 만약 모든 수신자의 처리가 완료된 상태라면(대기 0명), 재발송 확인 시 대기 초기화 후 자동 시작
  if (SENSE_STATE.recipients && SENSE_STATE.recipients.length > 0 && !SENSE_STATE.recipients.some(r => r.status === 'pending')) {
    if (confirm('모든 명단의 처리(발송/패스)가 완료된 상태입니다.\n\n명단 상태를 "대기"로 초기화하고 처음부터 다시 연속 발송하시겠습니까?')) {
      handleResetAllStatus(true);
      setTimeout(() => {
        startSenseBotEnterLoop();
      }, 350);
    }
    return;
  }

  // 1. 최신 명단(조합 메시지 포함) 및 블록을 봇에 즉시 동기화
  const payloadRecipients = SENSE_STATE.recipients.map(r => ({
    ...r,
    message: getFullMessageForRecipient(r)
  }));

  const activeCh = SENSE_STATE.activeChannel || 'kakao';

  fetch(`${SENSE_STATE.botUrl}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipients: payloadRecipients,
      blocks: SENSE_STATE.blocks,
      currentIndex: SENSE_STATE.currentIndex,
      mode: SENSE_STATE.botMode || 'classic',
      channel: activeCh
    })
  })
    .then(() => {
      // 2. 동기화 완료 후 봇 연속 발송 루프 시작
      return fetch(`${SENSE_STATE.botUrl}/start`, { method: 'POST' });
    })
    .then(res => res.json())
    .then(() => {
      SENSE_STATE.botRunning = true;
      updateBotIndicator(true, true, true);
      const chLabels = {
        kakao: '카카오톡',
        line: '라인(LINE)',
        telegram: '텔레그램',
        whatsapp: '왓츠앱',
        wechat: '위챗'
      };
      const chName = chLabels[activeCh] || '메신저';
      showToast(`🚀 [가속 발송 가동] ${chName} 화면을 보며 [Enter]만 치시면 연속 자동 발송됩니다!`);
    })
    .catch((err) => {
      console.error('Bot start error:', err);
      showToast('⚠️ 가속 엔진 통신 실패');
    });
}

/**
 * 연속 발송 일시정지
 */
function pauseSenseBot() {
  if (SENSE_STATE.botStatus !== 'connected') return;

  fetch(`${SENSE_STATE.botUrl}/pause`, { method: 'POST' })
    .then(res => res.json())
    .then(() => {
      SENSE_STATE.botRunning = false;
      updateBotIndicator(true, false, false);
      hideToast();
      showToast('⏸️ [일시정지] 발송이 일시정지되었습니다.', 2000);
    })
    .catch(() => {});
}

/**
 * 상시 노출 알림 배너 (상대방 미발견 등)
 */
function showDispatchAlert(msg, targetName) {
  hideToast();
  const banner = document.getElementById('dispatchAlertBanner');
  const msgEl = document.getElementById('dispatchAlertMsg');
  const subEl = document.getElementById('dispatchAlertSubMsg');
  const skipBtn = document.getElementById('skipNextBtn');

  if (msgEl) msgEl.innerText = msg;
  if (subEl) {
    subEl.innerText = targetName 
      ? `'${targetName}' 님의 대화방이 없거나 검색되지 않았습니다. 아래 [패스] 버튼을 누르면 다음 분으로 넘어갑니다.` 
      : '대화방이 없거나 검색되지 않았습니다. 아래 [패스] 버튼을 누르면 다음 분으로 넘어갑니다.';
  }
  if (banner) banner.classList.remove('hidden');

  if (skipBtn) {
    skipBtn.className = 'py-2.5 px-2.5 sm:px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all border border-indigo-500 shrink-0 shadow-sm animate-pulse ring-2 ring-indigo-300';
  }
}

/**
 * 알림 배너 닫기
 */
function dismissDispatchAlert() {
  const banner = document.getElementById('dispatchAlertBanner');
  if (banner) banner.classList.add('hidden');
  const skipBtn = document.getElementById('skipNextBtn');
  if (skipBtn) {
    skipBtn.className = 'py-2.5 px-2.5 sm:px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all border border-slate-300 shrink-0 shadow-2xs';
  }
}

/**
 * 현재 대상 패스(건너뛰기) 후 다음 대기자로 즉시 이동 및 발송 진행
 */
function handleSkipAndProceed(autoStart = true) {
  hideToast();
  dismissDispatchAlert();

  if (!SENSE_STATE.recipients || SENSE_STATE.recipients.length === 0) return;

  const curRec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
  const skippedName = curRec ? curRec.name : '';
  if (curRec && curRec.status !== 'done') {
    curRec.status = 'skipped';
  }

  // 다음 대기자(pending) 탐색
  let nextIdx = -1;
  for (let i = SENSE_STATE.currentIndex + 1; i < SENSE_STATE.recipients.length; i++) {
    if (SENSE_STATE.recipients[i].status === 'pending') {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1) {
    for (let i = 0; i < SENSE_STATE.currentIndex; i++) {
      if (SENSE_STATE.recipients[i].status === 'pending') {
        nextIdx = i;
        break;
      }
    }
  }

  if (nextIdx !== -1) {
    SENSE_STATE.currentIndex = nextIdx;
  }

  renderRecipients();
  renderKakaoPreview();
  renderCounters();
  updateMainDispatchBtnState();

  const nextRec = nextIdx !== -1 ? SENSE_STATE.recipients[nextIdx] : null;

  // 1. 센스봇 가속 엔진 연결 상태인 경우
  if (SENSE_STATE.botStatus === 'connected' && autoStart) {
    if (nextRec) {
      showToast(`⏩ "${skippedName}" 님 패스 완료! 다음 대상 "${nextRec.name}" 님 발송을 진행합니다.`, 1800);
      fetch(`${SENSE_STATE.botUrl}/skip`, { method: 'POST' })
        .then(res => res.json())
        .then(() => {
          SENSE_STATE.botRunning = true;
          updateBotIndicator(true, true, true);
        })
        .catch(() => {
          startSenseBotEnterLoop();
        });
    } else {
      showToast(`🎉 모든 대상 처리가 완료되었습니다!`, 2500);
      pauseSenseBot();
    }
  } else {
    // 2. 브라우저 단독 모드
    if (nextRec) {
      showToast(`⏩ "${skippedName}" 님 패스! 다음 대상 "${nextRec.name}" 님이 선택되었습니다.`, 1800);
    } else {
      showToast(`🎉 모든 대상 처리가 완료되었습니다!`, 2500);
    }
  }
}

/**
 * 발송 채널 전환 (디폴트: 'kakao')
 * channel: 'kakao' | 'line' | 'telegram' | 'whatsapp' | 'wechat'
 */
function switchDispatchChannel(channel) {
  SENSE_STATE.activeChannel = channel;

  const kakaoTab = document.getElementById('channelTab_kakao');
  const lineTab = document.getElementById('channelTab_line');
  const telegramTab = document.getElementById('channelTab_telegram');
  const whatsappTab = document.getElementById('channelTab_whatsapp');
  const wechatTab = document.getElementById('channelTab_wechat');

  const mainBtn = document.getElementById('mainDispatchBtn');
  const iconWrapper = document.getElementById('mainDispatchIconWrapper');
  const titleEl = document.getElementById('mainDispatchBtnTitle');
  const badgeEl = document.getElementById('mainDispatchBadge');
  const helpTextEl = document.getElementById('dispatchHelpText');

  const unselectedTabClass = 'py-1 px-1 rounded-lg font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap';

  if (kakaoTab) kakaoTab.className = unselectedTabClass;
  if (lineTab) lineTab.className = unselectedTabClass;
  if (telegramTab) telegramTab.className = unselectedTabClass;
  if (whatsappTab) whatsappTab.className = unselectedTabClass;
  if (wechatTab) wechatTab.className = unselectedTabClass;

  if (channel === 'kakao' && kakaoTab) {
    kakaoTab.className = 'py-1 px-1 rounded-lg font-bold text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer bg-[#fee500] text-[#191919] shadow-2xs whitespace-nowrap';
  } else if (channel === 'line' && lineTab) {
    lineTab.className = 'py-1 px-1 rounded-lg font-bold text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer bg-[#06c755] text-white shadow-2xs whitespace-nowrap';
  } else if (channel === 'telegram' && telegramTab) {
    telegramTab.className = 'py-1 px-1 rounded-lg font-bold text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer bg-[#229ed9] text-white shadow-2xs whitespace-nowrap';
  } else if (channel === 'whatsapp' && whatsappTab) {
    whatsappTab.className = 'py-1 px-1 rounded-lg font-bold text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer bg-[#25d366] text-white shadow-2xs whitespace-nowrap';
  } else if (channel === 'wechat' && wechatTab) {
    wechatTab.className = 'py-1 px-1 rounded-lg font-bold text-[10px] sm:text-[11px] xl:text-xs flex items-center justify-center gap-1 transition-all cursor-pointer bg-[#07c160] text-white shadow-2xs whitespace-nowrap';
  }

  // 메인 발송 버튼 및 도움말 상태 갱신 (명단 완료 시 흑백 비활성화 유지)
  updateMainDispatchBtnState();

  // 안티밴 일일 안전 캡 동적 갱신
  const capInfo = CHANNEL_ANTIBAN_CAPS[channel] || CHANNEL_ANTIBAN_CAPS.kakao;
  const guardBadge = document.getElementById('antiBanGuardBadge');
  if (guardBadge) guardBadge.innerText = capInfo.label;
  const guardDesc = document.getElementById('antiBanGuardDesc');
  if (guardDesc) guardDesc.innerText = capInfo.desc;

  // 발송 채널 테마에 맞게 대시보드 미리보기 카드 및 스마트폰 팝업 재렌더링
  renderKakaoPreview();

  // 센스봇 가속 엔진에 활성 채널 즉시 동기화
  if (SENSE_STATE.botStatus === 'connected') {
    fetch(`${SENSE_STATE.botUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channel })
    }).catch(() => {});
  }
}

/**
 * 통합 메인 발송 액션 버튼 클릭 핸들러
 * - 스마트 조건부 발송 바(_dispatchCondition) 활성화 상태에 따라 지정 블록 자동 패스 발송
 */
function handleUnifiedDispatchClick() {
  const mainBtn = document.getElementById('mainDispatchBtn');
  if (mainBtn && mainBtn.disabled) return;

  const total = SENSE_STATE.recipients ? SENSE_STATE.recipients.length : 0;
  if (total === 0) {
    showToast('⚠️ 발송할 수신자 명단이 없습니다. 먼저 명단을 등록하거나 불러오세요.');
    return;
  }

  const pendingCount = SENSE_STATE.recipients.filter(r => r.status === 'pending').length;
  if (pendingCount === 0) {
    if (confirm('모든 명단의 처리(발송/패스)가 완료된 상태입니다.\n\n명단 상태를 "대기"로 초기화하고 처음부터 다시 연속 발송하시겠습니까?')) {
      handleResetAllStatus(true);
      setTimeout(() => {
        handleUnifiedDispatchClick();
      }, 350);
    }
    return;
  }
  const channel = SENSE_STATE.activeChannel || 'kakao';

  // 1. 센스봇 가속 엔진 연결 상태: 전 채널(카톡·라인·텔레그램·왓츠앱·위챗) 순차 엔터 가속 루프 실행
  if (SENSE_STATE.botStatus === 'connected') {
    if (SENSE_STATE.botRunning) {
      pauseSenseBot();
    } else {
      startSenseBotEnterLoop();
    }
    return;
  }

  // 2. 엔진 미연결 상태: 브라우저 단독 웹 폴백
  if (channel === 'kakao') {
    openBotGuideModal();
    showToast('⚠️ 카카오톡 연속 발송을 위해선 센스봇 PC 엔진(센스톡_실행.bat) 실행이 필요합니다.');
    return;
  } else if (channel === 'line') {
    const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
    if (!rec) return;
    const msg = getFullMessageForRecipient(rec);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    window.open('https://line.me/R/msg/text/?' + encodeURIComponent(msg));
    showToast(`🟢 [라인(LINE)] "${rec.name}" 님 메시지가 자동 채워졌습니다! 라인 대화창에서 [Enter]를 누르세요.`);
    copyMessageAndAdvance();

  } else if (channel === 'telegram') {
    const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
    if (!rec) return;
    const msg = getFullMessageForRecipient(rec);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }

    const rawPhone = getRecipientPhone(rec);
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    let intlPhone = cleanPhone;
    if (intlPhone.startsWith('0')) {
      intlPhone = '82' + intlPhone.slice(1);
    }

    const tgUser = (rec.telegram || rec.telegram_id || rec.username || rec['텔레그램'] || '').toString().replace(/^@/, '').trim();

    let tgUrl = '';
    if (tgUser) {
      tgUrl = `tg://resolve?domain=${encodeURIComponent(tgUser)}`;
    } else if (intlPhone) {
      tgUrl = `tg://resolve?phone=${intlPhone}`;
    } else {
      tgUrl = `tg://msg_url?url=&text=${encodeURIComponent(msg)}`;
    }

    window.open(tgUrl);
    showToast(`✈️ [텔레그램] "${rec.name}" 님 맞춤 메시지가 클립보드에 복사되었습니다! 대화창에서 [Ctrl+V] 후 [Enter]를 누르세요.`);
    copyMessageAndAdvance();

  } else if (channel === 'whatsapp') {
    const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
    if (!rec) return;
    const rawPhone = getRecipientPhone(rec);
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    let intlPhone = cleanPhone;
    if (intlPhone.startsWith('0')) {
      intlPhone = '82' + intlPhone.slice(1);
    }
    const msg = getFullMessageForRecipient(rec);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`);
    showToast(`💬 [왓츠앱] "${rec.name}" (${intlPhone || '번호 없음'}) 대화창이 호출되었습니다.`);
    copyMessageAndAdvance();

  } else if (channel === 'wechat') {
    const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
    if (!rec) return;
    const msg = getFullMessageForRecipient(rec);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    showToast(`🛡️ [위챗 계정보호] "${rec.name}" 님 맞춤 메시지가 안전 복사되었습니다! 위챗 창에서 [Ctrl+V] 후 [Enter]로 전송하세요.`);
    copyMessageAndAdvance();
  }
}

/**
 * 가속 엔진 미연결 시 수동으로 1회 클립보드 복사 후 전진
 */
function dispatchManualFallback() {
  const rec = SENSE_STATE.recipients[SENSE_STATE.currentIndex];
  if (!rec) return;

  copyMessageAndAdvance();
  showToast(`📋 [수동 복사] "${rec.name}" 메시지가 복사되었습니다! 카톡 창에서 [Ctrl+V] 후 [Enter]를 누르세요.`);
}

/**
 * 하위 호환용 카카오 발송 핸들러
 */
function handleKakaoDispatchClick() {
  handleUnifiedDispatchClick();
}

/**
 * 센스봇에 현재 대상 1회 단독 발송 신호 전송
 */
function dispatchSenseBotCurrent() {
  if (SENSE_STATE.botRunning) {
    pauseSenseBot();
  } else {
    startSenseBotEnterLoop();
  }
}


/**
 * 안전 방어선 모드 - 사이렌 경고음 및 화면 붉은 점멸
 */
function triggerSirenAlarm(msg) {
  showToast(`🚨 [긴급 비상 방어선]: ${msg}`);

  // 화면 붉은 점멸
  document.body.classList.add('animate-pulse', 'bg-red-500/20');

  // Web Audio API 사이렌 비프음 생성
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    console.warn('Audio play error:', e);
  }

  setTimeout(() => {
    document.body.classList.remove('animate-pulse', 'bg-red-500/20');
  }, 2000);
}

// ==========================================
// 11. 토스트 알림 및 로컬 컨텍스트 피드백 컨트롤
// ==========================================

/**
 * 특정 블록 전용 로컬 플로팅 피드백 배지 (유저 요청: 사진창 블럭 주변에 이쁘게 노출)
 */
function showLocalBlockFeedback(blockIdx, message, type = 'success') {
  const host = document.getElementById(`imageBlockFeedback_${blockIdx}`) ||
               document.getElementById(`imageBlockDropZone_${blockIdx}`);
  if (!host) return;

  // 기존 배지 정리
  const existing = document.getElementById(`localFeedbackBadge_${blockIdx}`);
  if (existing) existing.remove();

  const isSuccess = type === 'success';
  const badge = document.createElement('div');
  badge.id = `localFeedbackBadge_${blockIdx}`;
  badge.className = `flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-lg border backdrop-blur-md transition-all duration-200 pointer-events-none ${
    isSuccess
      ? 'bg-emerald-600 text-white border-emerald-400/40 shadow-emerald-900/20 animate-in fade-in zoom-in-90'
      : 'bg-amber-600 text-white border-amber-400/40 shadow-amber-900/20 animate-in fade-in zoom-in-90'
  }`;
  badge.innerHTML = `
    <span class="material-symbols-outlined text-[15px]">${isSuccess ? 'check_circle' : 'warning'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  if (host.id === `imageBlockFeedback_${blockIdx}`) {
    host.innerHTML = '';
    host.appendChild(badge);
    setTimeout(() => {
      badge.classList.add('opacity-0', 'scale-95');
      setTimeout(() => badge.remove(), 250);
    }, 1800);
  } else {
    badge.classList.add('absolute', 'top-2', 'right-2', 'z-20');
    host.classList.add('relative');
    host.appendChild(badge);
    setTimeout(() => {
      badge.classList.add('opacity-0', 'scale-95');
      setTimeout(() => badge.remove(), 250);
    }, 1800);
  }
}

/**
 * 특정 HTML 요소 기준 앵커형 로컬 피드백 배지 (입력창 등)
 */
function showLocalElementFeedback(targetEl, message, type = 'warn') {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const badge = document.createElement('div');
  const isSuccess = type === 'success';
  badge.className = `fixed z-50 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-xl border backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95 pointer-events-none ${
    isSuccess ? 'bg-emerald-600 text-white border-emerald-400/40' : 'bg-amber-600 text-white border-amber-400/40'
  }`;
  badge.innerHTML = `
    <span class="material-symbols-outlined text-[15px]">${isSuccess ? 'check_circle' : 'warning'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  badge.style.left = `${rect.left + rect.width / 2}px`;
  badge.style.top = `${Math.max(10, rect.top - 34)}px`;
  badge.style.transform = 'translateX(-50%)';
  document.body.appendChild(badge);

  setTimeout(() => {
    badge.classList.add('opacity-0', '-translate-y-1');
    setTimeout(() => badge.remove(), 200);
  }, 1700);
}

/**
 * 글로벌 시스템 토스트 (화면 하단 중앙에 배치하여 메인 헤더 및 작업 영역 가림 방지)
 * - duration > 0: 지정된 밀리초 후 자동 페이드아웃
 * - duration === 0: 자동으로 사라지지 않고 유지 (엔터 타건 등 후속 이벤트 발생 시 전환)
 */
function showToast(message, duration = 2200) {
  let toast = document.getElementById('senseToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'senseToast';
    toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white font-body-sm text-xs font-semibold shadow-2xl transition-all opacity-0 pointer-events-none transform translate-y-3 border border-white/15 backdrop-blur-md flex items-center gap-2 max-w-[92vw] text-center';
    document.body.appendChild(toast);
  }

  if (typeof message === 'string' && /<[a-z][\s\S]*>/i.test(message)) {
    toast.innerHTML = message;
  } else {
    toast.innerText = message;
  }

  toast.classList.remove('opacity-0', 'translate-y-3');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(window._toastTimeout);
  if (duration && duration > 0) {
    window._toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-3');
    }, duration);
  }
}

/**
 * 활성화된 토스트 즉시 숨기기
 */
function hideToast() {
  const toast = document.getElementById('senseToast');
  if (toast) {
    clearTimeout(window._toastTimeout);
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-3');
  }
}

function openBotGuideModal() {
  const modal = document.getElementById('botGuideModal');
  if (!modal) return;

  const channel = SENSE_STATE.activeChannel || 'kakao';
  const channelNames = {
    kakao: '카카오톡',
    line: '라인(LINE)',
    telegram: '텔레그램',
    whatsapp: '왓츠앱(WhatsApp)',
    wechat: '위챗(WeChat)'
  };
  const channelColors = {
    kakao: { bg: 'bg-[#fee500]', text: 'text-slate-900', icon: 'bolt' },
    line: { bg: 'bg-[#06c755]', text: 'text-white', icon: 'chat' },
    telegram: { bg: 'bg-[#229ed9]', text: 'text-white', icon: 'send' },
    whatsapp: { bg: 'bg-[#25d366]', text: 'text-white', icon: 'forum' },
    wechat: { bg: 'bg-[#07c160]', text: 'text-white', icon: 'chat_bubble' }
  };

  const cName = channelNames[channel] || '카카오톡';
  const cTheme = channelColors[channel] || channelColors.kakao;

  const modalTitle = document.getElementById('modalChannelName');
  if (modalTitle) modalTitle.innerText = cName;

  document.querySelectorAll('.modalDynChannelName').forEach(el => {
    el.innerText = cName;
  });

  const iconWrapper = document.getElementById('modalChannelIconWrapper');
  if (iconWrapper) {
    iconWrapper.className = `w-8 h-8 rounded-xl ${cTheme.bg} ${cTheme.text} flex items-center justify-center font-bold shadow-2xs`;
    iconWrapper.innerHTML = `<span class="material-symbols-outlined text-[19px]">${cTheme.icon}</span>`;
  }

  // 연결 상태 배지 업데이트
  const statusBadge = document.getElementById('modalBotStatusBadge');
  if (statusBadge) {
    if (SENSE_STATE.botStatus === 'connected') {
      statusBadge.innerText = '✅ 연결 완료 (준비됨)';
      statusBadge.className = 'font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 text-[11px]';
    } else {
      statusBadge.innerText = '⚠️ 미연결 (실행 필요)';
      statusBadge.className = 'font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 text-[11px]';
    }
  }

  // 모달이 열릴 때 백그라운드 엔진 헬스체크 실시간 즉시 갱신
  checkSenseBotHealth(false);

  modal.classList.remove('hidden');
}

function openEngineModal() {
  openBotGuideModal();
}

function closeBotGuideModal() {
  const modal = document.getElementById('botGuideModal');
  if (modal) modal.classList.add('hidden');
}

function openImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.remove('hidden');
}

function closeImportModal() {
  const modal = document.getElementById('importModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * 엑셀(.xlsx, .xls) 및 CSV 파일 업로드 파싱 핸들러
 */
function handleFileUpload(file) {
  if (!file) return;

  const fileName = file.name || 'uploaded_file';
  const ext = fileName.split('.').pop().toLowerCase();

  const reader = new FileReader();

  if (ext === 'csv') {
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const rows = parseCsvText(text);
        processParsedRecipientRows(rows, fileName);
      } catch (err) {
        console.error('CSV 파싱 오류:', err);
        showToast('⚠️ CSV 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  } else {
    // Excel (.xlsx, .xls)
    reader.onload = function(e) {
      try {
        if (typeof XLSX === 'undefined') {
          showToast('⚠️ SheetJS 엑셀 파서 라이브러리가 로드되지 않았습니다.');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        processParsedRecipientRows(rows, fileName);
      } catch (err) {
        console.error('엑셀 파싱 오류:', err);
        showToast('⚠️ 엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

/**
 * 엑셀 표 복사(Ctrl+C) 후 클립보드 TSV 붙여넣기 핸들러
 */
function handleTsvPaste(tsvText) {
  if (!tsvText || !tsvText.trim()) {
    showToast('⚠️ 붙여넣을 텍스트 데이터가 비어 있습니다.');
    return;
  }
  try {
    const rows = parseCsvText(tsvText);
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
    processParsedRecipientRows(rows, `${dateStr} 가져온 명단`);
  } catch (err) {
    console.error('클립보드 데이터 파싱 오류:', err);
    showToast('⚠️ 데이터 파싱 중 오류가 발생했습니다: ' + err.message);
  }
}

/**
 * CSV / TSV 텍스트 문자열 파서
 */
function parseCsvText(text) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const isComma = commaCount > tabCount && commaCount > 0;

  return lines.map(line => {
    if (isComma) {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    } else {
      return line.split('\t').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    }
  });
}

/**
 * 업로드 또는 붙여넣은 2차원 명단 배열 분석 및 스마트 컬럼 매핑
 * 1) 필드명이 있는 경우 -> 유저의 필드명 그대로 사용
 * 2) 필드명이 없는 경우 -> 첫 열은 '이름', 전화번호 패턴은 '전화번호', 나머지는 '컬럼2', '컬럼3' 자동 부여
 */
function processParsedRecipientRows(rawRows, sourceName) {
  const rows = rawRows.filter(r => r && r.some(cell => String(cell || '').trim() !== ''));
  if (rows.length === 0) {
    showToast('⚠️ 유효한 데이터 행이 없습니다.');
    return;
  }

  const phoneRegex = /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/;
  const phoneLooseRegex = /01[0-9][0-9]{7,8}/;
  const isPhoneCell = (str) => {
    if (!str) return false;
    const clean = String(str).replace(/\s+/g, '');
    return phoneRegex.test(clean) || phoneLooseRegex.test(clean.replace(/[^0-9]/g, ''));
  };

  const row0 = rows[0].map(c => String(c || '').trim());
  const row1 = rows.length > 1 ? rows[1].map(c => String(c || '').trim()) : null;

  // 헤더 판별 키워드
  const headerKeywords = [
    '이름', '성명', '고객명', '수신자', 'name',
    '직함', '직책', '직급', 'title',
    '소속', '회사', '부서', 'org', 'company', 'dept',
    '전화', '전화번호', '핸드폰', '휴대폰', '연락처', 'phone', 'mobile', 'tel',
    '메모', '비고', '참고', '특이사항', 'memo', 'note',
    '금액', '회비', '입금', '날짜', '시간', '일시', '주소', '이메일', 'email'
  ];

  // row0에 실제 전화번호가 있으면 확실한 데이터 행 (헤더 아님)
  const row0HasPhone = row0.some(cell => isPhoneCell(cell));

  // row0에 헤더 키워드가 포함되어 있는지 확인
  const row0HasHeaderKeyword = row0.some(cell => {
    const low = cell.toLowerCase();
    return headerKeywords.some(kw => low === kw || low.includes(kw));
  });

  let hasHeader = false;
  if (!row0HasPhone) {
    if (row0HasHeaderKeyword) {
      hasHeader = true;
    } else if (row1) {
      const row1HasPhone = row1.some(cell => isPhoneCell(cell));
      const row1HasNum = row1.some(cell => !isNaN(Number(String(cell).replace(/,/g, ''))) && cell !== '');
      if (row1HasPhone || row1HasNum) {
        hasHeader = true;
      }
    }
  }

  let fieldNames = [];
  let dataRows = [];

  if (hasHeader) {
    // 1번 케이스: 유저 리스트에 필드명이 있는 경우 -> 그대로 필드명 사용
    fieldNames = row0.map((h, i) => {
      const trimmed = h.trim();
      if (trimmed) return trimmed;
      return i === 0 ? '이름' : `컬럼${i + 1}`;
    });
    dataRows = rows.slice(1);
  } else {
    // 2번 케이스: 항목명이 없는 경우 -> 스마트 유추 (첫 컬럼: '이름', 전화번호 감지, 그 외 '컬럼2', '컬럼3'...)
    dataRows = rows;
    const colCount = Math.max(...rows.map(r => r.length));

    fieldNames = [];
    for (let c = 0; c < colCount; c++) {
      if (c === 0) {
        fieldNames.push('이름');
      } else {
        const sampleColValues = rows.slice(0, 10).map(r => String(r[c] || '').trim()).filter(Boolean);
        const phoneMatchCount = sampleColValues.filter(v => isPhoneCell(v)).length;

        if (phoneMatchCount > 0 && phoneMatchCount >= sampleColValues.length * 0.5) {
          fieldNames.push('전화번호');
        } else {
          fieldNames.push(`컬럼${c + 1}`);
        }
      }
    }
  }

  // 중복 필드명 방지
  const seenFields = {};
  fieldNames = fieldNames.map(f => {
    if (!seenFields[f]) {
      seenFields[f] = 1;
      return f;
    } else {
      seenFields[f]++;
      return `${f}_${seenFields[f]}`;
    }
  });

  // 수신자 객체 생성 및 표준 필드 자동 매핑
  const newRecipients = dataRows.map((row, rIdx) => {
    const rec = {
      id: 'rec-' + Date.now() + '-' + rIdx,
      status: 'pending'
    };

    fieldNames.forEach((field, cIdx) => {
      const val = String(row[cIdx] || '').trim();
      rec[field] = val;

      const lowField = field.toLowerCase();
      if (field === '이름' || (cIdx === 0 && !rec.name)) {
        rec.name = val;
      } else if (lowField.includes('직함') || lowField.includes('직책') || lowField.includes('title')) {
        rec.title = val;
      } else if (lowField.includes('소속') || lowField.includes('회사') || lowField.includes('부서') || lowField.includes('org')) {
        rec.org = val;
      } else if (lowField.includes('전화') || lowField.includes('연락처') || lowField.includes('phone') || lowField.includes('mobile') || isPhoneCell(val)) {
        if (!rec.phone) rec.phone = val;
      } else if (lowField.includes('메모') || lowField.includes('비고') || lowField.includes('memo')) {
        rec.memo = val;
      } else if (lowField.includes('텔레그램') || lowField.includes('telegram') || lowField === 'tg') {
        rec.telegram = val;
      }
    });

    if (!rec.name) {
      rec.name = rec['이름'] || rec[fieldNames[0]] || `수신자${rIdx + 1}`;
    }
    if (!rec.title) rec.title = rec['직함'] || rec['컬럼2'] || '';
    if (!rec.org) rec.org = rec['소속'] || '';
    if (!rec.phone) rec.phone = rec['전화번호'] || '';
    if (!rec.memo) rec.memo = rec['메모'] || '';
    if (!rec.telegram) {
      rec.telegram = rec['텔레그램'] || rec['telegram'] || '';
      if (!rec.telegram && rec.name && String(rec.name).startsWith('@')) {
        rec.telegram = String(rec.name).replace(/^@/, '');
      }
    }

    return rec;
  });

  // 상태 갱신
  SENSE_STATE.customFields = fieldNames;
  SENSE_STATE.recipients = newRecipients;
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.isRecipientsSaved = false; // 새로 가져온 명단이므로 저장 활성화!

  const cleanName = sourceName.replace(/\.[^/.]+$/, '').trim() || '가져온 명단';
  SENSE_STATE.activeGroupName = cleanName;
  SENSE_STATE.activeGroupId = null;

  renderAll();

  const headerNotice = hasHeader ? '기존 필드명 반영' : '자동 열 유추(이름, 컬럼N) 적용';
  showToast(`🎉 ${newRecipients.length}명 로드 완료! [${headerNotice}: ${fieldNames.map(f => `#{${f}}`).join(' ')}]`);
}

// ==========================================
// 12. 인시튜(In-Situ) 컨텍스트 설정 및 도움말 팝오버
// ==========================================

/**
 * 헤더 프로필 & 멀린 클라우드 계정 팝오버 토글
 */
function toggleProfilePopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('profileAccountPopover');
  if (!popover) return;

  const isHidden = popover.classList.contains('hidden');
  closeAllPopovers();

  if (isHidden) {
    popover.classList.remove('hidden');
    // 계정 정보 갱신
    const savedEmail = localStorage.getItem('sensetalk_email');
    const userNameEl = document.getElementById('popoverUserName');
    const userEmailEl = document.getElementById('popoverUserEmail');
    const avatarEl = document.getElementById('popoverAvatarText');
    const badgeEl = document.getElementById('popoverCloudBadge');

    if (SENSE_STATE.isLoggedIn && savedEmail) {
      if (userNameEl) userNameEl.innerText = savedEmail.split('@')[0] + ' 님';
      if (userEmailEl) userEmailEl.innerText = savedEmail;
      if (avatarEl) avatarEl.innerText = savedEmail.charAt(0).toUpperCase();
      if (badgeEl) {
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800';
        badgeEl.innerText = '클라우드 연동됨';
      }
    } else {
      if (userNameEl) userNameEl.innerText = '게스트 사용자';
      if (userEmailEl) userEmailEl.innerText = '로컬 브라우저 세션 이용 중';
      if (avatarEl) avatarEl.innerText = 'G';
      if (badgeEl) {
        badgeEl.className = 'text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800';
        badgeEl.innerText = '로컬';
      }
    }
  }
}

/**
 * 치환 변수 원클릭 클립보드 복사 헬퍼
 */
function copyVariableTag(tag) {
  navigator.clipboard.writeText(tag).then(() => {
    showToast(`📋 변수 [${tag}] 복사 완료! 블록 본문에 붙여넣기(Ctrl+V)하세요.`);
  }).catch(() => {
    showToast(`📋 변수 [${tag}] 복사됨`);
  });
}

/**
 * 멀린 패밀리 앱 스위처 드롭다운 토글
 */
function toggleHubAppSwitcher(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('hubAppSwitcherDropdown');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  closeAllPopovers();
  if (isHidden) dropdown.classList.remove('hidden');
}

/**
 * 메시지 블록 추가 팝오버 토글 (하단 진한 버튼 클릭 시 3개 블록 선택창 노출)
 */
function toggleBlockAddPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('blockAddPopover');
  const chevron = document.getElementById('bottomBlockAddChevron');
  const statusText = document.getElementById('bottomBlockAddStatusText');
  if (!popover) return;

  const isHidden = popover.classList.contains('hidden');
  closeAllPopovers();

  if (isHidden) {
    popover.classList.remove('hidden');
    if (chevron) chevron.innerText = 'expand_less';
    if (statusText) statusText.innerText = '닫기';
  } else {
    popover.classList.add('hidden');
    if (chevron) chevron.innerText = 'expand_more';
    if (statusText) statusText.innerText = '선택하기';
  }
}

/**
 * 모든 인시튜 팝오버 닫기
 */
function closeAllPopovers() {
  const popovers = [
    'profileAccountPopover',
    'hubAppSwitcherDropdown',
    'dispatchHelpPopover',
    'blockAddPopover'
  ];
  popovers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const chevron = document.getElementById('bottomBlockAddChevron');
  if (chevron) chevron.innerText = 'expand_more';
  const statusText = document.getElementById('bottomBlockAddStatusText');
  if (statusText) statusText.innerText = '선택하기';
}

/**
 * 카카오톡 실시간 미리보기 스마트폰 팝업 모달 제어
 */
function openKakaoPreviewModal() {
  const modal = document.getElementById('kakaoPreviewPopupModal');
  const card = document.getElementById('kakaoPreviewPhoneCard');
  if (modal) {
    modal.classList.remove('hidden');
    renderKakaoPreview();

    // 사용자가 마우스로 직접 드래그하여 이동해 둔 위치가 있다면 복원
    if (card && window._kakaoPreviewPos && window._hasUserCustomPreviewPos) {
      const cardWidth = card.offsetWidth || 390;
      const maxLeft = Math.max(10, window.innerWidth - 80);
      const maxTop = Math.max(10, window.innerHeight - 80);
      const left = Math.max(-cardWidth + 80, Math.min(window._kakaoPreviewPos.left, maxLeft));
      const top = Math.max(0, Math.min(window._kakaoPreviewPos.top, maxTop));
      card.style.position = 'fixed';
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      card.style.margin = '0';
    } else if (card) {
      // 유저 요청: 가운데가 아닌 좌측(수신자 명단 위)에 디폴트로 나란히 띄우기 (우측 조립 캔버스 시야 100% 확보)
      if (window.innerWidth >= 1024) {
        const leftAside = document.querySelector('main aside');
        let defaultLeft = 36;
        let defaultTop = 72;
        if (leftAside) {
          const rect = leftAside.getBoundingClientRect();
          defaultLeft = Math.max(16, Math.round(rect.left + Math.max(0, (rect.width - 390) / 2)));
          defaultTop = Math.max(65, Math.round(rect.top + Math.max(0, (rect.height - 680) / 2)));
        }
        card.style.position = 'fixed';
        card.style.left = `${defaultLeft}px`;
        card.style.top = `${defaultTop}px`;
        card.style.margin = '0';
      } else {
        card.style.position = '';
        card.style.left = '';
        card.style.top = '';
        card.style.margin = '';
      }
    }
  }
}

function closeKakaoPreviewModal() {
  const modal = document.getElementById('kakaoPreviewPopupModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * 카카오톡 미리보기 팝업 어디든 잡고 위치 이동 가능 (Draggable Floating Window)
 */
function initDraggablePreviewPopup() {
  const card = document.getElementById('kakaoPreviewPhoneCard');
  if (!card) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;
  let hasMoved = false;

  function onPointerDown(e) {
    // 닫기, 발송 등 인터랙티브 버튼 및 입력창 클릭 시에는 드래그 방지
    if (e.target.closest('button, input, textarea, a, select')) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = card.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    startX = clientX;
    startY = clientY;
    isDragging = true;
    hasMoved = false;

    // fixed 좌표로 전환하여 자유 이동
    card.style.position = 'fixed';
    card.style.left = `${initLeft}px`;
    card.style.top = `${initTop}px`;
    card.style.margin = '0';
    card.style.transform = 'none';
    card.classList.add('shadow-2xl', 'ring-2', 'ring-primary/60');
    card.style.cursor = 'grabbing';
    document.body.classList.add('select-none');

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved = true;
      if (e.cancelable) e.preventDefault();
    }

    const cardWidth = card.offsetWidth || 390;
    const minLeft = -cardWidth + 80;
    const maxLeft = window.innerWidth - 80;
    const minTop = 0;
    const maxTop = window.innerHeight - 80;

    let newLeft = initLeft + deltaX;
    let newTop = initTop + deltaY;

    newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    newTop = Math.max(minTop, Math.min(newTop, maxTop));

    card.style.left = `${newLeft}px`;
    card.style.top = `${newTop}px`;
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;

    card.classList.remove('ring-2', 'ring-primary/60');
    card.style.cursor = '';
    document.body.classList.remove('select-none');

    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.removeEventListener('touchend', onPointerUp);

    if (hasMoved) {
      const rect = card.getBoundingClientRect();
      window._kakaoPreviewPos = { left: rect.left, top: rect.top };
      window._hasUserCustomPreviewPos = true;
    }
  }

  card.addEventListener('mousedown', onPointerDown);
  card.addEventListener('touchstart', onPointerDown, { passive: true });
}

/**
 * 메인 워크스페이스 좌우 패널 드래그 리사이저 (Splitter)
 * - 좌 25%:75% ~ 75%:25% 실시간 폭 조절
 * - localStorage에 비율 저장 및 재접속 시 복원
 * - 더블 클릭 시 50:50 기본 균형으로 복구
 */
function initWorkspaceSplitter() {
  const resizer = document.getElementById('splitResizer');
  const container = document.getElementById('workspaceSplitContainer');
  const leftPanel = document.getElementById('leftPanel');
  if (!resizer || !container || !leftPanel) return;

  // 저장된 분할 비율 복원 (데스크톱 화면 기준)
  const savedRatio = localStorage.getItem('sensetalk_panel_split_ratio');
  if (savedRatio && window.innerWidth >= 1024) {
    const pct = parseFloat(savedRatio);
    if (!isNaN(pct) && pct >= 25 && pct <= 75) {
      leftPanel.style.width = `${pct}%`;
    }
  }

  let isDragging = false;
  let startX = 0;
  let startLeftWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-indigo-100');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth <= 0) return;

    const deltaX = e.clientX - startX;
    const newWidth = startLeftWidth + deltaX;
    let newPct = (newWidth / containerWidth) * 100;

    // 25% ~ 75% 사이로 범위 제한
    if (newPct < 25) newPct = 25;
    if (newPct > 75) newPct = 75;

    leftPanel.style.width = `${newPct}%`;
    localStorage.setItem('sensetalk_panel_split_ratio', newPct.toFixed(1));
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizer.classList.remove('bg-indigo-100');
    }
  });

  // 더블 클릭 시 48~50% 기본 균형으로 원클릭 복구
  resizer.addEventListener('dblclick', () => {
    leftPanel.style.width = '48%';
    localStorage.removeItem('sensetalk_panel_split_ratio');
    showToast('📐 좌우 패널 비율을 기본 균등(5:5)으로 초기화했습니다.');
  });
}

/**
 * 발송 가이드 (?) 팝오버 토글
 */
function toggleDispatchHelpPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('dispatchHelpPopover');
  if (!popover) return;
  const isHidden = popover.classList.contains('hidden');
  closeAllPopovers();
  if (isHidden) popover.classList.remove('hidden');
}

/**
 * 멀린 패밀리 통합 계정 (Supabase) 1초 연동 처리
 */
function handleSupabaseConnect() {
  const email = prompt('멀린 패밀리 연동에 사용할 이메일을 입력하세요:\n(입력 즉시 로컬 명단과 템플릿이 Supabase와 실시간 동기화됩니다)', 'merlin_user@gmail.com');
  if (email && email.includes('@')) {
    SENSE_STATE.isLoggedIn = true;
    localStorage.setItem('sensetalk_logged_in', 'true');
    localStorage.setItem('sensetalk_email', email);
    localStorage.setItem('merlin_uuid', 'usr_' + Math.random().toString(36).substr(2, 8));
    
    const profileLabel = document.getElementById('userProfileLabel');
    if (profileLabel) profileLabel.innerText = email.split('@')[0];
    
    const avatar = document.getElementById('userAvatarText');
    if (avatar) avatar.innerText = email.charAt(0).toUpperCase();

    showToast(`🎉 멀린 패밀리 계정 연동 완료! (${email}) 명단과 템플릿이 영구 보관됩니다.`);
    closeAllPopovers();
  }
}

// 창 외부 클릭 시 모든 인시튜 팝오버 자동 닫기
window.addEventListener('click', (e) => {
  const interactiveTriggers = [
    'workflowSettingsBtn', 'workflowSettingsPopover',
    'messageOptionsBtn', 'messageOptionsPopover',
    'headerProfileWidget', 'profileAccountPopover',
    'hubAppSwitcherBtn', 'hubAppSwitcherDropdown',
    'dispatchHelpPopover'
  ];

  const clickedInside = interactiveTriggers.some(id => {
    const el = document.getElementById(id);
    return el && el.contains(e.target);
  });

  if (!clickedInside) {
    closeAllPopovers();
  }
});

// ==========================================
// 13. JIT 인터랙티브 온보딩 투어 (드래그 지원 & 감성 3초 가이드)
// ==========================================
const ONBOARDING_STEPS = [
  {
    step: 1,
    badge: '1/3',
    title: '1. 수신자 명단 등록',
    desc: '좌측 [수신자 명단]에서 엑셀/CSV 파일을 끌어다 놓거나 [불러오기]로 고객 명단을 등록하세요.',
    nextBtnText: '다음 (2/3)'
  },
  {
    step: 2,
    badge: '2/3',
    title: '2. 캔버스에서 메시지 조립',
    desc: '우측 [캔버스]에서 텍스트와 사진 블록을 조립하세요. 좌하단 [카톡 미리보기] 카드를 클릭하면 스마트폰 팝업으로 실시간 치환 결과를 확인할 수 있습니다.',
    nextBtnText: '다음 (3/3)'
  },
  {
    step: 3,
    badge: '3/3',
    title: '3. 한 명 한 명 눈을 맞추며 [Enter]',
    desc: '무작정 빠르게 쏘아대는 매크로가 아닙니다. 카카오톡 대화창에서 소중한 인연의 이름을 한 번 더 눈에 담고 [Enter]를 누르면, 정성 어린 진심이 1:1로 온전히 전해집니다.',
    nextBtnText: '진심 전하러 가기 (시작)'
  }
];

let _currentOnboardingStep = 1;

function initOnboardingTour() {
  const card = document.getElementById('jitOnboardingCard');
  if (!card) return;

  initDraggableOnboardingCard();

  const hasSeenV2 = localStorage.getItem('sensetalk_onboarding_v2_seen') === 'true';
  const isDismissed = localStorage.getItem('sensetalk_onboarding_dismissed') === 'true';

  if (!hasSeenV2) {
    // 신규 리디자인 버전 1회 강제 노출
    localStorage.setItem('sensetalk_onboarding_v2_seen', 'true');
    localStorage.removeItem('sensetalk_onboarding_dismissed');
    card.classList.remove('hidden', 'opacity-0', 'translate-y-2');
    renderOnboardingStep(1);
  } else if (!isDismissed) {
    card.classList.remove('hidden', 'opacity-0', 'translate-y-2');
    renderOnboardingStep(1);
  } else {
    card.classList.add('hidden');
  }
}

/**
 * 퀵 가이드 언제든 다시 열기
 */
function openOnboardingTour(forceReset = true) {
  if (forceReset) {
    localStorage.removeItem('sensetalk_onboarding_dismissed');
    _currentOnboardingStep = 1;
  }
  const card = document.getElementById('jitOnboardingCard');
  if (!card) return;
  card.classList.remove('hidden', 'opacity-0', 'translate-y-2');
  renderOnboardingStep(_currentOnboardingStep || 1);
}

function renderOnboardingStep(stepNumber) {
  const card = document.getElementById('jitOnboardingCard');
  const badgeEl = document.getElementById('onboardingStepBadge');
  const contentEl = document.getElementById('onboardingContent');
  const prevBtnEl = document.getElementById('onboardingPrevBtn');
  const prevBtnTextEl = document.getElementById('onboardingPrevBtnText');
  const nextBtnEl = document.getElementById('onboardingNextBtn');
  if (!card || !contentEl) return;

  const data = ONBOARDING_STEPS[stepNumber - 1];
  if (!data) return;

  _currentOnboardingStep = stepNumber;

  if (badgeEl) badgeEl.innerText = data.badge;
  contentEl.innerHTML = `
    <div class="font-bold text-white text-xs">${data.title}</div>
    <p class="text-slate-300 text-[11.5px] leading-relaxed pt-1.5">${data.desc}</p>
  `;

  // 이전 버튼 처리
  if (prevBtnEl) {
    if (stepNumber > 1) {
      prevBtnEl.classList.remove('hidden');
      if (prevBtnTextEl) prevBtnTextEl.innerText = `이전 (${stepNumber - 1}/3)`;
    } else {
      prevBtnEl.classList.add('hidden');
    }
  }

  // 다음 버튼 처리
  if (nextBtnEl) {
    const isLast = stepNumber === ONBOARDING_STEPS.length;
    nextBtnEl.innerHTML = `
      <span>${data.nextBtnText}</span>
      <span class="material-symbols-outlined text-[14px]">${isLast ? 'favorite' : 'arrow_forward'}</span>
    `;
  }
}

function prevOnboardingStep() {
  if (_currentOnboardingStep > 1) {
    _currentOnboardingStep--;
    renderOnboardingStep(_currentOnboardingStep);
  }
}

function nextOnboardingStep() {
  if (_currentOnboardingStep < ONBOARDING_STEPS.length) {
    _currentOnboardingStep++;
    renderOnboardingStep(_currentOnboardingStep);
  } else {
    dismissOnboarding();
    showToast('💌 소중한 진심이 전해지길 응원합니다. 편안한 발송 되세요!');
  }
}

function dismissOnboarding() {
  localStorage.setItem('sensetalk_onboarding_dismissed', 'true');
  const card = document.getElementById('jitOnboardingCard');
  if (card) {
    card.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      card.classList.add('hidden');
      card.classList.remove('opacity-0', 'translate-y-2');
    }, 250);
  }
}

/**
 * 퀵 가이드 박스 마우스/터치 드래그 이동 엔진 (Draggable Floating Window)
 */
function initDraggableOnboardingCard() {
  const card = document.getElementById('jitOnboardingCard');
  const header = document.getElementById('onboardingDragHeader');
  if (!card || !header || window._onboardingDragInitialized) return;
  window._onboardingDragInitialized = true;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;

  function onPointerDown(e) {
    // 닫기나 버튼 클릭 시에는 드래그 무시
    if (e.target.closest('button')) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = card.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;
    startX = clientX;
    startY = clientY;
    isDragging = true;

    card.style.position = 'fixed';
    card.style.left = `${initLeft}px`;
    card.style.top = `${initTop}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    card.style.margin = '0';
    card.classList.add('ring-2', 'ring-indigo-500/60');

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    const cardRect = card.getBoundingClientRect();
    let newLeft = initLeft + deltaX;
    let newTop = initTop + deltaY;

    // 브라우저 뷰포트 벗어나지 않도록 클램핑
    const maxLeft = window.innerWidth - cardRect.width - 8;
    const maxTop = window.innerHeight - cardRect.height - 8;
    newLeft = Math.max(8, Math.min(newLeft, maxLeft));
    newTop = Math.max(8, Math.min(newTop, maxTop));

    card.style.left = `${newLeft}px`;
    card.style.top = `${newTop}px`;

    if (e.cancelable) e.preventDefault();
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    card.classList.remove('ring-2', 'ring-indigo-500/60');
    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.removeEventListener('touchend', onPointerUp);
  }

  header.addEventListener('mousedown', onPointerDown);
  header.addEventListener('touchstart', onPointerDown, { passive: true });
}

// ==========================================
// 13. 다중 명단(그룹) 프리셋 저장 및 불러오기 엔진
// ==========================================

function initRecipientGroups() {
  try {
    const raw = localStorage.getItem('sensetalk_recipient_groups');
    if (raw) {
      SENSE_STATE.recipientGroups = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('저장된 명단 파싱 오류:', e);
    SENSE_STATE.recipientGroups = [];
  }

  if (!Array.isArray(SENSE_STATE.recipientGroups)) {
    SENSE_STATE.recipientGroups = [];
  }

  // 1. 목업/샘플 명단 완전 제거 (사용자가 직접 저장한 명단만 유지)
  const mockupGroupIds = ['group_default_seed'];
  const mockupGroupNames = ['기본 샘플 명단 (4명)', '기본 샘플 명단', '샘플 명단', '기본 명단'];

  const beforeCount = SENSE_STATE.recipientGroups.length;
  SENSE_STATE.recipientGroups = SENSE_STATE.recipientGroups.filter(g => {
    if (!g) return false;
    if (g.id && mockupGroupIds.includes(g.id)) return false;
    if (g.name && mockupGroupNames.some(m => g.name.trim() === m)) return false;
    // 김서연, 박민우 등 4명 목업 데이터만 들어있는 경우도 제거
    if (g.recipients && Array.isArray(g.recipients)) {
      const isMockRecipients = g.recipients.some(r => r.name === '김서연' && r.phone === '010-1234-5678');
      if (isMockRecipients && (g.id === 'group_default_seed' || (g.name && g.name.includes('샘플')) || g.name === '기본 명단')) {
        return false;
      }
    }
    return true;
  });

  // 혹시 이전 버전에서 명단 그룹 내부에 저장된 message / msg 및 customFields 정제
  let cleanedAny = false;
  SENSE_STATE.recipientGroups.forEach(g => {
    if (Array.isArray(g.recipients)) {
      g.recipients.forEach(r => {
        if (r && r.message !== undefined) { delete r.message; cleanedAny = true; }
        if (r && r.msg !== undefined) { delete r.msg; cleanedAny = true; }
      });
    }
    if (Array.isArray(g.customFields)) {
      const origLen = g.customFields.length;
      g.customFields = g.customFields.filter(f => f !== 'message' && f !== 'msg' && !['id', 'status', 'extra'].includes(f) && !String(f).startsWith('_'));
      if (g.customFields.length !== origLen) cleanedAny = true;
    }
  });

  if (SENSE_STATE.recipientGroups.length !== beforeCount || cleanedAny || !localStorage.getItem('sensetalk_recipient_groups')) {
    saveRecipientGroupsToStorage();
  }

  // 2. 새로고침 시 항상 최신 저장된 명단을 자동으로 불러와 띄우기!
  if (SENSE_STATE.recipientGroups.length > 0) {
    const lastId = localStorage.getItem('sensetalk_last_group_id');
    const lastName = localStorage.getItem('sensetalk_active_group_name');

    let targetGroup = null;
    if (lastId) {
      targetGroup = SENSE_STATE.recipientGroups.find(g => g.id === lastId);
    }
    if (!targetGroup && lastName) {
      targetGroup = SENSE_STATE.recipientGroups.find(g => g.name === lastName);
    }
    // 지정된 것이 없으면 가장 최근(0번째)에 저장/수정된 명단 그룹 자동 선택
    if (!targetGroup) {
      targetGroup = SENSE_STATE.recipientGroups[0];
    }

    if (targetGroup && Array.isArray(targetGroup.recipients)) {
      targetGroup.recipients.forEach(r => {
        if (r && r.message !== undefined) delete r.message;
        if (r && r.msg !== undefined) delete r.msg;
      });
      if (Array.isArray(targetGroup.customFields)) {
        targetGroup.customFields = targetGroup.customFields.filter(f => f !== 'message' && f !== 'msg' && !['id', 'status', 'extra'].includes(f) && !String(f).startsWith('_'));
      }
      SENSE_STATE.recipients = JSON.parse(JSON.stringify(targetGroup.recipients));
      SENSE_STATE.currentIndex = 0;
      SENSE_STATE.activeGroupName = targetGroup.name;
      SENSE_STATE.activeGroupId = targetGroup.id;
      SENSE_STATE.customFields = targetGroup.customFields || null;
      localStorage.setItem('sensetalk_active_group_name', targetGroup.name);
      localStorage.setItem('sensetalk_last_group_id', targetGroup.id);
    }
  } else {
    // 저장된 명단 그룹이 아직 없는 경우
    SENSE_STATE.recipients = [];
    SENSE_STATE.currentIndex = 0;
    SENSE_STATE.activeGroupName = '';
    SENSE_STATE.activeGroupId = null;
    SENSE_STATE.customFields = null;
    localStorage.removeItem('sensetalk_active_group_name');
    localStorage.removeItem('sensetalk_last_group_id');
  }

  updateGroupBadges();
}

function saveRecipientGroupsToStorage() {
  try {
    localStorage.setItem('sensetalk_recipient_groups', JSON.stringify(SENSE_STATE.recipientGroups));
    if (SENSE_STATE.activeGroupName) {
      localStorage.setItem('sensetalk_active_group_name', SENSE_STATE.activeGroupName);
    } else {
      localStorage.removeItem('sensetalk_active_group_name');
    }
    if (SENSE_STATE.activeGroupId) {
      localStorage.setItem('sensetalk_last_group_id', SENSE_STATE.activeGroupId);
    } else {
      localStorage.removeItem('sensetalk_last_group_id');
    }
  } catch (e) {
    console.error('명단 저장 실패:', e);
  }
  updateGroupBadges();
}

function updateGroupBadges() {
  const badge = document.getElementById('currentActiveGroupBadge');
  if (badge) {
    const name = SENSE_STATE.activeGroupName;
    if (name) {
      badge.innerText = name;
      badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20 shadow-2xs max-w-[120px] truncate cursor-pointer hover:bg-primary/20 transition-all";
      badge.title = `현재 활성 명단 그룹: ${name} (클릭 시 불러오기 목록 열기)`;
    } else {
      badge.innerText = '명단 없음';
      badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200 shadow-2xs max-w-[120px] truncate cursor-pointer hover:bg-slate-200 transition-all";
      badge.title = '저장된 그룹이 없거나 명단이 비어 있습니다 (클릭 시 불러오기 목록 열기)';
    }
  }
  const countBadge = document.getElementById('savedGroupsCountBadge');
  if (countBadge) {
    countBadge.innerText = (SENSE_STATE.recipientGroups || []).length;
  }
}

/**
 * 명단 저장 버튼 상태 동기화 (불러오거나 수정 시: 활성화, 저장 완료 시: 비활성화)
 */
function updateSaveRecipientsBtn() {
  const btn = document.getElementById('saveRecipientsBtn');
  const icon = document.getElementById('saveRecipientsBtnIcon');
  const text = document.getElementById('saveRecipientsBtnText');
  if (!btn) return;

  const count = SENSE_STATE.recipients ? SENSE_STATE.recipients.length : 0;
  const isSaved = SENSE_STATE.isRecipientsSaved === true;

  if (count === 0) {
    // 1. 수신자가 없는 경우 (0명): 비활성화
    btn.disabled = true;
    btn.className = "flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-headline-sm text-[11px] text-slate-400 bg-slate-100 border-2 border-slate-200 shadow-none cursor-not-allowed opacity-50 font-bold transition-all select-none";
    btn.title = "저장할 수신자 명단이 없습니다 (먼저 명단을 추가하세요)";
    if (icon) {
      icon.innerText = "save";
      icon.className = "material-symbols-outlined text-[15px] text-slate-400";
    }
    if (text) text.innerText = "명단 저장";
  } else if (!isSaved) {
    // 2. 명단을 불러왔거나 변경되어 저장이 필요한 경우: 선명한 에메랄드 활성화 (Active)
    btn.disabled = false;
    btn.className = "flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-headline-sm text-[11px] text-white bg-emerald-600 hover:bg-emerald-700 border-2 border-emerald-700 shadow-xs cursor-pointer font-bold transition-all active:scale-95 select-none";
    btn.title = `현재 명단(${count}명)을 보관함에 저장합니다 (저장 대기)`;
    if (icon) {
      icon.innerText = "save";
      icon.className = "material-symbols-outlined text-[15px] text-white";
    }
    if (text) text.innerText = "명단 저장";
  } else {
    // 3. 저장이 완료된 경우: 비활성화 (저장 완료)
    btn.disabled = true;
    btn.className = "flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-headline-sm text-[11px] text-slate-500 bg-slate-100 border-2 border-slate-200 shadow-none cursor-not-allowed opacity-75 font-bold transition-all select-none";
    btn.title = "현재 명단이 안전하게 저장되었습니다 (저장 완료)";
    if (icon) {
      icon.innerText = "check_circle";
      icon.className = "material-symbols-outlined text-[15px] text-emerald-600";
    }
    if (text) text.innerText = "저장 완료";
  }
}

function openSaveGroupModal() {
  if (!SENSE_STATE.recipients || SENSE_STATE.recipients.length === 0) {
    showToast('⚠️ 저장할 수신자 명단이 비어 있습니다. 먼저 명단을 추가하세요.');
    return;
  }
  if (SENSE_STATE.isRecipientsSaved) {
    showToast('ℹ️ 현재 명단이 이미 보관함에 안전하게 저장되어 있습니다.');
    return;
  }
  const modal = document.getElementById('saveGroupModal');
  const input = document.getElementById('saveGroupNameInput');
  const countEl = document.getElementById('saveGroupCountText');

  if (countEl) countEl.innerText = `${SENSE_STATE.recipients.length}명`;
  if (input) {
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
    input.value = SENSE_STATE.activeGroupName && SENSE_STATE.activeGroupName !== '명단 없음'
      ? SENSE_STATE.activeGroupName 
      : `${dateStr} 모임 명단`;
    setTimeout(() => { 
      input.focus(); 
      input.select(); 
      updateSaveGroupModalFeedback();
    }, 100);
  }
  if (modal) modal.classList.remove('hidden');
}

function closeSaveGroupModal() {
  const modal = document.getElementById('saveGroupModal');
  if (modal) modal.classList.add('hidden');
}

function updateSaveGroupModalFeedback() {
  const input = document.getElementById('saveGroupNameInput');
  const noticeEl = document.getElementById('saveGroupModeNotice');
  const confirmBtn = document.getElementById('saveGroupConfirmBtn');
  if (!input || !noticeEl) return;

  const name = input.value.trim();
  if (!name) {
    noticeEl.innerHTML = '';
    if (confirmBtn) confirmBtn.innerText = '저장하기';
    return;
  }

  const exists = SENSE_STATE.recipientGroups.some(g => g.name === name);
  if (exists) {
    noticeEl.innerHTML = `<span class="text-amber-700 font-bold flex items-center gap-1"><span>🔄</span> 기존 <strong>"${escapeHtml(name)}"</strong> 명단을 현재 수신자(${SENSE_STATE.recipients.length}명)로 덮어씁니다 (수정 업데이트).</span>`;
    if (confirmBtn) confirmBtn.innerText = '기존 명단 덮어쓰기';
  } else {
    noticeEl.innerHTML = `<span class="text-primary font-bold flex items-center gap-1"><span>✨</span> 새로운 <strong>"${escapeHtml(name)}"</strong> 명단 그룹으로 새로 추가 저장됩니다.</span>`;
    if (confirmBtn) confirmBtn.innerText = '새 명단 추가 저장';
  }
}

function handleSaveGroupConfirm() {
  const input = document.getElementById('saveGroupNameInput');
  const name = (input ? input.value : '').trim() || '새 모임 명단';

  if (!SENSE_STATE.recipients || SENSE_STATE.recipients.length === 0) {
    showToast('⚠️ 저장할 수신자 명단이 비어 있습니다. 먼저 명단을 추가하세요.');
    return;
  }

  const existingIdx = SENSE_STATE.recipientGroups.findIndex(g => g.name === name);
  const nowStr = new Date().toLocaleDateString('ko-KR');
  let savedGroupId = null;
  const isOverwriting = existingIdx >= 0;

  const cleanRecipients = SENSE_STATE.recipients.map(r => {
    const copy = { ...r };
    delete copy.message;
    delete copy.msg;
    return copy;
  });
  const cleanFields = (SENSE_STATE.customFields || getActiveRecipientFields()).filter(f => f !== 'message' && f !== 'msg' && !['id', 'status', 'extra'].includes(f) && !String(f).startsWith('_'));

  if (isOverwriting) {
    // 기존 그룹 덮어쓰기 & 최신 수정 순으로 맨 앞으로 이동
    const targetGroup = SENSE_STATE.recipientGroups.splice(existingIdx, 1)[0];
    targetGroup.recipients = cleanRecipients;
    targetGroup.updatedAt = nowStr;
    targetGroup.customFields = cleanFields;
    savedGroupId = targetGroup.id;
    SENSE_STATE.recipientGroups.unshift(targetGroup);
  } else {
    // 새 그룹 추가 (맨 앞에 배치)
    savedGroupId = 'group_' + Date.now();
    SENSE_STATE.recipientGroups.unshift({
      id: savedGroupId,
      name: name,
      updatedAt: nowStr,
      customFields: cleanFields,
      recipients: cleanRecipients
    });
  }

  SENSE_STATE.activeGroupName = name;
  SENSE_STATE.activeGroupId = savedGroupId;
  SENSE_STATE.isRecipientsSaved = true; // 저장 완료 -> 비활성화!
  saveRecipientGroupsToStorage();
  closeSaveGroupModal();
  renderAll();
  showToast(isOverwriting
    ? `🔄 기존 "${name}" (${SENSE_STATE.recipients.length}명) 명단이 현재 내용으로 업데이트되었습니다!`
    : `💾 새 명단 "${name}" (${SENSE_STATE.recipients.length}명)이 안전하게 저장되었습니다!`
  );
}

function openLoadGroupModal() {
  const modal = document.getElementById('loadGroupModal');
  renderGroupListCards();
  if (modal) modal.classList.remove('hidden');
}

function closeLoadGroupModal() {
  const modal = document.getElementById('loadGroupModal');
  if (modal) modal.classList.add('hidden');
}

function renderGroupListCards() {
  const container = document.getElementById('loadGroupListContainer');
  if (!container) return;

  if (!SENSE_STATE.recipientGroups || SENSE_STATE.recipientGroups.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-outline">
        <span class="material-symbols-outlined text-4xl mb-1 text-outline/50">folder_off</span>
        <p class="text-xs font-bold text-slate-600">저장된 명단 그룹이 없습니다.</p>
        <p class="text-[11px] text-slate-400 mt-1">작업 창에서 수신자를 입력한 후 [💾 명단 저장]을 눌러 보관하세요.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = SENSE_STATE.recipientGroups.map(group => {
    const isCurrent = group.name === SENSE_STATE.activeGroupName || group.id === SENSE_STATE.activeGroupId;
    const names = group.recipients.slice(0, 3).map(r => r.name).filter(Boolean).join(', ');
    const extraCount = group.recipients.length > 3 ? ` 외 ${group.recipients.length - 3}명` : '';
    const previewStr = names ? `${names}${extraCount}` : '수신자 없음';

    return `
      <div class="p-3 rounded-xl border ${isCurrent ? 'border-primary bg-primary/5 shadow-xs' : 'border-outline-variant/30 bg-surface-container-lowest hover:border-outline-variant'} flex items-center justify-between gap-3 transition-all">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="font-bold text-xs text-on-surface truncate">${escapeHtml(group.name)}</span>
            <span class="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${isCurrent ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}">${group.recipients.length}명</span>
            ${isCurrent ? '<span class="text-[9.5px] px-1 py-0.2 rounded bg-primary/10 text-primary font-bold">현재 사용 중</span>' : ''}
          </div>
          <div class="text-[11px] text-on-surface-variant truncate">
            👥 ${escapeHtml(previewStr)}
          </div>
          <div class="text-[10px] text-outline mt-0.5 font-mono">
            저장일: ${group.updatedAt || '최근'}
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button class="px-3 py-1.5 rounded-lg ${isCurrent ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-semibold'} text-xs shadow-2xs transition-all cursor-pointer" onclick="loadGroupById('${group.id}')">
            ${isCurrent ? '다시 불러오기' : '불러오기'}
          </button>
          <button class="w-7 h-7 rounded-lg hover:bg-error/10 text-outline hover:text-error flex items-center justify-center transition-colors cursor-pointer" onclick="deleteGroupById('${group.id}')" title="명단 그룹 삭제">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function loadGroupById(groupId) {
  const group = SENSE_STATE.recipientGroups.find(g => g.id === groupId);
  if (!group) return;

  // 깊은 복사로 불러오기 및 내부 통신용 필드 정제
  const cleanRecipients = JSON.parse(JSON.stringify(group.recipients || []));
  cleanRecipients.forEach(r => {
    if (r && r.message !== undefined) delete r.message;
    if (r && r.msg !== undefined) delete r.msg;
  });

  const cleanFields = Array.isArray(group.customFields)
    ? group.customFields.filter(f => f !== 'message' && f !== 'msg' && !['id', 'status', 'extra'].includes(f) && !String(f).startsWith('_'))
    : null;

  SENSE_STATE.recipients = cleanRecipients;
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.activeGroupName = group.name;
  SENSE_STATE.activeGroupId = group.id;
  SENSE_STATE.customFields = cleanFields;
  SENSE_STATE.isRecipientsSaved = false; // 명단을 불러왔으므로 저장 버튼 활성화!

  localStorage.setItem('sensetalk_last_group_id', group.id);
  localStorage.setItem('sensetalk_active_group_name', group.name);
  renderAll();
  closeLoadGroupModal();
  showToast(`📂 "${group.name}" (${group.recipients.length}명) 명단을 성공적으로 불러왔습니다!`);
}

function deleteGroupById(groupId) {
  const target = SENSE_STATE.recipientGroups.find(g => g.id === groupId);
  if (!target) return;

  if (confirm(`정말 "${target.name}" 명단 그룹을 삭제하시겠습니까?`)) {
    SENSE_STATE.recipientGroups = SENSE_STATE.recipientGroups.filter(g => g.id !== groupId);

    // 현재 사용 중이던 그룹을 삭제한 경우 처리
    if (SENSE_STATE.activeGroupName === target.name || SENSE_STATE.activeGroupId === groupId) {
      if (SENSE_STATE.recipientGroups.length > 0) {
        // 남은 명단 중 최신 명단 자동 활성화
        const nextGroup = SENSE_STATE.recipientGroups[0];
        SENSE_STATE.recipients = JSON.parse(JSON.stringify(nextGroup.recipients));
        SENSE_STATE.currentIndex = 0;
        SENSE_STATE.activeGroupName = nextGroup.name;
        SENSE_STATE.activeGroupId = nextGroup.id;
        SENSE_STATE.customFields = nextGroup.customFields || null;
        localStorage.setItem('sensetalk_active_group_name', nextGroup.name);
        localStorage.setItem('sensetalk_last_group_id', nextGroup.id);
      } else {
        SENSE_STATE.recipients = [];
        SENSE_STATE.currentIndex = 0;
        SENSE_STATE.activeGroupName = '';
        SENSE_STATE.activeGroupId = null;
        SENSE_STATE.customFields = null;
        localStorage.removeItem('sensetalk_active_group_name');
        localStorage.removeItem('sensetalk_last_group_id');
      }
    }

    saveRecipientGroupsToStorage();
    renderGroupListCards();
    renderAll();
    showToast(`🗑️ "${target.name}" 그룹이 삭제되었습니다.`);
  }
}

function handleClearCurrentRecipients() {
  if (confirm('현재 작업 화면의 명단을 모두 비우고 빈 명단으로 새로 시작하시겠습니까?\n\n(※ 기존에 보관함에 저장해 두신 다른 명단 그룹은 삭제되지 않고 안전하게 유지됩니다)')) {
    SENSE_STATE.recipients = [];
    SENSE_STATE.currentIndex = 0;
    SENSE_STATE.activeGroupName = '';
    SENSE_STATE.activeGroupId = null;
    SENSE_STATE.customFields = null;
    localStorage.removeItem('sensetalk_active_group_name');
    localStorage.removeItem('sensetalk_last_group_id');
    renderAll();
    closeLoadGroupModal();
    showToast('✨ 수신자 명단이 비워졌습니다. 새 명단을 입력하거나 붙여넣으세요.');
  }
}

/**
 * 수신자 명단의 완료/패스 상태를 대기 상태로 초기화 (재발송용)
 */
function handleResetAllStatus(skipConfirm = false) {
  if (!SENSE_STATE.recipients || SENSE_STATE.recipients.length === 0) return;
  const nonPendingCount = SENSE_STATE.recipients.filter(r => r.status !== 'pending').length;
  if (nonPendingCount === 0) {
    showToast('ℹ️ 이미 모든 수신자가 대기 상태입니다.');
    return;
  }
  if (!skipConfirm && !confirm(`처리 완료/패스된 ${nonPendingCount}명의 상태를 '대기' 상태로 초기화하시겠습니까?\n\n(※ 초기화 후 처음부터 다시 연속 발송을 진행할 수 있습니다)`)) {
    return;
  }
  clearTimeout(_botSyncDebounceTimer);
  _suppressBotDoneSyncUntil = Date.now() + 3000;
  _lastBotEventTimestamp = Date.now() / 1000;

  SENSE_STATE.recipients.forEach(r => {
    r.status = 'pending';
    delete r.message;
    delete r.msg;
  });
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.isRecipientsSaved = false;

  renderAll();
  syncStateToBot(true);
  showToast(`🔄 모든 수신자(${nonPendingCount}명)의 상태가 '대기'로 초기화되었습니다.`);
}
const syncRecipientsToBot = syncStateToBot;

// ==========================================
// 13-1. 🚀 루미노트 CRM 포인트 발송 대기열 실시간 연동 엔진
// ==========================================

let _cachedCrmQueue = [];
let _crmQueueFilter = 'all'; // 'all' | 'unjoined' | 'joined'

/**
 * 센스톡 시작 시 대기열 뱃지 카운트 자동 체크
 */
async function checkCrmQueueCount() {
  try {
    const res = await fetch(`${SENSETALK_SUPABASE_URL}/rest/v1/sensetalk_notification_queue?status=eq.pending&select=id`, {
      headers: {
        'apikey': SENSETALK_ANON_KEY,
        'Authorization': `Bearer ${SENSETALK_ANON_KEY}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : 0;
      updateCrmQueueBadge(count);
    }
  } catch (err) {
    console.warn('[SensTalk CRM Queue] 카운트 조회 실패:', err);
  }
}

function updateCrmQueueBadge(count) {
  const badge = document.getElementById('crmQueueCountBadge');
  const btn = document.getElementById('crmQueueLoadBtn');
  if (badge) {
    badge.innerText = String(count);
    if (count > 0) {
      badge.className = 'text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-mono font-black shadow-2xs animate-pulse';
      if (btn) btn.classList.add('ring-2', 'ring-amber-400');
    } else {
      badge.className = 'text-[9px] px-1.5 py-0.2 rounded-full bg-slate-300 text-slate-700 font-mono font-black shadow-2xs';
      if (btn) btn.classList.remove('ring-2', 'ring-amber-400');
    }
  }
}

function openCrmQueueModal() {
  const modal = document.getElementById('crmQueueModal');
  if (modal) modal.classList.remove('hidden');
  fetchCrmQueueList();
}

function closeCrmQueueModal() {
  const modal = document.getElementById('crmQueueModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * 현재 대기열 목록 반환 (가입/미가입 구분 없이 전원 대상)
 */
function getVisibleCrmQueueItems() {
  return _cachedCrmQueue;
}

// 하위 호환 빈 함수
function switchCrmQueueFilter(filter) {}

/**
 * Supabase 대기열 목록 조회 및 모달 렌더링 (전원 한 번에 조회 및 기본 전체 선택)
 */
async function fetchCrmQueueList() {
  const container = document.getElementById('crmQueueListContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="p-8 text-center text-outline">
      <span class="material-symbols-outlined text-3xl animate-spin text-amber-500 mb-1">sync</span>
      <p class="text-xs font-bold text-slate-600">루미노트 CRM 대기열을 불러오는 중...</p>
    </div>
  `;

  try {
    const res = await fetch(`${SENSETALK_SUPABASE_URL}/rest/v1/sensetalk_notification_queue?status=eq.pending&order=created_at.desc&limit=200`, {
      headers: {
        'apikey': SENSETALK_ANON_KEY,
        'Authorization': `Bearer ${SENSETALK_ANON_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`조회 실패 (${res.status})`);
    }

    const data = await res.json();
    _cachedCrmQueue = Array.isArray(data) ? data : [];

    // 통계 산출
    const totalCount = _cachedCrmQueue.length;

    // 모달 및 헤더 뱃지 갱신
    const totalBadge = document.getElementById('crmQueueModalTotalBadge');
    if (totalBadge) totalBadge.innerText = `${totalCount}명`;

    updateCrmQueueBadge(totalCount);

    // 기본값: 대기열 전체 선택 (가입/미가입 구분 없이 전원 선택)
    _cachedCrmQueue.forEach(item => {
      item._selected = true;
    });

    renderCrmQueueCards();

  } catch (err) {
    console.error('[SensTalk CRM Queue] 조회 오류:', err);
    container.innerHTML = `
      <div class="p-8 text-center text-rose-500">
        <span class="material-symbols-outlined text-3xl mb-1">error</span>
        <p class="text-xs font-bold">대기열을 불러오지 못했습니다.</p>
        <p class="text-[11px] text-slate-400 mt-1">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * 대기열 카드 리스트 렌더링 (체크박스 없이 심플 카드 뷰)
 */
function renderCrmQueueCards() {
  const container = document.getElementById('crmQueueListContainer');
  if (!container) return;

  const visibleItems = getVisibleCrmQueueItems();

  if (visibleItems.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-outline">
        <span class="material-symbols-outlined text-4xl mb-1 text-slate-300">task_alt</span>
        <p class="text-xs font-bold text-slate-600">현재 대기 중인 고객이 없습니다.</p>
        <p class="text-[11px] text-slate-400 mt-1">루미노트에서 포인트를 지급하면 이곳에 자동 적재됩니다.</p>
      </div>
    `;
    updateCrmQueueSelectionSummary();
    return;
  }

  container.innerHTML = visibleItems.map((item) => {
    const vars = item.variables || {};
    const isJoined = item.metadata?.is_joined === true;
    const ptStr = vars['지급포인트'] || vars['포인트'] || '5,000P';
    const cleanTargetName = (item.target_name || '').replace(/\/없음|\/미정/g, '').trim();
    const custNick = vars['별명'] || vars['고객명'] || cleanTargetName;
    const memo = vars['포인트메모'] || '포인트 지급';
    const createdAtStr = item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const badgeHtml = isJoined
      ? `<span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">👥 가입(멘토단)</span>`
      : `<span class="px-1.5 py-0.5 rounded-md font-mono text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">📱 미가입</span>`;

    return `
      <div class="p-3 rounded-xl border border-slate-200 bg-white hover:border-amber-400 hover:bg-amber-50/40 flex items-center justify-between gap-3 transition-all select-none shadow-2xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="font-mono text-xs font-black text-slate-900 truncate">${escapeHtml(cleanTargetName)}</span>
            ${badgeHtml}
            <span class="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold bg-amber-500 text-white">${escapeHtml(ptStr)}</span>
            <span class="text-[9.5px] text-slate-400 font-mono">${createdAtStr}</span>
          </div>
          <div class="text-[11px] text-slate-600 truncate">
            💬 별명: <strong class="text-amber-900 font-bold">${escapeHtml(custNick)}</strong> (${escapeHtml(item.target_phone || '연락처 없음')}) · ${escapeHtml(memo)}
          </div>
        </div>
        <button class="w-7 h-7 rounded-lg hover:bg-rose-100 text-slate-300 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer shrink-0" onclick="deleteCrmQueueItem('${item.id}')" title="대기열에서 제외">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    `;
  }).join('');

  updateCrmQueueSelectionSummary();
}

/**
 * 하위 호환용 빈 함수들
 */
function toggleCrmQueueItemCheck() {}
function toggleCrmQueueSelectAll() {}

/**
 * 대기열 인원 및 등록 버튼 상태 동기화
 */
function updateCrmQueueSelectionSummary() {
  const totalCount = _cachedCrmQueue.length;

  const footerCount = document.getElementById('crmQueueFooterCount');
  if (footerCount) footerCount.innerText = `${totalCount}명`;

  const countBadge = document.getElementById('crmQueueModalTotalBadge');
  if (countBadge) countBadge.innerText = `${totalCount}명`;

  const loadBtn = document.getElementById('crmQueueLoadSelectedBtn');
  const loadBtnText = document.getElementById('crmQueueLoadBtnText');
  if (loadBtn && loadBtnText) {
    loadBtn.disabled = totalCount === 0;
    loadBtnText.innerText = totalCount > 0 ? `명단에 등록하기 (${totalCount}명)` : '대기자가 없습니다';
  }
}

/**
 * 대기열 고객 전원을 센스톡 수신자 명단으로 등록 + 썬드리머 3단 스마트 블록 자동 설정
 */
function loadSelectedCrmQueueToRecipients() {
  if (!_cachedCrmQueue || _cachedCrmQueue.length === 0) {
    showToast('⚠️ 대기열에 고객이 없습니다.');
    return;
  }

  // 1. 수신자 명단 변환 (가로 축소: 이름, 별명, 가입여부, 포인트메모 딱 4개만 깔끔하게 구성)
  const converted = _cachedCrmQueue.map(item => {
    const vars = item.variables || {};
    const isJoined = item.metadata?.is_joined === true || vars['가입여부'] === '가입';
    const cleanTargetName = (item.target_name || '').replace(/\/없음|\/미정/g, '').trim();
    const smartNick = vars['별명'] || vars['고객명'] || cleanTargetName;
    const memo = vars['포인트메모'] || '포인트 지급';

    return {
      id: `crm_q_${item.id}`,
      name: cleanTargetName, // 1열: PC 카톡 친구 검색용 (맨 앞)
      별명: smartNick,        // 2열: 본문 치환용 스마트 별명 (#{별명})
      가입여부: isJoined ? '가입' : '미가입', // 3열: 조건부 발송용
      포인트메모: memo,       // 4열: 적립 메모 (#{포인트메모})
      status: 'pending',
      _is_joined: isJoined,
      _phone: item.target_phone || '',
      _crm_queue_id: item.id  // 발송 완료 후 상태 업데이트용
    };
  });

  SENSE_STATE.recipients = converted;
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.activeGroupName = `루미노트 CRM 대기열 (${converted.length}명)`;
  SENSE_STATE.activeGroupId = null;
  // 1열 '이름', 2열 '별명', 3열 '가입여부', 4열 '포인트메모' (초슬림 4컬럼)
  SENSE_STATE.customFields = ['이름', '별명', '가입여부', '포인트메모'];
  SENSE_STATE.isRecipientsSaved = false;
  SENSE_STATE.dispatchMode = 'sundreamer'; // ☀️ 썬드리머 발송 모드 활성화

  // 2. 썬드리머 전용 3단 스마트 블록 자동 조립 (앱에서 포인트 확인하므로 #{지급포인트} 변수 배제)
  SENSE_STATE.blocks = [
    {
      id: 'block-crm-point-notice',
      type: 'text',
      title: '포인트 적립 안내',
      content: `안녕하세요 #{별명}님!\n\n회원님의 소중한 치유 여정을 응원하며 썬드림 포인트가 성공적으로 적립되었습니다! (#{포인트메모})\n\n💡 이번에 적립된 포인트와 잔여 포인트는 '썬드리머' 앱에서 언제든지 간편하게 확인하실 수 있습니다.`,
      skipIfJoined: false, // 공통 발송
      isAd: false,
      optOutNum: '080-880-7766'
    },
    {
      id: 'block-crm-app-invite',
      type: 'text',
      title: '썬드리머 앱 가입 & 링크 안내',
      content: `🔗 썬드리머 앱 바로가기: https://sundreamer.app\n(확인 경로: MY ➔ 포인트)\n(아직 가입 전이시라면, 이메일로 6자리 인증번호만 입력하시면 3초 만에 로그인 완료!)`,
      skipIfJoined: true, // 🌟 가입 회원(멘토단)에게는 자동 패스(제외)!
      isAd: false,
      optOutNum: '080-880-7766'
    },
    {
      id: 'block-crm-usage-info',
      type: 'text',
      title: '포인트 사용처 & 인사',
      content: `적립된 포인트는 썬드림 조사기 및 교체용 램프 구매 시 카카오톡 채널 상담을 통해 현금처럼 할인 적용하여 사용하실 수 있습니다.\n\n늘 건강하고 평안한 하루 되세요. 즐빛하세요!`,
      skipIfJoined: false, // 공통 발송
      isAd: false,
      optOutNum: '080-880-7766'
    }
  ];

  // 3. 스마트 조건부 발송 제어 바 활성화 (가입 회원은 B2 블록 패스)
  _dispatchCondition.active = true;
  _dispatchCondition.field = '가입여부';
  _dispatchCondition.operator = 'equals';
  _dispatchCondition.value = '가입';
  _dispatchCondition.skipBlockIndices = [1]; // B2
  applyConditionToBlocks();

  renderAll();
  syncStateToBot(true);
  closeCrmQueueModal();
  showToast(`🚀 루미노트 CRM 대기열 ${converted.length}명 전원 등록 완료!\n[카카오톡 연속 발송]으로 시작하세요.`);
}

/**
 * 단건 장전
 */
function loadSingleCrmQueueItem(queueId) {
  const item = _cachedCrmQueue.find(q => q.id === queueId);
  if (!item) return;

  const vars = item.variables || {};
  const isJoined = item.metadata?.is_joined === true || vars['가입여부'] === '가입';
  const cleanTargetName = (item.target_name || '').replace(/\/없음|\/미정/g, '').trim();
  const smartNick = vars['별명'] || vars['고객명'] || cleanTargetName;
  const memo = vars['포인트메모'] || '포인트 지급';

  const singleRec = {
    id: `crm_q_${item.id}`,
    name: cleanTargetName,
    별명: smartNick,
    가입여부: isJoined ? '가입' : '미가입',
    포인트메모: memo,
    status: 'pending',
    _is_joined: isJoined,
    _phone: item.target_phone || '',
    _crm_queue_id: item.id
  };

  SENSE_STATE.recipients = [singleRec];
  SENSE_STATE.currentIndex = 0;
  SENSE_STATE.activeGroupName = `CRM 1:1 발송 (${cleanTargetName})`;
  SENSE_STATE.activeGroupId = null;
  SENSE_STATE.customFields = ['이름', '별명', '가입여부', '포인트메모'];
  SENSE_STATE.isRecipientsSaved = false;
  SENSE_STATE.dispatchMode = 'sundreamer';

  SENSE_STATE.blocks = [
    {
      id: 'block-crm-point-notice',
      type: 'text',
      title: '포인트 적립 안내',
      content: `안녕하세요 #{별명}님!\n\n회원님의 소중한 치유 여정을 응원하며 썬드림 포인트가 성공적으로 적립되었습니다! (#{포인트메모})\n\n💡 이번에 적립된 포인트와 잔여 포인트는 '썬드리머' 앱에서 언제든지 간편하게 확인하실 수 있습니다.`,
      skipIfJoined: false,
      isAd: false,
      optOutNum: '080-880-7766'
    },
    {
      id: 'block-crm-app-invite',
      type: 'text',
      title: '썬드리머 앱 가입 & 링크 안내',
      content: `🔗 썬드리머 앱 바로가기: https://sundreamer.app\n(확인 경로: MY ➔ 포인트)\n(아직 가입 전이시라면, 이메일로 6자리 인증번호만 입력하시면 3초 만에 로그인 완료!)`,
      skipIfJoined: true, // 🌟 가입 회원 패스
      isAd: false,
      optOutNum: '080-880-7766'
    },
    {
      id: 'block-crm-usage-info',
      type: 'text',
      title: '포인트 사용처 & 인사',
      content: `적립된 포인트는 썬드림 조사기 및 교체용 램프 구매 시 카카오톡 채널 상담을 통해 현금처럼 할인 적용하여 사용하실 수 있습니다.\n\n늘 건강하고 평안한 하루 되세요. 즐빛하세요!`,
      skipIfJoined: false,
      isAd: false,
      optOutNum: '080-880-7766'
    }
  ];

  // 스마트 조건부 발송 제어 바 활성화 (가입 회원은 B2 블록 패스)
  _dispatchCondition.active = true;
  _dispatchCondition.field = '가입여부';
  _dispatchCondition.operator = 'equals';
  _dispatchCondition.value = '가입';
  _dispatchCondition.skipBlockIndices = [1]; // B2
  applyConditionToBlocks();

  renderAll();
  syncStateToBot(true);
  closeCrmQueueModal();
  showToast(`👉 [${cleanTargetName}] (${isJoined ? '가입 회원' : '미가입'}) 고객님이 장전되었습니다. [카카오톡 연속 발송]을 누르세요.`);
}

/**
 * 대기열에서 개별 항목 취소/제외
 */
async function deleteCrmQueueItem(queueId) {
  if (!confirm('해당 고객을 대기열에서 제외하시겠습니까?')) return;

  try {
    const res = await fetch(`${SENSETALK_SUPABASE_URL}/rest/v1/sensetalk_notification_queue?id=eq.${queueId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SENSETALK_ANON_KEY,
        'Authorization': `Bearer ${SENSETALK_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'cancelled' })
    });
    if (res.ok) {
      showToast('대기열에서 제외되었습니다.');
      fetchCrmQueueList();
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * 발송 성공 시 대기열 원장 상태를 'sent'로 업데이트
 */
async function markCrmQueueAsSent(queueId) {
  if (!queueId) return;
  try {
    await fetch(`${SENSETALK_SUPABASE_URL}/rest/v1/sensetalk_notification_queue?id=eq.${queueId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SENSETALK_ANON_KEY,
        'Authorization': `Bearer ${SENSETALK_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
    });
    console.log(`[SensTalk CRM Queue] ✅ 대기열 ID ${queueId} 발송 완료(sent) 처리 완료`);
    checkCrmQueueCount();
  } catch (err) {
    console.warn('[SensTalk CRM Queue] 완료 상태 갱신 실패:', err);
  }
}

// ==========================================
// 14. 메시지 템플릿(텍스트+사진+옵션) 보관함 및 저장 엔진
// ==========================================

function initTemplates() {
  try {
    const raw = localStorage.getItem('sensetalk_templates');
    if (raw) {
      SENSE_STATE.templates = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('저장된 템플릿 파싱 오류:', e);
    SENSE_STATE.templates = [];
  }

  if (!Array.isArray(SENSE_STATE.templates)) {
    SENSE_STATE.templates = [];
  }

  // 1. 목업/시드 템플릿 완전 제거 (사용자가 직접 저장한 템플릿만 유지)
  const mockupIds = ['tmpl_seed_1', 'tmpl_seed_2', 'tmpl_seed_3', 'tmpl_seed_4'];
  const mockupNames = [
    '1:1 사진 첨부 미팅 안내장',
    'VIP 고객 안부 및 감사 인사',
    '정기 모임 / 동창회 일정 공지',
    '특별 프로모션 (광고/080 안심 준수)',
    '특별 프로모션'
  ];

  const beforeCount = SENSE_STATE.templates.length;
  SENSE_STATE.templates = SENSE_STATE.templates.filter(tmpl => {
    if (!tmpl) return false;
    if (tmpl.id && (tmpl.id.startsWith('tmpl_seed_') || mockupIds.includes(tmpl.id))) return false;
    if (tmpl.name && mockupNames.includes(tmpl.name)) return false;
    return true;
  });

  // 목업 찌꺼기가 걸러졌거나 스토리지에 아직 반영되지 않았으면 즉시 저장
  if (SENSE_STATE.templates.length !== beforeCount || !localStorage.getItem('sensetalk_templates')) {
    saveTemplatesToStorage();
  }

  // 2. 새로고침 시 마지막 템플릿을 자동으로 캔버스에 띄우기
  if (SENSE_STATE.templates.length > 0) {
    const lastId = localStorage.getItem('sensetalk_last_template_id');
    const lastName = localStorage.getItem('sensetalk_active_template_name');

    let targetTmpl = null;
    if (lastId) {
      targetTmpl = SENSE_STATE.templates.find(t => t.id === lastId);
    }
    if (!targetTmpl && lastName) {
      targetTmpl = SENSE_STATE.templates.find(t => t.name === lastName);
    }
    if (!targetTmpl) {
      targetTmpl = SENSE_STATE.templates[0];
    }

    if (targetTmpl && Array.isArray(targetTmpl.blocks) && targetTmpl.blocks.length > 0) {
      SENSE_STATE.blocks = JSON.parse(JSON.stringify(targetTmpl.blocks));
      SENSE_STATE.activeTemplateName = targetTmpl.name;
      localStorage.setItem('sensetalk_active_template_name', targetTmpl.name);
      localStorage.setItem('sensetalk_last_template_id', targetTmpl.id);
    }
  } else {
    SENSE_STATE.activeTemplateName = '';
    localStorage.removeItem('sensetalk_active_template_name');
    localStorage.removeItem('sensetalk_last_template_id');
  }

  updateTemplateBadges();
}

function saveTemplatesToStorage() {
  try {
    localStorage.setItem('sensetalk_templates', JSON.stringify(SENSE_STATE.templates));
    if (SENSE_STATE.activeTemplateName) {
      localStorage.setItem('sensetalk_active_template_name', SENSE_STATE.activeTemplateName);
    } else {
      localStorage.removeItem('sensetalk_active_template_name');
    }
  } catch (e) {
    console.error('템플릿 저장 실패:', e);
  }
  updateTemplateBadges();
}

function updateTemplateBadges() {
  const badge = document.getElementById('currentActiveTemplateBadge');
  if (badge) {
    const name = SENSE_STATE.activeTemplateName;
    if (name) {
      badge.innerText = name;
      badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold border border-purple-200 shadow-2xs max-w-[130px] sm:max-w-[150px] truncate cursor-pointer hover:bg-purple-200 transition-all";
      badge.title = `현재 활성 템플릿: ${name} (클릭 시 보관함 열기)`;
    } else {
      badge.innerText = '템플릿 없음';
      badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium border border-slate-200 shadow-2xs max-w-[130px] sm:max-w-[150px] truncate cursor-pointer hover:bg-slate-200 transition-all";
      badge.title = '저장되지 않은 템플릿입니다 (클릭 시 보관함 열기)';
    }
  }
  const countBadge = document.getElementById('savedTemplatesCountBadge');
  if (countBadge) {
    countBadge.innerText = (SENSE_STATE.templates || []).length;
  }
}

function handleNewTemplate() {
  const currentContent = SENSE_STATE.blocks.map(b => b.content || b.fileName || '').join('').trim();
  if (currentContent && SENSE_STATE.blocks.length > 0) {
    if (!confirm('현재 캔버스를 비우고 [새 템플릿] 작성을 시작하시겠습니까?\n\n(※ 기존에 보관함에 저장해 두신 템플릿은 삭제되지 않고 안전하게 유지됩니다)')) {
      return;
    }
  }

  SENSE_STATE.blocks = [
    {
      id: 'block-' + Date.now(),
      type: 'text',
      title: '기본 텍스트',
      content: '안녕하세요 #{이름}님!\n',
      isAd: false,
      optOutNum: '080-880-7766'
    }
  ];
  SENSE_STATE.activeTemplateName = '';
  localStorage.removeItem('sensetalk_active_template_name');
  localStorage.removeItem('sensetalk_last_template_id');

  renderAll();
  showToast('✨ 빈 캔버스가 준비되었습니다. 새 메시지 작성을 시작하세요!');
}

function updateSaveTemplateModalFeedback() {
  const input = document.getElementById('saveTemplateNameInput');
  const noticeEl = document.getElementById('saveTemplateModeNotice');
  const confirmBtn = document.getElementById('saveTemplateConfirmBtn');
  if (!input || !noticeEl) return;

  const name = input.value.trim();
  if (!name) {
    noticeEl.innerHTML = '';
    if (confirmBtn) confirmBtn.innerText = '보관함에 저장';
    return;
  }

  const exists = SENSE_STATE.templates.some(t => t.name === name);
  if (exists) {
    noticeEl.innerHTML = `<span class="text-amber-700 font-bold flex items-center gap-1"><span>🔄</span> 기존 <strong>"${escapeHtml(name)}"</strong> 템플릿을 현재 내용으로 덮어씁니다 (수정 업데이트).</span>`;
    if (confirmBtn) confirmBtn.innerText = '기존 템플릿 덮어쓰기';
  } else {
    noticeEl.innerHTML = `<span class="text-primary font-bold flex items-center gap-1"><span>✨</span> 새로운 <strong>"${escapeHtml(name)}"</strong> 템플릿으로 보관함에 새로 추가됩니다.</span>`;
    if (confirmBtn) confirmBtn.innerText = '새 템플릿 추가 저장';
  }
}

function openSaveTemplateModal() {
  const modal = document.getElementById('saveTemplateModal');
  const input = document.getElementById('saveTemplateNameInput');
  const summaryEl = document.getElementById('saveTemplateBlocksSummary');

  if (summaryEl) {
    const textCount = SENSE_STATE.blocks.filter(b => b.type === 'text').length;
    const imgCount = SENSE_STATE.blocks.filter(b => b.type === 'image').length;
    const firstImg = SENSE_STATE.blocks.find(b => b.type === 'image');

    summaryEl.innerHTML = `
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold text-[10.5px]">텍스트 블록 ${textCount}개</span>
        ${imgCount > 0 ? `<span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 font-bold text-[10.5px]">🖼️ 사진 블록 ${imgCount}개 (${escapeHtml(firstImg?.fileName || 'image.png')})</span>` : ''}
      </div>
    `;
  }

  if (input) {
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '');
    input.value = SENSE_STATE.activeTemplateName
      ? SENSE_STATE.activeTemplateName
      : `${dateStr} 맞춤 템플릿`;
    setTimeout(() => { input.focus(); input.select(); }, 100);
  }

  updateSaveTemplateModalFeedback();
  if (modal) modal.classList.remove('hidden');
}

function closeSaveTemplateModal() {
  const modal = document.getElementById('saveTemplateModal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveTemplateConfirm() {
  const input = document.getElementById('saveTemplateNameInput');
  const name = (input ? input.value : '').trim() || '새 메시지 템플릿';

  if (!SENSE_STATE.blocks || SENSE_STATE.blocks.length === 0) {
    showToast('⚠️ 저장할 메시지 블록이 없습니다.');
    return;
  }

  const existingIdx = SENSE_STATE.templates.findIndex(t => t.name === name);
  const nowStr = new Date().toLocaleDateString('ko-KR');

  const payload = {
    name: name,
    updatedAt: nowStr,
    blocks: JSON.parse(JSON.stringify(SENSE_STATE.blocks))
  };

  let savedId;
  const isOverwriting = existingIdx >= 0;

  if (isOverwriting) {
    savedId = SENSE_STATE.templates[existingIdx].id;
    SENSE_STATE.templates[existingIdx] = {
      ...payload,
      id: savedId
    };
  } else {
    savedId = 'tmpl_' + Date.now();
    SENSE_STATE.templates.unshift({
      ...payload,
      id: savedId
    });
  }

  SENSE_STATE.activeTemplateName = name;
  localStorage.setItem('sensetalk_active_template_name', name);
  localStorage.setItem('sensetalk_last_template_id', savedId);
  saveTemplatesToStorage();
  closeSaveTemplateModal();

  if (isOverwriting) {
    showToast(`🔄 기존 "${name}" 템플릿이 현재 내용으로 덮어쓰기(업데이트)되었습니다!`);
  } else {
    showToast(`✨ 새 템플릿 "${name}"이 보관함에 안전하게 추가 저장되었습니다!`);
  }
}

function openTemplateBoxModal() {
  const modal = document.getElementById('templateBoxModal');
  renderTemplateBoxList();
  if (modal) modal.classList.remove('hidden');
}

function closeTemplateBoxModal() {
  const modal = document.getElementById('templateBoxModal');
  if (modal) modal.classList.add('hidden');
}

function renderTemplateBoxList() {
  const container = document.getElementById('templateBoxListContainer');
  if (!container) return;

  if (!SENSE_STATE.templates || SENSE_STATE.templates.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-outline">
        <span class="material-symbols-outlined text-4xl mb-1 text-outline/50">bookmark_border</span>
        <p class="text-xs">저장된 템플릿이 없습니다.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = SENSE_STATE.templates.map(tmpl => {
    const isCurrent = tmpl.name === SENSE_STATE.activeTemplateName;
    const textBlocks = tmpl.blocks.filter(b => b.type === 'text');
    const imgBlocks = tmpl.blocks.filter(b => b.type === 'image');
    const firstText = textBlocks[0]?.content || '';
    const snippet = firstText.replace(/\s+/g, ' ').slice(0, 60) + (firstText.length > 60 ? '...' : '');
    const firstImg = imgBlocks[0];

    return `
      <div class="p-3.5 rounded-2xl border ${isCurrent ? 'border-primary bg-primary/5 shadow-xs' : 'border-outline-variant/30 bg-surface-container-lowest hover:border-primary/40'} flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1.5 flex-wrap">
            <span class="font-bold text-xs sm:text-sm text-on-surface">${escapeHtml(tmpl.name)}</span>
            <span class="px-2 py-0.2 rounded-full font-mono text-[10px] font-semibold bg-primary/10 text-primary">블록 ${tmpl.blocks.length}개</span>
            ${imgBlocks.length > 0 ? `<span class="px-2 py-0.2 rounded-full font-mono text-[10px] font-bold bg-amber-500/15 text-amber-800">🖼️ 사진 첨부</span>` : ''}
            ${isCurrent ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-primary text-on-primary font-bold">현재 캔버스</span>' : ''}
          </div>

          <!-- 본문 및 이미지 미리보기 -->
          <div class="flex items-center gap-2.5 bg-surface-container-low p-2 rounded-xl border border-outline-variant/20">
            ${
              firstImg && firstImg.dataUrl
                ? `<img src="${firstImg.dataUrl}" class="w-10 h-10 rounded-lg object-cover border border-black/10 shrink-0">`
                : (firstImg ? `<div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary text-[10px] font-bold shrink-0">사진</div>` : '')
            }
            <div class="text-[11px] text-on-surface-variant line-clamp-2 leading-relaxed">
              ${escapeHtml(snippet || '(텍스트 문구 없음)')}
            </div>
          </div>

          <div class="text-[10px] text-outline mt-1 font-mono">
            저장일: ${tmpl.updatedAt || '최근'}
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button class="px-3.5 py-2 rounded-xl ${isCurrent ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container hover:bg-primary hover:text-on-primary text-on-surface font-semibold'} text-xs shadow-2xs transition-all cursor-pointer flex items-center gap-1" onclick="applyTemplateById('${tmpl.id}')">
            <span class="material-symbols-outlined text-[15px]">play_arrow</span>
            <span>${isCurrent ? '다시 적용' : '캔버스에 적용'}</span>
          </button>
          <button class="w-8 h-8 rounded-xl hover:bg-error/10 text-outline hover:text-error flex items-center justify-center transition-colors cursor-pointer" onclick="deleteTemplateById('${tmpl.id}')" title="템플릿 삭제">
            <span class="material-symbols-outlined text-[17px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function applyTemplateById(tmplId) {
  const tmpl = SENSE_STATE.templates.find(t => t.id === tmplId);
  if (!tmpl) return;

  // 깊은 복사로 캔버스 블록 적용
  SENSE_STATE.blocks = JSON.parse(JSON.stringify(tmpl.blocks));
  SENSE_STATE.activeTemplateName = tmpl.name;

  localStorage.setItem('sensetalk_active_template_name', tmpl.name);
  localStorage.setItem('sensetalk_last_template_id', tmpl.id);
  renderBlocks();
  renderKakaoPreview();
  syncStateToBot();
  updateTemplateBadges();
  closeTemplateBoxModal();
  showToast(`📑 "${tmpl.name}" 템플릿이 캔버스에 즉시 적용되었습니다!`);
}

function deleteTemplateById(tmplId) {
  const target = SENSE_STATE.templates.find(t => t.id === tmplId);
  if (!target) return;

  if (confirm(`정말 "${target.name}" 템플릿을 삭제하시겠습니까?`)) {
    SENSE_STATE.templates = SENSE_STATE.templates.filter(t => t.id !== tmplId);
    const lastId = localStorage.getItem('sensetalk_last_template_id');
    if (lastId === tmplId || SENSE_STATE.activeTemplateName === target.name) {
      if (SENSE_STATE.templates.length > 0) {
        localStorage.setItem('sensetalk_last_template_id', SENSE_STATE.templates[0].id);
        localStorage.setItem('sensetalk_active_template_name', SENSE_STATE.templates[0].name);
        SENSE_STATE.activeTemplateName = SENSE_STATE.templates[0].name;
      } else {
        localStorage.removeItem('sensetalk_last_template_id');
        localStorage.removeItem('sensetalk_active_template_name');
        SENSE_STATE.activeTemplateName = '';
      }
    }
    saveTemplatesToStorage();
    renderTemplateBoxList();
    showToast(`🗑️ "${target.name}" 템플릿이 삭제되었습니다.`);
  }
}

// ==========================================
// 19. 자주 쓰는 상용구(텍스트 & 이미지) 서랍 & 레고 블록 믹스
// ==========================================

const DEFAULT_SNIPPETS = [
  {
    id: 'snip-1',
    title: '썬드림 고객 정기 안부 인사',
    category: '인사',
    type: 'text',
    content: '안녕하세요 #{이름} 고객님! 썬드림 고객지원팀입니다.\n오늘도 편안하고 건강한 하루 보내고 계신가요? 늘 썬드림과 함께해 주셔서 진심으로 감사드립니다.',
    createdAt: '2026-09-22',
    isFavorite: true
  },
  {
    id: 'snip-2',
    title: '국민은행 입금 계좌 및 세금계산서 안내',
    category: '계좌',
    type: 'text',
    content: '[썬드림 공식 결제 계좌 안내]\n• 입금계좌: 국민은행 814301-04-128956 (예금주: 썬드림 주식회사)\n• 입금 완료 후 입금자 성함을 회신 주시면 즉시 입금 확인 및 신속 출고가 진행됩니다.\n(사업자 세금계산서나 현금영수증 발행을 원하시면 사업자등록증 또는 휴대폰번호를 남겨주세요.)',
    createdAt: '2026-09-22',
    isFavorite: true
  },
  {
    id: 'snip-3',
    title: '썬드리머 공식 웹앱 간편가입 및 5,000P 혜택 안내',
    category: '앱가입',
    type: 'text',
    content: '📱 [썬드리머 공식 웹앱 오픈 및 회원 혜택 안내]\n#{이름} 고객님, 썬드림 환우분들을 위한 공식 멤버십 앱 "썬드리머"가 오픈되었습니다!\n\n🔗 앱 바로가기: https://sundreamer.app\n(네이버 이메일로 6자리 인증번호만 넣으시면 3초 만에 로그인 완료!)\n\n🎁 신규 가입 즉시 5,000P 웰컴 포인트 지급\n✨ 매일 자외선 조사 일기 작성 시 포인트 추가 적립\n🛒 전용 멤버십 스토어에서 램프/부품 포인트 할인 구매',
    createdAt: '2026-09-22',
    isFavorite: true
  },
  {
    id: 'snip-4',
    title: 'UVB 적정램프 권장 교체주기 가이드',
    category: '제품',
    type: 'text',
    content: '💡 [UVB 조사기 램프 관리 안내]\n자외선 치료용 램프는 겉보기에 불이 켜지더라도, 권장 유효 시간(약 300~500시간 또는 사용 1~2년) 경과 시 파장 조도가 서서히 저하됩니다. 최적의 치료 효과를 위해 정기적인 램프 교체와 점검을 추천드립니다.',
    createdAt: '2026-09-22',
    isFavorite: false
  },
  {
    id: 'snip-5',
    title: '기기 A/S 접수 및 본사 점검 절차 안내',
    category: 'AS',
    type: 'text',
    content: '🔧 [썬드림 A/S 센터 접수 안내]\n기기 이상 증상이나 부품 점검이 필요하신 경우, 기기 본체를 안전하게 완충 포장하여 아래 본사 주소로 택배 발송해 주시면 됩니다.\n• 본사 주소: (자세한 주소 기재)\n• 입고 즉시 엔지니어가 꼼꼼히 점검 후 유선으로 점검 결과를 안내해 드립니다.',
    createdAt: '2026-09-22',
    isFavorite: false
  },
  {
    id: 'snip-6',
    title: '썬드림 정품 인증 및 자외선요법 가이드 카드',
    category: '이미지',
    type: 'image',
    fileName: 'sundream_guide_card.png',
    fileSize: '18KB',
    dimensions: '600 x 400px',
    dataUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%231e1b4b"/><circle cx="300" cy="170" r="80" fill="%23f59e0b" opacity="0.3"/><circle cx="300" cy="170" r="50" fill="%23f59e0b"/><text x="300" y="280" fill="%23ffffff" font-size="24" font-weight="bold" text-anchor="middle" font-family="sans-serif">☀️ 썬드림 정품 보증 &amp; 사용 가이드</text><text x="300" y="320" fill="%23cbd5e1" font-size="15" text-anchor="middle" font-family="sans-serif">12년 전통 정품 광선치료 시스템</text></svg>',
    createdAt: '2026-09-22',
    isFavorite: true
  }
];

const DEFAULT_SNIPPET_CATEGORIES = [
  { id: '전체', name: '전체', icon: 'apps' },
  { id: '이미지', name: '이미지', icon: 'image' },
  { id: '일반', name: '일반', icon: 'folder' },
  { id: '인사', name: '인사', icon: 'chat' },
  { id: '계좌', name: '계좌/결제', icon: 'account_balance' },
  { id: '앱가입', name: '썬드리머앱', icon: 'smartphone' },
  { id: '제품', name: '램프/제품', icon: 'lightbulb' },
  { id: 'AS', name: 'AS/점검', icon: 'build' }
];

let SNIPPET_CATEGORIES = [];

/**
 * 카테고리 로컬스토리지 로드
 */
function loadSnippetCategories() {
  try {
    const raw = localStorage.getItem('sensetalk_snippet_categories');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        SNIPPET_CATEGORIES = parsed;
      }
    }
  } catch (e) {
    console.error('카테고리 로드 실패:', e);
  }

  if (!Array.isArray(SNIPPET_CATEGORIES) || SNIPPET_CATEGORIES.length === 0) {
    SNIPPET_CATEGORIES = JSON.parse(JSON.stringify(DEFAULT_SNIPPET_CATEGORIES));
    saveSnippetCategoriesToStorage();
  }

  // 필수 시스템 카테고리(전체, 이미지, 일반)가 누락되지 않도록 보장
  if (!SNIPPET_CATEGORIES.some(c => c.id === '전체')) {
    SNIPPET_CATEGORIES.unshift({ id: '전체', name: '전체', icon: 'apps' });
  }
  if (!SNIPPET_CATEGORIES.some(c => c.id === '이미지')) {
    const allIdx = SNIPPET_CATEGORIES.findIndex(c => c.id === '전체');
    SNIPPET_CATEGORIES.splice(allIdx + 1, 0, { id: '이미지', name: '이미지', icon: 'image' });
  }
  if (!SNIPPET_CATEGORIES.some(c => c.id === '일반')) {
    const imgIdx = SNIPPET_CATEGORIES.findIndex(c => c.id === '이미지');
    SNIPPET_CATEGORIES.splice(imgIdx + 1, 0, { id: '일반', name: '일반', icon: 'folder' });
  } else {
    // '일반' 탭을 항상 '이미지' 바로 다음 위치(고정 탭 그룹)로 재배치
    const imgIdx = SNIPPET_CATEGORIES.findIndex(c => c.id === '이미지');
    const generalIdx = SNIPPET_CATEGORIES.findIndex(c => c.id === '일반');
    if (imgIdx !== -1 && generalIdx !== -1 && generalIdx !== imgIdx + 1) {
      const generalItem = SNIPPET_CATEGORIES.splice(generalIdx, 1)[0];
      const newImgIdx = SNIPPET_CATEGORIES.findIndex(c => c.id === '이미지');
      SNIPPET_CATEGORIES.splice(newImgIdx + 1, 0, generalItem);
    }
  }
}

/**
 * 카테고리 로컬스토리지 저장
 */
function saveSnippetCategoriesToStorage() {
  try {
    localStorage.setItem('sensetalk_snippet_categories', JSON.stringify(SNIPPET_CATEGORIES));
  } catch (e) {
    console.error('카테고리 저장 실패:', e);
  }
}

let _editingSnippetId = null;
let _snippetModalType = 'text';
let _tempSnippetImageData = { dataUrl: '', fileName: '', fileSize: '', dimensions: '' };

/**
 * 상용구 초기 로드 (localStorage 동기화 및 기본 목업 주입)
 */
function initSnippets() {
  loadSnippetCategories();
  try {
    const raw = localStorage.getItem('sensetalk_snippet_library');
    if (raw) {
      SENSE_STATE.snippets = JSON.parse(raw);
    }
  } catch (e) {
    console.error('상용구 로드 실패:', e);
  }

  if (!Array.isArray(SENSE_STATE.snippets) || SENSE_STATE.snippets.length === 0) {
    SENSE_STATE.snippets = JSON.parse(JSON.stringify(DEFAULT_SNIPPETS));
    saveSnippetsToStorage();
  } else {
    // 기존 '택배' 카테고리가 남아있을 경우 '앱가입'으로 자동 업그레이드
    let migrated = false;
    SENSE_STATE.snippets.forEach(s => {
      if (s.category === '택배') {
        s.category = '앱가입';
        s.title = '썬드리머 공식 웹앱 간편가입 및 5,000P 혜택 안내';
        s.content = '📱 [썬드리머 공식 웹앱 오픈 및 회원 혜택 안내]\n#{이름} 고객님, 썬드림 환우분들을 위한 공식 멤버십 앱 "썬드리머"가 오픈되었습니다!\n\n🔗 앱 바로가기: https://sundreamer.app\n(네이버 이메일로 6자리 인증번호만 넣으시면 3초 만에 로그인 완료!)\n\n🎁 신규 가입 즉시 5,000P 웰컴 포인트 지급\n✨ 매일 자외선 조사 일기 작성 시 포인트 추가 적립\n🛒 전용 멤버십 스토어에서 램프/부품 포인트 할인 구매';
        migrated = true;
      }
    });
    if (migrated) {
      saveSnippetsToStorage();
    }
  }
}

/**
 * 상용구 localStorage 저장
 */
function saveSnippetsToStorage() {
  try {
    localStorage.setItem('sensetalk_snippet_library', JSON.stringify(SENSE_STATE.snippets));
  } catch (e) {
    console.error('상용구 저장 실패:', e);
  }
  updateSnippetBadgeCount();
}

/**
 * 서랍 헤더 뱃지 수 갱신
 */
function updateSnippetBadgeCount() {
  const badge = document.getElementById('snippetDrawerCountBadge');
  if (badge) {
    badge.innerText = `${(SENSE_STATE.snippets || []).length}개`;
  }
}

/**
 * 상용구 서랍 접기 / 펼치기 토글
 */
function toggleSnippetDrawer() {
  SENSE_STATE.isSnippetDrawerOpen = !SENSE_STATE.isSnippetDrawerOpen;
  localStorage.setItem('sensetalk_snippet_drawer_open', SENSE_STATE.isSnippetDrawerOpen ? 'true' : 'false');
  renderSnippetDrawer();
  if (SENSE_STATE.isSnippetDrawerOpen) {
    setTimeout(updateSnippetCategoryScrollIndicators, 100);
  }
}

/**
 * 상용구 서랍 렌더링
 */
function renderSnippetDrawer() {
  const wrapperEl = document.getElementById('snippetDrawerWrapper');
  const sectionEl = document.getElementById('snippetDrawerSection');
  const headerEl = document.getElementById('snippetDrawerHeader');
  const titleLeft = document.getElementById('snippetDrawerTitleLeft');
  const titleRight = document.getElementById('snippetDrawerTitleRight');
  const bodyEl = document.getElementById('snippetDrawerBody');
  const toggleIconEl = document.getElementById('snippetDrawerToggleIcon');
  if (!sectionEl || !bodyEl) return;

  updateSnippetBadgeCount();

  if (SENSE_STATE.isSnippetDrawerOpen) {
    // 1. 펼쳐진 상태: 좌측 들여쓰기 여백(pl-6) + 굵은 테두리(border-2 & border-l-[6px]) + 독특한 앰버/오렌지 제목줄
    if (wrapperEl) {
      wrapperEl.className = 'w-full pl-6 pr-1 pt-1 pb-1.5 flex flex-col shrink-0 select-none transition-all';
    }
    sectionEl.className = 'w-full rounded-2xl border-2 border-amber-400 border-l-[6px] border-l-amber-500 bg-amber-50/10 shadow-md flex flex-col overflow-hidden transition-all';
    if (headerEl) {
      headerEl.className = 'w-full py-2 px-3.5 flex items-center justify-between bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 text-white cursor-pointer hover:brightness-105 transition-all select-none shadow-2xs';
    }
    if (titleLeft) {
      titleLeft.classList.remove('hidden');
      titleLeft.classList.add('flex');
    }
    if (titleRight) {
      titleRight.classList.add('hidden');
    }
    const badge = document.getElementById('snippetDrawerCountBadge');
    if (badge) {
      badge.className = 'px-1.5 py-0.2 rounded-full bg-white text-amber-900 font-mono text-[9.5px] font-black shadow-2xs';
    }
    bodyEl.classList.remove('hidden');
    if (toggleIconEl) {
      toggleIconEl.innerHTML = '<span class="material-symbols-outlined text-[14px]">folder_open</span>';
      toggleIconEl.className = 'flex items-center justify-center w-5 h-5 rounded-md bg-white/20 hover:bg-white/30 text-white border border-white/30 shadow-2xs';
    }
  } else {
    // 2. 접힌 상태: 우측에 사이즈를 줄여 붙어있는 미니 알약형 캡슐 (산뜻한 앰버 골드 톤)
    if (wrapperEl) {
      wrapperEl.className = 'w-full px-1 py-0.5 flex items-center justify-end shrink-0 select-none transition-all';
    }
    sectionEl.className = 'inline-flex items-center rounded-xl border-2 border-amber-400/80 bg-amber-50 hover:bg-amber-100/90 text-amber-950 shadow-2xs select-none transition-all cursor-pointer';
    if (headerEl) {
      headerEl.className = 'flex items-center gap-2 py-1 px-2.5 w-full cursor-pointer';
    }
    if (titleLeft) {
      titleLeft.classList.add('hidden');
      titleLeft.classList.remove('flex');
    }
    if (titleRight) {
      titleRight.classList.remove('hidden');
      titleRight.className = 'font-headline-sm text-xs font-black text-amber-950';
    }
    const badge = document.getElementById('snippetDrawerCountBadge');
    if (badge) {
      badge.className = 'px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono text-[9.5px] font-black shadow-2xs';
    }
    bodyEl.classList.add('hidden');
    if (toggleIconEl) {
      toggleIconEl.innerHTML = '<span class="material-symbols-outlined text-[14px]">inventory_2</span>';
      toggleIconEl.className = 'flex items-center justify-center w-5 h-5 rounded-md bg-white border border-amber-300 text-xs shadow-2xs text-amber-700';
    }
    return;
  }

  // 1. 카테고리 칩 렌더링
  const chipsContainer = document.getElementById('snippetCategoryChips');
  if (chipsContainer) {
    let chipsHtml = '';
    SNIPPET_CATEGORIES.forEach((cat, idx) => {
      const isActive = SENSE_STATE.activeSnippetCategory === cat.id;
      const isFixed = cat.id === '전체' || cat.id === '이미지' || cat.id === '일반';
      const count = cat.id === '전체' 
        ? SENSE_STATE.snippets.length 
        : SENSE_STATE.snippets.filter(s => s.category === cat.id || (cat.id === '이미지' && s.type === 'image')).length;

      let btnClass = '';
      let badgeClass = '';

      if (isActive) {
        btnClass = isFixed
          ? 'bg-amber-600 text-white shadow-xs font-black border border-amber-700 ring-1 ring-amber-400'
          : 'bg-amber-500 text-white shadow-2xs font-bold border border-amber-600';
        badgeClass = 'bg-white/25 text-white';
      } else {
        if (isFixed) {
          // 고정 탭: 진한 차콜 슬레이트 톤으로 묵직하고 '고정'된 위상 부여
          btnClass = 'bg-slate-700 hover:bg-slate-800 text-white font-bold border border-slate-700 shadow-2xs';
          badgeClass = 'bg-white/20 text-slate-100 font-bold';
        } else {
          // 일반/가변 탭: 은은하고 산뜻한 라이트 그레이 톤
          btnClass = 'bg-slate-100 hover:bg-amber-50 hover:text-amber-900 text-slate-700 border border-slate-200/80 font-semibold';
          badgeClass = 'bg-slate-200 text-slate-600';
        }
      }

      chipsHtml += `
        <button type="button" class="px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer flex items-center gap-1 shrink-0 ${btnClass}" onclick="switchSnippetCategory('${cat.id}')">
          <span>${cat.name}</span>
          <span class="text-[9.5px] px-1 py-0.1 rounded-full ${badgeClass} font-mono">${count}</span>
        </button>
      `;

      // 고정 탭 3개('전체', '이미지', '일반')가 끝난 직후 은은한 세로 분리선 삽입
      if (cat.id === '일반' && idx < SNIPPET_CATEGORIES.length - 1) {
        chipsHtml += `<span class="w-px h-3.5 bg-slate-300 mx-0.5 shrink-0 select-none"></span>`;
      }
    });

    chipsContainer.innerHTML = chipsHtml;

    // 마우스 휠 가로 스크롤 매핑
    if (!chipsContainer._wheelBound) {
      chipsContainer._wheelBound = true;
      chipsContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          chipsContainer.scrollLeft += e.deltaY;
          updateSnippetCategoryScrollIndicators();
        }
      }, { passive: false });
    }

    setTimeout(updateSnippetCategoryScrollIndicators, 60);
  }

  // 2. 상용구 카드 목록 렌더링
  const grid = document.getElementById('snippetCardsGrid');
  if (!grid) return;

  const currentCat = SENSE_STATE.activeSnippetCategory;
  const filtered = SENSE_STATE.snippets.filter(s => {
    if (currentCat === '전체') return true;
    if (currentCat === '이미지') return s.type === 'image' || s.category === '이미지';
    return s.category === currentCat;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-4 text-center text-slate-400 text-xs">
        <span class="material-symbols-outlined text-[22px] block mb-0.5 text-slate-300">inbox</span>
        이 카테고리에 저장된 상용구가 없습니다.
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const isImage = item.type === 'image';
    const previewText = isImage ? `[이미지] ${item.fileName || '사진'}` : (item.content || '').replace(/\s+/g, ' ').slice(0, 36) + '...';

    return `
      <div class="p-2 rounded-xl bg-amber-50/20 border border-amber-200/80 hover:border-amber-400 flex flex-col justify-between gap-1.5 transition-all shadow-2xs group hover:bg-white">
        <!-- 상단: 제목 & 유형 & 삭제/수정 -->
        <div class="flex items-center justify-between gap-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <span class="w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isImage ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}">
              <span class="material-symbols-outlined text-[13px]">${isImage ? 'image' : 'chat'}</span>
            </span>
            <span class="font-bold text-[11px] text-slate-900 truncate" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" class="w-5 h-5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer" onclick="openEditSnippetModal('${item.id}')" title="수정">
              <span class="material-symbols-outlined text-[13px]">edit</span>
            </button>
            <button type="button" class="w-5 h-5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center cursor-pointer" onclick="deleteSnippetById('${item.id}')" title="삭제">
              <span class="material-symbols-outlined text-[13px]">close</span>
            </button>
          </div>
        </div>

        <!-- 본문 한 줄 미리보기 -->
        <div class="text-[10px] text-slate-600 truncate bg-white p-1 rounded-md border border-slate-100">
          ${escapeHtml(previewText)}
        </div>

        <!-- 하단 액션 버튼 (방식 A: 새 블록으로 조립 / 방식 B: 커서 위치 삽입) -->
        <div class="flex items-center gap-1 pt-0.5">
          <!-- 방식 A: 새 블록 추가 (레고 조립) -->
          <button type="button" class="flex-1 py-1 px-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center gap-0.5 shadow-2xs cursor-pointer active:scale-[0.98] transition-all" onclick="insertSnippetAsNewBlock('${item.id}')" title="캔버스 맨 뒤에 새 블록으로 추가 (레고 조립)">
            <span class="material-symbols-outlined text-[12px]">add_box</span>
            <span>+ 블록추가</span>
          </button>

          <!-- 방식 B: 커서 삽입 (텍스트 전용) -->
          ${!isImage ? `
            <button type="button" class="py-1 px-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer active:scale-[0.98] transition-all" onclick="insertSnippetAtCursor('${item.id}')" title="현재 편집 중인 텍스트 커서 위치에 바로 삽입">
              <span class="material-symbols-outlined text-[12px]">pin_drop</span>
              <span>커서삽입</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 상용구 카테고리 전환
 */
function switchSnippetCategory(catId) {
  SENSE_STATE.activeSnippetCategory = catId;
  renderSnippetDrawer();
  setTimeout(updateSnippetCategoryScrollIndicators, 60);
}

/**
 * [방식 A] 상용구를 캔버스에 "새 블록"으로 추가 (레고 조립)
 */
function insertSnippetAsNewBlock(snippetId) {
  const item = SENSE_STATE.snippets.find(s => s.id === snippetId);
  if (!item) return;

  if (item.type === 'image') {
    // 이미지 블록으로 추가
    const newBlock = {
      id: 'block-' + Date.now(),
      type: 'image',
      title: item.title || '이미지 상용구',
      fileName: item.fileName || 'snippet_image.png',
      fileSize: item.fileSize || '15KB',
      dimensions: item.dimensions || '600 x 400px',
      dataUrl: item.dataUrl || '',
      isCollapsed: false
    };
    SENSE_STATE.blocks.push(newBlock);
    showToast(`🖼️ "${item.title}" 사진이 새 블록으로 장전되었습니다!`);
  } else {
    // 텍스트 블록으로 추가
    const newBlock = {
      id: 'block-' + Date.now(),
      type: 'text',
      title: item.title || '상용구 블록',
      content: item.content || '',
      isAd: false,
      optOutNum: '080-880-7766',
      isCollapsed: false
    };
    SENSE_STATE.blocks.push(newBlock);
    showToast(`🧩 "${item.title}" 상용구가 새 블록으로 조립되었습니다!`);
  }

  renderBlocks();
  renderKakaoPreview();
  renderCounters();
  syncStateToBot();
  scrollToLatestBlock();
}

/**
 * [방식 B] 상용구를 현재 포커스된 커서 위치에 즉시 끼워넣기
 */
function insertSnippetAtCursor(snippetId) {
  const item = SENSE_STATE.snippets.find(s => s.id === snippetId);
  if (!item || item.type === 'image') return;

  const token = item.content || '';

  // 1. 활성 텍스트에어리어에 커서가 있으면 그 위치에 삽입
  const activeEl = document.activeElement;
  if (activeEl && activeEl.tagName === 'TEXTAREA' && activeEl.closest('#blocksCanvasContainer')) {
    const start = activeEl.selectionStart || 0;
    const end = activeEl.selectionEnd || 0;
    const val = activeEl.value || '';
    activeEl.value = val.substring(0, start) + token + val.substring(end);
    activeEl.selectionStart = activeEl.selectionEnd = start + token.length;
    activeEl.dispatchEvent(new Event('input'));
    renderCounters();
    activeEl.focus();
    showToast(`📍 커서 위치에 "${item.title}" 상용구가 삽입되었습니다.`);
    return;
  }

  // 2. 커서가 없으면 첫 번째 텍스트 블록 끝에 줄바꿈과 함께 추가
  let targetBlock = SENSE_STATE.blocks.find(b => b.type === 'text');
  if (!targetBlock) {
    addTextBlock();
    targetBlock = SENSE_STATE.blocks.find(b => b.type === 'text');
  }

  if (targetBlock) {
    targetBlock.content = (targetBlock.content ? targetBlock.content.trim() + '\n\n' : '') + token;
    renderBlocks();
    renderKakaoPreview();
    renderCounters();
    syncStateToBot();
    showToast(`📍 텍스트 블록에 "${item.title}" 상용구가 삽입되었습니다.`);
  }
}

/**
 * 상용구 모달 내 카테고리 셀렉트 및 삭제 드롭다운 옵션 동적 갱신
 */
function refreshModalCategoryOptions(selectedCatId) {
  const catSelect = document.getElementById('snippetModalCategorySelect');
  const deleteSelect = document.getElementById('snippetCategoryDeleteSelect');
  const deleteBtn = document.getElementById('snippetCategoryDeleteBtn');

  // 1. 등록/수정용 카테고리 드롭다운 ('전체' 제외)
  if (catSelect) {
    const selectable = SNIPPET_CATEGORIES.filter(c => c.id !== '전체');
    catSelect.innerHTML = selectable.map(c => `
      <option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>
    `).join('');
    if (selectedCatId && selectable.some(c => c.id === selectedCatId)) {
      catSelect.value = selectedCatId;
    } else {
      catSelect.value = selectable[0]?.id || '일반';
    }
  }

  // 2. 카테고리 탭 삭제용 드롭다운 ('전체', '이미지', '일반' 등 시스템 고정 탭 제외)
  if (deleteSelect) {
    const deletable = SNIPPET_CATEGORIES.filter(c => c.id !== '전체' && c.id !== '이미지' && c.id !== '일반');
    if (deletable.length === 0) {
      deleteSelect.innerHTML = '<option value="" disabled selected>삭제 가능한 탭 없음</option>';
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    } else {
      deleteSelect.innerHTML = deletable.map(c => `
        <option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>
      `).join('');
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      }
    }
  }
}

/**
 * 카테고리 탭 삭제 처리
 */
function handleDeleteCategoryClick() {
  const deleteSelect = document.getElementById('snippetCategoryDeleteSelect');
  const catId = deleteSelect?.value;

  if (!catId || catId === '전체' || catId === '이미지' || catId === '일반') {
    alert('삭제할 수 있는 카테고리 탭이 선택되지 않았습니다.');
    return;
  }

  const targetCat = SNIPPET_CATEGORIES.find(c => c.id === catId);
  const catName = targetCat ? (targetCat.name || targetCat.id) : catId;

  // 해당 카테고리에 속한 상용구 개수 확인
  const affectedSnippets = SENSE_STATE.snippets.filter(s => s.category === catId);
  const msg = affectedSnippets.length > 0
    ? `정말 '${catName}' 카테고리 탭을 삭제하시겠습니까?\n\n이 카테고리에 보관된 상용구 ${affectedSnippets.length}개는 '일반' 카테고리로 안전하게 이동됩니다.`
    : `정말 '${catName}' 카테고리 탭을 삭제하시겠습니까?`;

  if (!confirm(msg)) return;

  // 소속 상용구를 '일반'으로 안전 이동
  if (affectedSnippets.length > 0) {
    affectedSnippets.forEach(s => {
      s.category = '일반';
    });
    saveSnippetsToStorage();
  }

  // 카테고리 목록에서 제거
  SNIPPET_CATEGORIES = SNIPPET_CATEGORIES.filter(c => c.id !== catId);
  saveSnippetCategoriesToStorage();

  // 만약 삭제된 탭이 서랍에서 활성 탭이었다면 '전체'로 복구
  if (SENSE_STATE.activeSnippetCategory === catId) {
    SENSE_STATE.activeSnippetCategory = '전체';
  }

  // UI 갱신
  refreshModalCategoryOptions('일반');
  renderSnippetDrawer();
  showToast(`🗑️ '${catName}' 탭이 삭제되고, 상용구는 '일반'으로 이동되었습니다.`);
}

/**
 * 새 카테고리 탭 추가 처리
 */
function handleAddNewCategoryClick() {
  const inputEl = document.getElementById('snippetNewCategoryInput');
  const rawName = (inputEl?.value || '').trim();

  if (!rawName) {
    alert('추가할 카테고리명을 입력해주세요.');
    if (inputEl) inputEl.focus();
    return;
  }

  if (rawName.length > 10) {
    alert('카테고리명은 최대 10자까지 입력 가능합니다.');
    if (inputEl) inputEl.focus();
    return;
  }

  // 중복 검사
  const exists = SNIPPET_CATEGORIES.some(c => c.id.toLowerCase() === rawName.toLowerCase() || (c.name && c.name.toLowerCase() === rawName.toLowerCase()));
  if (exists) {
    alert(`'${rawName}' 카테고리가 이미 존재합니다.`);
    if (inputEl) inputEl.focus();
    return;
  }

  const newCat = {
    id: rawName,
    name: rawName,
    icon: 'label'
  };

  // 새 카테고리는 목록 끝에 추가 (앞쪽의 고정 탭 그룹: 전체, 이미지, 일반 유지)
  SNIPPET_CATEGORIES.push(newCat);

  saveSnippetCategoriesToStorage();
  if (inputEl) inputEl.value = '';

  // 모달 셀렉트 갱신 및 방금 추가한 카테고리로 등록 드롭다운 자동 지정
  refreshModalCategoryOptions(rawName);
  renderSnippetDrawer();
  showToast(`✨ 새 카테고리 '${rawName}' 탭이 추가되었습니다!`);
}

/**
 * 상용구 카테고리 칩 가로 스크롤 인디케이터 (좌/우 화살표) 갱신
 */
function updateSnippetCategoryScrollIndicators() {
  const container = document.getElementById('snippetCategoryChips');
  const leftBtn = document.getElementById('snippetCatScrollLeftBtn');
  const rightBtn = document.getElementById('snippetCatScrollRightBtn');
  if (!container) return;

  const scrollLeft = container.scrollLeft;
  const maxScrollLeft = container.scrollWidth - container.clientWidth;

  if (leftBtn) {
    if (scrollLeft > 4) {
      leftBtn.classList.remove('hidden');
      leftBtn.classList.add('flex');
    } else {
      leftBtn.classList.add('hidden');
      leftBtn.classList.remove('flex');
    }
  }

  if (rightBtn) {
    if (maxScrollLeft - scrollLeft > 4) {
      rightBtn.classList.remove('hidden');
      rightBtn.classList.add('flex');
    } else {
      rightBtn.classList.add('hidden');
      rightBtn.classList.remove('flex');
    }
  }
}

/**
 * 상용구 카테고리 칩 스크롤 이동
 */
function scrollSnippetCategories(offset) {
  const container = document.getElementById('snippetCategoryChips');
  if (container) {
    container.scrollBy({ left: offset, behavior: 'smooth' });
    setTimeout(updateSnippetCategoryScrollIndicators, 180);
  }
}

// 윈도우 리사이즈 시 상용구 칩 스크롤 화살표 가시성 자동 갱신
window.addEventListener('resize', () => {
  if (typeof updateSnippetCategoryScrollIndicators === 'function') {
    updateSnippetCategoryScrollIndicators();
  }
});

/**
 * 캔버스 블록 헤더의 [⭐️ 상용구로 저장] 버튼 클릭 시
 */
function saveBlockAsSnippet(blockIdx) {
  const block = SENSE_STATE.blocks[blockIdx];
  if (!block) return;

  _editingSnippetId = null;
  _snippetModalType = block.type === 'image' ? 'image' : 'text';

  const modal = document.getElementById('snippetModal');
  const titleEl = document.getElementById('snippetModalTitle');
  const nameInput = document.getElementById('snippetModalNameInput');
  const catSelect = document.getElementById('snippetModalCategorySelect');
  const contentInput = document.getElementById('snippetModalContentInput');

  if (titleEl) titleEl.innerText = '캔버스 블록을 상용구로 보관';
  if (nameInput) {
    nameInput.value = block.title ? block.title.replace(/블록.*$/, '').trim() : (block.type === 'image' ? '자주 쓰는 안내 사진' : '자주 쓰는 문구');
  }

  const targetCat = block.type === 'image' ? '이미지' : '일반';
  refreshModalCategoryOptions(targetCat);
  if (catSelect) {
    catSelect.value = targetCat;
  }

  if (block.type === 'image') {
    switchSnippetModalType('image');
    _tempSnippetImageData = {
      dataUrl: block.dataUrl || '',
      fileName: block.fileName || 'image.png',
      fileSize: block.fileSize || '',
      dimensions: block.dimensions || ''
    };
    updateSnippetImagePreviewUI();
  } else {
    switchSnippetModalType('text');
    if (contentInput) contentInput.value = block.content || '';
  }

  if (modal) modal.classList.remove('hidden');
}

/**
 * 새 상용구 등록 모달 열기
 */
function openNewSnippetModal() {
  _editingSnippetId = null;
  _snippetModalType = 'text';
  _tempSnippetImageData = { dataUrl: '', fileName: '', fileSize: '', dimensions: '' };

  const modal = document.getElementById('snippetModal');
  const titleEl = document.getElementById('snippetModalTitle');
  const nameInput = document.getElementById('snippetModalNameInput');
  const catSelect = document.getElementById('snippetModalCategorySelect');
  const contentInput = document.getElementById('snippetModalContentInput');

  if (titleEl) titleEl.innerText = '새 상용구 등록';
  if (nameInput) nameInput.value = '';

  const defaultCat = SENSE_STATE.activeSnippetCategory === '전체' 
    ? (SNIPPET_CATEGORIES.find(c => c.id !== '전체' && c.id !== '이미지')?.id || '인사') 
    : SENSE_STATE.activeSnippetCategory;

  refreshModalCategoryOptions(defaultCat);
  if (catSelect) catSelect.value = defaultCat;
  if (contentInput) contentInput.value = '';

  switchSnippetModalType(SENSE_STATE.activeSnippetCategory === '이미지' ? 'image' : 'text');
  updateSnippetImagePreviewUI();

  if (modal) modal.classList.remove('hidden');
  setTimeout(() => { if (nameInput) nameInput.focus(); }, 100);
}

/**
 * 상용구 수정 모달 열기
 */
function openEditSnippetModal(snippetId) {
  const item = SENSE_STATE.snippets.find(s => s.id === snippetId);
  if (!item) return;

  _editingSnippetId = snippetId;
  _snippetModalType = item.type || 'text';

  const modal = document.getElementById('snippetModal');
  const titleEl = document.getElementById('snippetModalTitle');
  const nameInput = document.getElementById('snippetModalNameInput');
  const catSelect = document.getElementById('snippetModalCategorySelect');
  const contentInput = document.getElementById('snippetModalContentInput');

  if (titleEl) titleEl.innerText = '상용구 수정';
  if (nameInput) nameInput.value = item.title || '';

  const targetCat = item.category || '일반';
  refreshModalCategoryOptions(targetCat);
  if (catSelect) catSelect.value = targetCat;

  if (item.type === 'image') {
    switchSnippetModalType('image');
    _tempSnippetImageData = {
      dataUrl: item.dataUrl || '',
      fileName: item.fileName || '',
      fileSize: item.fileSize || '',
      dimensions: item.dimensions || ''
    };
    updateSnippetImagePreviewUI();
  } else {
    switchSnippetModalType('text');
    if (contentInput) contentInput.value = item.content || '';
  }

  if (modal) modal.classList.remove('hidden');
}

/**
 * 상용구 모달 닫기
 */
function closeSnippetModal() {
  const modal = document.getElementById('snippetModal');
  if (modal) modal.classList.add('hidden');
}

/**
 * 상용구 유형 전환 (텍스트 vs 이미지)
 */
function switchSnippetModalType(type) {
  _snippetModalType = type;
  const btnText = document.getElementById('snippetTypeBtn_text');
  const btnImg = document.getElementById('snippetTypeBtn_image');
  const secText = document.getElementById('snippetModalTextSection');
  const secImg = document.getElementById('snippetModalImageSection');
  const catSelect = document.getElementById('snippetModalCategorySelect');

  if (type === 'image') {
    if (btnImg) {
      btnImg.className = 'py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-indigo-700 shadow-2xs cursor-pointer flex items-center justify-center gap-1';
    }
    if (btnText) {
      btnText.className = 'py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-slate-900 cursor-pointer flex items-center justify-center gap-1';
    }
    if (secText) secText.classList.add('hidden');
    if (secImg) secImg.classList.remove('hidden');
    if (catSelect) {
      catSelect.value = '이미지';
      catSelect.disabled = true;
      catSelect.classList.add('opacity-70', 'bg-slate-100', 'cursor-not-allowed');
    }
  } else {
    if (btnText) {
      btnText.className = 'py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-indigo-700 shadow-2xs cursor-pointer flex items-center justify-center gap-1';
    }
    if (btnImg) {
      btnImg.className = 'py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-slate-900 cursor-pointer flex items-center justify-center gap-1';
    }
    if (secText) secText.classList.remove('hidden');
    if (secImg) secImg.classList.add('hidden');
    if (catSelect) {
      catSelect.disabled = false;
      catSelect.classList.remove('opacity-70', 'bg-slate-100', 'cursor-not-allowed');
      if (catSelect.value === '이미지') {
        const defaultTextCat = SNIPPET_CATEGORIES.find(c => c.id !== '전체' && c.id !== '이미지')?.id || '일반';
        catSelect.value = defaultTextCat;
      }
    }
  }
}

/**
 * 상용구 이미지 파일 선택 처리
 */
function handleSnippetImageUpload(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      _tempSnippetImageData = {
        dataUrl: dataUrl,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        dimensions: `${img.width} x ${img.height}px`
      };
      updateSnippetImagePreviewUI();
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

/**
 * 상용구 이미지 클립보드 붙여넣기(Ctrl+V) 처리
 */
function handleSnippetImagePaste(event) {
  const clipboardData = event.clipboardData || window.clipboardData;
  if (!clipboardData || !clipboardData.items) return;

  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (item.type.indexOf('image') !== -1) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          _tempSnippetImageData = {
            dataUrl: dataUrl,
            fileName: `screenshot_${Date.now()}.png`,
            fileSize: formatFileSize(file.size),
            dimensions: `${img.width} x ${img.height}px`
          };
          updateSnippetImagePreviewUI();
          showToast('📸 클립보드 스크린샷이 상용구 이미지로 등록되었습니다!');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      break;
    }
  }
}

/**
 * 상용구 이미지 미리보기 박스 갱신
 */
function updateSnippetImagePreviewUI() {
  const box = document.getElementById('snippetImagePreviewBox');
  if (!box) return;

  if (_tempSnippetImageData.dataUrl) {
    box.innerHTML = `
      <div class="flex items-center gap-3 p-1">
        <img src="${_tempSnippetImageData.dataUrl}" class="w-20 h-16 object-cover rounded-lg border border-indigo-200 shadow-2xs">
        <div class="text-left text-xs">
          <div class="font-bold text-slate-800 truncate max-w-[200px]">${escapeHtml(_tempSnippetImageData.fileName)}</div>
          <div class="text-[11px] text-slate-500">${_tempSnippetImageData.dimensions} · ${_tempSnippetImageData.fileSize}</div>
          <div class="text-[10px] text-emerald-600 font-bold mt-0.5">✓ 이미지 등록 완료</div>
        </div>
      </div>
    `;
  } else {
    box.innerHTML = `
      <div class="flex flex-col items-center gap-1 text-slate-500">
        <span class="material-symbols-outlined text-[28px] text-indigo-500">add_photo_alternate</span>
        <span class="text-[11px] font-bold">클릭하여 이미지 파일 선택 또는 드래그/붙여넣기</span>
      </div>
    `;
  }
}

/**
 * 상용구 저장 확인
 */
function handleSaveSnippetConfirm() {
  const nameInput = document.getElementById('snippetModalNameInput');
  const catSelect = document.getElementById('snippetModalCategorySelect');
  const contentInput = document.getElementById('snippetModalContentInput');

  const title = (nameInput?.value || '').trim();
  const type = _snippetModalType;
  const category = type === 'image' ? '이미지' : (catSelect?.value || '일반');

  if (!title) {
    alert('상용구 명칭을 입력해주세요.');
    if (nameInput) nameInput.focus();
    return;
  }

  if (type === 'text') {
    const content = (contentInput?.value || '').trim();
    if (!content) {
      alert('상용구 본문 내용을 입력해주세요.');
      if (contentInput) contentInput.focus();
      return;
    }

    if (_editingSnippetId) {
      const idx = SENSE_STATE.snippets.findIndex(s => s.id === _editingSnippetId);
      if (idx !== -1) {
        SENSE_STATE.snippets[idx] = {
          ...SENSE_STATE.snippets[idx],
          title,
          category,
          type: 'text',
          content,
          updatedAt: new Date().toISOString().slice(0, 10)
        };
      }
    } else {
      SENSE_STATE.snippets.unshift({
        id: 'snip-' + Date.now(),
        title,
        category,
        type: 'text',
        content,
        createdAt: new Date().toISOString().slice(0, 10),
        isFavorite: false
      });
    }
  } else {
    // 이미지 상용구
    if (!_tempSnippetImageData.dataUrl) {
      alert('등록할 이미지를 파일 또는 스크린샷 붙여넣기(Ctrl+V)로 지정해주세요.');
      return;
    }

    if (_editingSnippetId) {
      const idx = SENSE_STATE.snippets.findIndex(s => s.id === _editingSnippetId);
      if (idx !== -1) {
        SENSE_STATE.snippets[idx] = {
          ...SENSE_STATE.snippets[idx],
          title,
          category: '이미지',
          type: 'image',
          fileName: _tempSnippetImageData.fileName,
          fileSize: _tempSnippetImageData.fileSize,
          dimensions: _tempSnippetImageData.dimensions,
          dataUrl: _tempSnippetImageData.dataUrl,
          updatedAt: new Date().toISOString().slice(0, 10)
        };
      }
    } else {
      SENSE_STATE.snippets.unshift({
        id: 'snip-' + Date.now(),
        title,
        category: '이미지',
        type: 'image',
        fileName: _tempSnippetImageData.fileName,
        fileSize: _tempSnippetImageData.fileSize,
        dimensions: _tempSnippetImageData.dimensions,
        dataUrl: _tempSnippetImageData.dataUrl,
        createdAt: new Date().toISOString().slice(0, 10),
        isFavorite: false
      });
    }
  }

  saveSnippetsToStorage();
  closeSnippetModal();
  renderSnippetDrawer();
  showToast(`✅ "${title}" 상용구가 서랍에 안전하게 저장되었습니다!`);
}

/**
 * 상용구 삭제
 */
function deleteSnippetById(snippetId) {
  const item = SENSE_STATE.snippets.find(s => s.id === snippetId);
  if (!item) return;

  if (confirm(`정말 "${item.title}" 상용구를 서랍에서 삭제하시겠습니까?`)) {
    SENSE_STATE.snippets = SENSE_STATE.snippets.filter(s => s.id !== snippetId);
    saveSnippetsToStorage();
    renderSnippetDrawer();
    showToast(`🗑️ "${item.title}" 상용구가 삭제되었습니다.`);
  }
}

