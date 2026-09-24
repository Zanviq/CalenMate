import { NextResponse, type NextRequest } from 'next/server';

// Must match SESSION_COOKIE in backend/src/middleware/auth.ts.
const SESSION_COOKIE = 'calenmate_session';

// Optimistic route gate based on cookie presence. The backend verifies the
// JWT on every API call; an invalid cookie is cleared by the backend and the
// (app) layout then redirects to /login.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const path = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const isPublicRoute =
    path === '/' ||
    path.startsWith('/login') ||
    path.startsWith('/privacy') ||
    path.startsWith('/terms');

  // 로그인하지 않은 사용자는 공개 경로 외에는 /login으로 리다이렉트
  if (!hasSession && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 로그인한 사용자가 랜딩(/) 또는 /login에 접근하면 /home으로 리다이렉트
  if (hasSession && (path === '/' || path.startsWith('/login'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
