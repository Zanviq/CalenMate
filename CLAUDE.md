# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalenMate - AI schedule management web app (calendar + ToDo + Gemini chat). Monorepo with separate frontend (Next.js) and backend (Express.js) plus PostgreSQL 16, all run by `docker compose up`. Auth is username/password with an httpOnly JWT cookie.

## Commands

```bash
# Full stack in Docker (db + backend + frontend) — from root
cp .env.example .env && docker compose up --build   # http://localhost:3000, demo / demo1234

# Run both frontend and backend concurrently (from root; needs a local Postgres + backend/.env)
npm run dev

# Frontend only (port 3000)
npm run dev:frontend    # or: cd frontend && npm run dev

# Backend only (port 4000)
npm run dev:backend     # or: cd backend && npm run dev

# Frontend
cd frontend && npm run build    # Build
cd frontend && npm run lint     # ESLint (flat config, v9)

# Backend
cd backend && npm run build     # tsc → dist/
cd backend && npm run db:generate   # drizzle-kit: schema.ts → drizzle/*.sql migration
cd backend && npm run db:migrate    # apply migrations (also runs automatically on server start)
cd backend && npm run db:seed       # demo account + sample data (also runs on start unless SEED_DEMO_DATA=false)
# Backend has no lint script or ESLint config
```

**No test framework is configured.** There are no test files or test runner setup in this project.

## Architecture

### Frontend (`frontend/`) - Next.js 16, App Router
- **Auth flow**: Login/register form (`app/login`) → `store/auth.ts` (Zustand) calls `/api/auth/*`. `proxy.ts` gates routes by presence of the `calenmate_session` cookie; the backend verifies it.
- **Routing**: `app/(app)/` is the authenticated layout group (redirects to `/login` if no user). Pages: home, calendar, reminders, reminders/[id], settings.
- **App Shell**: `AppShell` component provides sidebar nav + chat panel layout.
- **State**: Zustand for auth (`store/auth.ts`) and chat (`store/chat.ts`). TanStack React Query for server state. Chat store is keyed by context (`home`/`calendar`/`reminder`) — messages persist when switching tabs.
- **API client**: `lib/api.ts` - Axios instance, same-origin `/api/*` with credentials. `next.config.ts` rewrites `/api/*` to `BACKEND_URL` (build-time; `http://backend:4000` in Docker), output is `standalone`.
- **UI**: shadcn/ui components in `components/ui/` (config: `components.json`, style "base-nova"). Calendar uses FullCalendar library. Markdown editing via `@uiw/react-md-editor`.
- **Styling**: Tailwind CSS v4 — no `tailwind.config` file. Theme is defined inline in `globals.css` using `@theme` with oklch() color space and CSS variables. Plugins: `@tailwindcss/typography`, `tw-animate-css`. Dark mode via `next-themes`.
- **Path alias**: `@/*` → `./src/*`

### Backend (`backend/`) - Express.js 5
- **Entry**: `src/index.ts` - Express app with helmet, gzip compression, CORS (allows frontend origin), JSON parsing.
- **Auth middleware**: `middleware/auth.ts` - Verifies the JWT in the `calenmate_session` cookie (`JWT_SECRET`), sets `req.userId`. Extended request type: `AuthRequest`. Passwords hashed with bcryptjs.
- **DB**: Drizzle ORM + `pg`. Schema in `src/db/schema.ts` (snake_case property keys so rows serialize in the API shape), SQL migrations in `backend/drizzle/`, applied on startup by `src/db/migrate.ts`; demo seed in `src/db/seed.ts`.
- **Routes** (all under `/api/`): auth, calendar, reminders, reminder-notes, task-lists, chat, summary, instructions, settings, insights, focus.
- **Services**:
  - `events.ts` - Calendar events in Postgres. Returns the `{ summary, start: { dateTime | date }, end, colorId }` shape used by chat UI / summary / Gemini prompts. Times are rendered in Asia/Seoul (+09:00).
  - `task-lists.ts` - ToDo lists; the `@default` alias resolves to the user's default list (created at sign-up).
  - `reminders.ts` - Shared ToDo operations (create/update/status/delete/link-event) used by routes and chat actions.
  - `gemini.ts` - Gemini 2.5 Flash with structured JSON output. System prompt includes: current events, reminders, chat history, user instructions.
- **Validation**: `middleware/validate.ts` with Zod schemas.
- **Dev**: Uses `tsx watch` for hot reload.

### AI Chat Pipeline (cross-cutting)
1. `POST /api/chat` receives user message + context (home/calendar/reminder)
2. Backend fetches in parallel: chat history, user instructions, calendar events, reminders
3. `gemini.ts` returns structured JSON: `{ actions: AIAction[], response: string }`
4. `chat.ts` route executes actions sequentially (create/update/delete events, reminders, instructions)
5. Invalidates summary cache after schedule-changing actions
6. Saves both user and assistant messages to `chat_messages` table

### Auth Flow (cross-cutting)
1. `POST /api/auth/register` or `/api/auth/login` (bcrypt) → backend sets httpOnly `calenmate_session` JWT cookie
2. Browser calls same-origin `/api/*`; Next.js rewrites to the backend, so the cookie is sent automatically
3. `authMiddleware` verifies the JWT and sets `req.userId`; every query filters by `user_id` (former RLS policies: `docs/authorization.md`)

### Data Model (PostgreSQL 16, Drizzle)
- `users` - username, password_hash, display_name, avatar_url, settings (jsonb)
- `events` - Calendar events (start_at/end_at timestamptz, all_day, color = colorId '1'..'11')
- `task_lists` - ToDo lists (one `is_default` per user)
- `reminders` - ToDos (`list_id`, status, checklist jsonb, tags text[], `linked_event_id` → events)
- `reminder_notes` - Markdown AI notes per reminder
- `chat_messages` - Persisted chat with `context` field and `metadata` (action results)
- `user_instructions` - Persistent AI behavior rules set by users
- `todo_time_log` - Focus sessions

### Environment Variables
- Docker: root `.env` (from `.env.example`) - `JWT_SECRET`, `GEMINI_API_KEY`, `POSTGRES_*`, `APP_PORT`, `COOKIE_SECURE`, `SEED_DEMO_DATA`
- Local dev: `backend/.env` (from `backend/.env.example`) - adds `DATABASE_URL`, `PORT`, `FRONTEND_URL`. Frontend needs no env (optional `BACKEND_URL` for the rewrite, read at build time).

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, TanStack Query, FullCalendar, Zod, react-hook-form
- **Backend**: Express.js 5, TypeScript 6, Drizzle ORM, pg, bcryptjs, jsonwebtoken, @google/generative-ai
- **Database/Auth**: PostgreSQL 16 (Docker), username/password + JWT cookie
- **Infra**: Docker Compose (db, backend, frontend), multi-stage Dockerfiles
- **AI**: Google Gemini 2.5 Flash (structured JSON output mode)

## Conventions

- TypeScript strict mode in both packages
- Components: PascalCase. Functions/variables: camelCase. API endpoints: kebab-case
- Commit messages: conventional commits (Korean body allowed)
- Frontend imports use `@/` path alias
- AI responses and UI are in Korean
- **IMPORTANT**: This project uses Next.js 16 which has breaking changes from earlier versions. Read `node_modules/next/dist/docs/` and `frontend/AGENTS.md` before writing Next.js code.
- Backend TypeScript targets ES2020 with CommonJS modules; frontend targets ES2017 with ESNext modules (bundler resolution)
