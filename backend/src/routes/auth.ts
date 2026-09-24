import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { AuthRequest, authMiddleware, issueSession, clearSession } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { users, type UserRow } from '../db/schema';
import { createDefaultList } from '../services/task-lists';

const router = Router();

const BCRYPT_ROUNDS = 10;

const usernameSchema = z
  .string()
  .trim()
  .min(3, '아이디는 3자 이상이어야 합니다')
  .max(32, '아이디는 32자 이하여야 합니다')
  .regex(/^[a-zA-Z0-9._-]+$/, '아이디는 영문, 숫자, . _ - 만 사용할 수 있습니다');

const registerSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다').max(128),
  display_name: z.string().trim().max(50).optional(),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

// Never send the password hash to the client.
export function toPublicUser(user: UserRow) {
  const { password_hash: _hash, ...rest } = user;
  void _hash;
  return rest;
}

async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return user ?? null;
}

// POST /register - Create an account and start a session
router.post('/register', validateBody(registerSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, display_name } = req.body as z.infer<typeof registerSchema>;

    if (await findUserByUsername(username)) {
      res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
      return;
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ username, password_hash, display_name: display_name || username })
        .returning();
      await createDefaultList(created.id, tx);
      return created;
    });

    issueSession(res, user.id);
    res.status(201).json(toPublicUser(user));
  } catch (err) {
    console.error('register failed:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /login - Verify credentials and start a session
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as z.infer<typeof loginSchema>;
    const user = await findUserByUsername(username);

    // Compare even when the user is missing so response time doesn't reveal it.
    const hash = user?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
      return;
    }

    issueSession(res, user.id);
    res.json(toPublicUser(user));
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /logout - Clear the session cookie
router.post('/logout', (_req: Request, res: Response) => {
  clearSession(res);
  res.json({ message: 'Logged out' });
});

// GET /me - Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);

    if (!user) {
      clearSession(res);
      res.status(401).json({ error: 'User not found' });
      return;
    }

    res.json(toPublicUser(user));
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
