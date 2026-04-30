# ToDo Phase 1 — 진행 상황 인계 문서

**작성일**: 2026-04-30
**기준 보고서**: `documents/feature/todo-enhancements.md`
**Phase 1 범위**: F1 다단계 상태 + F2 캘린더 링크 (auto-complete) + F3 체크리스트 (데이터 모델만)

---

## 1. 완료한 작업

### 1.1 DB 마이그레이션 (작성만, **아직 Supabase에 적용 안 됨**)

파일: `documents/migration_todo_phase1.sql`

추가된 칼럼 (모두 `public.reminders` 테이블):
- `status TEXT NOT NULL DEFAULT 'not_started'` — `not_started` / `in_progress` / `completed`
- `started_at TIMESTAMPTZ`
- `completed_at TIMESTAMPTZ`
- `linked_event_id TEXT` — Google Calendar event ID (FK 없음)
- `auto_complete_on_event_end BOOLEAN DEFAULT false`
- `checklist JSONB DEFAULT '[]'`

백필: 기존 `is_completed = true` 행은 `status = 'completed'`, `completed_at = updated_at`.
인덱스: `idx_reminders_status (user_id, status)`, `idx_reminders_linked_event (user_id, linked_event_id) WHERE linked_event_id IS NOT NULL`.

**이 다음에 해야 하는 것**: Supabase Dashboard → SQL Editor에 SQL 붙여넣고 Run. 또는 Supabase MCP 연결 후 자동 실행.

### 1.2 백엔드 변경

#### `backend/src/types/index.ts`
- `ReminderStatus` 타입 (`'not_started' | 'in_progress' | 'completed'`)
- `ChecklistItem` 인터페이스 (`{ id, text, done, order }`)
- `Reminder`에 신규 필드 추가: `status`, `started_at`, `completed_at`, `linked_event_id`, `auto_complete_on_event_end`, `checklist`
- `AIAction.type`에 `'set_reminder_status' | 'link_reminder_event'` 추가

#### `backend/src/routes/reminders.ts`
- import에 `getCalendarClient`, `ReminderStatus`, `ChecklistItem` 추가
- `checklistItemSchema` (Zod), `statusSchema`, `linkEventSchema` 정의
- `createReminderSchema` / `updateReminderSchema`에 `checklist` 필드 추가
- `mergeTaskWithMetadata` 재작성: 신규 필드 머지 + Google completion이 status를 어떻게 override하는지 룰 명시
  - Google `completed` → `status='completed'`
  - Google `needsAction` + Supabase `status='in_progress'` → `in_progress` 유지
  - 그 외 → `not_started`
- `computeAutoTransition()` 신규 함수: 링크된 이벤트의 시작/종료 타임스탬프 기준 status 자동 계산
- GET `/` 핸들러에 lazy auto-transition 로직 추가:
  - 링크된 ToDo만 골라 `Promise.all`로 calendar.events.get 배치 조회
  - 전이가 발생한 행은 백그라운드로 Supabase persist + Google Tasks `completed` 동기화
  - 캘린더 실패 시 raw 데이터 반환 (graceful degrade)
- POST `/` (생성)에 `status: 'not_started'`, `checklist` 필드 저장
- PUT `/:id`에 `checklist` 처리
- PATCH `/:id/complete`에 `status` / `completed_at` 동기화
- **신규 엔드포인트**:
  - `PATCH /:id/status` — 3-state 변경 (Google Tasks 먼저 동기화 → 실패 시 502)
  - `POST /:id/link-event` — `event_id` 옵션 또는 `date+start_time+(duration_minutes|end_time)`로 인라인 이벤트 생성 후 링크
  - `DELETE /:id/link-event` — 캘린더 이벤트는 보존하고 링크만 해제

#### `backend/src/services/gemini.ts`
시스템 프롬프트에 신규 액션 사용법 추가:
- `create_reminder` / `update_reminder`에 `checklist` 필드 안내 + 형식 예시
- `set_reminder_status` 섹션 추가
- `link_reminder_event` 섹션 추가 (option 1: 새 이벤트 생성 / option 2: 기존 이벤트 연결)

#### `backend/src/routes/chat.ts`
- `executeAction` 새 case:
  - `set_reminder_status` — Google Tasks 동기화 + Supabase status/started_at/completed_at 갱신, return type `'reminder_status_updated'`
  - `link_reminder_event` — `event_id` 또는 인라인 생성, return type `'reminder_linked'`
- `update_reminder` case에 `checklist` 처리 추가
- `hasCalendarActions` / `hasTaskActions` 분기에 신규 액션 포함 (POST `/`와 POST `/execute` 양쪽)
- `SUCCESS_TYPES` set에 `'reminder_status_updated'`, `'reminder_linked'` 추가

### 1.3 프론트엔드 변경

#### `frontend/src/types/index.ts`
- `ReminderStatus`, `ChecklistItem` 타입 (백엔드와 동일)
- `Reminder`에 신규 필드 추가
- `AIAction.type`에 `set_reminder_status`, `link_reminder_event` 추가

#### `frontend/src/components/reminders/link-event-dialog.tsx` (신규)
- 날짜 (Calendar Popover) + 시작 시간 (`<input type="time">`) + 소요 시간 (15/30/60/90/120분) + 자동완료 체크박스
- `POST /api/reminders/:id/link-event` 호출
- 성공 시 `['reminders', id]`, `['reminders']`, `['calendar-events']` 캐시 invalidate

#### `frontend/src/app/(app)/reminders/page.tsx`
- import에 `Circle`, `CircleDashed`, `Link as LinkIcon`, `ReminderStatus` 추가
- `Checkbox` import 제거
- `nextStatus()` 헬퍼 + `<StatusIcon>` 컴포넌트 추가 (3가지 아이콘)
- `toggleCompleteMutation` → `setStatusMutation` 변경 (PATCH `/:id/status` 호출, optimistic update)
- 카드 좌측 체크박스 → 3-state 사이클 버튼 (클릭 시 `not_started → in_progress → completed → not_started`)
- 제목 옆에 링크 배지 (linked_event_id 있을 때) + 체크리스트 진행률 배지 (`{done}/{total}`)
- `CheckCircle2` 우측 표시 제거 (좌측 status 아이콘과 중복)

#### `frontend/src/app/(app)/reminders/[id]/page.tsx`
- import에 `CircleDashed`, `Link as LinkIcon`, `Unlink`, `ReminderStatus`, `LinkEventDialog` 추가
- `linkDialogOpen` state 추가
- `toggleCompleteMutation` → `setStatusMutation` 변경
- `unlinkEventMutation` 신규 (DELETE `/:id/link-event`)
- 헤더 버튼 영역 재구성:
  - linked_event_id 유무에 따라 "시간 잡기" / "연결 해제" 토글 버튼
  - 기존 binary 완료 토글 → 3-state 사이클 버튼 (`Circle/CircleDashed/CheckCircle2` 아이콘 + "시작 안 함/진행 중/완료됨" 라벨)
- 컴포넌트 끝에 `<LinkEventDialog>` 렌더링

#### `frontend/src/components/chat-panel.tsx`
- `ACTION_LABELS`에 `reminder_status_updated`, `reminder_linked` 추가

### 1.4 검증 결과

- **backend** `npx tsc --noEmit`: 통과
- **frontend** `npx tsc --noEmit`: 통과
- **frontend** `npm run lint`: 4건 모두 기존 이슈 (이번 작업 무관)
  - `calendar/page.tsx` `format` unused
  - `reminders/page.tsx` `TabsContent` unused
  - `chat-panel.tsx:427` setState in effect (사전 보고서에 언급됨)
  - `middleware.ts` unused options
- **backend** lint: 설정 없음 (CLAUDE.md에 명시)

---

## 2. 다음 Claude 세션이 해야 할 일

### 2.1 ⚠️ 즉시 (코드 변경 전 필수)

1. **마이그레이션 적용**
   - 옵션 A: Supabase Dashboard → SQL Editor에 `documents/migration_todo_phase1.sql` 붙여넣고 Run
   - 옵션 B: Supabase MCP 설정 후 자동 실행
   - 적용 안 하면 백엔드 GET/PATCH 모두 500 (칼럼 없음)
2. **동작 확인 (manual smoke test)**
   - ToDo 페이지에서 좌측 status 아이콘 클릭 → 3단계 순환 확인
   - 상세 페이지 "시간 잡기" 클릭 → 다이얼로그 → 캘린더에 이벤트 생성되는지 확인
   - 이벤트 종료 시간 지난 후 ToDo 페이지 재진입 → 자동 완료 토스트 없이 status 'completed'로 바뀌는지 확인
   - AI 채팅 "이 ToDo 진행 중으로 바꿔줘" → `set_reminder_status` 액션 동작 확인
   - AI 채팅 "오늘 오후 2시에 1시간 잡아줘" → `link_reminder_event` 액션 동작 확인
3. **회귀 확인**
   - 기존 완료/미완료 토글 (PATCH `/:id/complete`)이 여전히 동작
   - Google Tasks 양방향 동기화 (제목/메모/마감일/완료) 정상

### 2.2 Phase 1 미완 항목 (선택)

1. **체크리스트 인라인 에디터** (F3 UI 부분)
   - 현재 데이터 모델 + AI 갱신만 구현됨. 사용자 직접 편집 UI는 미구현.
   - 추가 위치: `frontend/src/app/(app)/reminders/[id]/page.tsx` 편집 탭 안 또는 별도 섹션
   - 권장 컴포넌트 구조:
     - 새 항목 추가 입력 + 항목별 체크박스 + 텍스트 인라인 편집 + 삭제
     - 드래그 정렬은 후순위 (react-dnd 또는 dnd-kit)
   - PUT `/:id`로 전체 `checklist` 배열을 보내는 패턴이 백엔드에 이미 있음
2. **GET `/:id`에도 lazy auto-transition 적용**
   - 현재 GET `/`에만 적용. 상세 페이지를 직접 열었을 때도 동작하려면 동일 로직 추가 필요
   - 단순한 방식: GET `/:id`에서 linked_event_id 있을 때만 calendar.events.get 1회 호출
3. **링크된 이벤트 정보 표시**
   - 상세 페이지에 "이 ToDo는 X월 Y일 14:00–15:00 일정과 연결됨" 한 줄 표시
   - 캘린더 페이지의 이벤트 클릭 팝오버에 "연결된 ToDo: ..." 표시 (양방향 시각화)

### 2.3 Phase 2 (다음 단계)

원래 보고서 (`documents/feature/todo-enhancements.md` §3) 기준:

1. **F5 태그 + 필터** (의존성 없음, 우선)
   - `tags TEXT[]` + GIN 인덱스
   - ToDo 카드에 태그 칩, 페이지 상단 태그 필터
2. **F4 시간 그래프** (F1, F2 의존)
   - `todo_time_log` 테이블 또는 reminders의 started_at/completed_at + linked_event 길이로 집계
   - GET `/api/todo/timeline?from=&to=` 신규
   - 첫 차트는 "일별 스택 바"만

### 2.4 알려진 미해결 이슈 / 트레이드오프

1. **`status` 영속 vs Google Tasks**
   - Google은 `in_progress`를 모름 → 모바일 Google Tasks 앱에서 보면 'needsAction'으로만 보임
   - `mergeTaskWithMetadata`에서 Google needsAction + Supabase in_progress → in_progress 유지하는 룰을 둠. 사용자 인지 필요.
2. **GET `/`의 lazy auto-transition 비용**
   - 링크된 ToDo가 N개면 calendar.events.get N회 (병렬). 일반 사용 (수~수십 개) 수준에서는 문제 없으나 100개+ 사용자에서는 batch endpoint 또는 캐시 검토.
3. **외부에서 캘린더 이벤트 삭제된 경우**
   - `linked_event_id`는 stale. 현재는 `events.get` 실패 시 그냥 무시 (auto-transition 건너뜀)
   - 추후 정리 작업: 주기적으로 stale 링크 nullify
4. **PUT `/:id` 동시 수정 race**
   - 기존 보고서 §3에서 언급된 false positive였으나, 새 칼럼 추가로 update payload가 커진 만큼 실제 사용에서 문제가 생기는지 모니터링 필요
5. **Supabase MCP 미연결**
   - 마이그레이션 자동 실행 불가. 다음 세션에서 MCP 추가하면 편리.

---

## 3. 새 Claude Code 세션 시작 시 권장 프롬프트

```
documents/feature/todo-phase1-progress.md를 읽고 Phase 1 진행을 이어서 해줘.
먼저 마이그레이션을 Supabase에 적용했는지 확인하고, §2.1 동작 확인부터 시작해라.
```

또는 Phase 2로 바로 넘어가려면:

```
documents/feature/todo-phase1-progress.md와 documents/feature/todo-enhancements.md를
읽고 Phase 2 (F5 태그)부터 진행해라.
```

---

## 4. 변경된 파일 전체 목록

```
documents/migration_todo_phase1.sql                                      (신규)
documents/feature/todo-phase1-progress.md                                (이 파일)

backend/src/types/index.ts                                               (수정)
backend/src/routes/reminders.ts                                          (수정)
backend/src/routes/chat.ts                                               (수정)
backend/src/services/gemini.ts                                           (수정)

frontend/src/types/index.ts                                              (수정)
frontend/src/components/reminders/link-event-dialog.tsx                  (신규)
frontend/src/app/(app)/reminders/page.tsx                                (수정)
frontend/src/app/(app)/reminders/[id]/page.tsx                           (수정)
frontend/src/components/chat-panel.tsx                                   (수정 — ACTION_LABELS만)
```

커밋은 아직 안 했음. 다음 세션에서 동작 확인 후 단일 커밋 또는 논리 단위로 분할 권장.
