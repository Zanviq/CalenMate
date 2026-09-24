import Link from 'next/link';
import Image from 'next/image';

export const metadata = {
  title: '서비스 약관 — CalenMate',
  description: 'CalenMate 서비스 이용에 관한 약관입니다.',
};

const LAST_UPDATED = '2026년 9월 24일';
const CONTACT_EMAIL = 'zanviq.dev@gmail.com';

export default function TermsPage() {
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
          Terms of Service
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">서비스 약관</h1>
        <p className="mt-3 text-sm text-muted-foreground">최종 업데이트: {LAST_UPDATED}</p>

        <div className="mt-12 space-y-12 text-[15px] leading-7">
          <section>
            <h2 className="text-xl font-semibold tracking-tight">1. 서비스 개요</h2>
            <p className="mt-3 text-muted-foreground">
              CalenMate(이하 &ldquo;서비스&rdquo;)는 자체 호스팅 방식으로 실행되는
              일정·할 일 관리 웹 애플리케이션이며, 인공지능 모델을 활용한 일정 관리 보조 기능을
              제공합니다. 본 약관은 서비스 이용에 관한 사용자와 운영자 간의 권리·의무를
              규정합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">2. 약관의 동의</h2>
            <p className="mt-3 text-muted-foreground">
              사용자는 서비스에 로그인함으로써 본 약관 및{' '}
              <Link href="/privacy" className="underline hover:text-foreground">
                개인정보처리방침
              </Link>
              에 동의한 것으로 간주됩니다. 약관에 동의하지 않는 경우 서비스를 이용할 수 없습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">3. 계정 및 인증</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                서비스는 아이디와 비밀번호로 인증을 제공합니다. 사용자는 자신의 비밀번호를 안전하게
                관리할 책임이 있습니다.
              </li>
              <li>
                AI 기능을 사용하려면 운영자가 Gemini API 키를 설정해야 하며, 설정되지 않은 경우 AI
                기능이 동작하지 않을 수 있습니다.
              </li>
              <li>타인의 계정으로 서비스를 이용하거나 인증 정보를 위·변조하는 행위는 금지됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">4. 사용자 의무</h2>
            <p className="mt-3 text-muted-foreground">사용자는 다음 행위를 해서는 안 됩니다.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>법령 또는 공서양속에 반하는 콘텐츠를 입력·생성하는 행위</li>
              <li>서비스의 정상적인 운영을 방해하거나 자동화 도구로 비정상적인 부하를 발생시키는 행위</li>
              <li>서비스의 소스코드를 무단으로 복제, 역공학(reverse engineering)하는 행위</li>
              <li>제3자의 권리(저작권, 상표권, 프라이버시 등)를 침해하는 행위</li>
              <li>서비스를 통해 스팸, 악성 코드 배포 등 부정한 목적으로 이용하는 행위</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">5. AI 기능에 관한 고지</h2>
            <p className="mt-3 text-muted-foreground">
              서비스의 AI 채팅 기능은 Gemini 모델을 사용하며, 모델의 응답은 정확성을
              보장하지 않습니다. 사용자는 AI가 제안한 일정 변경, 할 일 생성·수정·삭제 등을 실행하기
              전에 직접 검토할 책임이 있으며, 운영자는 AI 응답에 따라 발생한 결과(일정 누락,
              잘못된 일정 추가 등)에 대해 책임지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">6. 지적재산권</h2>
            <p className="mt-3 text-muted-foreground">
              서비스의 디자인, 코드, 상표 등에 관한 권리는 운영자에게 귀속됩니다. 사용자가 서비스
              내에 작성한 노트·메시지 등의 콘텐츠에 대한 권리는 사용자에게 귀속되며, 운영자는
              서비스 제공에 필요한 범위 내에서만 이를 처리합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">7. 면책 조항</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                서비스는 &ldquo;있는 그대로(as-is)&rdquo; 제공되며, 특정 목적에의 적합성, 무결성,
                지속적 가용성을 보장하지 않습니다.
              </li>
              <li>
                Gemini API의 정책 변경, 장애, 한도 초과 등으로 인한 서비스 중단에
                대해 운영자는 책임지지 않습니다.
              </li>
              <li>
                사용자의 일정·할 일 데이터 손실로 인한 손해에 대해 운영자는 직접적
                또는 간접적 책임을 부담하지 않으며, 사용자는 중요한 데이터를 별도로 백업할 책임이
                있습니다.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">8. 서비스 변경 및 종료</h2>
            <p className="mt-3 text-muted-foreground">
              운영자는 서비스의 일부 또는 전부를 사전 고지 후 변경하거나 종료할 수 있습니다. 본
              약관 위반, 부정 이용 등이 확인되는 경우 사전 고지 없이 해당 사용자의 이용을 제한할
              수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">9. 약관의 변경</h2>
            <p className="mt-3 text-muted-foreground">
              본 약관은 변경될 수 있으며, 중요한 변경의 경우 서비스 내 공지 또는 이메일을 통해
              안내됩니다. 변경 후 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로
              간주됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">10. 준거법 및 분쟁 해결</h2>
            <p className="mt-3 text-muted-foreground">
              본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용으로 발생한 분쟁에 대해서는
              민사소송법상 관할 법원을 제1심 관할 법원으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-tight">11. 문의</h2>
            <p className="mt-3 text-muted-foreground">
              본 약관에 관한 문의는 다음 이메일로 보내주세요.
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
            <Link href="/privacy" className="hover:text-foreground">
              개인정보처리방침
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
