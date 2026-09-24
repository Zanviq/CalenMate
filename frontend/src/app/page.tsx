import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  CheckSquare,
  ArrowRight,
  Check,
  ListTodo,
  RefreshCw,
  StickyNote,
  Command,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';

export const metadata = {
  title: 'CalenMate — 일정과 할 일을 한 곳에',
  description:
    '캘린더와 ToDo를 한 화면에서. 채팅으로 일정과 ToDo를 정리하고, 노트를 함께 관리합니다.',
};

const features = [
  {
    icon: Calendar,
    title: '캘린더',
    desc: '월간·주간·일간 보기에서 일정을 추가, 수정, 삭제할 수 있습니다.',
  },
  {
    icon: ListTodo,
    title: 'ToDo 목록',
    desc: 'ToDo를 목록별로 나누고 상태, 태그, 체크리스트로 관리합니다.',
  },
  {
    icon: Command,
    title: '채팅으로 빠르게',
    desc: '"내일 오후 3시 미팅 추가" 한 줄이면 끝. 자연어로 일정과 ToDo를 한 번에 정리합니다.',
  },
  {
    icon: StickyNote,
    title: 'ToDo 노트',
    desc: '각 ToDo에 마크다운 메모를 붙이거나 AI에게 노트 초안을 부탁할 수 있습니다.',
  },
  {
    icon: RefreshCw,
    title: '실시간 반영',
    desc: '채팅에서 만든 일정도 캘린더 화면에 즉시 나타납니다. 새로고침 없이 바로 확인하세요.',
  },
  {
    icon: CheckSquare,
    title: '맥락 기반 응답',
    desc: '홈, 캘린더, ToDo 탭에 따라 답변의 맥락이 달라집니다. 사용자 지시사항도 영구 저장됩니다.',
  },
];

const steps = [
  {
    n: '01',
    title: '로그인',
    desc: '아이디와 비밀번호로 계정을 만들고 로그인합니다.',
  },
  {
    n: '02',
    title: '평소처럼 말하기',
    desc: '"이번 주 일정 정리해줘"처럼 자연어로 시작합니다.',
  },
  {
    n: '03',
    title: '바로 반영',
    desc: '결과가 캘린더와 ToDo 화면에 바로 반영됩니다.',
  },
];

const mockEvents = [
  { time: '09:00', title: '주간 스탠드업', span: 'col-span-1' },
  { time: '11:30', title: '디자인 리뷰', span: 'col-span-2' },
  { time: '14:00', title: '1:1 미팅', span: 'col-span-1' },
];

const mockTodos = [
  { title: 'PR 리뷰 마무리', done: true },
  { title: '주간 보고서 초안', done: false },
  { title: '월요일 미팅 자료 준비', done: false },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="CalenMate"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
              priority
            />
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
      <section className="border-b border-border/60">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
          {/* Copy */}
          <div className="flex flex-col justify-center">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Schedule · Tasks · Notes
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              일정과 할 일을
              <br />
              한 곳에서 정리하세요.
            </h1>
            <p className="mt-6 max-w-md text-base text-muted-foreground sm:text-lg">
              채팅 한 줄로 일정과 ToDo를 추가하고 노트까지 함께 관리합니다.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: 'lg' }), 'gap-2 px-5')}
              >
                시작하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className={cn(buttonVariants({ size: 'lg', variant: 'ghost' }), 'px-3 text-muted-foreground hover:text-foreground')}
              >
                기능 둘러보기
              </a>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              데모 계정: demo / demo1234
            </p>
          </div>

          {/* Mock product preview */}
          <div className="relative">
            <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_12px_32px_rgba(0,0,0,0.4)]">
              <div className="overflow-hidden rounded-xl border border-border/60">
                {/* Window chrome */}
                <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                  <span className="ml-3 text-[11px] font-medium text-muted-foreground">CalenMate · Today</span>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-5">
                  {/* Calendar mock */}
                  <div className="sm:col-span-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-medium">12월 18일 (수)</p>
                      <span className="text-[10px] text-muted-foreground">3 events</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      {[7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((h, i) => {
                        const event = mockEvents.find(
                          (_, idx) =>
                            (idx === 0 && h === 9) ||
                            (idx === 1 && h === 11) ||
                            (idx === 2 && h === 14)
                        );
                        return (
                          <div key={h} className="flex items-stretch gap-2">
                            <span className="w-7 shrink-0 pt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                              {h}:00
                            </span>
                            <div className="relative flex-1 border-t border-dashed border-border/60">
                              {event && (
                                <div
                                  className={cn(
                                    'absolute left-0 right-2 top-1 rounded-md border border-border bg-foreground/5 px-2 py-1 text-[10.5px] font-medium',
                                    i === 4 && 'h-7'
                                  )}
                                >
                                  <span className="text-foreground">{event.title}</span>
                                  <span className="ml-1.5 text-muted-foreground">{event.time}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Todos + chat hint */}
                  <div className="space-y-3 sm:col-span-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium">ToDo</p>
                        <span className="text-[10px] text-muted-foreground">2 left</span>
                      </div>
                      <div className="space-y-1.5">
                        {mockTodos.map((t) => (
                          <div
                            key={t.title}
                            className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5"
                          >
                            <span
                              className={cn(
                                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                                t.done
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-border'
                              )}
                            >
                              {t.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                            </span>
                            <span
                              className={cn(
                                'text-[11px]',
                                t.done && 'text-muted-foreground line-through'
                              )}
                            >
                              {t.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        채팅
                      </p>
                      <p className="mt-1 text-[11.5px] leading-snug">
                        &ldquo;내일 9시 1:1 미팅 30분 잡고, 자료 준비를 ToDo에 추가&rdquo;
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Check className="h-3 w-3" strokeWidth={2.5} /> 캘린더에 추가됨
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Check className="h-3 w-3" strokeWidth={2.5} /> ToDo 1건 생성됨
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="mb-14 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Features
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              필요한 도구를 따로 두지 않습니다.
            </h2>
            <p className="mt-3 text-muted-foreground">
              일정, 할 일, 메모를 한 흐름으로 다룰 수 있도록 설계했습니다.
            </p>
          </div>
          <div className="grid divide-y divide-border/60 border-y border-border/60 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }, idx) => (
              <div
                key={title}
                className={cn(
                  'group/feature p-6 sm:p-8',
                  // bottom border for second row in 3-col layout
                  idx < 3 && 'lg:border-b lg:border-border/60',
                  // for 2-col tablet: add divider on second column
                  idx % 2 === 1 && 'sm:border-l sm:border-border/60 lg:border-l-0',
                  // re-establish 3-col left borders correctly
                  idx % 3 !== 0 && 'lg:border-l lg:border-border/60',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.6} />
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="mb-14 max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              How it works
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              로그인 후 바로 사용합니다.
            </h2>
            <p className="mt-3 text-muted-foreground">
              설정도, 학습 곡선도 없습니다. 평소 쓰던 그대로의 흐름.
            </p>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="bg-background p-6 sm:p-8">
                <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            오늘부터 가볍게 시작하세요.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            로그인 한 번이면 됩니다. 별도 설치 없이 웹에서 바로 사용할 수 있습니다.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className={cn(buttonVariants({ size: 'lg' }), 'gap-2 px-5')}
            >
              시작하기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="CalenMate"
              width={20}
              height={20}
              className="h-5 w-5 rounded"
            />
            <span>CalenMate © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              서비스 약관
            </Link>
            <Link href="/login" className="hover:text-foreground">
              로그인
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
