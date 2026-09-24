'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Check,
  ArrowLeft,
  Info,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore, getAuthErrorMessage } from '@/store/auth';

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
  const { signIn, signUp } = useAuthStore();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === 'signup';

  const toggleMode = () => {
    setMode(isSignUp ? 'login' : 'signup');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp({ username, password, display_name: displayName || undefined });
      } else {
        await signIn(username, password);
      }
      router.replace('/home');
    } catch (err) {
      setError(getAuthErrorMessage(err, isSignUp ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다.'));
      setSubmitting(false);
    }
  };

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
              캘린더와 ToDo를 한 화면에서 관리하고, 채팅 한 줄로 일정을 추가하세요.
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
                {isSignUp ? '회원가입' : '로그인'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSignUp
                  ? '아이디와 비밀번호를 정해 새 계정을 만드세요.'
                  : '아이디와 비밀번호로 로그인하세요.'}
              </p>
            </div>

            {/* Credentials form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-xs font-medium">
                  아이디
                </label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <label htmlFor="display_name" className="text-xs font-medium">
                    이름 <span className="text-muted-foreground">(선택)</span>
                  </label>
                  <Input
                    id="display_name"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="비워두면 아이디를 사용합니다"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium">
                  비밀번호
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {isSignUp && (
                  <p className="text-[11px] text-muted-foreground">8자 이상 입력하세요.</p>
                )}
              </div>

              {error && (
                <p className="whitespace-pre-line text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSignUp ? '가입하기' : '로그인'}
              </Button>

              {!isSignUp && (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    데모 계정: <span className="font-mono text-foreground">demo</span> /{' '}
                    <span className="font-mono text-foreground">demo1234</span>
                  </span>
                </div>
              )}
            </form>

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
                {isSignUp ? '이미 계정이 있으신가요?' : '계정이 없으신가요?'}{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="font-medium text-foreground hover:underline"
                >
                  {isSignUp ? '로그인' : '회원가입'}
                </button>
              </p>
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
