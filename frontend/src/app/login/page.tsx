'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  Check,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';

const mockSchedule = [
  { time: '09:00', title: '주간 스탠드업' },
  { time: '11:30', title: '디자인 리뷰' },
  { time: '14:00', title: '1:1 미팅' },
  { time: '16:00', title: '주간 보고서 작성' },
];

const mockTodos = [
  { title: 'PR 리뷰 마무리', done: true },
  { title: '주간 보고서 초안', done: false },
  { title: '월요일 미팅 자료 준비', done: false },
];

export default function LoginPage() {
  const { signInWithGoogle } = useAuthStore();

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand / mock preview panel */}
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-muted/30 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="CalenMate"
            width={28}
            height={28}
            className="h-7 w-7 rounded-lg"
            priority
          />
          <span className="text-sm font-semibold tracking-tight">CalenMate</span>
        </div>

        {/* Center copy + product mock */}
        <div className="space-y-10">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Schedule · Tasks · Notes
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              일정과 할 일을
              <br />
              한 곳에서 정리합니다.
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Google 캘린더와 Tasks를 그대로 쓰면서, 채팅 한 줄로 일정을 추가하고 ToDo를 정리하세요.
            </p>
          </div>

          {/* Product mock */}
          <div className="max-w-md overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_12px_32px_rgba(0,0,0,0.4)]">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="ml-3 text-[11px] font-medium text-muted-foreground">Today</span>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-5">
              {/* Schedule */}
              <div className="sm:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium">12월 18일 (수)</p>
                  <span className="text-[10px] text-muted-foreground">
                    {mockSchedule.length} events
                  </span>
                </div>
                <div className="space-y-1.5">
                  {mockSchedule.map((e) => (
                    <div
                      key={e.time}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                    >
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {e.time}
                      </span>
                      <span className="h-3 w-px bg-border" />
                      <span className="truncate text-[11.5px] font-medium">{e.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ToDo */}
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium">ToDo</p>
                  <span className="text-[10px] text-muted-foreground">
                    {mockTodos.filter((t) => !t.done).length} left
                  </span>
                </div>
                <div className="space-y-1.5">
                  {mockTodos.map((t) => (
                    <div
                      key={t.title}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                    >
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${
                          t.done
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border'
                        }`}
                      >
                        {t.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      <span
                        className={`truncate text-[11px] ${
                          t.done ? 'text-muted-foreground line-through' : ''
                        }`}
                      >
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} CalenMate.
        </p>
      </aside>

      {/* Right: login panel */}
      <main className="relative flex flex-col bg-background">
        {/* Top-left back link */}
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            홈으로
          </Link>
          {/* Mobile-only mini brand */}
          <Link href="/" className="flex items-center gap-1.5 lg:hidden">
            <Image
              src="/logo.png"
              alt="CalenMate"
              width={24}
              height={24}
              className="h-6 w-6 rounded-md"
            />
            <span className="text-sm font-semibold tracking-tight">CalenMate</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-sm space-y-10">
            {/* Heading */}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                로그인
              </h1>
              <p className="text-sm text-muted-foreground">
                Google 계정으로 로그인하면 캘린더와 Tasks가 자동으로 연결됩니다.
              </p>
            </div>

            {/* Sign in button */}
            <div className="space-y-3">
              <Button
                onClick={signInWithGoogle}
                size="lg"
                variant="outline"
                className="w-full justify-center gap-2.5"
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

              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Google 캘린더와 Tasks 읽기·쓰기 권한이 함께 요청됩니다.
                  토큰은 안전하게 보관되며 동기화 외 용도로 사용되지 않습니다.
                </span>
              </div>
            </div>

            {/* Divider + alt action */}
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/60" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
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
