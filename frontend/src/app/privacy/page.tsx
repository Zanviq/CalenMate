import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: '개인정보처리방침 — CalenMate',
  description: 'CalenMate가 사용자의 개인정보를 어떻게 수집·사용·보관하는지 설명합니다.',
};

const LAST_UPDATED = '2026년 9월 24일';
const CONTACT_EMAIL = 'zanviq.dev@gmail.com';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
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
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Privacy Policy
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          개인정보처리방침
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          최종 업데이트: {LAST_UPDATED}
        </p>

        <div className="mt-12 space-y-12 text-[15px] leading-7">
          <section>
            <h2 className="text-xl font-semibold tracking-tight">1. 개요</h2>
            <p className="mt-3 text-muted-foreground">
              CalenMate(이하 &ldquo;서비스&rdquo;)는 사용자의 일정과 할 일을 관리하고, 인공지능
              기반의 일정 관리 보조 기능을 제공합니다. 서비스는 운영자가 직접 설치해 실행하는
              자체 호스팅 방식으로 동작하며, 모든 데이터는 해당 설치본의 데이터베이스에
              저장됩니다. 본 방침은 수집되는 정보, 사용 목적, 보관 및 처리 방식, 사용자의 권리에
              관한 사항을 설명합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">2. 수집하는 정보</h2>
            <p className="mt-3 text-muted-foreground">
              서비스는 다음의 정보를 수집·처리합니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">계정 정보</strong> — 아이디, 표시 이름,
                비밀번호 해시(bcrypt). 비밀번호 원문은 저장하지 않습니다.
              </li>
              <li>
                <strong className="text-foreground">일정 데이터</strong> — 사용자가 등록한 일정의
                제목, 시작·종료 시간, 설명, 색상.
              </li>
              <li>
                <strong className="text-foreground">할 일 데이터</strong> — 할 일 목록 및 항목(제목,
                상태, 마감일, 태그, 체크리스트, 집중 세션 기록 등).
              </li>
              <li>
                <strong className="text-foreground">서비스 내 사용자 생성 데이터</strong> —
                할 일에 첨부된 마크다운 노트, AI 채팅 메시지, 사용자 지시사항(persistent
                instructions).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">3. 외부 전송</h2>
            <p className="mt-3 text-muted-foreground">
              서비스가 외부로 데이터를 전송하는 경우는 다음 한 가지입니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Gemini API</strong> — 사용자가 AI 채팅, 일정
                요약, AI 노트 생성 기능을 사용할 때, 처리에 필요한 범위 내에서 다음 정보가 Gemini
                모델로 전달됩니다: 사용자 메시지, 최근 일정, 할 일 목록, 사용자 지시사항, 채팅
                이력.{' '}
                <a
                  href="https://ai.google.dev/gemini-api/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  Gemini API 약관
                </a>
                에 따라 처리됩니다.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              그 외의 제3자에게 사용자 데이터를 판매하거나 광고 목적으로 제공하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">4. 데이터 보관 및 삭제</h2>
            <p className="mt-3 text-muted-foreground">
              사용자 데이터는 서비스 이용 기간 동안 설치본의 PostgreSQL 데이터베이스에
              보관됩니다. 계정 삭제 요청 시 이메일(<a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">{CONTACT_EMAIL}</a>)로
              연락 주시면 30일 이내에 모든 사용자 데이터(일정, 할 일, 채팅 기록, 노트, 사용자
              지시사항 등)를 삭제합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">5. 사용자 권리</h2>
            <p className="mt-3 text-muted-foreground">
              사용자는 자신의 개인정보에 대한 다음 권리를 가집니다: 열람, 정정, 삭제, 처리 정지,
              동의 철회. 권리 행사를 원하시는 경우{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">
                {CONTACT_EMAIL}
              </a>
              로 문의해 주세요.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">6. 보안</h2>
            <p className="mt-3 text-muted-foreground">
              비밀번호는 bcrypt 해시로만 저장되며, 로그인 세션은 JavaScript에서 읽을 수 없는
              httpOnly 쿠키로 유지됩니다. 모든 데이터 조회·변경은 서버에서 로그인한 사용자의
              데이터로 범위가 제한되어, 각 사용자는 자신의 데이터에만 접근할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">7. 방침 변경</h2>
            <p className="mt-3 text-muted-foreground">
              본 방침이 변경될 경우 본 페이지의 최종 업데이트 일자를 갱신하고, 중대한 변경의
              경우 이메일로 사전 안내드립니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">8. 문의</h2>
            <p className="mt-3 text-muted-foreground">
              본 방침 또는 개인정보 처리에 관한 문의는 다음 이메일로 보내주세요.
            </p>
            <p className="mt-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium underline hover:text-foreground"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span>CalenMate © {new Date().getFullYear()}</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-foreground">
              홈
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              서비스 약관
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
