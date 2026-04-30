'use client';

import Link from 'next/link';
import {
  Calendar,
  Sparkles,
  ListTodo,
  CheckCircle2,
  ArrowLeft,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const { signInWithGoogle } = useAuthStore();

  return (
    <div className="grid h-full min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left: design / brand panel */}
      <aside className="relative hidden overflow-hidden bg-zinc-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Decorative gradients */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_oklch(0.5_0.18_265_/_0.55),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_oklch(0.55_0.16_300_/_0.45),_transparent_55%)]"
        />
        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:32px_32px]"
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-zinc-950">
            <Calendar className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">CalenMate</span>
        </div>

        {/* Center copy + chat preview card */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
              <Sparkles className="h-3 w-3" />
              Gemini 2.5 Flash 기반
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              일정을 말하세요.
              <br />
              <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">
                AI가 정리합니다.
              </span>
            </h2>
            <p className="max-w-md text-sm text-white/70">
              Google 캘린더와 Tasks가 그대로 연동된 AI 일정 관리. 한 줄 채팅으로 일정과 리마인더를 만들고, 노트를 받으세요.
            </p>
          </div>

          {/* Mock chat card */}
          <div className="max-w-md space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
            <div className="flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-white/10 px-3.5 py-2 text-sm">
                내일 오후 3시에 디자인 리뷰 1시간 잡아줘
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-violet-500">
                <Sparkles className="h-3 w-3" />
              </span>
              <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2 text-sm">
                <p>네, 추가했어요.</p>
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="font-medium">디자인 리뷰</span>
                  <span className="text-white/50">· 내일 15:00 – 16:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feature bullets */}
          <ul className="grid max-w-md gap-3 text-sm text-white/80">
            <li className="flex items-start gap-2.5">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <span>Google Calendar 양방향 동기화</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>Google Tasks 리마인더 + AI 노트</span>
            </li>
            <li className="flex items-start gap-2.5">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <span>맥락을 이해하는 채팅 어시스턴트</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-xs text-white/40">
          © {new Date().getFullYear()} CalenMate. AI로 더 가벼워지는 일정 관리.
        </p>
      </aside>

      {/* Right: login panel */}
      <main className="relative flex flex-col bg-background">
        {/* Top-left back link (mobile + desktop) */}
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            홈으로
          </Link>
          {/* Mobile-only mini brand (desktop shows it on the left panel) */}
          <Link href="/" className="flex items-center gap-1.5 lg:hidden">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
              <Calendar className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">CalenMate</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-8">
            {/* Heading */}
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                다시 오신 것을 환영합니다
              </h1>
              <p className="text-sm text-muted-foreground">
                Google 계정으로 로그인하여 시작하세요.
              </p>
            </div>

            {/* Sign in button */}
            <div className="space-y-3">
              <Button
                onClick={signInWithGoogle}
                size="lg"
                variant="outline"
                className="w-full gap-2.5"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google로 로그인
              </Button>

              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>
                  로그인 시 Google 캘린더와 Tasks 읽기·쓰기 권한이 함께 요청됩니다.
                  토큰은 안전하게 보관되며 동기화 외 용도로 사용되지 않습니다.
                </span>
              </div>
            </div>

            {/* Divider + alt actions */}
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    또는
                  </span>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                CalenMate가 처음이라면{' '}
                <Link href="/" className="font-medium text-foreground hover:underline">
                  소개 페이지
                </Link>
                를 둘러보세요.
              </p>
            </div>

            {/* Legal */}
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground/80">
              계속 진행하면 서비스 약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
