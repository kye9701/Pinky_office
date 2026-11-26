# 핑키오피스 (pinky-office-site)

대장 김예은 · 총괄 팀장 핑키가 함께 쓰는 1인 AI 오피스 — 정적 웹 앱(빌드 없음).

## 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 화면 전체(헤더 · 탭 · 오피스/회의실/업무판 · 교육서/설정/편집 모달) |
| `styles.css` | 다크 버건디 · 차콜 배경 + 핑크/코랄 포인트, 모바일 우선 + PC 반응형 |
| `app.js` | 상태 관리 · 렌더링 · localStorage 저장 · 실시간 DB 동기화 · 클립보드 복사 · 웹훅 전송 |
| `office.png` | 3D 핑크 아이소메트릭 오피스 일러스트 원본(1672×941, 가로형) |
| `office.webp` | 같은 그림의 경량 버전(90KB) — `<picture>`로 먼저 로드 |

## 동작

- **오피스**: `office.png` 배너 + `오늘의 오피스` 바(작업 중 · 답변 완료 · 대기 · 미연결, 실제 데이터 계산)
- **우리 팀**: 김예은(대장) / 핑키(총괄 팀장) / 챗GPT · 클로드 · 제미나이 · 큐(Cue) · 키링 · 부이(Vooy) · 마누스(Manus) · 뮤즈(Muse) · 하크(Hark) · 인스팅트(Instinct) · 그록(Groq) — 카드마다 역할·상태 배지·바로가기 버튼
  - `연결 문구`: 그 AI에 붙여넣을 역할·보고 양식 프롬프트를 클립보드로 복사 + 토스트 (팀원별 `이 역할에서 지킬 것` 한 줄 포함)
  - v3(2026-11-26): 키링을 큐에서 분리하고 키링·부이·마누스·뮤즈·하크·인스팅트를 추가. v4(같은 날): 그록(Groq) 추가.
  - 예전 저장값이나 클라우드에 예전 팀원 목록이 남아 있으면 새로고침·동기화 때 그 버전에 없던 팀원만 자동으로 병합합니다(`MEMBER_SINCE`). 최신 버전에서 일부러 지운 팀원은 되살아나지 않습니다.
- **회의실(우편함)**: 담당 선택 → 지시 작성 → 답글(대장/담당 비서) → 상태(대기·작업 중·완료) 변경 → 삭제
- **업무판**: 대기 · 작업 중 · 검수 대기 · 완료 칸반, 상태 필터, 담당 필터, 새 업무/수정/삭제, ← → 상태 이동
- **교육서**: 팀 운영 규칙 5개, 비서별 보고 양식, 회의실 사용법, 실시간 DB·텔레그램 연결 방법, 자주 하는 실수
- **설정**: 팀원 추가/편집/삭제, 실시간 DB(Apps Script) 연결, 텔레그램 자동 연결, Webhook URL 저장(+테스트 전송), 데모 데이터 초기화, 내 데이터 JSON 복사
- **데모 모드**: 켜면 예시 업무·지시가 보이고, 끄면 내가 만든 것만 보입니다.

데이터는 브라우저 `localStorage`(`pinky-office-v1`)에 저장되고, 실시간 DB를 연결하면 같은 내용이 클라우드에도 저장돼 폰·PC가 함께 씁니다.

## 실시간 DB(Google Apps Script) 연동

PC를 꺼도 24시간 도는 백엔드입니다. 서버 코드는 이 저장소에 없습니다(비공개 폴더 관리).

- 설정 → **실시간 DB**에 웹 앱 URL(`https://script.google.com/macros/s/.../exec`)을 넣고 **저장하고 동기화**
- 또는 주소 하나로 바로 연결: `https://kye9701.github.io/Pinky_office/#api=<웹앱 URL>&key=<비밀 키>`
- 첫 로드에서 `GET ?action=sync`로 받아오고, 변경이 생기면 `POST action=save_all`로 올립니다(0.8초 묶음)
- 15초마다, 그리고 창에 다시 들어올 때 새 내용을 확인합니다. 예시(데모) 항목은 올리지 않습니다.
- 텔레그램: **자동 연결**을 누르면 서버가 `getUpdates`로 Chat ID를 찾아 저장하고 `setWebhook`까지 겁니다
  - 회의실에 새 지시가 올라오면 봇이 알림 → 그 알림에 답장하면 같은 티켓에 답글로 달립니다

| 액션 | 방식 | 하는 일 |
| --- | --- | --- |
| `ping` | GET | 연결·버전·텔레그램 상태 |
| `sync` | GET | 전체 데이터(또는 `since` 이후 변경 여부) |
| `save_all` | POST | tasks · messages · team 통째로 저장 + 새 지시 텔레그램 알림 |
| `add_task` | POST | 업무 하나 추가 |
| `add_message` | POST | 회의실 지시·답글 추가 |
| `telegram_status` · `telegram_connect` · `telegram_test` · `telegram_reset` | POST | 봇 상태 · 자동 연결 · 테스트 · 해제 |
| (텔레그램 update) | POST | `action` 없이 오면 회의실 지시로 저장 |

> Apps Script는 OPTIONS(preflight)에 답하지 못하므로 POST 본문을 `text/plain`으로 보냅니다. 저장 값은 9KB 제한을 피해 8KB씩 나눠 보관합니다.

## 웹훅 페이로드

`POST` `Content-Type: application/json`

```json
{
  "type": "지시",
  "office": "핑키오피스",
  "chief": "김예은",
  "to": "핑키",
  "title": "제목",
  "message": "본문",
  "status": "대기",
  "createdAt": "2026-11-26T13:20:00.000Z",
  "text": "텔레그램 등에 그대로 보낼 한 덩어리 문자열"
}
```

브라우저에서 직접 보내므로 n8n Webhook 노드의 Allowed Origins(CORS)에 배포 주소를 추가해야 합니다.

## 배포

GitHub Pages에서 `main` 브랜치 루트(`/`)를 그대로 게시합니다(빌드 없음).

- 라이브: <https://kye9701.github.io/Pinky_office/>
- 저장소: <https://github.com/kye9701/Pinky_office>
- 수정 후 `main`에 푸시하면 1분 안에 자동 반영됩니다.

```bash
git add -A && git commit -m "내용 수정" && git push
```

정적 파일만 있으므로 Cloudflare Pages 등 다른 정적 호스팅에 그대로 올려도 됩니다.
