import Link from 'next/link';
import {
  Calendar,
  Sparkles,
  ListTodo,
  MoonStar,
  ArrowRight,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'CalenMate — AI로 일정과 할 일을 똑똑하게',
  description:
    'Google 캘린더 / Tasks와 연동되는 AI 일정 관리 앱. 채팅으로 일정을 만들고, ToDo를 정리하고, AI가 노트를 작성합니다.',
};

const features = [
  {
    icon: Calendar,
    title: 'Google Calendar 양방향 동기화',
    desc: '로그인하면 즉시 내 캘린더가 나타나고, 추가/수정/삭제가 Google과 자동으로 동기화됩니다.',
  },
  {
    icon: Sparkles,
    title: 'AI 채팅 어시스턴트',
    desc: 'Gemini 2.5 Flash가 자연어로 일정·ToDo를 만들고 정리합니다. "내일 오후 3시 회의 잡아줘"처럼 말하세요.',
  },
  {
    icon: ListTodo,
    title: 'Google Tasks ToDo',
    desc: 'ToDo가 Google Tasks와 연동되어 모바일/웹 어디서나 동기화됩니다. 우선순위·색상·알림도 함께.',
  },
  {
    icon: MessageSquare,
    title: 'ToDo에 AI 노트',
    desc: '각 ToDo에 마크다운 노트를 작성하거나, AI에게 노트 초안을 부탁할 수 있습니다.',
  },
  {
    icon: Zap,
    title: '맥락 기반 응답',
    desc: '홈/캘린더/ToDo 탭에 따라 AI가 다른 컨텍스트로 응답합니다. 사용자 지침도 영구 저장됩니다.',
  },
  {
    icon: MoonStar,
    title: '다크 모드 · 한국어 우선',
    desc: '라이트/다크/시스템 테마, 한국어 응답, 캘린더 뷰·기본 우선순위 등 개인화 설정.',
  },
];

const steps = [
  {
    n: '1',
    title: 'Google로 로그인',
    desc: 'Google 계정으로 로그인하면 캘린더와 Tasks 권한이 함께 부여됩니다.',
  },
  {
    n: '2',
    title: 'AI에게 말 걸기',
    desc: '"이번 주 일정 정리해줘", "내일 9시 미팅 추가" 같은 자연어로 시작하세요.',
  },
  {
    n: '3',
    title: '자동으로 동기화',
    desc: 'AI의 액션이 Google Calendar / Tasks로 즉시 반영되고, 변경 내역은 채팅에 기록됩니다.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <Calendar className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">CalenMate</span>
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="#features"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              기능
            </a>
            <a
              href="#how"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              사용법
            </a>
            <Link
              href="/login"
              className={cn(buttonVariants({ size: 'sm' }), 'ml-1')}
            >
              로그인
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_oklch(0.85_0.08_250_/_0.2),_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,_oklch(0.4_0.1_260_/_0.25),_transparent_60%)]" />
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Gemini 2.5 Flash 기반
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              AI로 일정과 할 일을
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-violet-400">
                똑똑하게 관리하세요
              </span>
            </h1>
            <p className="mt-6 text-base text-muted-foreground sm:text-lg">
              Google 캘린더와 Tasks에 그대로 연동되는 AI 일정 관리 앱.
              <br className="hidden sm:block" />
              채팅 한 줄로 일정을 만들고, ToDo를 정리하고, 노트를 받으세요.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: 'lg' }), 'gap-2 px-5')}
              >
                Google로 시작하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'px-5')}
              >
                기능 둘러보기
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Google 계정이 필요하며, 캘린더 · Tasks 권한이 요청됩니다.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              필요한 모든 것이 한 곳에
            </h2>
            <p className="mt-3 text-muted-foreground">
              일정 · 할 일 · AI 노트를 분리된 도구가 아닌 하나의 흐름으로 관리합니다.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <Card
                key={title}
                className="border-border/60 transition-colors hover:border-foreground/30"
              >
                <CardContent className="space-y-3 p-6">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              30초 만에 시작
            </h2>
            <p className="mt-3 text-muted-foreground">
              설정도, 학습 곡선도 없습니다. 평소 말하던 그대로 AI에게 부탁하세요.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-foreground font-semibold text-background">
                  {s.n}
                </div>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            지금 시작해보세요
          </h2>
          <p className="mt-3 text-muted-foreground">
            로그인 한 번이면 끝. 별도 설치 없이 웹에서 바로 사용할 수 있습니다.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className={cn(buttonVariants({ size: 'lg' }), 'gap-2 px-5')}
            >
              Google로 시작하기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-foreground text-background">
              <Calendar className="h-3 w-3" />
            </span>
            <span>CalenMate © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              로그인
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
