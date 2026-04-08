# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalenMate - Google Calendar integrated AI schedule management web app. Monorepo with separate frontend (Next.js) and backend (Express.js), connected via REST API with Supabase Auth tokens.

## Commands

```bash
# Run both frontend and backend concurrently (from root)
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
# Backend has no lint script or ESLint config
```

**No test framework is configured.** There are no test files or test runner setup in this project.

## Architecture

### Frontend (`frontend/`) - Next.js 16, App Router
- **Auth flow**: Supabase Auth → Google OAuth with calendar scopes. `useAuth` hook wraps Zustand store (`store/auth.ts`). Middleware (`middleware.ts`) handles session refresh via `@supabase/ssr`.
- **Routing**: `app/(app)/` is the authenticated layout group (redirects to `/login` if no user). Pages: home, calendar, reminders, reminders/[id], settings.
- **App Shell**: `AppShell` component provides sidebar nav + chat panel layout.
- **State**: Zustand for auth (`store/auth.ts`) and chat (`store/chat.ts`). TanStack React Query for server state. Chat store is keyed by context (`home`/`calendar`/`reminder`) — messages persist when switching tabs.
- **API client**: `lib/api.ts` - Axios instance with interceptor that auto-attaches Supabase JWT. Includes token caching (5min TTL) and auto-retry on 401 with `refreshSession()`.
- **UI**: shadcn/ui components in `components/ui/` (config: `components.json`, style "base-nova"). Calendar uses FullCalendar library. Markdown editing via `@uiw/react-md-editor`.
- **Styling**: Tailwind CSS v4 — no `tailwind.config` file. Theme is defined inline in `globals.css` using `@theme` with oklch() color space and CSS variables. Plugins: `@tailwindcss/typography`, `tw-animate-css`. Dark mode via `next-themes`.
- **Path alias**: `@/*` → `./src/*`

### Backend (`backend/`) - Express.js 5
- **Entry**: `src/index.ts` - Express app with helmet, gzip compression, CORS (allows frontend origin), JSON parsing.
- **Auth middleware**: `middleware/auth.ts` - Validates Supabase JWT via `supabaseAdmin.auth.getUser()`, caches token→userId (3min TTL), sets `req.userId`. Extended request type: `AuthRequest`.
- **Routes** (all under `/api/`): auth, calendar, reminders, reminder-notes, task-lists, chat, summary, instructions, settings.
- **Services**:
  - `google-auth.ts` - OAuth2 client factory with per-user caching (15min TTL), auto-persists refreshed tokens to Supabase with debounce.
  - `google-calendar.ts` / `google-tasks.ts` - Google API wrappers using cached OAuth2 clients.
  - `gemini.ts` - Gemini 2.5 Flash with structured JSON output. System prompt includes: current events (30 days), reminders, chat history (20 msgs), user instructions.
  - `supabase.ts` - Admin client (service role key).
- **Validation**: `middleware/validate.ts` with Zod schemas.
- **Dev**: Uses `tsx watch` for hot reload.

### AI Chat Pipeline (cross-cutting)
1. `POST /api/chat` receives user message + context (home/calendar/reminder)
2. Backend fetches in parallel: chat history, user instructions, calendar events, reminders
3. `gemini.ts` returns structured JSON: `{ actions: AIAction[], response: string }`
4. `chat.ts` route executes actions sequentially (create/update/delete events, reminders, instructions)
5. Pre-fetches Google API clients once before action loop to avoid per-action overhead
6. Invalidates summary cache after schedule-changing actions
7. Saves both user and assistant messages to `chat_messages` table

### Auth Flow (cross-cutting)
1. Frontend: Supabase OAuth → Google (with calendar scopes) → callback at `/auth/callback`
2. Frontend stores session, attaches JWT to API requests via Axios interceptor
3. Backend validates JWT with Supabase Admin, extracts `userId`
4. Google Calendar/Tasks access uses provider tokens stored in `profiles` table, auto-refreshed via OAuth2 client event handler

### Data Model (Supabase)
- `profiles` - User info + encrypted Google OAuth tokens
- `reminders` - Synced with Google Tasks (`google_task_id`, `google_list_id`)
- `reminder_notes` - Markdown AI notes per reminder
- `chat_messages` - Persisted chat with `context` field and `metadata` (action results)
- `user_instructions` - Persistent AI behavior rules set by users
- All tables use RLS with `user_id = auth.uid()`

### Environment Variables
- Frontend: `frontend/.env.local` - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`
- Backend: `backend/.env` - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `FRONTEND_URL`, `PORT`

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, TanStack Query, FullCalendar, Zod, react-hook-form
- **Backend**: Express.js 5, TypeScript 6, googleapis, @google/generative-ai
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **AI**: Google Gemini 2.5 Flash (structured JSON output mode)

## Conventions

- TypeScript strict mode in both packages
- Components: PascalCase. Functions/variables: camelCase. API endpoints: kebab-case
- Commit messages: conventional commits (Korean body allowed)
- Frontend imports use `@/` path alias
- AI responses and UI are in Korean
- **IMPORTANT**: This project uses Next.js 16 which has breaking changes from earlier versions. Read `node_modules/next/dist/docs/` and `frontend/AGENTS.md` before writing Next.js code.
- Backend TypeScript targets ES2020 with CommonJS modules; frontend targets ES2017 with ESNext modules (bundler resolution)
