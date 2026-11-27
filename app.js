/* 핑키오피스 — 대장 김예은 · 총괄 팀장 핑키
   순수 바닐라 JS. 모든 상태는 localStorage에 저장됩니다. */
(function () {
  'use strict';

  var KEY = 'pinky-office-v1';
  var STATE_VERSION = 4;
  var TASK_STATUS = ['대기', '작업 중', '검수 대기', '완료'];
  var THREAD_STATUS = ['대기', '작업 중', '완료'];
  var LEAVE_STATUS = '휴직 중';   // 휴직: 책상 컴퓨터가 꺼지고 💤 표시

  /* 기본 팀원이 추가된 버전 — 저장값·실시간 DB에 없으면 그 버전 이하의 목록에 자동으로 채웁니다. */
  var MEMBER_SINCE = { keyring: 3, vooy: 3, manus: 3, muse: 3, hark: 3, instinct: 3, groq: 4 };
  var LEGACY_CUE_ROLE = '키링 · 정리 · 기록';   // v2에서는 큐가 키링과 뒤섞여 있었음

  /* ---------- 유틸 ---------- */
  function $(id) { return document.getElementById(id); }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return pad(d.getHours()) + ':' + pad(d.getMinutes());
    var y = new Date(now.getTime() - 86400000);
    if (d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()) return '어제';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function fmtFull(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* 단톡방 시각 표기: 오후 9:28 */
  function fmtChatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var ap = h < 12 ? '오전' : '오후';
    var hh = h % 12; if (hh === 0) hh = 12;
    var mm = d.getMinutes();
    return ap + ' ' + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* 좌석 맵·활동 표기를 위한 상대 시간 */
  function relTime(iso) {
    var t = new Date(iso).getTime();
    if (!t) return '방금';
    var diff = Math.max(0, Date.now() - t);
    var min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return min + '분 전';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + '시간 전';
    return Math.floor(hour / 24) + '일 전';
  }

  function dayKey(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function dayLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    var now = new Date();
    var same = dayKey(iso) === dayKey(now.toISOString());
    var y = new Date(now.getTime() - 86400000);
    var label = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + days[d.getDay()] + '요일';
    if (same) return '오늘 · ' + label;
    if (dayKey(iso) === dayKey(y.toISOString())) return '어제 · ' + label;
    return label;
  }

  function badgeClass(status) {
    switch (status) {
      case '대장': return 'badge-chief';
      case '작업 중': return 'badge-doing';
      case '완료': return 'badge-done';
      case '미연결': return 'badge-off';
      case '휴직 중': return 'badge-leave';
      default: return 'badge-wait';
    }
  }

  function tagClass(status) {
    switch (status) {
      case '작업 중': return 'tag-doing';
      case '완료': return 'tag-done';
      case '검수 대기': return 'tag-review';
      default: return 'tag-wait';
    }
  }

  /* ---------- 기본 데이터 ---------- */
  /* 기본 팀원 — 대장·총괄 팀장과 지금 쓰는 AI들 (v3: 키링·Cue·부이·마누스·뮤즈·하크·인스팅트, v4: 그록) */
  function defaultMembers() {
    return [
      {
        id: 'yeeun', name: '김예은', emoji: '👑', role: '대장 · 최종 결정',
        status: '대장', desc: '모든 결정은 대장 승인 후 실행.', connected: true, isChief: true, demo: false
      },
      {
        id: 'pinky', name: '핑키', emoji: '🌸', role: '총괄 팀장 · 분업 · 검수',
        status: '작업 중', desc: '지시를 티켓으로 쪼개고 결과를 모아 대장에게 보고합니다.', connected: true, isChief: false, demo: false
      },
      {
        id: 'gpt', name: '챗GPT', emoji: '🤖', role: '리서치 · 초안 작성',
        status: '대기', desc: '자료 조사와 초안 작성. 출처를 함께 달아 보고합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'claude', name: '클로드', emoji: '📝', role: '기획 · 문서 다듬기',
        status: '대기', desc: '긴 글 구조 잡기와 문장 다듬기. 고친 이유를 함께 적습니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'gemini', name: '제미나이', emoji: '🔍', role: '비교 · 사실 확인',
        status: '대기', desc: '선택지를 나란히 비교하고 사실관계를 확인합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'cue', name: '큐', emoji: '🗂️', role: '에이전트 팀 · 업무 인계 (Cue)',
        status: '미연결', desc: '각자 메일·전화·컴퓨터를 가진 에이전트 팀을 꾸려 조사·정리·발표를 나눠 맡깁니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'keyring', name: '키링', emoji: '📞', role: '전화·예약 대행 (Keyring)',
        status: '미연결', desc: '전화로만 받는 예약, 고객센터 대기, 구독 해지까지 대신 하고 통화 내용을 정리해 보고합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'vooy', name: '부이', emoji: '🛍️', role: '메신저 심부름 · 취향 기억 (Vooy)',
        status: '미연결', desc: '메신저에서 말하면 쿠팡·배달·예약까지 실행하고, 취향과 약속 조율을 기억합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'manus', name: '마누스', emoji: '🖐️', role: '장시간 실행 · 결과물 제작 (Manus)',
        status: '미연결', desc: '조사·발표자료·데이터 분석을 스스로 계획해 끝까지 만들고 결과물 파일로 넘깁니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'muse', name: '뮤즈', emoji: '🎨', role: '일정·메일·쇼핑 비서 (Muse)',
        status: '미연결', desc: '메일·일정·예산·쇼핑을 연결해 승인받아 처리하고, 앱을 닫아도 계속 일합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'hark', name: '하크', emoji: '👂', role: '생활 OS · 먼저 챙기기 (Hark)',
        status: '미연결', desc: '내 컴퓨터를 대신 쓰는 Handoff로 예약·구매를 끝내고, 놓칠 일을 먼저 제안합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'instinct', name: '인스팅트', emoji: '💬', role: '문자 심부름 · 자체 폰 (Instinct)',
        status: '미연결', desc: '문자나 전화로 부리면 자체 폰·컴퓨터로 예약·구매·이메일을 끝까지 처리합니다.', connected: false, isChief: false, demo: true
      },
      {
        id: 'groq', name: '그록', emoji: '⚡', role: '초고속 추론 · 요약·코드 보조 (Groq)',
        status: '미연결', desc: 'LPU로 답이 바로 나오는 초고속 모델. 긴 문서 요약과 코드 점검을 빠르게 돌립니다.', connected: false, isChief: false, demo: true
      }
    ];
  }

  function defaultMember(id) {
    var list = defaultMembers();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* 예전 팀원 목록에 새 기본 팀원을 채웁니다(버전 2 → 3 → 4 마이그레이션).
     sinceVersion보다 나중에 추가된 팀원만 채워서, 일부러 지운 팀원이 새로고침마다 되살아나지 않게 합니다. */
  function mergeNewMembers(list, sinceVersion, skipIds) {
    var members = Array.isArray(list) ? list.slice() : [];
    var changed = false;
    var skip = {};
    (Array.isArray(skipIds) ? skipIds : []).forEach(function (id) { skip[id] = true; });
    // v2의 '큐'는 키링과 역할이 섞여 있었으므로, 손대지 않은 경우에만 새 역할로 바꿉니다.
    members.forEach(function (m) {
      if (m && m.id === 'cue' && m.role === LEGACY_CUE_ROLE) {
        var d = defaultMember('cue');
        if (d) { m.role = d.role; m.desc = d.desc; changed = true; }
      }
    });
    var present = {};
    members.forEach(function (m) { if (m && m.id) present[m.id] = true; });
    Object.keys(MEMBER_SINCE).forEach(function (id) {
      if (present[id] || skip[id] || MEMBER_SINCE[id] <= sinceVersion) return;
      var d = defaultMember(id);
      if (d) { members.push(clone(d)); changed = true; }
    });
    return { members: members, changed: changed };
  }

  /* 클라우드 팀 목록은 버전을 저장하지 않으므로, 누가 들어 있는지로 어느 버전에서 저장된 목록인지 짐작합니다. */
  function teamEra(list) {
    var present = {};
    (Array.isArray(list) ? list : []).forEach(function (m) { if (m && m.id) present[m.id] = true; });
    var era = 2;
    Object.keys(MEMBER_SINCE).forEach(function (id) {
      if (present[id] && MEMBER_SINCE[id] > era) era = MEMBER_SINCE[id];
    });
    return era;
  }

  function seedState() {
    var now = Date.now();
    var t = function (min) { return new Date(now - min * 60000).toISOString(); };
    return {
      version: STATE_VERSION,
      demoMode: true,
      settings: { webhookUrl: '', webhookKind: 'n8n', apiUrl: '', apiSecret: '', dirty: false, wakeMode: '전원', motion: true },
      members: defaultMembers(),
      fired: [],
      tasks: [
        {
          id: uid('t'), title: '카페 오픈 준비 체크리스트', ownerId: 'yeeun', status: '완료',
          note: '정리 후 공유 완료', createdAt: t(180), updatedAt: t(40), demo: true
        },
        {
          id: uid('t'), title: '회의실 답장 템플릿 다듬기', ownerId: 'gpt', status: '검수 대기',
          note: '대장 확인만 남음', createdAt: t(150), updatedAt: t(35), demo: true
        },
        {
          id: uid('t'), title: '교육서 목차 잡기', ownerId: 'claude', status: '대기',
          note: '팀 규칙 5개 중심으로', createdAt: t(120), updatedAt: t(120), demo: true
        },
        {
          id: uid('t'), title: '카페 인테리어 레퍼런스 5개', ownerId: 'gemini', status: '작업 중',
          note: '상업 공간 위주로', createdAt: t(90), updatedAt: t(12), demo: true
        }
      ],
      threads: [
        {
          id: uid('th'), memberId: 'pinky', title: '핑키오피스 첫 화면 띄우기', status: '작업 중',
          createdAt: t(95), updatedAt: t(15), demo: true,
          messages: [
            { id: uid('m'), from: 'chief', text: '핑키오피스 첫 화면부터 띄워줘. 남편 폰에 있는 AP AI 오피스처럼, 우리 팀 이름으로.', at: t(95) },
            { id: uid('m'), from: 'member', via: 'web', text: '결론: 첫 화면 준비 완료했어요.\n한 일: 3D 오피스 그림 + 우리 팀 카드 + 오늘 상태 바.\n확인 필요: 팀원 이름·역할 이대로 갈까요?\n다음 단계: 교육서 본문 채우기.', at: t(15) }
          ]
        },
        {
          id: uid('th'), memberId: 'claude', title: '교육서 초안 잡아줘', status: '완료',
          createdAt: t(200), updatedAt: t(160), demo: true,
          messages: [
            { id: uid('m'), from: 'chief', text: '팀 운영 규칙 5개로 교육서 초안 잡아줘.', at: t(200) },
            { id: uid('m'), from: 'member', via: 'web', text: '결론: 5개 규칙 초안 완성.\n한 일: 승인 우선·티켓 하나에 하나·확인 필요 표시·검수 순서·기록 남기기.\n확인 필요: 없음.\n다음 단계: 교육서 탭에 붙이기.', at: t(160) }
          ]
        },
        {
          id: uid('th'), memberId: 'gemini', title: '카페 인테리어 레퍼런스 찾아줘', status: '대기',
          createdAt: t(70), updatedAt: t(70), demo: true,
          messages: [
            { id: uid('m'), from: 'chief', text: '상업 공간 카페 레퍼런스 5개만. 사진 설명이랑 왜 좋은지 한 줄씩.', at: t(70) }
          ]
        }
      ]
    };
  }

  /* ---------- 상태 ---------- */
  var state = loadState();
  var ui = { view: 'meeting', statusFilter: '전체', ownerFilter: null, threadId: null, seatId: null, replyTarget: null, officeOpen: true };

  /* 실시간 DB(Google Apps Script) 연결 상태 */
  var API_POLL_MS = 15000;
  var sync = {
    status: 'off',      // off · connecting · saving · on · error
    message: '',
    lastAt: '',
    timer: null,
    poll: null,
    listening: false,
    telegram: null
  };

  /* 예시(데모) 업무만 최신 문구로 다시 깔고, 직접 만든 업무는 그대로 남긴다 */
  function refreshDemoTasks(savedTasks, baseTasks) {
    var mine = savedTasks.filter(function (t) { return t && !t.demo; });
    var demos = baseTasks.filter(function (t) { return t.demo; });
    return mine.concat(demos);
  }

  function loadState() {
    var base = seedState();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return base;
      var savedVersion = typeof saved.version === 'number' ? saved.version : 1;
      var tasks = Array.isArray(saved.tasks) ? saved.tasks : base.tasks;
      if (savedVersion < STATE_VERSION) tasks = refreshDemoTasks(tasks, base.tasks);
      var members = Array.isArray(saved.members) && saved.members.length ? saved.members : base.members;
      // 버전 2 → 3 → 4: 예전에 저장된 팀원 목록에 새 기본 팀원을 채워 넣습니다.
      if (savedVersion < STATE_VERSION) members = mergeNewMembers(members, savedVersion).members;
      var next = {
        version: STATE_VERSION,
        demoMode: saved.demoMode !== false,
        settings: {
          webhookUrl: (saved.settings && saved.settings.webhookUrl) || '',
          webhookKind: (saved.settings && saved.settings.webhookKind) || 'n8n',
          apiUrl: (saved.settings && saved.settings.apiUrl) || '',
          apiSecret: (saved.settings && saved.settings.apiSecret) || '',
          dirty: !!(saved.settings && saved.settings.dirty),
          wakeMode: (saved.settings && saved.settings.wakeMode) || '전원'
        },
        members: members,
        fired: Array.isArray(saved.fired) ? saved.fired : [],
        tasks: tasks,
        threads: Array.isArray(saved.threads) ? saved.threads : base.threads
      };
      if (savedVersion < STATE_VERSION) {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (err) { /* 저장 실패는 무시 */ }
      }
      return next;
    } catch (err) {
      return base;
    }
  }

  /* push=false 는 클라우드로 올리지 않고 이 브라우저에만 저장(초기 시드·동기화 수신 직후) */
  function save(push) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (push !== false) queuePush();
      return true;
    } catch (err) {
      toast('저장 공간이 부족해 저장하지 못했어요.');
      return false;
    }
  }

  /* ---------- 실시간 DB: 주소·비밀 키 ---------- */
  function apiUrl() { return (state.settings.apiUrl || '').trim(); }

  function apiConfigured() {
    return /^https?:\/\//i.test(apiUrl());
  }

  function apiRequest(action, body, since) {
    if (!apiConfigured()) return Promise.reject(new Error('실시간 DB 주소가 없어요.'));
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    var opts = { method: 'POST', cache: 'no-store', redirect: 'follow' };
    var url = apiUrl();

    if (action === 'sync') {
      var q = ['action=sync', 't=' + Date.now()];
      if (since) q.push('since=' + encodeURIComponent(since));
      if (state.settings.apiSecret) q.push('secret=' + encodeURIComponent(state.settings.apiSecret));
      opts.method = 'GET';
      url += (url.indexOf('?') > -1 ? '&' : '?') + q.join('&');
    } else {
      var payload = { action: action };
      if (state.settings.apiSecret) payload.secret = state.settings.apiSecret;
      if (body) for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
      // text/plain 이면 브라우저가 preflight(OPTIONS)를 보내지 않아 Apps Script와 잘 맞아요.
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(payload);
    }
    if (ctrl) opts.signal = ctrl.signal;

    return fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res || !res.ok) throw new Error('서버 응답 ' + (res ? res.status : '없음'));
      return res.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw new Error(err && err.name === 'AbortError' ? '응답이 늦어요(시간 초과)' : '연결하지 못했어요');
    });
  }

  function setSyncState(status, message) {
    sync.status = status;
    if (typeof message === 'string') sync.message = message;
    renderSyncState();
  }

  function renderSyncState() {
    var stateLabel = {
      off: '연결 안 함 · 이 브라우저에만 저장',
      connecting: '연결하는 중…',
      saving: '저장하는 중…',
      on: '연결됨 · 폰·PC 실시간 동기화',
      error: '연결 문제 · ' + (sync.message || '확인 필요')
    }[sync.status] || '';
    var el = $('apiState');
    if (el) {
      el.textContent = stateLabel + (sync.status === 'on' && sync.lastAt ? ' (' + fmtTime(sync.lastAt) + ')' : '');
      el.setAttribute('data-state', sync.status);
    }
    var note = $('storeNote');
    if (note) note.textContent = apiConfigured() ? '클라우드(실시간 DB)에 저장됩니다' : '이 브라우저에만 저장됩니다';
    var tg = $('telegramState');
    if (tg) {
      if (sync.telegram && sync.telegram.ready) tg.textContent = '텔레그램 알림 연결됨';
      else if (sync.telegram && sync.telegram.tokenSet) tg.textContent = '봇 토큰만 있음 · Chat ID 미감지';
      else tg.textContent = '텔레그램 준비 전';
    }
    renderDbWarn();
  }

  /* DB 주소가 없으면 화면 위쪽에 "이 브라우저에만 저장" 경고를 띄웁니다. */
  function renderDbWarn() {
    var el = $('dbWarn');
    if (!el) return;
    el.hidden = apiConfigured();
    if (apiConfigured()) return;
    var title = el.querySelector('.dw-title');
    var text = el.querySelector('.dw-text');
    /* 홈 화면 웹앱으로 열렸는데 DB 주소가 비어 있으면 이유를 짚어 줍니다. */
    if (isStandaloneApp()) {
      if (title) title.textContent = '홈 화면 앱으로 열려 DB 주소가 없어요!';
      if (text) text.innerHTML = '「홈 화면에 추가」할 때 주소에 <code>#api=…</code>가 들어 있어야 DB가 이어져요. '
        + '⚙️ 설정에서 <b>원클릭 링크</b>를 복사해 주소창에 붙여 연 뒤, 그 주소로 다시 홈 화면에 추가해 주세요.';
    } else {
      if (title) title.textContent = '지금 「이 브라우저에만 저장」 상태예요!';
      if (text) text.innerHTML = '원클릭 링크(<code>#api=…</code>)로 열거나 <b>⚙️ 설정</b>에서 DB 주소를 넣어야 AI·텔레그램과 연결돼요. 이 상태에서는 AI가 단톡방을 읽지 못해 답도 못 해요.';
    }
  }

  /* 지금 저장된 DB 주소로 폰에서 바로 열 수 있는 원클릭 링크 */
  function oneClickLink() {
    var url = apiUrl();
    if (!url) return '';
    var key = (state.settings.apiSecret || '').trim();
    var base = (window.location.origin || '') + (window.location.pathname || '/');
    return base + '#api=' + encodeURIComponent(url) + (key ? '&key=' + encodeURIComponent(key) : '');
  }

  function copyOneClickLink() {
    var link = oneClickLink();
    if (!link) { toast('먼저 실시간 DB 주소를 넣고 저장해 주세요.'); return; }
    copyText(link, '폰에서 열 원클릭 링크를 복사했어요. 폰 브라우저 주소창에 붙여 열면 바로 연결돼요.');
  }

  /* 서버 데이터를 화면에 적용. 예시(데모) 항목은 이 브라우저 것을 그대로 둡니다. */
  function applyRemote(data) {
    var teamMerged = false;
    var remoteTasks = Array.isArray(data.tasks) ? data.tasks : null;
    var remoteThreads = Array.isArray(data.messages) ? data.messages : null;
    if (remoteTasks) {
      state.tasks = state.tasks.filter(function (t) { return t.demo; })
        .concat(remoteTasks.filter(function (t) { return t && !t.demo; }));
    }
    if (remoteThreads) {
      state.threads = state.threads.filter(function (t) { return t.demo; })
        .concat(remoteThreads.filter(function (t) { return t && !t.demo; }));
    }
    if (Array.isArray(data.team) && data.team.length) {
      // 클라우드에 예전 팀원 목록이 남아 있으면 새 기본 팀원을 같이 채용합니다.
      var team = mergeNewMembers(data.team, teamEra(data.team), state.fired);
      state.members = team.members;
      teamMerged = team.changed;
    } else if (!state.members.length) {
      state.members = defaultMembers();
      teamMerged = true;
    }
    if (data.telegram) sync.telegram = data.telegram;
    return { teamMerged: teamMerged };
  }

  function localOnlyCount() {
    var n = 0;
    state.tasks.forEach(function (t) { if (t && !t.demo) n++; });
    state.threads.forEach(function (t) { if (t && !t.demo) n++; });
    return n;
  }

  /* 클라우드 → 이 브라우저 */
  function pullFromServer(silent) {
    if (!apiConfigured()) return Promise.resolve(false);
    // 아직 못 올린 내 변경이 있으면 받아오지 않고 먼저 올립니다(덮어쓰기 방지)
    if (state.settings.dirty) {
      return pushToServer(true).then(function (ok) {
        if (!ok) return false;
        return pullFromServer(silent);
      });
    }
    return apiRequest('sync', null, sync.lastAt).then(function (data) {
      if (!data || data.ok !== true) throw new Error((data && (data.message || data.error)) || '동기화 응답 오류');
      if (data.telegram) sync.telegram = data.telegram;
      if (data.changed === false) {
        sync.lastAt = data.updatedAt || sync.lastAt;
        setSyncState('on');
        return false;
      }
      var remoteEmpty = (!data.tasks || !data.tasks.length) && (!data.messages || !data.messages.length);
      if (remoteEmpty && !sync.lastAt && localOnlyCount() > 0) {
        // 처음 연결: 클라우드가 비어 있으면 이 브라우저 내용을 올려 둡니다.
        setSyncState('on');
        pushToServer();
        return true;
      }
      var applied = applyRemote(data);
      sync.lastAt = data.updatedAt || '';
      save(false);
      renderAll();
      setSyncState('on');
      if (applied && applied.teamMerged) queuePush();
      if (!silent) toast('실시간 DB에서 최신 내용을 받았어요.');
      return true;
    }).catch(function (err) {
      setSyncState('error', err && err.message ? err.message : '연결 실패');
      if (!silent) toast('실시간 DB 연결 문제: ' + sync.message);
      return false;
    });
  }

  /* 이 브라우저 → 클라우드 (0.8초 묶어서 한 번) */
  function queuePush() {
    if (!apiConfigured()) return;
    if (sync.timer) clearTimeout(sync.timer);
    sync.timer = setTimeout(function () {
      sync.timer = null;
      pushToServer();
    }, 800);
  }

  function pushToServer(silent) {
    if (!apiConfigured()) return Promise.resolve(false);
    var payload = {
      tasks: state.tasks.filter(function (t) { return t && !t.demo; }),
      messages: state.threads.filter(function (t) { return t && !t.demo; }),
      team: state.members
    };
    setSyncState('saving');
    return apiRequest('save_all', payload).then(function (data) {
      if (!data || data.ok !== true) throw new Error((data && (data.message || data.error)) || '저장 실패');
      if (data.telegram) sync.telegram = data.telegram;
      sync.lastAt = data.updatedAt || sync.lastAt;
      if (state.settings.dirty) {
        state.settings.dirty = false;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* 무시 */ }
      }
      setSyncState('on');
      if (data.notified) toast('텔레그램으로 알림도 보냈어요 (' + data.notified + '건)');
      return true;
    }).catch(function (err) {
      state.settings.dirty = true;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
      setSyncState('error', err && err.message ? err.message : '저장 실패');
      if (!silent) toast('클라우드 저장이 막혔어요. 이 브라우저에는 저장됐어요.');
      return false;
    });
  }

  function startPolling() {
    if (!apiConfigured()) return;
    if (!sync.poll) {
      sync.poll = setInterval(function () {
        if (document.visibilityState === 'hidden') return;
        pullFromServer(true);
      }, API_POLL_MS);
    }
    if (!sync.listening) {
      sync.listening = true;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'hidden') pullFromServer(true);
      });
      window.addEventListener('focus', function () { pullFromServer(true); });
    }
  }

  function stopPolling() {
    if (sync.poll) clearInterval(sync.poll);
    sync.poll = null;
  }

  /* #api=https://script.google.com/.../exec&key=비밀키 로 바로 연결 */
  function readApiFromHash() {
    /* #api=... 과 ?api=... 둘 다 지원하고, 주소는 그대로 남깁니다.
       iOS Safari 「홈 화면에 추가」는 지금 주소를 저장하기 때문에 주소창에서 #api=를 지우면
       홈 화면 앱에서 DB 주소가 사라집니다. */
    var hash = String(window.location.hash || '').replace(/^#\/?/, '');
    var search = String(window.location.search || '').replace(/^\?/, '');
    var raw = hash.indexOf('api=') > -1 ? hash : (search.indexOf('api=') > -1 ? search : '');
    if (!raw) return false;
    var found = { url: '', key: '' };
    raw.split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx === -1) return;
      var k = pair.slice(0, idx);
      var v = pair.slice(idx + 1);
      try { v = decodeURIComponent(v); } catch (err) { /* 그대로 사용 */ }
      if (k === 'api' || k === 'url') found.url = v;
      if (k === 'key' || k === 'secret') found.key = v;
    });
    if (!/^https?:\/\//i.test(found.url)) return false;
    state.settings.apiUrl = found.url.trim();
    if (found.key) state.settings.apiSecret = found.key.trim();
    return true;
  }

  /* 홈 화면 앱(iOS 독립 실행)으로 열렸는지 */
  function isStandaloneApp() {
    try {
      return !!(window.navigator && window.navigator.standalone)
        || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (err) { return false; }
  }

  /* ---------- 표시용 데이터 ---------- */
  function visibleTasks() {
    return state.tasks.filter(function (t) { return state.demoMode || !t.demo; });
  }
  function visibleThreads() {
    return state.threads.filter(function (t) { return state.demoMode || !t.demo; })
      .sort(function (a, b) { return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt); });
  }
  function memberById(id) {
    for (var i = 0; i < state.members.length; i++) if (state.members[i].id === id) return state.members[i];
    return null;
  }
  function memberName(id) {
    var m = memberById(id);
    return m ? m.name : '미지정';
  }
  function memberEmoji(id) {
    var m = memberById(id);
    return m ? m.emoji : '👤';
  }
  function calcStats() {
    var tasks = visibleTasks();
    var threads = visibleThreads();
    var working = tasks.filter(function (t) { return t.status === '작업 중'; }).length
      + threads.filter(function (t) { return t.status === '작업 중'; }).length;
    var done = threads.filter(function (t) { return t.status === '완료'; }).length;
    var waiting = tasks.filter(function (t) { return t.status === '대기'; }).length
      + threads.filter(function (t) { return t.status === '대기'; }).length;
    var offline = state.members.filter(function (m) { return !m.isChief && m.status !== LEAVE_STATUS && !isConnected(m); }).length;
    var leave = state.members.filter(function (m) { return m.status === LEAVE_STATUS; }).length;
    return { working: working, done: done, waiting: waiting, offline: offline, leave: leave };
  }

  function onLeave(m) { return !!m && m.status === LEAVE_STATUS; }
  function onLeaveId(id) { return onLeave(memberById(id)); }

  /* AI 답글이 달린 팀원은 연결된 것으로 봅니다(그록·Groq 답글은 서버가 memberId를 붙여 저장).
     상태값(미연결)은 그대로 두고, 화면에 보여줄 때만 '대기'로 바꿔 혼동을 줄입니다. */
  function hasAiReply(id) {
    if (!id) return false;
    for (var i = 0; i < state.threads.length; i++) {
      var t = state.threads[i];
      if (!t || t.demo) continue;
      var list = t.messages || [];
      for (var j = 0; j < list.length; j++) {
        var msg = list[j];
        if (msg && msg.from === 'member' && msg.memberId === id) return true;
      }
    }
    return false;
  }

  function isConnected(m) {
    if (!m) return false;
    if (m.isChief || m.connected) return true;
    return hasAiReply(m.id);
  }

  function displayStatus(m) {
    if (!m) return '';
    if (m.status === '미연결' && isConnected(m)) return '대기';
    return m.status;
  }

  /* 답글 작성자: 서버가 붙인 msg.memberId를 먼저 쓰고, 없으면 티켓 담당을 씁니다.
     (3인 회의처럼 한 티켓에 여러 팀원이 답할 때 각자 이름·아바타로 보이게) */
  function msgAuthorId(t, msg) {
    var id = msg && msg.memberId ? String(msg.memberId) : '';
    if (id && memberById(id)) return id;
    return t ? t.memberId : '';
  }

  /* ---------- 토스트 ---------- */
  var toastTimer = null;
  function toast(message) {
    var el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-show'); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-show');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 2400);
  }

  /* ---------- 클립보드 ---------- */
  function copyText(text, okMessage) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMessage : '복사가 막혔어요. 길게 눌러 직접 복사해 주세요.');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        toast(okMessage);
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ---------- 연결 문구(프롬프트) ---------- */
  /* 팀원별 '이 역할에서 지킬 것' 한 줄 — 저장 데이터에는 넣지 않고 연결 문구에만 붙입니다. */
  var PROMPT_TIPS = {
    pinky: '지시를 받으면 티켓으로 쪼갠 목록을 먼저 보여 주고, 끝나면 누가 무엇을 했는지 한 줄씩 모아 보고한다.',
    gpt: '자료는 출처 링크를 함께 달고, 초안은 대장이 바로 고칠 수 있는 문장으로 준다.',
    claude: '문장을 고칠 때는 고친 이유를 한 줄씩 붙이고, 원문과 바뀐 문장을 같이 보여 준다.',
    gemini: '비교할 때는 표로 정리하고, 사실 확인은 근거 링크와 확인한 날짜를 함께 적는다.',
    cue: '한 지시를 에이전트 팀에 나눠 맡길 때는 누가 무엇을 맡는지 먼저 적고, 넘길 때 결과물 이름과 남은 일을 함께 넘긴다.',
    keyring: '전화·예약·해지처럼 실행이 필요한 일은 하기 전에 무엇을 할지 한 줄로 확인받고, 끝나면 통화·처리 결과를 요약해 보고한다. 상대에게는 대장을 돕는 AI 비서라는 점을 먼저 밝힌다.',
    vooy: '메신저로 온 부탁은 취향·자주 쓰는 곳을 먼저 확인하고, 주문·예약은 결제 전에 금액과 조건을 확인받는다.',
    manus: '오래 걸리는 일은 단계 목록을 먼저 보여 주고, 끝나면 결과물 파일 이름과 확인 방법을 함께 보고한다.',
    muse: '메일·일정·예산을 읽을 때는 필요한 범위만 보고, 보내기·구매·예약은 승인받은 것만 실행한다.',
    hark: '예약·구매·결제는 실행 전에 무엇을 얼마에 할지 먼저 보여 주고, 놓치기 쉬운 일은 한 번 더 알려 준다.',
    instinct: '문자로 받은 심부름은 자기 폰·컴퓨터로 끝까지 처리하되, 예약·구매 확정 전에는 반드시 확인을 받는다.',
    groq: '빠른 답을 믿고 바로 넘기지 말고, 요약은 원문 구조를 지키고 코드는 실행 조건과 확인 방법을 함께 적는다. 중요한 숫자·일정은 근거 링크로 한 번 더 확인한다.'
  };

  function buildPrompt(m) {
    var lines = [
      '너는 「핑키오피스」 팀의 ' + m.name + ' (' + m.role + ') 역할이야.',
      '',
      '[팀]',
      '- 대장: 김예은 — 최종 결정권자. 모든 결정은 대장 승인 후 실행.',
      '- 총괄 팀장: 핑키 — 지시를 티켓으로 쪼개고 결과를 모아 대장에게 보고.',
      '- 너의 한 줄 역할: ' + (m.desc || m.role)
    ];
    if (PROMPT_TIPS[m.id]) lines.push('- 이 역할에서 지킬 것: ' + PROMPT_TIPS[m.id]);
    lines.push(
      '',
      '[일하는 방식]',
      '1. 지시는 단톡방(회의실) 티켓 하나에 하나씩 처리한다.',
      '2. 모르는 것은 추측으로 채우지 말고 "확인 필요"로 남긴다.',
      '3. 결제·계약·외부 발송·삭제는 절대 혼자 하지 않고 대장 승인을 먼저 요청한다.',
      '4. 결과물은 초안 → 검수 → 완료 순서로만 넘긴다.',
      '',
      '[방 상태]',
      '- 깨움: ' + ((state.settings && state.settings.wakeMode) || '전원')
        + ((state.settings && state.settings.wakeMode) === '지명만' ? ' — 내 이름이 지명된 티켓에만 답한다.' : ' — 새 티켓은 담당에게 바로 전달된다.'),
      '',
      '[보고 양식 — 이 순서로 답한다]',
      '결론: (한 줄)',
      '한 일: (3줄 이내, 결과물 이름 포함)',
      '확인 필요: (대장에게 물어볼 것, 최대 3개 / 없으면 "없음")',
      '다음 단계: (다음에 할 일 1개)'
    );

    /* 실시간 DB 주소가 있으면, 이 AI가 실제로 회의실을 읽고 답글을 남기는 주소까지 넣습니다. */
    var api = apiUrl();
    if (apiConfigured()) {
      var secret = (state.settings.apiSecret || '').trim();
      var q = function (query) {
        return api + (api.indexOf('?') > -1 ? '&' : '?') + query + (secret ? '&secret=' + encodeURIComponent(secret) : '');
      };
      lines.push(
        '',
        '[회의실 연결 — 이 주소로 핑키오피스 회의실을 읽고 답글을 남긴다]',
        '회의실 주소: ' + api,
        '1) 읽기(먼저 이것부터 연다): ' + q('action=sync&format=text'),
        '   → 회의실 티켓·업무판·팀 목록이 글로 나온다. "id=..."가 티켓 번호다.',
        '   → JSON이 필요하면: ' + q('action=sync'),
        '2) 답글 달기 (웹 주소를 열 수 있는 도구): ' + q('action=add_message&threadId=<티켓 id>&from=member&memberId=' + encodeURIComponent(m.id) + '&text=<답글>'),
        '   → text는 URL 인코딩한다(공백 %20, 줄바꿈 %0A). 답글은 500자 안쪽으로 줄인다.',
        '   → 답글을 남기면 {"ok":true,...}가 돌아온다. 실패하면 돌아온 error를 한 줄로 보고한다.',
        '3) 답글 달기 (POST·API 호출이 되는 도구): POST ' + api,
        '   → Content-Type: text/plain, 본문: {"action":"add_message","threadId":"<티켓 id>","from":"member","memberId":"' + m.id + '","text":"<답글>"' + (secret ? ',"secret":"' + secret + '"' : '') + '}',
        '4) 새 업무 올리기: ' + q('action=add_task&title=<업무>&ownerId=' + encodeURIComponent(m.id) + '&status=대기'),
        '5) 주소를 아예 열 수 없는 도구라면, 답글 본문을 그대로 답변으로 보여 줘. 대장이 복사해서 회의실에 붙인다.'
      );
    }

    lines.push('', '[지금 할 일]');
    if (apiConfigured()) {
      lines.push(
        '1. 위 읽기 주소를 열어 회의실을 확인한다.',
        '2. 담당이 "' + m.name + '(id=' + m.id + ')"이고 상태가 "대기" 또는 "작업 중"인 티켓의 마지막 지시를 위 보고 양식으로 처리한다.',
        '3. 가능하면 그 티켓 id로 회의실에 답글도 남긴다.',
        '4. 네 담당 지시가 아직 없으면 "대기 중"이라고만 답한다.'
      );
    } else {
      lines.push('회의실에 도착한 마지막 지시를 읽고 위 양식으로 답해줘. 지시가 아직 없으면 "대기 중"이라고만 말해줘.');
    }
    return lines.join('\n');
  }

  /* 연결 문구를 복사했으면 '연결됨 · 대기'로 표시 — 복사만 하고 계속 '미연결'로 남지 않게 */
  function markConnectionCopied(m) {
    if (!m || m.isChief) return false;
    var changed = false;
    if (!m.connected) { m.connected = true; changed = true; }
    if (m.status === '미연결') { m.status = '대기'; changed = true; }
    if (!changed) return false;
    save();
    renderAll();
    return true;
  }

  /* 답글이 어디로 들어왔는지(웹·텔레그램) 표시 */
  function viaLabel(via) {
    var v = String(via || '').trim();
    if (!v) return '';
    if (v === 'telegram') return '텔레그램';
    if (v === 'web') return '웹 연결';
    if (v.indexOf('web:') === 0) return '웹 연결 · ' + v.slice(4);
    if (v === 'groq') return '⚡ Groq';
    if (v.indexOf('groq:') === 0) {
      var who = v.slice(5).trim();
      return '⚡ ' + (memberById(who) ? memberName(who) : (who || 'Groq'));
    }
    return v;
  }

  /* ---------- 렌더: 헤더/탭 ---------- */
  function renderDemoToggle() {
    var btn = $('demoToggle');
    var label = $('demoLabel');
    if (!btn || !label) return;
    btn.setAttribute('aria-pressed', state.demoMode ? 'true' : 'false');
    label.textContent = state.demoMode ? '데모 모드' : '실사용 모드';
  }

  function switchView(name) {
    ui.view = name;
    document.body.classList.remove('view-meeting', 'view-office', 'view-board');
    document.body.classList.add('view-' + name);
    ['office', 'meeting', 'board'].forEach(function (v) {
      var view = $('view-' + v);
      if (view) {
        var on = v === name;
        view.classList.toggle('is-active', on);
        if (on) { view.removeAttribute('hidden'); } else { view.setAttribute('hidden', ''); }
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var on = tab.getAttribute('data-view') === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (name === 'meeting') renderMeeting();
    if (name === 'board') renderBoard();
    var tabsEl = document.querySelector('.tabs');
    if (tabsEl && typeof tabsEl.getBoundingClientRect === 'function') {
      var headerEl = document.querySelector('.top');
      var headerH = headerEl ? (headerEl.getBoundingClientRect().height || 0) : 0;
      var top = tabsEl.getBoundingClientRect().top + (window.scrollY || 0) - headerH - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  /* ---------- 렌더: 오피스 ---------- */
  function renderStats() {
    var el = $('officeStats');
    if (!el) return;
    var s = calcStats();
    var parts = [
      '작업 중 <b>' + s.working + '</b>',
      '답변 완료 <b>' + s.done + '</b>',
      '대기 <b>' + s.waiting + '</b>',
      '미연결 <b>' + s.offline + '</b>'
    ];
    if (s.leave) parts.push('휴직 <b>' + s.leave + '</b>');
    el.innerHTML = parts.join('<span class="sep">·</span>');
  }

  /* ---------- 렌더: 픽셀 오피스 책상 ---------- */
  /* 팀원마다 책상·모니터·키보드·의자·이름표. 대장은 방 가운데 앞쪽(관리자 자리)에 따로 앉습니다. */
  var RINGS = ['#ff7a9c', '#ffb26b', '#7ee0c0', '#8fb8ff', '#c79bff', '#ffd166', '#6ee7d7', '#ff9bd2', '#9be15d', '#f2a2ff', '#7dd3fc', '#ffc0a6', '#b0f0c0'];

  function ringOf(id) {
    var i = 0;
    for (var k = 0; k < state.members.length; k++) { if (state.members[k].id === id) { i = k; break; } }
    return RINGS[i % RINGS.length];
  }

  /* ---------- 미니 사람 캐릭터 (인라인 SVG) ----------
     팀원마다 머리 모양·머리색·옷 색·표정이 다릅니다. 대장은 왕관을 씁니다. */
  var PERSON_LOOKS = {
    yeeun: { skin: '#f4cfae', hair: '#3a2620', style: 'long', shirt: '#f0b23c', pants: '#6b4a2a', expr: 'smile' },
    pinky: { skin: '#f8d8c0', hair: '#ff9ec4', style: 'bob', shirt: '#ff6f93', pants: '#8e3c5c', expr: 'grin' },
    gpt: { skin: '#e8bd9a', hair: '#2b2b2b', style: 'short', shirt: '#10a37f', pants: '#2f3c39', expr: 'smile' },
    claude: { skin: '#f2c9a8', hair: '#6b4a33', style: 'side', shirt: '#d97757', pants: '#3a2f2a', expr: 'calm' },
    gemini: { skin: '#eec3a2', hair: '#3b3a55', style: 'curly', shirt: '#5b8cff', pants: '#2d3350', expr: 'smile' },
    cue: { skin: '#f6d3b7', hair: '#2f2b3a', style: 'bob', shirt: '#7d6bff', pants: '#2c2842', expr: 'calm' },
    keyring: { skin: '#e0b090', hair: '#8b5e3c', style: 'pony', shirt: '#ffb26b', pants: '#5b4632', expr: 'grin' },
    vooy: { skin: '#f8dcc6', hair: '#2f4f4a', style: 'long', shirt: '#5fd8b6', pants: '#2b4a44', expr: 'wink' },
    manus: { skin: '#e8bd9a', hair: '#1f1f24', style: 'short', shirt: '#68788c', pants: '#2b313a', expr: 'calm' },
    muse: { skin: '#f4cfae', hair: '#6d4a8f', style: 'long', shirt: '#c79bff', pants: '#4a3466', expr: 'smile' },
    hark: { skin: '#f6d3b7', hair: '#4a3a2a', style: 'spiky', shirt: '#ffd166', pants: '#6a5223', expr: 'grin' },
    instinct: { skin: '#eec3a2', hair: '#2b3b46', style: 'short', shirt: '#6ee7d7', pants: '#2b4a52', expr: 'wink' },
    groq: { skin: '#f2c9a8', hair: '#2a1f18', style: 'spiky', shirt: '#ff7043', pants: '#5a2a18', expr: 'grin' }
  };
  var FALLBACK_LOOKS = [
    { skin: '#f6d3b7', hair: '#3f2d24', style: 'bob', shirt: '#8fb8ff', pants: '#3a4152', expr: 'smile' },
    { skin: '#eec3a2', hair: '#2c2a30', style: 'bun', shirt: '#ffb26b', pants: '#5b4632', expr: 'grin' },
    { skin: '#f8dcc6', hair: '#6b4a33', style: 'short', shirt: '#7ee0c0', pants: '#2f4a44', expr: 'calm' },
    { skin: '#e0b090', hair: '#1f1f24', style: 'pony', shirt: '#c79bff', pants: '#4a3466', expr: 'wink' },
    { skin: '#f4cfae', hair: '#4b3a55', style: 'spiky', shirt: '#ffd166', pants: '#6a5223', expr: 'smile' },
    { skin: '#e8bd9a', hair: '#3a2620', style: 'curly', shirt: '#ff9bd2', pants: '#7a3c5a', expr: 'grin' }
  ];

  function lookOf(m) {
    if (m && PERSON_LOOKS[m.id]) return PERSON_LOOKS[m.id];
    var s = String((m && (m.id || m.name)) || 'pinky');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return FALLBACK_LOOKS[h % FALLBACK_LOOKS.length];
  }

  function personSvg(m) {
    var L = lookOf(m);
    var hair = L.hair, style = L.style, shirt = L.shirt, pants = L.pants;
    var back = '';
    if (style === 'long') {
      back = '<rect x="7.3" y="9.2" width="13.4" height="12.6" rx="5.6" fill="' + hair + '"/>';
    } else if (style === 'bob') {
      back = '<rect x="7.6" y="9.4" width="12.8" height="9.4" rx="4.5" fill="' + hair + '"/>';
    } else if (style === 'pony') {
      back = '<circle cx="21.6" cy="14.6" r="2.7" fill="' + hair + '"/>'
        + '<rect x="18.8" y="9.8" width="4.4" height="4.4" rx="2.2" fill="' + hair + '"/>';
    } else if (style === 'bun') {
      back = '<circle cx="14" cy="5.2" r="2.4" fill="' + hair + '"/>';
    } else if (style === 'curly') {
      back = '<circle cx="9.2" cy="9.6" r="2.6" fill="' + hair + '"/>'
        + '<circle cx="14" cy="7.7" r="2.8" fill="' + hair + '"/>'
        + '<circle cx="18.8" cy="9.6" r="2.6" fill="' + hair + '"/>';
    }
    var fringe = '';
    if (style === 'side') {
      fringe = '<path d="M8.1 12.6C9.2 9.6 11.4 8 14 8c2.2 0 4 0.9 5.2 2.4-2.6 1.2-6.8 1.4-9.8 0.2z" fill="' + hair + '"/>';
    } else if (style === 'spiky') {
      fringe = '<path d="M8.2 10.4 9.5 6.4 11.4 8.8 13.1 5.2 14.9 8.6 16.8 5.8 18.4 8.4 19.8 10.4z" fill="' + hair + '"/>';
    }
    var eyes;
    if (L.expr === 'wink') {
      eyes = '<circle cx="16.2" cy="13.9" r="0.9" fill="#3a2a24"/>'
        + '<path d="M10.7 14q1.1 0.9 2.2 0" fill="none" stroke="#3a2a24" stroke-width="0.9" stroke-linecap="round"/>';
    } else {
      eyes = '<circle cx="11.9" cy="13.9" r="0.9" fill="#3a2a24"/>'
        + '<circle cx="16.1" cy="13.9" r="0.9" fill="#3a2a24"/>';
    }
    var mouth;
    if (L.expr === 'grin') {
      mouth = '<path d="M12.1 16.2h3.8a1.9 1.9 0 0 1-3.8 0z" fill="#b2504a"/>';
    } else if (L.expr === 'calm') {
      mouth = '<path d="M12.6 16.6h2.8" stroke="#8a4a3f" stroke-width="0.9" stroke-linecap="round"/>';
    } else {
      mouth = '<path d="M12.3 16.3q1.7 1.5 3.4 0" fill="none" stroke="#8a4a3f" stroke-width="0.9" stroke-linecap="round"/>';
    }
    var crown = (m && m.isChief)
      ? '<path d="M10 7.6 10 4.5 12.3 6.1 14 3.2 15.7 6.1 18 4.5 18 7.6z" fill="#ffd45e" stroke="#c9901a" stroke-width="0.5" stroke-linejoin="round"/>'
      : '';
    return '<svg class="ds-person" viewBox="0 0 28 38" aria-hidden="true" focusable="false">'
      + '<ellipse class="p-spot" cx="14" cy="36.2" rx="6.6" ry="1.7"/>'
      + back
      + '<rect x="10.9" y="28" width="2.8" height="6.6" rx="1.3" fill="' + pants + '"/>'
      + '<rect x="14.3" y="28" width="2.8" height="6.6" rx="1.3" fill="' + pants + '"/>'
      + '<rect x="10.3" y="33.6" width="3.5" height="2.3" rx="1.1" fill="#3b2b23"/>'
      + '<rect x="14.2" y="33.6" width="3.5" height="2.3" rx="1.1" fill="#33251f"/>'
      + '<rect x="7.5" y="20.2" width="2.2" height="7.4" rx="1.1" fill="' + shirt + '"/>'
      + '<rect x="18.3" y="20.2" width="2.2" height="7.4" rx="1.1" fill="' + shirt + '"/>'
      + '<rect x="9.5" y="18.6" width="9" height="10.8" rx="3.2" fill="' + shirt + '"/>'
      + '<path d="M11.6 18.8 14 20.9 16.4 18.8" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1" stroke-linecap="round"/>'
      + '<rect x="12.9" y="15" width="2.2" height="4.6" rx="1.1" fill="' + L.skin + '"/>'
      + '<circle cx="8" cy="13.4" r="1.3" fill="' + L.skin + '"/>'
      + '<circle cx="20" cy="13.4" r="1.3" fill="' + L.skin + '"/>'
      + '<circle cx="14" cy="12.9" r="6.2" fill="' + L.skin + '"/>'
      + '<path d="M7.8 12.9a6.2 6.2 0 0 1 12.4 0z" fill="' + hair + '"/>'
      + fringe
      + eyes + mouth
      + '<circle cx="10.2" cy="15.5" r="1.05" fill="#ff9aa6" opacity="0.45"/>'
      + '<circle cx="17.8" cy="15.5" r="1.05" fill="#ff9aa6" opacity="0.45"/>'
      + crown
      + '</svg>';
  }

  /* ---------- 사람 캐릭터 움직임 (✨ 움직임 ON / ⏸️ 멈춤) ---------- */
  var seatBase = {};
  var wanderPos = {};
  var wanderTimer = null;
  var wanderTick = 0;
  var WANDER_MS = 2400;

  function motionOn() {
    return !(state.settings && state.settings.motion === false);
  }

  function seatOf(id) {
    return document.querySelector('#seatLayer [data-seat="' + id + '"]');
  }

  function clampPct(v) { return Math.max(3, Math.min(97, v)); }

  /* 작업 중은 책상 앞에서 톡톡, 휴직은 빈백에서 느리게, 나머지는 통로·라운지 쪽으로 조금씩 */
  function wanderSpan(m) {
    if (m.isChief) return 0.8;
    if (onLeave(m)) return 1.1;
    if (displayStatus(m) === '작업 중') return 0.7;
    if (displayStatus(m) === '미연결') return 0.9;
    return 2.6;
  }

  function stepWander() {
    if (!motionOn()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    wanderTick++;
    state.members.forEach(function (m) {
      var base = seatBase[m.id];
      var el = seatOf(m.id);
      if (!base || !el) return;
      var span = wanderSpan(m);
      var nx, ny;
      if (!m.isChief && !onLeave(m) && displayStatus(m) !== '작업 중' && wanderTick % 5 === 0) {
        nx = clampPct(base.x + 2.5 + Math.random() * 4.5);   /* 카페 바·라운지(오른쪽) 쪽 큰 걸음 */
        ny = clampPct(base.y + (Math.random() * 2 - 1) * 3.2);
      } else {
        nx = clampPct(base.x + (Math.random() * 2 - 1) * span);
        ny = clampPct(base.y + (Math.random() * 2 - 1) * span * 0.8);
      }
      var prev = wanderPos[m.id];
      var left = nx < (prev ? prev.x : base.x);
      wanderPos[m.id] = { x: nx, y: ny, left: left };
      el.style.setProperty('--x', nx.toFixed(2));
      el.style.setProperty('--y', ny.toFixed(2));
      el.classList.toggle('is-left', left);
    });
  }

  function applyWanderPos() {
    if (!motionOn()) return;
    state.members.forEach(function (m) {
      var p = wanderPos[m.id];
      if (!p) return;
      var el = seatOf(m.id);
      if (!el) return;
      el.style.setProperty('--x', p.x.toFixed(2));
      el.style.setProperty('--y', p.y.toFixed(2));
      el.classList.toggle('is-left', !!p.left);
    });
  }

  function startWander() {
    if (wanderTimer) return;
    wanderTimer = setInterval(stepWander, WANDER_MS);
    setTimeout(stepWander, 800);   /* 첫 화면에서 바로 조금 움직이게 */
  }

  function stopWander() {
    if (wanderTimer) clearInterval(wanderTimer);
    wanderTimer = null;
  }

  function renderMotion() {
    var btn = $('motionToggle');
    var label = $('motionLabel');
    var room = $('pixelOffice');
    var on = motionOn();
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-on', on);
      btn.title = on ? '캐릭터가 오피스 안을 돌아다녀요 (누르면 멈춤)' : '캐릭터를 제자리에 멈췄어요 (누르면 다시 움직임)';
    }
    if (label) label.textContent = on ? '✨ 움직임 ON' : '⏸️ 멈춤';
    if (room) room.classList.toggle('is-motion-off', !on);
    if (on) startWander(); else stopWander();
  }

  function renderOfficeMeta() {
    var working = state.members.filter(function (m) { return displayStatus(m) !== '미연결' && !onLeave(m); }).length;
    if ($('officeCount')) $('officeCount').textContent = String(working);
    var latest = visibleThreads()[0];
    var live = latest
      ? memberName(latest.memberId) + ' ' + relTime(latest.updatedAt || latest.createdAt) + ' 활동'
      : '오늘도 출근 중';
    if ($('officeLive')) $('officeLive').textContent = live;
    if ($('liveNote')) $('liveNote').textContent = live;
  }

  /* 책상 상태: 작업 중(초록불·화면 반짝) · 대기(화면 켜짐) · 미연결(회색) · 휴직(꺼짐) · 대장 */
  function deskClass(m) {
    var c = 'desk-seat';
    if (m.isChief) c += ' is-chief';
    if (m.id === 'pinky') c += ' is-pinky';
    if (onLeave(m)) c += ' is-away';
    else if (displayStatus(m) === '미연결') c += ' is-off';
    else if (displayStatus(m) === '작업 중') c += ' is-working';
    else c += ' is-on';
    /* 움직임 애니메이션 종류: 작업 중은 톡톡, 휴직은 느리게, 나머지는 걷기 */
    if (m.isChief) c += ' is-idle';
    else if (onLeave(m)) c += ' is-sway';
    else if (displayStatus(m) === '작업 중') c += ' is-tap';
    else c += ' is-walk';
    return c;
  }

  function deskStateText(m) {
    return onLeave(m) ? '💤 휴직' : displayStatus(m);
  }

  /* 3D 클레이 디오라마(clay-office.webp) 위에 팀원 자리를 % 좌표로 얹습니다.
     왼쪽 긴 회의 테이블 8자리 · 가운데 소파 2 · 라운지 체어 2 · 오른쪽 휴게 빈백(휴직 자리).
     휴직한 팀원은 오른쪽 빈백/쉼터로 자리를 옮기고, 비워진 책상은 빈자리가 됩니다. */
  var CLAY_SEATS = [
    { x: 25.2, y: 40.4, zone: 'boss', side: 'r' },
    { x: 16.4, y: 50.8, side: 'l' }, { x: 35.0, y: 50.8, side: 'r' },
    { x: 16.4, y: 62.4, side: 'l' }, { x: 35.0, y: 62.4, side: 'r' },
    { x: 16.4, y: 74.0, side: 'l' }, { x: 35.0, y: 74.0, side: 'l' },
    { x: 51.4, y: 54.0, side: 'r' },
    { x: 40.6, y: 71.4, side: 'r' }, { x: 63.6, y: 70.0, side: 'r' },
    { x: 42.0, y: 45.0, side: 'r' }, { x: 57.4, y: 47.2, side: 'r' },
    { x: 86.4, y: 45.4, side: 'l' },
    { x: 72.0, y: 45.4, zone: 'lounge', side: 'r' }, { x: 80.0, y: 55.2, zone: 'lounge', side: 'l' }
  ];

  function deskHtml(m, seat) {
    var leave = onLeave(m);
    var mark = m.isChief ? '👑 ' : (leave ? '💤 ' : '');
    var cls = deskClass(m) + (seat.zone === 'boss' ? ' is-boss' : '') + (seat.side === 'l' ? ' name-left' : '');
    var walk = (1.8 + Math.random() * 1.1).toFixed(2);
    seatBase[m.id] = { x: seat.x, y: seat.y };
    return '<button type="button" class="' + cls + '" data-seat="' + esc(m.id) + '"'
      + ' style="--ring:' + ringOf(m.id) + ';--x:' + (seat.x) + ';--y:' + (seat.y) + ';--walk:' + walk + 's"'
      + ' aria-label="' + esc(m.name + ' · ' + (m.role || '') + ' · ' + deskStateText(m)) + '"'
      + ' title="' + esc(m.name + ' · ' + deskStateText(m)) + '">'
      + '<span class="ds-avatar" aria-hidden="true">' + personSvg(m) + '</span>'
      + '<span class="ds-name">' + esc(mark + m.name) + '</span>'
      + '<span class="ds-dot" aria-hidden="true"></span>'
      + '<span class="ds-state sr-only">' + esc(deskStateText(m)) + '</span>'
      + '</button>';
  }

  function renderSeatMap() {
    var layer = $('seatLayer');
    if (!layer) return;
    var chief = null;
    var team = [];
    state.members.forEach(function (m) {
      if (m.isChief && !chief) chief = m;
      else team.push(m);
    });
    seatBase = {};
    var deskQueue = CLAY_SEATS.filter(function (s) { return !s.zone; }).slice();
    var loungeQueue = CLAY_SEATS.filter(function (s) { return s.zone === 'lounge'; }).slice();
    var overflow = 0;
    function nextSeat(loungeFirst) {
      if (loungeFirst && loungeQueue.length) return loungeQueue.shift();
      if (deskQueue.length) return deskQueue.shift();
      if (loungeQueue.length) return loungeQueue.shift();
      var s = CLAY_SEATS[(overflow++) % CLAY_SEATS.length];
      return { x: s.x, y: Math.min(94, s.y + 3.6) };
    }
    function place(list, loungeFirst) {
      return list.map(function (m) { return deskHtml(m, nextSeat(loungeFirst)); }).join('');
    }
    var standing = team.filter(function (m) { return !onLeave(m); });
    var away = team.filter(function (m) { return onLeave(m); });
    var html = chief ? deskHtml(chief, CLAY_SEATS[0]) : '';
    html += place(away, true);   /* 휴직자는 먼저 오른쪽 빈백/쉼터 자리로 */
    html += place(standing);
    layer.innerHTML = html;
    layer.setAttribute('data-seats', String(state.members.length));
    applyWanderPos();
  }

  function renderWake() {
    var mode = (state.settings && state.settings.wakeMode) || '전원';
    if ($('wakeLabel')) $('wakeLabel').textContent = '깨움: ' + mode;
    if ($('wakeToggle')) $('wakeToggle').setAttribute('aria-pressed', mode === '지명만' ? 'true' : 'false');
    if ($('wakeHint')) $('wakeHint').textContent = mode === '지명만' ? '지명한 팀원만 답해요' : '필요한 팀원만 부르려면 「지명만」';
    var go = $('wakeGo');
    if (go) { go.hidden = mode === '지명만'; go.textContent = '지명만으로 바꾸기'; }
  }

  function renderTeam() {
    var grid = $('teamGrid');
    if (!grid) return;
    if ($('teamCount')) $('teamCount').textContent = state.members.length + '명';
    grid.innerHTML = state.members.map(function (m) {
      var isChief = !!m.isChief;
      var cls = 'team-card';
      if (isChief) cls += ' is-chief';
      if (m.id === 'pinky') cls += ' is-pinky';
      if (onLeave(m)) cls += ' is-away';
      var id = esc(m.id);
      var actions;
      if (isChief) {
        actions = ''
          + '<button type="button" class="btn btn-primary" data-act="board" data-member="' + id + '">📋 업무판 보기</button>'
          + '<button type="button" class="btn btn-ghost" data-act="meeting" data-member="' + id + '">💬 회의실</button>';
      } else {
        actions = ''
          + '<button type="button" class="btn btn-primary" data-act="meeting" data-member="' + id + '">💬 회의실에서 부르기</button>'
          + '<button type="button" class="btn btn-ghost" data-act="copy" data-member="' + id + '">🔗 연결 문구</button>';
      }
      var manage = isChief ? '' : '<div class="tc-actions tc-actions-sub">'
        + (onLeave(m)
          ? '<button type="button" class="btn btn-ghost btn-sm" data-act="resume" data-member="' + id + '">▶️ 복직</button>'
          : '<button type="button" class="btn btn-ghost btn-sm" data-act="leave" data-member="' + id + '">⏸️ 휴직</button>')
        + '<button type="button" class="btn btn-danger btn-sm" data-act="fire" data-member="' + id + '">🚪 해고</button>'
        + '</div>';
      return ''
        + '<article class="' + cls + '">'
        + '  <div class="tc-head">'
        + '    <div class="tc-avatar" aria-hidden="true">' + esc(m.emoji || '🙂') + '</div>'
        + '    <div class="tc-id">'
        + '      <div class="tc-name">' + esc(m.name) + '</div>'
        + '      <div class="tc-role">' + esc(m.role) + '</div>'
        + '    </div>'
        + '  </div>'
        + '  <span class="badge ' + badgeClass(displayStatus(m)) + '"><span class="dot"></span>' + esc(displayStatus(m)) + '</span>'
        + '  <p class="tc-desc">' + esc(m.desc || '') + '</p>'
        + '  <div class="tc-actions">' + actions + '</div>'
        + manage
        + '</article>';
    }).join('');
  }

  /* ---------- 렌더: 회의실 ---------- */
  function renderComposeSelect() {
    var sel = $('composeTo');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = state.members.filter(function (m) { return !m.isChief; }).map(function (m) {
      var leave = onLeave(m);
      return '<option value="' + esc(m.id) + '">' + esc((leave ? '💤 ' : '') + m.emoji + ' ' + m.name + ' · ' + m.status) + '</option>';
    }).join('');
    if (current && memberById(current) && !memberById(current).isChief) sel.value = current;
  }

  function renderComposeTarget() {
    var sel = $('composeTo');
    var el = $('composeTarget');
    if (!sel || !el) return;
    var m = memberById(sel.value);
    el.textContent = m
      ? (m.emoji + ' ' + m.name + (onLeave(m) ? ' · 💤 휴직 중' : '') + '에게 전달')
      : '전원에게 전달';
  }

  function renderReplyTarget() {
    var box = $('replyTarget');
    if (!box) return;
    var t = null;
    for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.replyTarget) t = state.threads[i];
    if (!t) { ui.replyTarget = null; box.hidden = true; }
    else {
      box.hidden = false;
      if ($('replyTargetText')) $('replyTargetText').textContent = '이어서 · ' + t.title;
    }
    if ($('composeBody')) $('composeBody').placeholder = t ? memberName(t.memberId) + '에게 이어서 말하기' : '메시지 입력';
  }

  /* ---------- 렌더: 단톡방 말풍선 ---------- */
  function ticketBar(t) {
    return '<div class="ticket-bar">'
      + '<button type="button" class="tb-main" data-thread="' + esc(t.id) + '">'
      + '<span class="tb-ico" aria-hidden="true">🎫</span>'
      + '<span class="tb-title">' + esc(t.title) + '</span>'
      + '<span class="tag ' + tagClass(t.status) + '">' + esc(t.status) + '</span>'
      + '<span class="tb-more">전체보기 ›</span>'
      + '</button>'
      + '<button type="button" class="tb-reply" data-reply="' + esc(t.id) + '" aria-label="이 티켓에 이어서 말하기">↩</button>'
      + '</div>';
  }

  function bubble(t, msg) {
    var chief = msg.from === 'chief';
    var via = viaLabel(msg.via);
    var isTg = via.indexOf('텔레그램') === 0;
    var isGroq = via.indexOf('⚡') === 0;
    var src = via ? '<span class="src-badge' + (isTg ? ' is-tg' : (isGroq ? ' is-groq' : '')) + '">' + esc(via) + '</span>' : '';
    if (chief) {
      return '<div class="bubble-row is-chief">'
        + '<div class="b-main">'
        + '<div class="bubble b-me">' + esc(msg.text) + '</div>'
        + '<div class="b-time">' + esc(fmtChatTime(msg.at)) + '</div>'
        + '</div>'
        + '<div class="b-ava is-me" aria-hidden="true">예</div>'
        + '</div>';
    }
    /* 3인 회의: 답글마다 작성자(msg.memberId)를 먼저 보고 이름·아바타·색을 고릅니다. */
    var authorId = msgAuthorId(t, msg);
    var leaveChip = onLeaveId(authorId) ? ' <span class="leave-chip">💤 휴직</span>' : '';
    return '<div class="bubble-row is-member">'
      + '<div class="b-ava' + (onLeaveId(authorId) ? ' is-away' : '') + '" style="--ring:' + ringOf(authorId) + '" aria-hidden="true">' + esc(memberEmoji(authorId)) + '</div>'
      + '<div class="b-main">'
      + '<div class="b-who"><span class="b-name">' + esc(memberName(authorId)) + '</span>' + leaveChip + src + '</div>'
      + '<div class="bubble b-ai">' + esc(msg.text) + '</div>'
      + '<div class="b-time">' + esc(fmtChatTime(msg.at)) + '</div>'
      + '</div>'
      + '</div>';
  }

  function renderChatStream() {
    var box = $('chatStream');
    if (!box) return;
    var threads = visibleThreads();
    var items = [];
    threads.forEach(function (t) {
      (t.messages || []).forEach(function (msg) {
        items.push({ t: t, m: msg, at: new Date(msg.at || t.createdAt).getTime() || 0 });
      });
    });
    if (!items.length) {
      box.innerHTML = '<div class="chat-empty">'
        + '<div class="ce-ico" aria-hidden="true">💬</div>'
        + '<p><b>단톡방이 조용해요.</b><br>아래 입력창에서 담당을 고르고 첫 지시를 보내 보세요.</p>'
        + '</div>';
      return;
    }
    items.sort(function (a, b) { return a.at - b.at; });
    var html = [];
    var lastThread = null;
    var lastDay = '';
    items.forEach(function (it) {
      var when = it.m.at || it.t.createdAt;
      var day = dayKey(when);
      if (day !== lastDay) {
        html.push('<div class="day-divider"><span>' + esc(dayLabel(when)) + '</span></div>');
        lastDay = day;
      }
      if (!lastThread || lastThread.id !== it.t.id) {
        html.push(ticketBar(it.t));
        lastThread = it.t;
      }
      html.push(bubble(it.t, it.m));
    });
    box.innerHTML = html.join('');
  }

  function scrollChatEnd() {
    var box = $('chatStream');
    if (!box) return;
    var last = box.lastElementChild;
    if (last && typeof last.scrollIntoView === 'function') {
      try { last.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (err) { /* 무시 */ }
    }
  }

  function renderMeeting() {
    renderComposeSelect();
    var list = $('threadList');
    var count = $('threadCount');
    var threads = visibleThreads();
    if (count) count.textContent = threads.length + '건';
    var hookState = $('webhookState');
    if (hookState) {
      hookState.textContent = state.settings.webhookUrl ? ('웹훅 연결됨 · ' + state.settings.webhookKind) : '웹훅 미설정';
    }
    if (!list) return;
    list.innerHTML = threads.length ? threads.map(function (t) {
      var last = t.messages && t.messages.length ? t.messages[t.messages.length - 1] : null;
      var preview = last ? (last.from === 'chief' ? '대장: ' : memberName(msgAuthorId(t, last)) + ': ') + last.text : '내용 없음';
      return ''
        + '<button type="button" class="thread-item" data-thread="' + esc(t.id) + '">'
        + '  <span class="ti-avatar" style="--ring:' + ringOf(t.memberId) + '" aria-hidden="true">' + esc(memberEmoji(t.memberId)) + '</span>'
        + '  <span class="ti-body">'
        + '    <span class="ti-top">'
        + '      <span class="ti-title">' + esc(t.title) + '</span>'
        + '      <span class="tag ' + tagClass(t.status) + '">' + esc(t.status) + '</span>'
        + '    </span>'
        + '    <span class="ti-preview">' + esc(preview) + '</span>'
        + '    <span class="ti-time">' + esc(memberName(t.memberId)) + (onLeaveId(t.memberId) ? ' · 💤 휴직' : '') + ' · ' + esc(fmtTime(t.updatedAt || t.createdAt)) + '</span>'
        + '  </span>'
        + '</button>';
    }).join('') : '<span class="rail-empty">아직 티켓이 없어요. 아래 입력창에서 첫 지시를 보내 보세요.</span>';
    renderChatStream();
    renderReplyTarget();
    renderComposeTarget();
  }

  /* ---------- 렌더: 업무판 ---------- */
  function renderOwnerFilterChip() {
    var chip = $('ownerFilterChip');
    if (!chip) return;
    if (ui.ownerFilter && memberById(ui.ownerFilter)) {
      chip.hidden = false;
      chip.textContent = '담당: ' + memberName(ui.ownerFilter) + ' ✕';
    } else {
      chip.hidden = true;
      ui.ownerFilter = null;
    }
    Array.prototype.forEach.call(document.querySelectorAll('#boardFilters .chip[data-filter]'), function (c) {
      c.classList.toggle('is-active', c.getAttribute('data-filter') === ui.statusFilter);
    });
  }

  function renderBoard() {
    renderOwnerFilterChip();
    var board = $('board');
    if (!board) return;
    var columns = ui.statusFilter === '전체' ? TASK_STATUS : [ui.statusFilter];
    board.style.gridTemplateColumns = columns.length === 1 ? '1fr' : '';

    var tasks = visibleTasks().filter(function (t) {
      return !ui.ownerFilter || t.ownerId === ui.ownerFilter;
    });

    if (!tasks.length) {
      board.innerHTML = '<div class="empty">'
        + (state.demoMode ? '업무가 없어요.' : '데모 데이터가 숨겨져 있어요.<br>오른쪽 위 <b>＋ 새 업무</b>로 직접 추가해 보세요.')
        + '</div>';
      return;
    }

    board.innerHTML = columns.map(function (status) {
      var colTasks = tasks.filter(function (t) { return t.status === status; });
      var cards = colTasks.map(function (t) {
        var idx = TASK_STATUS.indexOf(t.status);
        var prev = idx > 0 ? '<button type="button" class="mini-btn" data-act="move" data-dir="-1" data-task="' + esc(t.id) + '" aria-label="이전 상태로">←</button>' : '<button type="button" class="mini-btn" data-act="move" data-dir="-1" data-task="' + esc(t.id) + '" disabled aria-label="이전 상태로">←</button>';
        var next = idx < TASK_STATUS.length - 1 ? '<button type="button" class="mini-btn" data-act="move" data-dir="1" data-task="' + esc(t.id) + '" aria-label="다음 상태로">→</button>' : '<button type="button" class="mini-btn" data-act="move" data-dir="1" data-task="' + esc(t.id) + '" disabled aria-label="다음 상태로">→</button>';
        return ''
          + '<div class="task">'
          + '  <div class="task-top">'
          + '    <button type="button" class="task-title" data-act="edit" data-task="' + esc(t.id) + '">' + esc(t.title) + '</button>'
          + '  </div>'
          + (t.note ? '<p class="task-note">' + esc(t.note) + '</p>' : '')
          + '  <div class="task-foot">'
          + '    <span class="owner-tag">' + esc(memberEmoji(t.ownerId) + ' ' + memberName(t.ownerId)) + '</span>'
          + '    <span class="mini-btns">' + prev + next + '</span>'
          + '  </div>'
          + '</div>';
      }).join('');
      return ''
        + '<section class="col" data-status="' + esc(status) + '">'
        + '  <div class="col-head">'
        + '    <span class="col-mark" aria-hidden="true"></span>'
        + '    <span class="col-title">' + esc(status) + '</span>'
        + '    <span class="col-count">' + colTasks.length + '</span>'
        + '  </div>'
        + '  <div class="col-body">' + (cards || '<div class="empty" style="padding:14px 8px;">비어 있어요</div>') + '</div>'
        + '</section>';
    }).join('');
  }

  /* ---------- 렌더: 교육서 / 설정 ---------- */
  function renderReportFormats() {
    var box = $('reportFormats');
    if (!box) return;
    box.innerHTML = state.members.map(function (m) {
      var lines = [
        '결론: ' + (m.isChief ? '결정 내용 한 줄' : m.name + '이 내린 결론 한 줄'),
        '한 일: 3줄 이내 · 결과물 이름 포함',
        '확인 필요: 대장 승인/질문 최대 3개',
        '다음 단계: 다음에 할 일 1개'
      ];
      if (m.role.indexOf('검수') > -1) lines.push('검수 의견: 통과/보류 + 이유 1줄');
      if (m.role.indexOf('리서치') > -1 || m.role.indexOf('조사') > -1) lines.push('출처: 링크 또는 자료명');
      return '<div class="report-card"><h4>' + esc(m.emoji + ' ' + m.name) + ' <span class="muted small">' + esc(m.role) + '</span></h4><pre>' + esc(lines.join('\n')) + '</pre></div>';
    }).join('');
  }

  function renderSettings() {
    var list = $('memberAdmin');
    if (list) {
      list.innerHTML = state.members.map(function (m) {
        return ''
          + '<div class="admin-row">'
          + '  <span class="admin-emoji" aria-hidden="true">' + esc(m.emoji || '🙂') + '</span>'
          + '  <div>'
          + '    <b>' + esc(m.name) + (m.isChief ? ' <span class="muted small">(대장)</span>' : '') + '</b>'
          + '    <p class="muted small">' + esc(m.role) + ' · ' + esc(m.status) + (m.connected ? ' · 연결됨' : ' · 미연결') + '</p>'
          + '  </div>'
          + '  <div class="admin-actions">'
          + '    <button type="button" class="mini-btn" data-act="edit-member" data-member="' + esc(m.id) + '">편집</button>'
          + (m.isChief ? '' : '<button type="button" class="mini-btn" data-act="del-member" data-member="' + esc(m.id) + '">삭제</button>')
          + '  </div>'
          + '</div>';
      }).join('');
    }
    if ($('webhookUrl')) $('webhookUrl').value = state.settings.webhookUrl || '';
    if ($('webhookKind')) $('webhookKind').value = state.settings.webhookKind || 'n8n';
    if ($('apiUrl')) $('apiUrl').value = state.settings.apiUrl || '';
    if ($('apiSecret')) $('apiSecret').value = state.settings.apiSecret || '';
    renderSyncState();
  }

  function renderAll() {
    renderDemoToggle();
    renderOfficeMeta();
    renderStats();
    renderSeatMap();
    renderMotion();
    renderWake();
    renderTeam();
    renderMeeting();
    renderBoard();
    renderSyncState();
    if ($('modal-settings') && !$('modal-settings').hidden) renderSettings();
    if ($('modal-guide') && !$('modal-guide').hidden) renderReportFormats();
    if ($('modal-seat') && !$('modal-seat').hidden) renderSeatSheet();
  }

  /* ---------- 모달 ---------- */
  var lastFocus = null;

  function openModal(id) {
    var modal = $(id);
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (id === 'modal-settings') renderSettings();
    if (id === 'modal-guide') renderReportFormats();
    var focusable = modal.querySelector('input:not([type="hidden"]), textarea, select, button');
    if (focusable) {
      setTimeout(function () { try { focusable.focus({ preventScroll: true }); } catch (err) {} }, 60);
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (err) {}
    }
  }

  function closeTopModal() {
    var open = Array.prototype.slice.call(document.querySelectorAll('.modal')).filter(function (m) { return !m.hidden; });
    if (open.length) closeModal(open[open.length - 1]);
  }

  /* ---------- 웹훅 ---------- */
  function sendWebhook(payload) {
    var url = (state.settings.webhookUrl || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast('웹훅 URL이 http(s)로 시작하지 않아 보내지 못했어요.');
      return;
    }
    var body = JSON.stringify(payload);
    if (typeof fetch !== 'function') return;
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        mode: 'cors'
      }).then(function (res) {
        if (res.ok) toast('웹훅으로도 보냈어요 · ' + state.settings.webhookKind);
        else toast('웹훅 응답이 ' + res.status + ' 이에요. 지시는 저장됐어요.');
      }).catch(function () {
        toast('지시는 저장했지만 웹훅 전송이 막혔어요 (CORS 설정 확인)');
      });
    } catch (err) {
      toast('지시는 저장했지만 웹훅을 보내지 못했어요.');
    }
  }

  /* ---------- 동작: 회의실 ---------- */
  function createThread(memberId, title, body, status) {
    var now = new Date().toISOString();
    var target = memberById(memberId);
    var thread = {
      id: uid('th'),
      memberId: memberId,
      title: title,
      status: status,
      createdAt: now,
      updatedAt: now,
      demo: false,
      messages: []
    };
    if (body) {
      thread.messages.push({ id: uid('m'), from: 'chief', text: body, at: now });
    }
    state.threads.push(thread);
    save();
    sendWebhook({
      type: '지시',
      office: '핑키오피스',
      chief: '김예은',
      to: memberName(memberId),
      title: title,
      message: body || '',
      status: status,
      createdAt: now,
      text: '[' + memberName(memberId) + '] ' + title + (body ? '\n' + body : '')
    });
    return thread;
  }

  function openThread(id) {
    var thread = null;
    for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === id) thread = state.threads[i];
    if (!thread) return;
    ui.threadId = id;
    renderThreadModal();
    openModal('modal-thread');
  }

  function renderThreadModal() {
    var thread = null;
    for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.threadId) thread = state.threads[i];
    if (!thread) return;
    $('threadTitle').textContent = thread.title;
    $('threadMeta').textContent = memberEmoji(thread.memberId) + ' ' + memberName(thread.memberId)
      + (onLeaveId(thread.memberId) ? ' · 💤 휴직 중' : '')
      + ' · ' + fmtFull(thread.createdAt) + ' 시작';

    Array.prototype.forEach.call($('threadStatusSwitch').querySelectorAll('button'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-status') === thread.status);
    });

    $('threadMessages').innerHTML = (thread.messages || []).map(function (msg) {
      var isChief = msg.from === 'chief';
      var via = viaLabel(msg.via);
      if (isChief) {
        return '<div class="msg msg-chief">'
          + '  <div class="msg-col">'
          + '    <div class="msg-bubble">' + esc(msg.text) + '</div>'
          + '    <span class="msg-meta">' + esc(fmtChatTime(msg.at) + (via ? ' · ' + via : '')) + '</span>'
          + '  </div>'
          + '</div>';
      }
      var authorId = msgAuthorId(thread, msg);
      var isGroq = via.indexOf('⚡') === 0;
      return '<div class="msg msg-member">'
        + '  <span class="msg-ava" style="--ring:' + ringOf(authorId) + '" aria-hidden="true">' + esc(memberEmoji(authorId)) + '</span>'
        + '  <div class="msg-col">'
        + '    <span class="msg-who">' + esc(memberName(authorId)) + (via ? ' <span class="src-badge' + (isGroq ? ' is-groq' : '') + '">' + esc(via) + '</span>' : '') + '</span>'
        + '    <div class="msg-bubble">' + esc(msg.text) + '</div>'
        + '    <span class="msg-meta">' + esc(fmtChatTime(msg.at)) + '</span>'
        + '  </div>'
        + '</div>';
    }).join('') || '<div class="empty">아직 대화가 없어요.</div>';

    $('replyFrom').value = thread.messages && thread.messages.length && thread.messages[thread.messages.length - 1].from === 'member' ? 'chief' : 'member';
    $('replyBody').value = '';
    var box = $('threadMessages');
    box.scrollTop = box.scrollHeight;
  }

  function setThreadStatus(status) {
    if (THREAD_STATUS.indexOf(status) === -1) return;
    var thread = null;
    for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.threadId) thread = state.threads[i];
    if (!thread) return;
    thread.status = status;
    thread.updatedAt = new Date().toISOString();
    save();
    renderThreadModal();
    renderMeeting();
    renderStats();
    toast('상태를 「' + status + '」(으)로 바꿨어요.');
  }

  /* ---------- 동작: 업무판 ---------- */
  function openTaskModal(taskId) {
    var task = null;
    if (taskId) {
      for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === taskId) task = state.tasks[i];
    }
    $('taskTitle').textContent = task ? '업무 수정' : '새 업무';
    $('taskId').value = task ? task.id : '';
    $('taskName').value = task ? task.title : '';
    $('taskNote').value = task ? (task.note || '') : '';
    $('taskStatus').value = task ? task.status : '대기';
    var ownerSel = $('taskOwner');
    ownerSel.innerHTML = state.members.map(function (m) {
      return '<option value="' + esc(m.id) + '">' + esc(m.emoji + ' ' + m.name) + '</option>';
    }).join('');
    ownerSel.value = task ? task.ownerId : (ui.ownerFilter || (state.members[1] ? state.members[1].id : state.members[0].id));
    var del = $('deleteTaskBtn');
    if (del) del.hidden = !task;
    openModal('modal-task');
  }

  function moveTask(taskId, dir) {
    var task = null;
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === taskId) task = state.tasks[i];
    if (!task) return;
    var idx = TASK_STATUS.indexOf(task.status);
    var next = idx + dir;
    if (next < 0 || next >= TASK_STATUS.length) return;
    task.status = TASK_STATUS[next];
    task.updatedAt = new Date().toISOString();
    save();
    renderBoard();
    renderStats();
  }

  /* ---------- 동작: 팀원 ---------- */
  function openMemberModal(id) {
    var m = null;
    if (id) {
      for (var i = 0; i < state.members.length; i++) if (state.members[i].id === id) m = state.members[i];
    }
    $('memberTitle').textContent = m ? '팀원 편집' : '팀원 추가';
    $('memberId').value = m ? m.id : '';
    $('memberEmoji').value = m ? m.emoji : '🙂';
    $('memberName').value = m ? m.name : '';
    $('memberRole').value = m ? m.role : '';
    $('memberDesc').value = m ? (m.desc || '') : '';
    $('memberStatus').value = m ? m.status : '대기';
    $('memberConnected').checked = m ? !!m.connected : false;
    openModal('modal-member');
  }

  /* ---------- 동작: 좌석 카드 · 팀원 부르기 ---------- */
  function makeTitle(text) {
    var line = String(text || '').replace(/\s+/g, ' ').trim();
    if (line.length > 24) line = line.slice(0, 24).trim() + '…';
    return line || '새 지시';
  }

  function openSeat(id) {
    if (!memberById(id)) return;
    ui.seatId = id;
    renderSeatSheet();
    openModal('modal-seat');
  }

  function renderSeatSheet() {
    var m = memberById(ui.seatId);
    var modal = $('modal-seat');
    if (!m) { if (modal) closeModal(modal); return; }
    $('seatTitle').textContent = m.name + ' 팀원 카드';
    $('seatMeta').textContent = onLeave(m)
      ? '휴직 중 · 복직을 누를 때까지 단톡방 답변을 받지 않아요'
      : (isConnected(m) ? '연결됨 · 단톡방에서 바로 답해요' : '미연결 · 연결 문구를 복사해 초대하세요');
    $('seatEmoji').textContent = m.emoji || '🙂';
    $('seatEmoji').style.setProperty('--ring', ringOf(m.id));
    $('seatName').textContent = m.name;
    $('seatRole').textContent = m.role || '';
    var badge = $('seatBadge');
    badge.className = 'badge ' + badgeClass(displayStatus(m));
    badge.innerHTML = '<span class="dot"></span>' + esc(displayStatus(m));
    $('seatDesc').textContent = m.desc || '';
    var acts;
    if (m.isChief) {
      acts = '<button type="button" class="btn btn-primary" data-act="board" data-member="' + esc(m.id) + '">📋 업무판 보기</button>'
        + '<button type="button" class="btn btn-ghost" data-act="meeting" data-member="' + esc(m.id) + '">💬 대장으로 말하기</button>';
    } else {
      acts = '<button type="button" class="btn btn-primary" data-act="meeting" data-member="' + esc(m.id) + '">💬 @' + esc(m.name) + ' 부르기</button>'
        + '<button type="button" class="btn btn-ghost" data-act="copy" data-member="' + esc(m.id) + '">🔗 연결 문구 복사</button>'
        + '<button type="button" class="btn btn-ghost" data-act="board" data-member="' + esc(m.id) + '">📋 담당 업무</button>'
        + (onLeave(m)
          ? '<button type="button" class="btn btn-return" data-act="resume" data-member="' + esc(m.id) + '">▶️ 복직</button>'
          : '<button type="button" class="btn btn-leave" data-act="leave" data-member="' + esc(m.id) + '">⏸️ 휴직</button>')
        + '<button type="button" class="btn btn-danger" data-act="fire" data-member="' + esc(m.id) + '">🚪 해고</button>';
    }
    $('seatActions').innerHTML = acts;
  }

  function handleMemberAction(act, id) {
    var m = memberById(id);
    var seat = $('modal-seat');
    if (act === 'leave' || act === 'resume') {
      setMemberLeave(id, act === 'leave');
      return;
    }
    if (act === 'fire') {
      fireMember(id);
      return;
    }
    if (seat && !seat.hidden) closeModal(seat);
    if (act === 'board') {
      ui.ownerFilter = id;
      ui.statusFilter = '전체';
      switchView('board');
      renderBoard();
      toast(memberName(id) + ' 담당 업무만 보고 있어요.');
      return;
    }
    if (act === 'meeting') {
      switchView('meeting');
      var sel = $('composeTo');
      if (sel) sel.value = id;
      renderComposeTarget();
      ui.replyTarget = null;
      renderReplyTarget();
      var body = $('composeBody');
      if (body && m) {
        var mention = '@' + m.name + ' ';
        if (!body.value.trim()) body.value = mention;
        else if (body.value.indexOf('@' + m.name) !== 0) body.value = mention + body.value;
      }
      if (body) setTimeout(function () { try { body.focus({ preventScroll: true }); } catch (err) {} }, 140);
      toast((m ? m.name : '팀원') + '에게 말을 걸어 보세요.');
      return;
    }
    if (act === 'copy') {
      if (!m) return;
      var okMessage = m.name + ' 연결 문구를 복사했어요. 그 AI에 붙여넣으세요.';
      if (markConnectionCopied(m)) {
        okMessage = m.name + ' 연결 문구를 복사했어요. 상태를 「대기 · 연결됨」으로 바꿨어요 — 이제 그 AI가 단톡방을 읽고 답글을 남길 수 있어요.';
      }
      copyText(buildPrompt(m), okMessage);
    }
  }

  /* ---------- 동작: 휴직 · 복직 · 해고 ---------- */
  function setMemberLeave(id, leave) {
    var m = memberById(id);
    if (!m || m.isChief) return;
    m.status = leave ? LEAVE_STATUS : '대기';
    save();
    renderAll();
    renderMeeting();
    toast(leave
      ? m.name + ' 휴직 처리 완료 · 책상 컴퓨터를 껐어요 💤'
      : m.name + ' 복직 완료 · 제자리로 돌아왔어요 ▶️');
  }

  function removeMember(id) {
    var m = memberById(id);
    if (!m || m.isChief) return false;
    state.members = state.members.filter(function (x) { return x.id !== id; });
    if (!Array.isArray(state.fired)) state.fired = [];
    if (state.fired.indexOf(id) === -1) state.fired.push(id);
    if (ui.seatId === id) ui.seatId = null;
    if (ui.ownerFilter === id) ui.ownerFilter = null;
    save();
    renderAll();
    return true;
  }

  function fireMember(id) {
    var m = memberById(id);
    if (!m || m.isChief) return;
    if (!window.confirm('「' + m.name + '」 팀원을 해고할까요?\n오피스 자리와 팀 목록에서 빠져요. 업무·지시 기록은 그대로 남아요.')) return;
    var seat = $('modal-seat');
    if (seat && !seat.hidden) closeModal(seat);
    if (removeMember(id)) toast(m.name + ' 팀원을 해고했어요. 책상이 비었어요 🚪');
  }

  /* ---------- 이벤트 ---------- */
  var bound = false;
  function bind() {
    if (bound) return;   /* DOMContentLoaded가 두 번 와도 이벤트가 겹치지 않게 */
    bound = true;
    // 탭
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { switchView(tab.getAttribute('data-view')); });
    });

    // 모달 열기/닫기
    document.addEventListener('click', function (e) {
      var opener = e.target.closest('[data-open]');
      if (opener) {
        var which = opener.getAttribute('data-open');
        openModal(which === 'guide' ? 'modal-guide' : 'modal-settings');
        return;
      }
      var closer = e.target.closest('[data-close]');
      if (closer) {
        closeModal(closer.closest('.modal'));
        return;
      }
      var gotoBtn = e.target.closest('[data-goto]');
      if (gotoBtn) {
        switchView(gotoBtn.getAttribute('data-goto'));
        return;
      }
      if (e.target.classList && e.target.classList.contains('modal')) {
        closeModal(e.target);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTopModal();
    });

    // 데모 모드
    $('demoToggle').addEventListener('click', function () {
      state.demoMode = !state.demoMode;
      save();
      renderAll();
      toast(state.demoMode ? '데모 모드를 켰어요. 예시 데이터가 보여요.' : '데모 모드를 껐어요. 내가 만든 것만 보여요.');
    });

    // 팀원 부르기·연결 문구 (우리 팀 카드 + 좌석 카드 공용)
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act][data-member]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act !== 'board' && act !== 'meeting' && act !== 'copy' && act !== 'leave' && act !== 'resume' && act !== 'fire') return;
      handleMemberAction(act, btn.getAttribute('data-member'));
    });

    // 좌석 맵: 팀원 자리 누르기
    if ($('seatLayer')) {
      $('seatLayer').addEventListener('click', function (e) {
        var seat = e.target.closest('[data-seat]');
        if (seat) openSeat(seat.getAttribute('data-seat'));
      });
    }

    // 오피스 바: 캐릭터 움직임 ON/OFF
    if ($('motionToggle')) {
      $('motionToggle').addEventListener('click', function () {
        state.settings.motion = !motionOn();
        save(false);
        renderMotion();
        toast(motionOn() ? '캐릭터가 다시 돌아다녀요 ✨' : '캐릭터를 제자리에 멈췄어요 ⏸️');
      });
    }

    // 오피스 바: 좌석 맵 접기/펼치기
    if ($('officeToggle')) {
      $('officeToggle').addEventListener('click', function () {
        ui.officeOpen = !ui.officeOpen;
        if ($('seatWrap')) $('seatWrap').hidden = !ui.officeOpen;
        $('officeToggle').setAttribute('aria-expanded', ui.officeOpen ? 'true' : 'false');
        if ($('officeFold')) $('officeFold').textContent = ui.officeOpen ? '접기' : '펼치기';
      });
    }

    // 공지 바: 깨움 범위·팀장
    function toggleWake() {
      var mode = state.settings.wakeMode === '지명만' ? '전원' : '지명만';
      state.settings.wakeMode = mode;
      save();
      renderWake();
      toast(mode === '지명만' ? '지명한 팀원만 답해요. 메시지에 @이름을 적어 주세요.' : '전원이 깨어 있어요. 새 티켓은 담당에게 전달돼요.');
    }
    if ($('wakeToggle')) $('wakeToggle').addEventListener('click', toggleWake);
    if ($('wakeGo')) $('wakeGo').addEventListener('click', toggleWake);
    if ($('leadChip')) {
      $('leadChip').addEventListener('click', function () {
        switchView('office');
        toast('팀장은 김예은 대장이에요. 모든 결정의 최종 승인자예요.');
      });
    }

    // 입력바: 티켓 설정·답장 대상·자동 높이
    if ($('composeMoreBtn')) {
      $('composeMoreBtn').addEventListener('click', function () {
        var box = $('composeExtra');
        var open = box.hidden;
        box.hidden = !open;
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.textContent = open ? '− 티켓 설정' : '＋ 티켓 설정';
        if (open && $('composeTitle')) {
          setTimeout(function () { try { $('composeTitle').focus({ preventScroll: true }); } catch (err) {} }, 60);
        }
      });
    }
    if ($('composeTo')) $('composeTo').addEventListener('change', renderComposeTarget);
    if ($('replyTargetClear')) {
      $('replyTargetClear').addEventListener('click', function () {
        ui.replyTarget = null;
        renderReplyTarget();
        toast('답장 대상을 풀었어요. 다음 메시지는 새 티켓으로 열려요.');
      });
    }
    if ($('composeBody')) {
      var bodyEl = $('composeBody');
      bodyEl.addEventListener('input', function () {
        bodyEl.style.height = 'auto';
        bodyEl.style.height = Math.min(120, bodyEl.scrollHeight || 0) + 'px';
      });
      bodyEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          var form = $('composeForm');
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      });
    }

    // 단톡방: 말풍선 · 티켓 바
    if ($('chatStream')) {
      $('chatStream').addEventListener('click', function (e) {
        var reply = e.target.closest('[data-reply]');
        if (reply) {
          ui.replyTarget = reply.getAttribute('data-reply');
          renderReplyTarget();
          if ($('composeBody')) { try { $('composeBody').focus({ preventScroll: true }); } catch (err) {} }
          toast('이 티켓에 이어서 말해요.');
          return;
        }
        var th = e.target.closest('[data-thread]');
        if (th) openThread(th.getAttribute('data-thread'));
      });
    }

    // 회의실: 새 지시
    $('composeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var memberId = $('composeTo').value;
      var body = $('composeBody').value.trim();
      var title = $('composeTitle').value.trim();
      var status = $('composeStatus').value;
      if (!memberId) { toast('담당을 먼저 골라 주세요.'); return; }
      if (!body && !title) { toast('메시지를 적어 주세요.'); return; }
      if (!title) title = makeTitle(body);

      // "@이름"으로 시작하면 그 팀원을 담당으로 바꿉니다.
      var mention = (body || '').match(/^@([^\s]+)/);
      if (mention) {
        var named = null;
        state.members.forEach(function (m) { if (!m.isChief && m.name === mention[1]) named = m; });
        if (named) {
          memberId = named.id;
          if ($('composeTo')) $('composeTo').value = named.id;
          renderComposeTarget();
        }
      }

      var target = null;
      for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.replyTarget) target = state.threads[i];
      var now = new Date().toISOString();
      if (target) {
        target.messages = target.messages || [];
        target.messages.push({ id: uid('m'), from: 'chief', text: body || title, at: now });
        target.updatedAt = now;
        if (status !== '대기') target.status = status;
        save();
        renderAll();
        scrollChatEnd();
        toast(memberName(target.memberId) + '에게 이어서 보냈어요.');
        if (onLeaveId(target.memberId)) toast(memberName(target.memberId) + '은(는) 지금 휴직 중이에요. 복직하면 그때 답할 수 있어요 💤');
      } else {
        var created = createThread(memberId, title, body, status);
        renderAll();
        scrollChatEnd();
        toast(memberName(memberId) + '에게 지시를 보냈어요.');
        if (onLeaveId(memberId)) toast(memberName(memberId) + '은(는) 지금 휴직 중이에요. 복직하면 그때 답할 수 있어요 💤');
      }
      $('composeTitle').value = '';
      $('composeBody').value = '';
      $('composeStatus').value = '대기';
      if ($('composeExtra')) {
        $('composeExtra').hidden = true;
        if ($('composeMoreBtn')) {
          $('composeMoreBtn').textContent = '＋ 티켓 설정';
          $('composeMoreBtn').setAttribute('aria-expanded', 'false');
        }
      }
      if ($('composeBody')) $('composeBody').style.height = 'auto';
    });

    // 회의실: 목록
    $('threadList').addEventListener('click', function (e) {
      var item = e.target.closest('[data-thread]');
      if (item) openThread(item.getAttribute('data-thread'));
    });

    // 회의실: 상태 변경
    $('threadStatusSwitch').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-status]');
      if (btn) setThreadStatus(btn.getAttribute('data-status'));
    });

    // 회의실: 답글
    $('replyForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var thread = null;
      for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.threadId) thread = state.threads[i];
      if (!thread) return;
      var text = $('replyBody').value.trim();
      if (!text) { toast('답글 내용을 적어 주세요.'); return; }
      var from = $('replyFrom').value === 'chief' ? 'chief' : 'member';
      thread.messages.push({ id: uid('m'), from: from, text: text, at: new Date().toISOString() });
      thread.updatedAt = new Date().toISOString();
      if (from === 'member' && thread.status === '대기') thread.status = '작업 중';
      save();
      renderThreadModal();
      renderMeeting();
      renderStats();
      toast('답글을 남겼어요.');
    });

    // 회의실: 삭제
    $('deleteThreadBtn').addEventListener('click', function () {
      if (!ui.threadId) return;
      var thread = null;
      for (var i = 0; i < state.threads.length; i++) if (state.threads[i].id === ui.threadId) thread = state.threads[i];
      if (!thread) return;
      if (!window.confirm('「' + thread.title + '」 지시와 답글을 모두 지울까요?')) return;
      state.threads = state.threads.filter(function (t) { return t.id !== ui.threadId; });
      ui.threadId = null;
      save();
      closeModal($('modal-thread'));
      renderAll();
      toast('지시를 지웠어요.');
    });

    // 업무판: 필터
    $('boardFilters').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      if (chip.id === 'ownerFilterChip') {
        ui.ownerFilter = null;
        renderBoard();
        return;
      }
      ui.statusFilter = chip.getAttribute('data-filter');
      renderBoard();
    });

    // 업무판: 카드
    $('board').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-task');
      if (act === 'move') moveTask(id, parseInt(btn.getAttribute('data-dir'), 10));
      else if (act === 'edit') openTaskModal(id);
    });

    $('addTaskBtn').addEventListener('click', function () { openTaskModal(null); });

    // 업무 저장
    $('taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = $('taskId').value;
      var title = $('taskName').value.trim();
      var ownerId = $('taskOwner').value;
      var status = $('taskStatus').value;
      var note = $('taskNote').value.trim();
      if (!title) { toast('업무 제목을 적어 주세요.'); return; }
      var now = new Date().toISOString();
      if (id) {
        for (var i = 0; i < state.tasks.length; i++) {
          if (state.tasks[i].id === id) {
            state.tasks[i].title = title;
            state.tasks[i].ownerId = ownerId;
            state.tasks[i].status = status;
            state.tasks[i].note = note;
            state.tasks[i].updatedAt = now;
          }
        }
      } else {
        state.tasks.push({ id: uid('t'), title: title, ownerId: ownerId, status: status, note: note, createdAt: now, updatedAt: now, demo: false });
      }
      save();
      closeModal($('modal-task'));
      renderAll();
      toast(id ? '업무를 수정했어요.' : '업무를 추가했어요.');
    });

    var deleteTaskBtn = $('deleteTaskBtn');
    if (deleteTaskBtn) {
      deleteTaskBtn.addEventListener('click', function () {
        var id = $('taskId').value;
        if (!id) return;
        if (!window.confirm('이 업무를 지울까요?')) return;
        state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
        save();
        closeModal($('modal-task'));
        renderAll();
        toast('업무를 지웠어요.');
      });
    }

    // 설정: 팀원 관리
    $('memberAdmin').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-member');
      if (act === 'edit-member') openMemberModal(id);
      if (act === 'del-member') {
        var m = memberById(id);
        if (!m || m.isChief) return;
        if (!window.confirm('「' + m.name + '」 팀원을 목록에서 지울까요? 업무·지시의 담당은 그대로 남아요.')) return;
        removeMember(id);
        toast(m.name + ' 팀원을 지웠어요.');
      }
    });

    $('addMemberBtn').addEventListener('click', function () { openMemberModal(null); });

    // 팀원 저장
    $('memberForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var id = $('memberId').value;
      var name = $('memberName').value.trim();
      if (!name) { toast('이름을 적어 주세요.'); return; }
      var data = {
        emoji: $('memberEmoji').value.trim() || '🙂',
        name: name,
        role: $('memberRole').value.trim() || '팀원',
        desc: $('memberDesc').value.trim(),
        status: $('memberStatus').value,
        connected: $('memberConnected').checked
      };
      if (id) {
        for (var i = 0; i < state.members.length; i++) {
          if (state.members[i].id === id) {
            state.members[i].emoji = data.emoji;
            state.members[i].name = data.name;
            state.members[i].role = data.role;
            state.members[i].desc = data.desc;
            state.members[i].status = data.status;
            state.members[i].connected = data.connected;
          }
        }
      } else {
        state.members.push({
          id: uid('mem'), emoji: data.emoji, name: data.name, role: data.role, desc: data.desc,
          status: data.status, connected: data.connected, isChief: false, demo: false
        });
      }
      save();
      closeModal($('modal-member'));
      renderSettings();
      renderAll();
      toast(id ? '팀원 정보를 저장했어요.' : data.name + ' 팀원을 추가했어요.');
    });

    // 설정: 웹훅
    $('saveWebhookBtn').addEventListener('click', function () {
      var url = $('webhookUrl').value.trim();
      if (url && !/^https?:\/\//i.test(url)) { toast('http:// 또는 https://로 시작하는 주소를 넣어 주세요.'); return; }
      state.settings.webhookUrl = url;
      state.settings.webhookKind = $('webhookKind').value;
      save();
      renderMeeting();
      toast(url ? '웹훅 주소를 저장했어요.' : '웹훅을 비웠어요. 이제 전송하지 않아요.');
    });

    $('testWebhookBtn').addEventListener('click', function () {
      var url = $('webhookUrl').value.trim();
      if (!url) { toast('먼저 Webhook URL을 넣어 주세요.'); return; }
      state.settings.webhookUrl = url;
      state.settings.webhookKind = $('webhookKind').value;
      save();
      sendWebhook({
        type: '테스트',
        office: '핑키오피스',
        chief: '김예은',
        to: '전체',
        title: '핑키오피스 연결 테스트',
        message: '이 메시지가 보이면 연결 성공이에요.',
        status: '-',
        createdAt: new Date().toISOString(),
        text: '핑키오피스 연결 테스트 — 이 메시지가 보이면 성공이에요.'
      });
      toast('테스트를 보냈어요. 받은 쪽을 확인해 주세요.');
    });

    // 설정: 실시간 DB·텔레그램
    $('saveApiBtn').addEventListener('click', function () { saveApiSettings(); });
    $('testApiBtn').addEventListener('click', function () { testApi(); });
    $('connectTelegramBtn').addEventListener('click', function () { connectTelegram(); });
    $('testTelegramBtn').addEventListener('click', function () { testTelegram(); });
    if ($('copyLinkBtn')) $('copyLinkBtn').addEventListener('click', function () { copyOneClickLink(); });

    // DB 미연결 경고 배너
    if ($('dbWarnSettings')) {
      $('dbWarnSettings').addEventListener('click', function () {
        openModal('modal-settings');
        setTimeout(function () { if ($('apiUrl')) { try { $('apiUrl').focus({ preventScroll: true }); } catch (err) {} } }, 80);
      });
    }
    if ($('dbWarnGuide')) {
      $('dbWarnGuide').addEventListener('click', function () { openModal('modal-guide'); });
    }

    // 설정: 데이터
    $('resetDemoBtn').addEventListener('click', function () {
      if (!window.confirm('데모 데이터를 처음 상태로 되돌릴까요? 직접 만든 업무·지시도 함께 지워져요.')) return;
      var keepUrl = state.settings.webhookUrl;
      var keepKind = state.settings.webhookKind;
      var keepApi = state.settings.apiUrl;
      var keepKey = state.settings.apiSecret;
      state = seedState();
      state.settings.webhookUrl = keepUrl;
      state.settings.webhookKind = keepKind;
      state.settings.apiUrl = keepApi;
      state.settings.apiSecret = keepKey;
      ui.ownerFilter = null;
      ui.statusFilter = '전체';
      save(false);
      renderSettings();
      renderAll();
      toast('데모 데이터를 초기화했어요.');
      if (apiConfigured()) pullFromServer(true);
    });

    $('exportBtn').addEventListener('click', function () {
      copyText(JSON.stringify(state, null, 2), '내 데이터를 JSON으로 복사했어요.');
    });
  }

  /* ---------- 설정: 실시간 DB · 텔레그램 ---------- */
  function saveApiSettings() {
    var url = ($('apiUrl') ? $('apiUrl').value : '').trim();
    var key = ($('apiSecret') ? $('apiSecret').value : '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast('https://script.google.com/… 주소를 넣어 주세요.');
      return;
    }
    state.settings.apiUrl = url;
    state.settings.apiSecret = key;
    save(false);
    sync.lastAt = '';
    if (!url) {
      stopPolling();
      setSyncState('off');
      /* 사용자가 직접 비운 경우에만 주소창의 #api=를 지웁니다(새로고침해도 되살아나지 않게). */
      try {
        if (/api=/.test(window.location.hash) || /api=/.test(window.location.search)) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) { /* 무시 */ }
      toast('실시간 DB 연결을 해제했어요. 이제 이 브라우저에만 저장돼요.');
      return;
    }
    startPolling();
    setSyncState('connecting');
    pullFromServer(false);
  }

  function testApi() {
    if (!apiConfigured()) { toast('실시간 DB 주소를 먼저 저장해 주세요.'); return; }
    setSyncState('connecting');
    apiRequest('ping').then(function (data) {
      if (!data || data.ok !== true) throw new Error((data && (data.message || data.error)) || '응답 오류');
      if (data.telegram) sync.telegram = data.telegram;
      setSyncState('on');
      toast('연결 확인 완료 · ' + (data.service || '핑키오피스 DB') + ' v' + (data.version || '?')
        + (data.telegram && data.telegram.ready ? ' · 텔레그램 준비됨' : ''));
    }).catch(function (err) {
      setSyncState('error', err && err.message ? err.message : '연결 실패');
      toast('연결하지 못했어요: ' + sync.message);
    });
  }

  function connectTelegram() {
    if (!apiConfigured()) { toast('실시간 DB 주소를 먼저 저장해 주세요.'); return; }
    toast('텔레그램 연결 상태를 확인하고 있어요…');
    apiRequest('telegram_connect').then(function (data) {
      if (!data) throw new Error('응답 없음');
      if (data.telegram) sync.telegram = data.telegram;
      renderSyncState();
      if (data.ok) {
        toast('텔레그램 연결 완료 · @' + (data.bot || 'Pinky_office_bot') + ' (Chat ID 끝 ' + (data.chatTail || '') + ')');
      } else {
        toast(data.message || data.webhookError || '텔레그램 연결이 아직이에요. 안내를 확인해 주세요.');
      }
    }).catch(function (err) {
      toast('텔레그램 연결 실패: ' + (err && err.message ? err.message : ''));
    });
  }

  function testTelegram() {
    if (!apiConfigured()) { toast('실시간 DB 주소를 먼저 저장해 주세요.'); return; }
    apiRequest('telegram_test').then(function (data) {
      if (data && data.ok) toast('텔레그램으로 테스트 알림을 보냈어요. 폰을 확인해 보세요.');
      else toast('아직 보내지 못했어요: ' + ((data && (data.error || data.message)) || '텔레그램 연결 필요'));
    }).catch(function (err) {
      toast('전송 실패: ' + (err && err.message ? err.message : ''));
    });
  }

  /* ---------- 시작 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    bind();
    var fromHash = readApiFromHash();
    if (fromHash) save(false);
    renderAll();
    startWander();
    try {
      if (!localStorage.getItem(KEY)) save(false);
    } catch (err) { /* 저장소를 쓸 수 없어도 화면은 동작합니다. */ }
    if (apiConfigured()) {
      startPolling();
      setSyncState('connecting');
      pullFromServer(!fromHash).then(function () {
        if (fromHash) toast('실시간 DB를 연결했어요. 이제 폰·PC가 함께 동기화돼요.');
      });
    }
  });
})();
