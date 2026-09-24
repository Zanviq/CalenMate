import { Router, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { users } from '../db/schema';

const router = Router();

router.use(authMiddleware);

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  defaultCalendarView: z.enum(['dayGridMonth', 'timeGridWeek', 'timeGridDay']).optional(),
  defaultReminderPriority: z.enum(['low', 'medium', 'high']).optional(),
  language: z.enum(['ko', 'en']).optional(),
});

const DEFAULT_SETTINGS = {
  theme: 'system',
  defaultCalendarView: 'dayGridMonth',
  defaultReminderPriority: 'medium',
  language: 'ko',
};

async function readSettings(userId: string) {
  const [user] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.settings ?? {};
}

// GET / - Get user settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    res.json({ ...DEFAULT_SETTINGS, ...(await readSettings(req.userId!)) });
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH / - Update user settings (partial merge)
router.patch('/', validateBody(settingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const merged = { ...(await readSettings(req.userId!)), ...req.body };

    const [updated] = await db
      .update(users)
      .set({ settings: merged, updated_at: new Date() })
      .where(eq(users.id, req.userId!))
      .returning({ settings: users.settings });

    res.json({ ...DEFAULT_SETTINGS, ...(updated?.settings ?? merged) });
  } catch (err) {
    console.error('Settings PATCH error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
