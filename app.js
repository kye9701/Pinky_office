/* 핑키오피스 — 대장 김예은 · 총괄 팀장 핑키
   순수 바닐라 JS. 모든 상태는 localStorage에 저장됩니다. */
(function () {
  'use strict';

  var KEY = 'pinky-office-v1';
  var STATE_VERSION = 3;
  var TASK_STATUS = ['대기', '작업 중', '검수 대기', '완료'];
  var THREAD_STATUS = ['대기', '작업 중', '완료'];

  /* v3에서 새로 들어온 기본 팀원 — 예전 저장값·실시간 DB에 없으면 자동으로 채웁니다. */
  var NEW_MEMBER_IDS = ['keyring', 'vooy', 'manus', 'muse', 'hark', 'instinct'];
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

  function badgeClass(status) {
    switch (status) {
      case '대장': return 'badge-chief';
      case '작업 중': return 'badge-doing';
      case '완료': return 'badge-done';
      case '미연결': return 'badge-off';
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
  /* 기본 팀원 — 대장·총괄 팀장과 지금 쓰는 AI들 (v3: 키링·Cue·부이·마누스·뮤즈·하크·인스팅트 추가) */
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
      }
    ];
  }

  function defaultMember(id) {
    var list = defaultMembers();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* 예전 팀원 목록에 새 기본 팀원을 채웁니다(버전 2 → 3 마이그레이션).
     새 팀원이 하나도 없는 목록일 때만 채워서, 일부러 지운 팀원이 새로고침마다 되살아나지 않게 합니다. */
  function mergeNewMembers(list) {
    var members = Array.isArray(list) ? list.slice() : [];
    var changed = false;
    // v2의 '큐'는 키링과 역할이 섞여 있었으므로, 손대지 않은 경우에만 새 역할로 바꿉니다.
    members.forEach(function (m) {
      if (m && m.id === 'cue' && m.role === LEGACY_CUE_ROLE) {
        var d = defaultMember('cue');
        if (d) { m.role = d.role; m.desc = d.desc; changed = true; }
      }
    });
    var present = {};
    members.forEach(function (m) { if (m && m.id) present[m.id] = true; });
    var missing = NEW_MEMBER_IDS.filter(function (id) { return !present[id]; });
    if (missing.length !== NEW_MEMBER_IDS.length) return { members: members, changed: changed };
    missing.forEach(function (id) {
      var d = defaultMember(id);
      if (d) { members.push(clone(d)); changed = true; }
    });
    return { members: members, changed: changed };
  }

  function seedState() {
    var now = Date.now();
    var t = function (min) { return new Date(now - min * 60000).toISOString(); };
    return {
      version: STATE_VERSION,
      demoMode: true,
      settings: { webhookUrl: '', webhookKind: 'n8n', apiUrl: '', apiSecret: '', dirty: false },
      members: defaultMembers(),
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
            { id: uid('m'), from: 'member', text: '결론: 첫 화면 준비 완료했어요.\n한 일: 3D 오피스 그림 + 우리 팀 카드 + 오늘 상태 바.\n확인 필요: 팀원 이름·역할 이대로 갈까요?\n다음 단계: 교육서 본문 채우기.', at: t(15) }
          ]
        },
        {
          id: uid('th'), memberId: 'claude', title: '교육서 초안 잡아줘', status: '완료',
          createdAt: t(200), updatedAt: t(160), demo: true,
          messages: [
            { id: uid('m'), from: 'chief', text: '팀 운영 규칙 5개로 교육서 초안 잡아줘.', at: t(200) },
            { id: uid('m'), from: 'member', text: '결론: 5개 규칙 초안 완성.\n한 일: 승인 우선·티켓 하나에 하나·확인 필요 표시·검수 순서·기록 남기기.\n확인 필요: 없음.\n다음 단계: 교육서 탭에 붙이기.', at: t(160) }
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
  var ui = { view: 'office', statusFilter: '전체', ownerFilter: null, threadId: null };

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
      // 버전 2 → 3: 예전에 저장된 팀원 목록에 새 기본 팀원을 채워 넣습니다.
      if (savedVersion < STATE_VERSION) members = mergeNewMembers(members).members;
      var next = {
        version: STATE_VERSION,
        demoMode: saved.demoMode !== false,
        settings: {
          webhookUrl: (saved.settings && saved.settings.webhookUrl) || '',
          webhookKind: (saved.settings && saved.settings.webhookKind) || 'n8n',
          apiUrl: (saved.settings && saved.settings.apiUrl) || '',
          apiSecret: (saved.settings && saved.settings.apiSecret) || '',
          dirty: !!(saved.settings && saved.settings.dirty)
        },
        members: members,
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
      var team = mergeNewMembers(data.team);
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
    var raw = String(window.location.hash || '').replace(/^#\/?/, '');
    if (raw.indexOf('api=') === -1) return false;
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
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (err) { /* 무시 */ }
    return true;
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
    var offline = state.members.filter(function (m) { return !m.connected && !m.isChief; }).length;
    return { working: working, done: done, waiting: waiting, offline: offline };
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
    instinct: '문자로 받은 심부름은 자기 폰·컴퓨터로 끝까지 처리하되, 예약·구매 확정 전에는 반드시 확인을 받는다.'
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
      '1. 지시는 회의실(우편함) 티켓 하나에 하나씩 처리한다.',
      '2. 모르는 것은 추측으로 채우지 말고 "확인 필요"로 남긴다.',
      '3. 결제·계약·외부 발송·삭제는 절대 혼자 하지 않고 대장 승인을 먼저 요청한다.',
      '4. 결과물은 초안 → 검수 → 완료 순서로만 넘긴다.',
      '',
      '[보고 양식 — 이 순서로 답한다]',
      '결론: (한 줄)',
      '한 일: (3줄 이내, 결과물 이름 포함)',
      '확인 필요: (대장에게 물어볼 것, 최대 3개 / 없으면 "없음")',
      '다음 단계: (다음에 할 일 1개)',
      '',
      '[지금 할 일]',
      '회의실에 도착한 마지막 지시를 읽고 위 양식으로 답해줘. 지시가 아직 없으면 "대기 중"이라고만 말해줘.'
    );
    return lines.join('\n');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- 렌더: 오피스 ---------- */
  function renderStats() {
    var el = $('officeStats');
    if (!el) return;
    var s = calcStats();
    el.innerHTML = [
      '작업 중 <b>' + s.working + '</b>',
      '답변 완료 <b>' + s.done + '</b>',
      '대기 <b>' + s.waiting + '</b>',
      '미연결 <b>' + s.offline + '</b>'
    ].join('<span class="sep">·</span>');
  }

  function renderTeam() {
    var grid = $('teamGrid');
    if (!grid) return;
    grid.innerHTML = state.members.map(function (m) {
      var isChief = !!m.isChief;
      var cls = 'team-card';
      if (isChief) cls += ' is-chief';
      if (m.id === 'pinky') cls += ' is-pinky';
      var actions;
      if (isChief) {
        actions = ''
          + '<button type="button" class="btn btn-primary" data-act="board" data-member="' + esc(m.id) + '">📋 업무판 보기</button>'
          + '<button type="button" class="btn btn-ghost" data-act="meeting" data-member="' + esc(m.id) + '">💬 회의실</button>';
      } else {
        actions = ''
          + '<button type="button" class="btn btn-primary" data-act="meeting" data-member="' + esc(m.id) + '">💬 회의실에서 부르기</button>'
          + '<button type="button" class="btn btn-ghost" data-act="copy" data-member="' + esc(m.id) + '">🔗 연결 문구</button>';
      }
      return ''
        + '<article class="' + cls + '">'
        + '  <div class="tc-head">'
        + '    <div class="tc-avatar" aria-hidden="true">' + esc(m.emoji || '🙂') + '</div>'
        + '    <div class="tc-id">'
        + '      <div class="tc-name">' + esc(m.name) + '</div>'
        + '      <div class="tc-role">' + esc(m.role) + '</div>'
        + '    </div>'
        + '  </div>'
        + '  <span class="badge ' + badgeClass(m.status) + '"><span class="dot"></span>' + esc(m.status) + '</span>'
        + '  <p class="tc-desc">' + esc(m.desc || '') + '</p>'
        + '  <div class="tc-actions">' + actions + '</div>'
        + '</article>';
    }).join('');
  }

  /* ---------- 렌더: 회의실 ---------- */
  function renderComposeSelect() {
    var sel = $('composeTo');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = state.members.filter(function (m) { return !m.isChief; }).map(function (m) {
      return '<option value="' + esc(m.id) + '">' + esc(m.emoji + ' ' + m.name + ' · ' + m.status) + '</option>';
    }).join('');
    if (current && memberById(current) && !memberById(current).isChief) sel.value = current;
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
    if (!threads.length) {
      list.innerHTML = '<div class="empty">아직 지시가 없어요.<br>위에서 담당을 고르고 <b>첫 지시</b>를 보내 보세요.</div>';
      return;
    }
    list.innerHTML = threads.map(function (t) {
      var last = t.messages && t.messages.length ? t.messages[t.messages.length - 1] : null;
      var preview = last ? (last.from === 'chief' ? '대장: ' : memberName(t.memberId) + ': ') + last.text : '내용 없음';
      return ''
        + '<button type="button" class="thread-item" data-thread="' + esc(t.id) + '">'
        + '  <div class="ti-avatar" aria-hidden="true">' + esc(memberEmoji(t.memberId)) + '</div>'
        + '  <div class="ti-body">'
        + '    <div class="ti-top">'
        + '      <span class="ti-title">' + esc(t.title) + '</span>'
        + '      <span class="tag ' + tagClass(t.status) + '">' + esc(t.status) + '</span>'
        + '    </div>'
        + '    <p class="ti-preview">' + esc(preview) + '</p>'
        + '    <div class="ti-time">' + esc(memberName(t.memberId)) + ' · ' + esc(fmtTime(t.updatedAt || t.createdAt)) + '</div>'
        + '  </div>'
        + '</button>';
    }).join('');
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
    renderStats();
    renderTeam();
    renderMeeting();
    renderBoard();
    renderSyncState();
    if ($('modal-settings') && !$('modal-settings').hidden) renderSettings();
    if ($('modal-guide') && !$('modal-guide').hidden) renderReportFormats();
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
  }

  /* ---------- 동작: 회의실 ---------- */
  function createThread(memberId, title, body, status) {
    var now = new Date().toISOString();
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
      + ' · ' + fmtFull(thread.createdAt) + ' 시작';

    Array.prototype.forEach.call($('threadStatusSwitch').querySelectorAll('button'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-status') === thread.status);
    });

    $('threadMessages').innerHTML = (thread.messages || []).map(function (msg) {
      var isChief = msg.from === 'chief';
      return ''
        + '<div class="msg ' + (isChief ? 'msg-chief' : 'msg-member') + '">'
        + '  <span class="msg-meta">' + esc((isChief ? '대장 김예은' : memberName(thread.memberId)) + ' · ' + fmtTime(msg.at)) + '</span>'
        + esc(msg.text)
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

  /* ---------- 이벤트 ---------- */
  function bind() {
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

    // 우리 팀 카드
    $('teamGrid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-member');
      if (act === 'board') {
        ui.ownerFilter = id;
        ui.statusFilter = '전체';
        switchView('board');
        renderBoard();
        toast(memberName(id) + ' 담당 업무만 보고 있어요.');
      } else if (act === 'meeting') {
        switchView('meeting');
        var sel = $('composeTo');
        if (sel) sel.value = id;
        var title = $('composeTitle');
        if (title) setTimeout(function () { title.focus({ preventScroll: true }); }, 120);
        toast(memberName(id) + '에게 지시를 적어 보세요.');
      } else if (act === 'copy') {
        var m = memberById(id);
        if (m) copyText(buildPrompt(m), m.name + ' 연결 문구를 복사했어요. 그 AI에 붙여넣으세요.');
      }
    });

    // 회의실: 새 지시
    $('composeForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var memberId = $('composeTo').value;
      var title = $('composeTitle').value.trim();
      var body = $('composeBody').value.trim();
      var status = $('composeStatus').value;
      if (!memberId) { toast('담당을 먼저 골라 주세요.'); return; }
      if (!title) { toast('제목을 적어 주세요.'); return; }
      createThread(memberId, title, body, status);
      $('composeTitle').value = '';
      $('composeBody').value = '';
      $('composeStatus').value = '대기';
      renderAll();
      toast(memberName(memberId) + '에게 지시를 보냈어요.');
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
        state.members = state.members.filter(function (x) { return x.id !== id; });
        save();
        renderSettings();
        renderAll();
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
