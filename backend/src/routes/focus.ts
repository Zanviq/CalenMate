import { Router, Response } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { reminders, todoTimeLog } from '../db/schema';
import { isUuid } from '../services/events';
import { getOwnedReminder } from '../services/reminders';
import { invalidateSummaryCache } from './summary';

const router = Router();

router.use(authMiddleware);

const startSchema = z.object({
  reminder_id: z.string().uuid(),
  duration_minutes: z.number().int().positive().max(8 * 60).optional(),
});

const endSchema = z.object({
  complete: z.boolean().optional(),
});

const activeFocusFor = (userId: string) =>
  and(
    eq(todoTimeLog.user_id, userId),
    isNull(todoTimeLog.ended_at),
    eq(todoTimeLog.source, 'focus_session'),
  );

// GET /active - Current active focus session for this user (if any).
// Active = ended_at is NULL. Frontend uses this to resume the timer banner
// on reload across tabs/devices.
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const [log] = await db
      .select({
        id: todoTimeLog.id,
        reminder_id: todoTimeLog.reminder_id,
        started_at: todoTimeLog.started_at,
        target_minutes: todoTimeLog.target_minutes,
      })
      .from(todoTimeLog)
      .where(activeFocusFor(req.userId!))
      .orderBy(desc(todoTimeLog.started_at))
      .limit(1);

    if (!log) {
      res.json(null);
      return;
    }

    // Hydrate the reminder so the banner can show title + duration target.
    const reminder = await getOwnedReminder(req.userId!, log.reminder_id);

    res.json({
      id: log.id,
      reminder_id: log.reminder_id,
      started_at: log.started_at,
      target_minutes: log.target_minutes ?? null,
      reminder: reminder ? { id: reminder.id, title: reminder.title, color: reminder.color } : null,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch active focus session' });
  }
});

// POST /start - Start a focus session on a reminder. Also flips reminder status
// to 'in_progress' (if not already completed) so the timer signal is visible
// across the app even before the session ends.
router.post('/start', validateBody(startSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { reminder_id, duration_minutes } = req.body as z.infer<typeof startSchema>;

    // Reject if user already has an active focus session — keeps semantics simple
    // and prevents accidental double-start. Caller must end the existing one first.
    const [existingActive] = await db
      .select({ id: todoTimeLog.id })
      .from(todoTimeLog)
      .where(activeFocusFor(req.userId!))
      .limit(1);

    if (existingActive) {
      res.status(409).json({ error: 'Active focus session already exists', activeId: existingActive.id });
      return;
    }

    // Verify reminder ownership.
    const reminder = await getOwnedReminder(req.userId!, reminder_id);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const now = new Date();

    // Insert log; persist `target_minutes` so the timer survives page reloads
    // and other devices can pick up where this one left off.
    const [log] = await db
      .insert(todoTimeLog)
      .values({
        user_id: req.userId!,
        reminder_id,
        started_at: now,
        source: 'focus_session',
        target_minutes: duration_minutes ?? null,
      })
      .returning();

    // Only transition status if the reminder isn't already completed.
    if (reminder.status !== 'completed') {
      await db
        .update(reminders)
        .set({
          status: 'in_progress',
          started_at: reminder.started_at ?? now,
          updated_at: now,
        })
        .where(and(eq(reminders.id, reminder_id), eq(reminders.user_id, req.userId!)));
    }

    invalidateSummaryCache(req.userId!);
    res.status(201).json({
      id: log.id,
      reminder_id,
      started_at: log.started_at,
      target_minutes: log.target_minutes ?? null,
      reminder: { id: reminder.id, title: reminder.title, color: reminder.color },
    });
  } catch (err) {
    console.error('Failed to start focus session:', err);
    res.status(500).json({ error: 'Failed to start focus session' });
  }
});

// POST /:logId/end - End an active focus session. If complete=true also marks
// the reminder as completed. Otherwise the reminder stays in whatever status it was.
router.post('/:logId/end', validateBody(endSchema), async (req: AuthRequest, res: Response) => {
  try {
    const logId = req.params.logId as string;
    const { complete } = req.body as z.infer<typeof endSchema>;

    if (!isUuid(logId)) {
      res.status(404).json({ error: 'Focus session not found' });
      return;
    }
    const ownLog = and(eq(todoTimeLog.id, logId), eq(todoTimeLog.user_id, req.userId!));

    const [log] = await db.select().from(todoTimeLog).where(ownLog).limit(1);

    if (!log) {
      res.status(404).json({ error: 'Focus session not found' });
      return;
    }

    if (log.ended_at) {
      res.status(409).json({ error: 'Focus session already ended' });
      return;
    }

    const now = new Date();

    const [updatedLog] = await db
      .update(todoTimeLog)
      .set({ ended_at: now })
      .where(ownLog)
      .returning({
        id: todoTimeLog.id,
        reminder_id: todoTimeLog.reminder_id,
        started_at: todoTimeLog.started_at,
        ended_at: todoTimeLog.ended_at,
      });

    let reminderUpdate: Record<string, unknown> | null = null;
    if (complete) {
      const reminder = await getOwnedReminder(req.userId!, log.reminder_id);
      const [r2] = await db
        .update(reminders)
        .set({
          status: 'completed',
          is_completed: true,
          completed_at: reminder?.completed_at ?? now,
          updated_at: now,
        })
        .where(and(eq(reminders.id, log.reminder_id), eq(reminders.user_id, req.userId!)))
        .returning();
      reminderUpdate = r2 ?? null;
    }

    invalidateSummaryCache(req.userId!);
    res.json({ log: updatedLog, reminder: reminderUpdate });
  } catch (err) {
    console.error('Failed to end focus session:', err);
    res.status(500).json({ error: 'Failed to end focus session' });
  }
});

export default router;
