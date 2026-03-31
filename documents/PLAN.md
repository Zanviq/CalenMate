# CalenMate 개발 계획서

## 1. 아키텍처 개요

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Backend API    │────▶│  Supabase    │
│  (Next.js)  │     │  (Express.js)   │     │  (PostgreSQL)│
│  Vercel     │     │  Railway/Render │     │              │
└─────────────┘     └────────┬────────┘     └──────────────┘
                             │
                    ┌────────┼────────┐
                    ▼        ▼        ▼
              Google Cal  Gemini   Supabase
              API         API      Auth
```

### Frontend (Next.js 14 + App Router)
- UI 렌더링, 라우팅, 클라이언트 상태 관리
- Supabase Auth 클라이언트 (Google OAuth)
- 백엔드 API 호출

### Backend (Express.js + TypeScript)
- Google Calendar API 프록시 (토큰 관리)
- Gemini AI 처리 (프롬프트 관리, 구조화 파싱)
- 리마인더/노트 CRUD
- Supabase 서버 사이드 접근

---

## 2. 데이터베이스 설계 (Supabase)

### profiles
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | Supabase auth.users.id |
| email | text | 이메일 |
| display_name | text | 표시 이름 |
| avatar_url | text | 프로필 이미지 |
| google_access_token | text (encrypted) | Google OAuth 액세스 토큰 |
| google_refresh_token | text (encrypted) | Google OAuth 리프레시 토큰 |
| settings | jsonb | 사용자 설정 (테마, 알림 등) |
| created_at | timestamptz | 생성일 |
| updated_at | timestamptz | 수정일 |

### reminders
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles) | |
| title | text | 리마인더 제목 |
| description | text | 상세 설명 |
| due_date | timestamptz | 마감일 |
| priority | text | low / medium / high |
| is_completed | boolean | 완료 여부 |
| notify | boolean | 알림 여부 |
| notify_at | timestamptz | 알림 시각 |
| color | text | 색상 코드 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### reminder_notes (AI 노트)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| reminder_id | uuid (FK → reminders) | |
| user_id | uuid (FK → profiles) | |
| content | text | 노트 내용 (마크다운) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### chat_messages
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles) | |
| role | text | user / assistant |
| content | text | 메시지 내용 |
| context | text | home / calendar / reminder |
| metadata | jsonb | AI 파싱 결과, 실행된 액션 등 |
| created_at | timestamptz | |

### RLS (Row Level Security)
- 모든 테이블에 RLS 활성화
- `user_id = auth.uid()` 정책으로 계정 간 데이터 완전 격리

---

## 3. API 설계

### Auth
- `POST /api/auth/google` - Google OAuth 콜백 처리, 토큰 저장
- `POST /api/auth/refresh` - Google 토큰 갱신
- `GET /api/auth/me` - 현재 사용자 정보

### Calendar (Google Calendar 프록시)
- `GET /api/calendar/events` - 일정 목록 조회 (기간 파라미터)
- `POST /api/calendar/events` - 일정 생성
- `PUT /api/calendar/events/:id` - 일정 수정
- `DELETE /api/calendar/events/:id` - 일정 삭제

### Reminders
- `GET /api/reminders` - 리마인더 목록
- `POST /api/reminders` - 리마인더 생성
- `PUT /api/reminders/:id` - 리마인더 수정
- `DELETE /api/reminders/:id` - 리마인더 삭제
- `PATCH /api/reminders/:id/complete` - 완료 토글

### Reminder Notes
- `GET /api/reminders/:id/notes` - 노트 조회
- `POST /api/reminders/:id/notes` - 노트 생성/수정

### AI Chat
- `POST /api/chat` - AI 메시지 전송 + 액션 실행
- `GET /api/chat/history` - 채팅 히스토리 (context별 필터)

### AI Summary
- `GET /api/summary/today` - 오늘 일정 AI 요약
- `GET /api/summary/week` - 이번 주 일정 AI 요약

---

## 4. AI (Gemini) 설계

### 구조화 파싱 시스템
사용자 입력을 Gemini에 전송하여 구조화된 JSON으로 변환:

```json
{
  "actions": [
    {
      "type": "create_event",
      "data": {
        "title": "팀 미팅",
        "date": "2026-03-30",
        "start_time": "17:00",
        "end_time": "18:00",
        "color": null
      }
    },
    {
      "type": "create_reminder",
      "data": {
        "title": "보고서 작성",
        "priority": "high",
        "due_date": "2026-03-31",
        "notify": true
      }
    }
  ],
  "response": "5시에 팀 미팅 일정을 추가하고, 할일에 보고서 작성을 추가했습니다."
}
```

### 컨텍스트별 시스템 프롬프트
- **홈**: 전체 일정/리마인더 요약, 통합 관리
- **캘린더**: 일정 중심 (CRUD, 시간 관리)
- **리마인더**: 할 일 중심 (체크리스트, 우선순위)

### 복합 명령 처리
- 하나의 메시지에서 여러 액션 추출
- 순차 실행 후 결과 통합 응답

---

## 5. 프론트엔드 페이지 구조

```
/                      → 리다이렉트 (/home 또는 /login)
/login                 → 로그인 페이지
/home                  → 홈 (통합 대시보드 + AI 요약)
/calendar              → 캘린더 뷰 + AI 채팅
/reminders             → 리마인더 목록 + AI 채팅
/reminders/:id         → 리마인더 상세 (편집 + AI 노트)
/settings              → 설정 페이지
```

### 레이아웃

```
┌──────┬────────────────────────┬──────────┐
│      │                        │          │
│ 사이 │      메인 콘텐츠        │  AI 채팅  │
│ 드바 │                        │          │
│      │                        │          │
│      │                        │          │
│──────│                        │          │
│프로필│                        │          │
└──────┴────────────────────────┴──────────┘
```

### 주요 컴포넌트
- `Sidebar` - 네비게이션 + 하단 프로필 (계정 전환)
- `ChatPanel` - 오른쪽 AI 채팅 패널
- `CalendarView` - 월간/주간/일간 캘린더
- `DayDetailModal` - 날짜 클릭 시 일정 목록
- `ReminderList` - 리마인더 목록
- `ReminderDetail` - 편집 + AI 노트 탭
- `AccountSwitcher` - 계정 전환 팝업

---

## 6. 개발 단계 (Phase)

### Phase 1: 프로젝트 초기 설정
1. Frontend: Next.js 프로젝트 생성, Tailwind + shadcn/ui 설정
2. Backend: Express.js + TypeScript 프로젝트 생성
3. Supabase 프로젝트 생성, 스키마 마이그레이션 작성
4. 환경변수 설정 (.env)
5. 모노레포 구조 정리 (루트 package.json, 스크립트)

### Phase 2: 인증 시스템
1. Supabase Auth + Google OAuth 설정
2. Google Calendar API 스코프 설정 (읽기/쓰기 권한)
3. 로그인/로그아웃 플로우
4. Google 토큰 저장/갱신 로직 (백엔드)
5. 인증 미들웨어 (백엔드)
6. Auth 상태 관리 (프론트엔드)

### Phase 3: 레이아웃 & 네비게이션
1. 사이드바 컴포넌트 (홈/리마인더/캘린더/설정)
2. AI 채팅 패널 (오른쪽)
3. 반응형 레이아웃
4. 프로필 영역 + 계정 전환 UI

### Phase 4: 캘린더 기능
1. Google Calendar API 연동 (백엔드 프록시)
2. 캘린더 뷰 컴포넌트 (월간/주간/일간)
3. 날짜 클릭 → 일정 목록 표시
4. 일정 생성/수정/삭제 UI
5. 일정 색상 지원

### Phase 5: 리마인더 기능
1. 리마인더 CRUD API
2. 리마인더 목록 UI (필터, 정렬)
3. 리마인더 상세 페이지 (편집 탭)
4. AI 노트 탭 (마크다운 에디터)
5. 완료 토글, 우선순위 표시
6. 알림 설정

### Phase 6: AI 채팅 시스템
1. Gemini API 연동 (백엔드)
2. 구조화 파싱 시스템 프롬프트 설계
3. 채팅 UI 컴포넌트
4. 컨텍스트별 AI 동작 분기
5. 복합 명령 처리 (여러 액션 한번에)
6. 채팅 히스토리 저장/조회

### Phase 7: 홈 대시보드
1. 통합 뷰 (오늘 일정 + 리마인더)
2. AI 일정 요약 기능
3. 빠른 액션 (체크, 추가)

### Phase 8: 설정 & 계정 전환
1. 설정 페이지 (프로필, 알림, 테마)
2. 다중 계정 전환 기능
3. 계정 간 데이터 격리 확인

### Phase 9: 마무리 & 배포
1. 에러 핸들링, 로딩 상태
2. 반응형 디자인 점검
3. Frontend 배포 (Vercel)
4. Backend 배포 (Railway/Render)
5. 환경변수 설정 (프로덕션)
6. 최종 테스트

---

## 7. 핵심 기술 결정

| 항목 | 선택 | 이유 |
|------|------|------|
| 상태관리 | Zustand | 가볍고 TypeScript 호환 좋음 |
| 캘린더 UI | @fullcalendar/react | 풍부한 뷰 옵션, Google Calendar 연동 |
| 마크다운 에디터 | @uiw/react-md-editor | 가볍고 AI 노트에 적합 |
| HTTP 클라이언트 | axios | 인터셉터로 토큰 관리 용이 |
| 서버 데이터 캐싱 | TanStack Query | 서버 상태 캐싱, 낙관적 업데이트 |
| 폼 관리 | react-hook-form + zod | 타입 안전한 폼 검증 |
| 날짜 처리 | date-fns | 트리 셰이킹 가능, 가벼움 |
| 아이콘 | lucide-react | shadcn/ui와 호환 |

---

## 8. 환경변수

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=         # 백엔드 API 주소
```

### Backend (.env)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=
FRONTEND_URL=                # CORS 허용 도메인
PORT=4000
```
