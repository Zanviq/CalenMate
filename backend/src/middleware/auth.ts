import { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export const SESSION_COOKIE = 'calenmate_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

export function issueSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSession(res: Response) {
  const { maxAge: _maxAge, ...opts } = sessionCookieOptions();
  void _maxAge;
  res.clearCookie(SESSION_COOKIE, opts);
}

// Verifies the session cookie (stateless JWT) and sets req.userId.
// Per-row ownership is enforced in each route by filtering on user_id —
// see docs/authorization.md for the list of policies this replaces.
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];

  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const sub = typeof payload === 'object' ? payload.sub : undefined;
    if (!sub) throw new Error('Missing subject');
    req.userId = sub;
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Invalid session' });
  }
}
