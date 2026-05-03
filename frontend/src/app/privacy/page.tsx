import Link from 'next/link';
import { Calendar } from 'lucide-react';

export const metadata = {
  title: '개인정보처리방침 — CalenMate',
  description: 'CalenMate가 사용자의 개인정보를 어떻게 수집·사용·보관하는지 설명합니다.',
};

const LAST_UPDATED = '2026년 5월 3일';
const CONTACT_EMAIL = 'zanviq.dev@gmail.com';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground text-background">
              <Calendar className="h-4 w-4" />
            </span>
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
              CalenMate(이하 &ldquo;서비스&rdquo;)는 Google 캘린더 및 Google Tasks와 연동하여
              사용자의 일정과 할 일을 관리하고, 인공지능 기반의 일정 관리 보조 기능을 제공합니다.
              본 방침은 서비스 이용 과정에서 수집되는 정보, 사용 목적, 보관 및 처리 방식,
              사용자의 권리에 관한 사항을 설명합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">2. 수집하는 정보</h2>
            <p className="mt-3 text-muted-foreground">
              서비스는 다음의 정보를 수집·처리합니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">계정 정보</strong> — Google 계정 이메일 주소,
                이름, 프로필 사진(Supabase Auth를 통해 수신).
              </li>
              <li>
                <strong className="text-foreground">Google 캘린더 데이터</strong> — 사용자가 연결한
                Google 계정의 캘린더 일정(제목, 시작·종료 시간, 설명, 참석자 등). 사용자의 명시적
                요청에 따라 조회·생성·수정·삭제됩니다.
              </li>
              <li>
                <strong className="text-foreground">Google Tasks 데이터</strong> — 사용자의 할 일
                목록 및 항목(제목, 상태, 마감일, 메모 등). 사용자의 명시적 요청에 따라 동기화됩니다.
              </li>
              <li>
                <strong className="text-foreground">서비스 내 사용자 생성 데이터</strong> —
                할 일에 첨부된 마크다운 노트, AI 채팅 메시지, 사용자 지시사항(persistent
                instructions).
              </li>
              <li>
                <strong className="text-foreground">OAuth 토큰</strong> — Google API 접근을 위한
                액세스 토큰 및 리프레시 토큰. 데이터베이스에 저장되며 인증 외 목적으로 사용되지
                않습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">
              3. Google API 사용 및 권한 범위
            </h2>
            <p className="mt-3 text-muted-foreground">
              서비스는 다음의 Google OAuth 권한을 요청합니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">
                  auth/calendar
                </code>{' '}
                — 캘린더 일정의 조회, 생성, 수정, 삭제. 사용자가 채팅 또는 UI에서 요청한 작업을
                수행하기 위해 사용됩니다.
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">
                  auth/calendar.events
                </code>{' '}
                — 개별 일정 항목의 세부 관리.
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[13px]">auth/tasks</code>{' '}
                — 할 일 목록의 조회 및 동기화.
              </li>
            </ul>
            <div className="mt-5 rounded-md border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-semibold">
                Google API Services User Data Policy 및 Limited Use 준수
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                서비스는 Google API로부터 수신한 사용자 데이터의 사용 및 전송에 있어{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  Google API Services User Data Policy
                </a>
                의 Limited Use 요구사항을 준수합니다. 구체적으로,
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Google 사용자 데이터는 사용자가 명시적으로 요청한 기능 제공에만 사용됩니다.</li>
                <li>광고를 포함한 어떠한 광고 목적으로도 데이터를 사용하지 않습니다.</li>
                <li>
                  운영자 또는 제3자가 사용자의 데이터를 임의로 열람하지 않으며, 다음의 예외에만
                  접근이 발생할 수 있습니다: 사용자의 명시적 동의, 보안·악용 방지, 법적 요구,
                  운영상 디버깅(가능한 경우 익명화 후).
                </li>
                <li>사용자 데이터를 제3자에게 판매하지 않습니다.</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">4. 제3자 처리 및 데이터 흐름</h2>
            <p className="mt-3 text-muted-foreground">
              서비스 운영을 위해 다음의 제3자 처리자(sub-processor)를 사용합니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Supabase</strong> — 인증, 데이터베이스 호스팅,
                세션 관리. 계정 정보, OAuth 토큰, 사용자 생성 콘텐츠가 암호화되어 저장됩니다.
              </li>
              <li>
                <strong className="text-foreground">Google Cloud (Gemini API)</strong> — 사용자가
                AI 채팅 기능을 사용할 때, 메시지 처리에 필요한 범위 내에서 다음 정보가 Gemini
                모델로 전달됩니다: 사용자 메시지, 최근 일정 요약, 할 일 목록, 사용자 지시사항,
                채팅 이력. Google의{' '}
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
              <li>
                <strong className="text-foreground">Vercel</strong> — 프론트엔드 및 백엔드 호스팅
                인프라.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              위 처리자 외에 어떠한 제3자에게도 사용자 데이터를 판매하거나 광고 목적으로
              제공하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">5. 데이터 보관 및 삭제</h2>
            <p className="mt-3 text-muted-foreground">
              사용자 데이터는 서비스 이용 기간 동안 보관됩니다. 사용자는 다음 방법으로 데이터를
              삭제할 수 있습니다.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                서비스 내 설정 페이지에서 Google 연결을 해제하면 저장된 OAuth 토큰이 즉시
                삭제됩니다.
              </li>
              <li>
                계정 삭제 요청 시 이메일(<a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-foreground">{CONTACT_EMAIL}</a>)로
                연락 주시면 30일 이내에 모든 사용자 데이터(채팅 기록, 노트, 사용자 지시사항 등)를
                완전히 삭제합니다.
              </li>
              <li>
                Google 계정 설정의{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  서드파티 앱 액세스 페이지
                </a>
                에서 CalenMate의 권한을 직접 철회할 수 있습니다.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              참고로, 서비스는 Google 캘린더·Tasks의 데이터 자체를 별도로 복제·저장하지 않으며,
              요청 시점마다 Google API를 호출해 조회·반영합니다. 따라서 Google 계정의 원본 데이터는
              서비스 삭제와 무관하게 사용자의 Google 계정에 그대로 유지됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">6. 사용자 권리</h2>
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
            <h2 className="text-xl font-semibold tracking-tight">7. 보안</h2>
            <p className="mt-3 text-muted-foreground">
              모든 통신은 HTTPS로 암호화되며, OAuth 토큰을 포함한 민감 데이터는 Supabase의 암호화된
              데이터베이스에 저장됩니다. 데이터베이스 접근은 Row Level Security(RLS)로 보호되어
              각 사용자는 자신의 데이터에만 접근할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">8. 방침 변경</h2>
            <p className="mt-3 text-muted-foreground">
              본 방침이 변경될 경우 본 페이지의 최종 업데이트 일자를 갱신하고, 중대한 변경의
              경우 이메일로 사전 안내드립니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">9. 문의</h2>
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
