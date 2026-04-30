# ToDo 기능 확장 — 설계 보고서

**작성일**: 2026-04-30
**대상**: CalenMate ToDo (Google Tasks 연동) 기능 확장
**목적**: Google Tasks의 한계를 보완하고, CalenMate만의 차별점(캘린더 + AI 통합)을 살린
ToDo 기능 후보군을 정리하고 적용 방안을 설계.

---

## 1. 현재 상태 진단

### 1.1 데이터 모델 (`reminders` 테이블)

```ts
interface Reminder {
  id, user_id, title, description, due_date,
  priority: 'low' | 'medium' | 'high',
  is_completed: boolean,    // ← Google Tasks와 동기화되는 유일한 상태
  notify, notify_at, color,
  google_task_id, google_list_id,
}
```

추가로 `reminder_notes` 테이블에 마크다운 노트 1:1 매핑.

### 1.2 Google Tasks API의 본질적 제약

이 제약은 **새 기능 설계의 가장 중요한 출발점**이다.

| 항목 | Google Tasks 지원 여부 |
|---|---|
| 상태 | `needsAction` / `completed` 두 가지만 |
| 서브태스크 | 1단계만, 같은 list 내에서 parent 지정 |
| 태그 / 라벨 | ❌ |
| 시간 추적 | ❌ |
| 반복 | ❌ (모바일 앱에서만 부분 지원) |
| 우선순위 | ❌ (CalenMate에선 Supabase 단독 저장) |
| 색상 | ❌ (CalenMate에선 Supabase 단독 저장) |
| 의존성 | ❌ |

→ **모든 확장 기능은 Supabase에 풍부한 모델을 두고, Google Tasks와는 최소 공통 분모
(제목 / 설명 / 마감일 / 완료 여부)만 양방향 동기화**하는 패턴을 따른다. 이는
이미 `priority`, `color`, `notify` 필드에서 검증된 접근이다.

### 1.3 차별 포인트 (Google Tasks 대비)

CalenMate가 단순 Google Tasks 클라이언트로 머물지 않으려면, **캘린더 + AI 통합**에서
나오는 기능이 있어야 한다. 즉 다음 3가지가 결합되어야 가치가 생긴다:
- **Calendar 데이터** (시간 슬롯, 일정)
- **AI 에이전트** (자연어 → 액션, 컨텍스트 인식)
- **ToDo 데이터** (완료 상태, 우선순위, 노트)

기능 후보를 평가할 때 "이 기능이 위 3가지 중 2개 이상을 연결하는가?"가 핵심 기준.

---

## 2. 기능 후보 카탈로그

총 12개 후보를 **Tier 1 (적극 권장) / Tier 2 (검토 가치) / Tier 3 (지켜볼 것)**로 분류.

---

### TIER 1 — 적극 권장

#### F1. 다단계 상태 (Not Started / In Progress / Completed) + 자동 전이

> 사용자가 직접 제안한 항목. CalenMate의 **캘린더 통합**과 가장 자연스럽게 결합.

**문제**:
Google Tasks는 "완료 / 미완료" 두 상태뿐이다. 실제 업무 흐름에는 "지금 하고 있음"
이라는 중간 상태가 분명히 존재하고, 이는 다음 시나리오에서 가치가 크다:
- 오늘 동시에 진행 중인 것이 무엇인지 시각화
- 시간 추적 / 시간 그래프(F4)의 입력 신호
- Pomodoro / Focus 세션(F8)의 트리거

**설계**:

```sql
ALTER TABLE reminders ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started'
  CHECK (status IN ('not_started', 'in_progress', 'completed'));
ALTER TABLE reminders ADD COLUMN started_at TIMESTAMPTZ;
ALTER TABLE reminders ADD COLUMN completed_at TIMESTAMPTZ;
```

`is_completed`는 **derived 필드**로 유지한다 (`status === 'completed'`).
→ Google Tasks 동기화는 기존 그대로. Tasks가 "needsAction"이면 `status`는
`not_started` 또는 `in_progress` 둘 중 하나, "completed"이면 `completed`.

**자동 전이 (캘린더 링크 시)**:
캘린더 이벤트와 링크된 ToDo (F2 참조)는 다음 규칙을 따른다:
- 이벤트 시작 시간 도달 → `not_started` → `in_progress`
- 이벤트 종료 시간 도달 → `in_progress` → `completed` (옵션, 사용자 설정)

**구현 위치**:
- **DB**: 마이그레이션 1회.
- **백엔드**: `routes/reminders.ts`에 `PATCH /:id/status` 엔드포인트.
  자동 전이는 별도 cron worker가 1분 간격으로 `linked_event_id IS NOT NULL`인
  ToDo를 스캔. 또는 **lazy evaluation** — 사용자가 ToDo 페이지를 열 때
  서버에서 한 번 동기화하고 응답.
- **프론트**: ToDo 카드에 3단계 토글(원형 빈 / 반쯤 채워진 / 체크). 키보드
  단축키(`1` / `2` / `3`)로도 가능.
- **AI**: `update_reminder` 액션의 데이터 스키마에 `status` 필드 추가.

**리스크 / 트레이드오프**:
- Google Tasks가 모르는 상태이므로, 모바일 Google Tasks 앱에서 보면 "needsAction"
  으로만 보임 → 사용자에게 "in_progress는 CalenMate 전용"임을 명시.
- 자동 전이 cron은 서버리스로 가는 경우 별도 인프라 필요. **lazy evaluation 우선
  권장** (요청 시점에 계산).

**우선순위**: 🔴 높음. F2/F4의 전제 조건.

---

#### F2. 캘린더 이벤트 ↔ ToDo 양방향 링크

> CalenMate의 **존재 이유**에 가장 부합. 두 데이터 소스를 결합한 첫 번째 기능.

**문제**:
지금은 캘린더와 ToDo가 같은 화면에 있을 뿐, **연결되어 있지는 않다**. 사용자가
"이 ToDo를 위해 1시간 캘린더에 잡자"라는 매우 흔한 행동을 하려면 두 번 입력해야 한다.

**설계 (1) Time-Blocking — ToDo → Calendar Event**:
- ToDo 상세 페이지에 "캘린더에 시간 잡기" 버튼.
- 클릭 시 다이얼로그: 시작 시간 / 길이(15/30/60/90분) → 캘린더 이벤트 생성.
- 생성된 이벤트는 ToDo의 `linked_event_id`에 저장.

**설계 (2) Auto-Complete — Calendar Event → ToDo**:
- 링크된 ToDo는 이벤트 종료 시간에 자동 완료(F1의 자동 전이).

**설계 (3) AI 자연어 통합**:
- "PR 리뷰 ToDo에 내일 오후 2시부터 1시간 잡아줘" → AI가 `create_event` +
  `update_reminder(linked_event_id)` 두 액션 동시 실행.

**스키마**:
```sql
ALTER TABLE reminders ADD COLUMN linked_event_id TEXT;
-- Google Calendar event ID. 캘린더는 외부 데이터이므로 FK는 없다.
ALTER TABLE reminders ADD COLUMN auto_complete_on_event_end BOOLEAN DEFAULT false;
```

**구현 위치**:
- **백엔드**: `POST /api/reminders/:id/link-event` (이벤트 생성+링크).
  `DELETE` 시 캘린더 이벤트는 남겨둘지 / 함께 지울지 사용자 확인.
- **프론트**: ToDo 카드에 캘린더 아이콘 (링크된 경우 강조). 캘린더 이벤트 클릭 시
  팝오버에 연결된 ToDo 표시.
- **AI**: 새 합성 액션 또는 기존 `create_event` + `update_reminder`로 충분.

**리스크**:
- Google 캘린더 이벤트가 외부에서 삭제되면 `linked_event_id`가 stale → 주기적
  검증 또는 lazy 검증 필요.
- 사용자가 "이 이벤트는 그 ToDo와는 다른데..."라며 자동 완료를 끄고 싶을 수 있음 →
  per-link toggle (`auto_complete_on_event_end`).

**우선순위**: 🔴 매우 높음. CalenMate의 차별점 그 자체.

---

#### F3. 서브태스크 / 체크리스트

**문제**:
"주간 보고서 작성" 같은 큰 ToDo는 안에 5~10개의 작은 단계가 있다. Google Tasks의
1단계 서브태스크는 너무 무겁고 UI도 별도 ToDo처럼 보인다. 같은 ToDo 안에
"체크리스트"로 정리하는 패턴이 노션 / Things / TickTick에서 검증되어 있다.

**설계**:
두 가지 방식 중 선택:

**(a) JSON 칼럼 (추천)** — 가벼운 체크리스트:
```sql
ALTER TABLE reminders ADD COLUMN checklist JSONB DEFAULT '[]';
-- [{ id, text, done, order }]
```
- 진행률 = `done / total` 계산.
- ToDo 카드에 "3/7" 같은 진행률 표시.

**(b) 별도 테이블** — 진짜 서브태스크:
- Google Tasks의 부모-자식 관계와 매핑 가능.
- 하지만 Google Tasks의 서브태스크는 list 내에서만 가능 → 제약.

**권장**: (a). Google과 무관하게 동작하고, 마크다운 체크박스 노트(`reminder_notes`)와
역할 분리도 명확. 노트는 long-form, 체크리스트는 step-by-step.

**구현**:
- **프론트**: ToDo 상세 페이지 상단에 인라인 체크리스트 컴포넌트(Vercel Notion-style:
  슬래시 명령으로 추가, 드래그 정렬).
- **AI**: `update_reminder`에 `checklist` 필드. "보고서 ToDo에 1) 데이터 수집,
  2) 초안, 3) 리뷰 요청 항목 추가" 같은 요청 처리.

**우선순위**: 🟠 높음. 구현 비용 낮고, ToDo 페이지 체류 가치 ↑.

---

#### F4. 시간 그래프 (Time Graph)

> 사용자가 직접 제안한 항목. Notion처럼 "내가 이번 주 어디에 시간을 썼나" 시각화.

**문제**:
완료한 ToDo가 쌓이지만, 그 데이터로부터 통찰을 얻을 수 없다. 시간 추적 데이터를
**자동으로** 모으면(F1의 `started_at` / `completed_at`, F2의 캘린더 이벤트 길이),
별도 입력 없이 회고/리포트가 가능해진다.

**설계**:

**입력 신호 (자동 수집, 사용자 추가 입력 0)**:
- F1: ToDo 상태 전이 시점 → 진행 시간 계산.
- F2: 링크된 캘린더 이벤트의 길이.
- F8 (Focus session): Pomodoro 타이머 종료 시점.

**표시 UI**:

| 차트 | 표시 내용 | 사용처 |
|---|---|---|
| 일별 스택 바 | 하루 시간을 ToDo별 색상으로 채움 | 홈 위젯 / 회고 |
| 주간 히트맵 | 요일 × 시간 버킷별 완료 ToDo 수 | 패턴 발견 |
| Pie | 태그(F5)별 시간 비중 | 회고 |
| 누적 라인 | 7/30일 완료 추세 | 모티베이션 |

**스키마**:
```sql
CREATE TABLE todo_time_log (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  source TEXT NOT NULL,  -- 'manual' | 'event_link' | 'focus_session'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_time_log_user_started ON todo_time_log(user_id, started_at DESC);
```

**구현**:
- **백엔드**: `GET /api/todo/timeline?from=&to=` 집계 엔드포인트.
- **프론트**: `recharts` 또는 `visx` 사용. 새 페이지 `/insights` 또는 홈에
  주간 위젯.
- **점진 도입**: 우선 일별 스택 바만, 나머지는 데이터가 쌓인 뒤.

**리스크**:
- 입력 신호가 부족하면 "텅 빈 차트" 문제 → F1, F2 먼저 출시.
- 사용자가 "분 단위 추적은 부담스럽다" → **completed_at만으로도 의미 있는 차트**
  (요일별 완료 수 등)부터 시작.

**우선순위**: 🟠 높음. F1/F2 의존. 출시 시 큰 임팩트.

---

#### F5. 태그 / 라벨

**문제**:
Google Tasks의 list는 너무 무겁다(생성/이동이 무겁고 동기화 부담). 가벼운 횡단
범주(work / personal / learn / health)가 필요. 시간 그래프(F4) 분류에도 필수.

**설계**:
```sql
ALTER TABLE reminders ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE INDEX idx_reminders_tags ON reminders USING GIN (tags);
```
- 자유 입력 + 자동 완성(이미 사용한 태그 제안).
- 태그별 색상은 `user_settings`에 저장.

**UI**:
- ToDo 카드에 태그 칩.
- 사이드바 또는 ToDo 페이지 상단에 태그 필터.
- AI: "오늘 work 태그 ToDo만 보여줘".

**우선순위**: 🟡 중간. F4의 의미를 살리는 보조.

---

### TIER 2 — 검토 가치 있음

#### F6. 반복 ToDo (Recurring)

**문제**: "매주 월요일 회고", "매일 영양제" 같은 일상 루틴.

**설계**:
```sql
ALTER TABLE reminders ADD COLUMN recurrence JSONB;
-- { freq: 'daily' | 'weekly' | 'monthly', interval: 1, byDay: ['MO'], until }
ALTER TABLE reminders ADD COLUMN recurrence_parent_id UUID REFERENCES reminders(id);
```
- "Template" 행 1개 + 매번 인스턴스를 생성하는 방식 (Google Calendar의 RRULE 패턴).
- 자정 cron으로 다음 날 인스턴스 생성.

**리스크**: Google Tasks는 반복을 지원하지 않으므로 **인스턴스만 동기화**하고
템플릿은 Supabase 전용. 인스턴스 간 노트는 공유할지 분리할지 정책 결정 필요.

**우선순위**: 🟡 중간. 사용자층 분포에 따라 매우 가치 있음(habit 사용자) 또는
거의 안 씀(프로젝트 워커).

---

#### F7. AI 자동 스케줄링

**문제**: ToDo가 10개 있고 캘린더에 빈 슬롯이 분산돼 있을 때, AI가 자동으로
"각 ToDo를 어디에 넣을지" 제안하면 하루 계획 시간이 크게 줄어든다.

**설계**:
- 입력: 미완료 ToDo + 빈 캘린더 슬롯 + 사용자 지시사항(`user_instructions` 활용).
- 출력: ToDo → (시작시간, 길이) 매핑 제안 → 사용자 확인 후 `pendingActions` 흐름.
- 휴리스틱:
  - 우선순위 high → 오전
  - "30분 이상 집중 가능한" 슬롯에 큰 ToDo
  - "회의와 회의 사이 15분"은 small ToDo만

**구현**:
- 새 AI 액션: `suggest_schedule`.
- Gemini에 도구 호출 형태로 제공하거나, 별도 endpoint `POST /api/chat/suggest-schedule`.

**리스크**:
- 사용자가 제안에 동의하지 않으면 학습 데이터로 활용 어려움.
- **첫 출시는 "제안만"하고 자동 적용은 하지 않음**이 안전.

**우선순위**: 🟡 중간. F2 의존. 데모 임팩트는 매우 큼.

---

#### F8. 포커스 세션 (Pomodoro)

**문제**: ToDo를 시작했는데 몇 분 만에 다른 일을 한다. 집중 시간을 명시적으로
선언하면 (1) 시간 그래프 데이터 (2) 알림 차단 트리거 (3) 자기 통제 효과.

**설계**:
- ToDo에서 "25분 집중 시작" 버튼 → 타이머 시작 → 종료 시 `todo_time_log`에 기록.
- F1 상태를 자동으로 `in_progress`로 전이.
- 종료 시 휴식 5분 알림.

**구현**:
- 프론트엔드 단독으로 가능 (브라우저 알림 API). 데이터만 백엔드에 기록.

**우선순위**: 🟡 낮음~중간. F4 시간 그래프 보강 효과.

---

#### F9. 스누즈 / 미루기 (Snooze)

**문제**: "지금은 못 하지만 잊고 싶지도 않은" 상황. 매번 마감일을 손으로 바꾸는 건
귀찮다.

**설계**:
- 우클릭 메뉴 또는 카드 hover 액션에 "오늘 저녁 / 내일 / 다음 주 월요일" 빠른
  버튼.
- 단순히 `due_date` 변경 + `snoozed_at` 기록 (재차 스누즈 방지 / 분석용).

**우선순위**: 🟢 낮음. 구현 간단, 즉시 가치.

---

### TIER 3 — 지켜볼 것

#### F10. 의존성 (Dependencies)

ToDo A가 끝나야 B가 가능. 그래프 시각화. **Use case 협소** — 보통 사용자에게
과한 복잡도. 프로젝트 매니지먼트 영역으로 넘어가면 본 앱의 정체성과 충돌.

#### F11. 습관 / 스트릭 (Streak)

매일 X일 연속. Habit-tracking은 Habitica / Streaks 같은 별도 카테고리. F6과
중첩 → F6로 흡수 가능.

#### F12. 템플릿

자주 쓰는 ToDo 묶음 저장. **F6(반복)**과 기능 중첩이 큼. 별도 테이블 도입 비용
대비 가치가 불분명.

---

## 3. 권장 로드맵

각 단계는 독립 PR로 출시 가능하도록 의존성을 최소화.

### Phase 1 — 기본 모델 강화 (2~3 PR)

| # | 작업 | 의존 | 임팩트 |
|---|---|---|---|
| 1 | F1 다단계 상태 + 자동 전이 (lazy) | — | 🔴 |
| 2 | F2 캘린더 링크 (time-blocking + auto-complete) | F1 | 🔴 |
| 3 | F3 체크리스트 (JSON 칼럼) | — | 🟠 |

### Phase 2 — 분류와 인사이트 (2 PR)

| # | 작업 | 의존 | 임팩트 |
|---|---|---|---|
| 4 | F5 태그 + 필터 | — | 🟡 |
| 5 | F4 시간 그래프 (일별 스택바부터) | F1, F2 | 🟠 |

### Phase 3 — 워크플로 자동화 (3 PR)

| # | 작업 | 의존 | 임팩트 |
|---|---|---|---|
| 6 | F9 스누즈 | — | 🟢 |
| 7 | F8 포커스 세션 | F1 | 🟡 |
| 8 | F7 AI 자동 스케줄링 (제안만) | F2 | 🟡 |

### Phase 4 — 선택적 (사용자 데이터 보고 결정)

- F6 반복 ToDo
- F11 습관 (F6 흡수 검토)

---

## 4. 횡단 설계 원칙

### 4.1 Google Tasks 동기화 정책

새 필드 추가 시 항상 다음을 결정:

| 필드 종류 | 예시 | Google에 보낼 것 |
|---|---|---|
| Google에 매핑 가능 | title, description, due_date, completed | ✅ 양방향 |
| Google에 매핑 불가 | priority, status='in_progress', tags, checklist, linked_event_id | ❌ Supabase 전용 |

→ 머지 로직(`reminders.ts`의 read 경로)에서 **Google = source of truth for shared
fields**, **Supabase = source of truth for extension fields** 원칙 유지.

### 4.2 AI 액션 스키마 확장

새 필드를 추가하면 `gemini.ts`의 시스템 프롬프트와 액션 JSON 스키마도 함께
갱신해야 한다. 추가 시 체크리스트:
1. `AIAction` 타입 (`frontend/src/types/index.ts`)
2. 액션 실행기 (`backend/src/routes/chat.ts:executeAction`)
3. 시스템 프롬프트 (`backend/src/services/gemini.ts`)
4. 채팅 패널 액션 라벨 맵 (`frontend/src/components/chat-panel.tsx`)

이 4곳을 잊지 않으려면 **기능별 README** 또는 코드에 ADD-FIELD 주석 표식이
유용하다.

### 4.3 마이그레이션 안전성

- 모든 새 칼럼은 NULL 허용 또는 기본값 부여 → 기존 row에 영향 0.
- `status` 도입 시 기존 `is_completed`는 derived view 또는 trigger로 동기화 유지
  (제거하지 말 것 — 외부 클라이언트/리포트 호환).

### 4.4 자동화의 윤리 — "사용자 모르게 변하지 않기"

자동 전이(F1), 자동 완료(F2), 자동 스케줄링(F7) 모두 **사용자 동의 없이 상태를
바꾸지 않는다**는 원칙이 중요하다:
- 자동 전이는 **opt-in** 스위치 (글로벌 또는 per-ToDo).
- 자동 완료는 첫 발생 시 토스트로 "방금 자동으로 완료됨, 되돌리기" 제공.
- AI 스케줄링은 항상 confirm 흐름.

신뢰가 깨지면 사용자는 영원히 자동화를 끈다.

---

## 5. 결론

CalenMate는 "Google Tasks 클라이언트"가 아니라 **"캘린더와 AI를 결합한
업무 정리 도구"**로 자리잡아야 한다. 그 차별점을 가장 잘 드러내는 것이
**F1 + F2 + F4** 3개의 결합이다:

- **F1** 상태 모델 → 시간 데이터의 토대
- **F2** 캘린더 링크 → 캘린더와 ToDo의 결합
- **F4** 시간 그래프 → 결합의 결과를 사용자에게 시각화

이 3개를 먼저 단단히 만들면, 나머지 기능은 모두 이 위에 자연스럽게 얹힌다.
역순(예: 태그부터, 또는 반복부터)으로 시작하면 "Google Tasks에 화장만 더한 앱"
이 된다.

**다음 단계 권장**: F1을 별도 설계 문서(`feature/F1-status-model.md`)로 구체화한
뒤 마이그레이션 SQL과 API 변경부터 시작.
