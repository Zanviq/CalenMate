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
cd frontend && npm run lint     # ESLint

# Backend
cd backend && npm run build     # tsc → dist/
```

## Architecture

### Frontend (`frontend/`) - Next.js 16, App Router
- **Auth flow**: Supabase Auth → Google OAuth with calendar scopes. `useAuth` hook wraps Zustand store (`store/auth.ts`). Middleware (`middleware.ts`) handles session refresh via `@supabase/ssr`.
- **Routing**: `app/(app)/` is the authenticated layout group (redirects to `/login` if no user). Pages: home, calendar, reminders, reminders/[id], settings.
- **App Shell**: `AppShell` component provides sidebar nav + chat panel layout.
- **State**: Zustand for auth (`store/auth.ts`) and chat (`store/chat.ts`). TanStack React Query for server state.
- **API client**: `lib/api.ts` - Axios instance with interceptor that auto-attaches Supabase JWT to all backend requests.
- **UI**: shadcn/ui components in `components/ui/`. Calendar uses FullCalendar library.
- **Path alias**: `@/*` → `./src/*`

### Backend (`backend/`) - Express.js 5
- **Entry**: `src/index.ts` - Express app with helmet, CORS (allows frontend origin), JSON parsing.
- **Auth middleware**: `middleware/auth.ts` - Validates Supabase JWT via `supabaseAdmin.auth.getUser()`, sets `req.userId`.
- **Routes** (all under `/api/`): auth, calendar, reminders, reminder-notes, chat, summary.
- **Services**: `google-calendar.ts` (Google Calendar API), `gemini.ts` (Google Gemini AI), `supabase.ts` (admin client).
- **Dev**: Uses `tsx watch` for hot reload.

### Auth Flow (cross-cutting)
1. Frontend: Supabase OAuth → Google (with calendar scopes) → callback at `/auth/callback`
2. Frontend stores session, attaches JWT to API requests via Axios interceptor
3. Backend validates JWT with Supabase Admin, extracts `userId`
4. Google Calendar access uses the provider token from the OAuth flow

### Environment Variables
- Frontend: `frontend/.env.local` - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`
- Backend: `backend/.env` - Supabase, Google Calendar, Gemini API keys, `FRONTEND_URL`

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, TanStack Query, FullCalendar, Zod, react-hook-form
- **Backend**: Express.js 5, TypeScript 6, googleapis, @google/generative-ai
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **AI**: Google Gemini API

## Conventions

- TypeScript strict mode in both packages
- Components: PascalCase. Functions/variables: camelCase. API endpoints: kebab-case
- Commit messages: conventional commits (Korean body allowed)
- Frontend imports use `@/` path alias
- **IMPORTANT**: This project uses Next.js 16 which has breaking changes from earlier versions. Read `node_modules/next/dist/docs/` before writing Next.js code.
