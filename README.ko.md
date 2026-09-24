<div align="center">

# 📅 CalenMate

**AI와 대화하며 관리하는 캘린더·ToDo 앱**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

[English](./README.md) | **한국어**

<img src="https://img.shields.io/badge/Powered%20by-Google%20Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Powered by Gemini"/>

</div>

---

## 📌 프로젝트 상태

이 프로젝트는 개발이 중단되었습니다. 여기서 다룬 아이디어는 다음 두 후속 프로젝트로 이어졌습니다.

- [**SERVER**](https://github.com/Zanviq/SERVER) — 캘린더, 할 일, AI 비서를 포함한 개인용 멀티유저 홈서버 (FastAPI + React, Docker)
- [**Plant-Counselor**](https://github.com/Zanviq/Plant-Counselor) — 고민, 목표, 일정을 식물의 생애주기로 표현하는 AI 정원사 웹 서비스

---

## 💭 Developer's Note

> <!-- TODO: 인용구 1줄 -->

<!-- TODO: 개발 동기 -->

---

## ✨ Features

### 💬 AI 채팅 비서
- Gemini 2.5 Flash의 JSON 출력을 사용하며, 메시지 하나로 여러 작업을 실행 (일정·ToDo 생성/수정/삭제, 상태 변경, 일정 연결, 지시사항 저장)
- 프롬프트에 향후 7일 일정, 미완료 및 최근 완료 ToDo, 최근 대화 40개, 저장된 지시사항이 들어감
- 다른 기간을 묻는 질문이면 AI가 해당 기간 조회를 먼저 요청(`query_events`)하고 그 결과로 답변
- 여러 건 삭제·수정, 여러 ToDo를 빈 시간대에 한 번에 배치하는 작업은 대기 상태로 보여주고, 사용자가 확인을 누르면 실행
- 대화 기록은 탭(홈 / 캘린더 / ToDo)별로 유지, `/today`, `/reminders`, `/clear` 등 슬래시 명령어 지원

### 📅 캘린더
- 월간 / 주간 / 일간 보기 (FullCalendar), 날짜를 클릭하면 그날 일정 확인 및 추가
- 일정은 PostgreSQL에 저장, 색상 11종
- 채팅으로도 일정 추가, 이동, 삭제 가능

### ✅ ToDo
- ToDo는 목록에 속함 (회원가입 시 기본 목록 생성)
- 세 가지 상태(시작 전 / 진행 중 / 완료), 우선순위, 마감일, 태그(AND 필터), 체크리스트
- 미루기: 마감일을 내일, 다음 주, 다음 월요일로 이동
- ToDo를 기존 일정에 연결하거나 새 시간 블록을 만들 수 있고, 연결된 일정이 시작·종료되면 다음 조회 시 상태가 갱신됨 (별도 백그라운드 작업 없음)

### 📝 노트와 집중 세션
- ToDo마다 마크다운 노트 1개, AI가 초안 작성 가능
- 집중 타이머(25 / 50분)를 시작하면 ToDo가 진행 중으로 바뀌고, 종료 시 완료 처리 선택 가능
- 인사이트 페이지에서 ToDo 시작·완료 시각과 집중 세션 기록으로 날짜별 사용 시간을 합산

### 🏠 홈 요약
- 오늘 일정과 미완료 ToDo를 AI가 요약 (15분 캐시, 데이터 변경 시 초기화)
- 오늘 일정, 미완료 ToDo, 저장된 AI 지시사항을 한 화면에 표시

### 🔐 계정과 자체 호스팅
- 아이디 + 비밀번호 회원가입, 비밀번호는 bcrypt 해시로 저장, 세션은 httpOnly JWT 쿠키
- 모든 쿼리는 로그인한 사용자 기준으로 필터링 ([docs/authorization.md](docs/authorization.md))
- `docker compose up`으로 PostgreSQL, 백엔드, 프론트엔드가 함께 실행되며 시작 시 마이그레이션과 데모 데이터가 적용됨

---

## 🚀 Getting Started

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (Docker Compose v2 포함)
- [Google Gemini API Key](https://aistudio.google.com/app/apikey) (AI 기능에만 필요, 없어도 나머지 기능은 동작)

### Installation

```bash
# 저장소 클론
git clone https://github.com/Zanviq/CalenMate.git
cd CalenMate

# 환경 변수 파일 생성 후 JWT_SECRET, GEMINI_API_KEY 설정
cp .env.example .env

# 빌드 및 실행 (db, backend, frontend)
docker compose up --build
```

http://localhost:3000 에 접속합니다.

### 데모 계정

| 아이디 | 비밀번호 |
|:---:|:---:|
| `demo` | `demo1234` |

데모 계정에는 예시 일정, ToDo, 노트, 지시사항이 들어 있습니다. 만들지 않으려면 `.env`에서 `SEED_DEMO_DATA=false`로 설정합니다.

### 환경 변수

| 변수 | 설명 |
|----------|-------------|
| `JWT_SECRET` | 세션 쿠키 서명 키 (예: `openssl rand -hex 32`) |
| `GEMINI_API_KEY` | 채팅, 요약, AI 노트에 쓰는 Gemini API 키 |
| `APP_PORT` | 웹 앱 포트 (기본값 `3000`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | 데이터베이스 설정 |
| `COOKIE_SECURE` | HTTPS로 서비스할 때 `true` |
| `SEED_DEMO_DATA` | 시작 시 데모 계정 생성 여부 (기본값 `true`) |

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **UI** | Tailwind CSS v4, shadcn/ui, FullCalendar |
| **State** | Zustand, TanStack Query |
| **Backend** | Express 5, TypeScript, Zod |
| **Database** | PostgreSQL 16, Drizzle ORM |
| **Auth** | bcryptjs, jsonwebtoken (httpOnly 쿠키) |
| **AI** | Google Gemini API (gemini-2.5-flash) |
| **Infra** | Docker Compose, 멀티스테이지 Dockerfile |

---

## 📁 Project Structure

```
CalenMate/
├── 📂 backend/
│   ├── 📂 drizzle/              # SQL 마이그레이션 (drizzle-kit 생성)
│   ├── 📂 src/
│   │   ├── 📂 db/
│   │   │   ├── schema.ts        # 테이블 정의
│   │   │   ├── migrate.ts       # 시작 시 마이그레이션 적용
│   │   │   └── seed.ts          # 데모 계정과 예시 데이터
│   │   ├── 📂 middleware/
│   │   │   ├── auth.ts          # JWT 쿠키 검증, req.userId 설정
│   │   │   └── validate.ts      # Zod 요청 검증
│   │   ├── 📂 routes/           # auth, calendar, reminders, chat, summary, focus, insights ...
│   │   ├── 📂 services/
│   │   │   ├── gemini.ts        # 프롬프트, 재시도, JSON 파싱
│   │   │   ├── events.ts        # 캘린더 일정
│   │   │   ├── reminders.ts     # 라우트와 채팅이 함께 쓰는 ToDo 처리
│   │   │   └── task-lists.ts    # ToDo 목록
│   │   └── index.ts             # Express 앱, 서버 시작
│   └── Dockerfile
├── 📂 frontend/
│   ├── 📂 src/
│   │   ├── 📂 app/              # 페이지: login, home, calendar, reminders, insights, settings
│   │   ├── 📂 components/       # 앱 셸, 채팅 패널, 캘린더/ToDo 다이얼로그, ui/
│   │   ├── 📂 store/            # Zustand 스토어 (auth, chat)
│   │   ├── 📂 lib/api.ts        # Axios 클라이언트 (같은 오리진 /api)
│   │   └── proxy.ts             # 세션 쿠키 기준 리다이렉트
│   ├── next.config.ts           # /api를 백엔드로 리라이트, standalone 출력
│   └── Dockerfile
├── 📂 docs/
│   └── authorization.md         # 사용자별 접근 규칙
├── docker-compose.yml           # db, backend, frontend
└── .env.example                 # 환경 변수 템플릿
```

---

## 💡 How to Use

1. **로그인**: `demo` / `demo1234`로 로그인하거나 "회원가입"으로 계정 생성
2. **AI에게 요청**: 오른쪽 채팅 패널에 입력 (예: "내일 오후 3시에 치과 일정 추가해줘")
3. **일정 추가**: 캘린더에서 날짜를 클릭하고 입력 폼 작성
4. **ToDo 관리**: ToDo 페이지에서 항목 추가, 목록 선택, 태그 필터, 동그라미를 눌러 상태 변경
5. **시간 블록 잡기**: ToDo 상세 페이지에서 기존 일정을 연결하거나 새 시간 블록 생성
6. **집중하기**: ToDo 상세 페이지에서 25분 또는 50분 집중 세션 시작
7. **시간 확인**: 인사이트 페이지에서 날짜별 사용 시간 확인

---

## 🎨 Screenshots

<div align="center">

![Login](image/Login.png)

<table>
  <tr>
    <td><img src="image/Home.png" width="400"/></td>
    <td><img src="image/Calendar.png" width="400"/></td>
  </tr>
  <tr>
    <td><img src="image/ToDo.png" width="400"/></td>
    <td><img src="image/ToDo_Detail.png" width="400"/></td>
  </tr>
  <tr>
    <td><img src="image/Chat.png" width="400"/></td>
    <td><img src="image/Insights.png" width="400"/></td>
  </tr>
</table>
</div>

---

## 📝 License

이 프로젝트는 MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE)를 참고하세요.

---

<div align="center">

| 👤 **Developer** | ✉️ **Email** |
|:---:|:---:|
| Zanviq | zanviq.dev@gmail.com |

</div>
