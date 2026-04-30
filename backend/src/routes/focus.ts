import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';
import { updateGoogleTask } from '../services/google-tasks';
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

// GET /active - Current active focus session for this user (if any).
// Active = ended_at is NULL. Frontend uses this to resume the timer banner
// on reload across tabs/devices.
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('todo_time_log')
      .select('id, reminder_id, started_at, source, target_minutes')
      .eq('user_id', req.userId)
      .is('ended_at', null)
      .eq('source', 'focus_session')
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch active focus session' });
      return;
    }

    if (!data || data.length === 0) {
      res.json(null);
      return;
    }

    const log = data[0];
    // Hydrate the reminder so the banner can show title + duration target.
    const { data: reminder } = await supabaseAdmin
      .from('reminders')
      .select('id, title, color')
      .eq('id', log.reminder_id)
      .eq('user_id', req.userId)
      .single();

    res.json({
      id: log.id,
      reminder_id: log.reminder_id,
      started_at: log.started_at,
      target_minutes: log.target_minutes ?? null,
      reminder: reminder ?? null,
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
    const { data: existingActive } = await supabaseAdmin
      .from('todo_time_log')
      .select('id')
      .eq('user_id', req.userId)
      .is('ended_at', null)
      .eq('source', 'focus_session')
      .limit(1);

    if (existingActive && existingActive.length > 0) {
      res.status(409).json({ error: 'Active focus session already exists', activeId: existingActive[0].id });
      return;
    }

    // Verify reminder ownership.
    const { data: reminder, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('id, title, color, status, started_at, google_task_id, google_list_id')
      .eq('id', reminder_id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const nowIso = new Date().toISOString();

    // Insert log; persist `target_minutes` so the timer survives page reloads
    // and other devices can pick up where this one left off.
    const sourceStr = 'focus_session';
    const { data: log, error: logError } = await supabaseAdmin
      .from('todo_time_log')
      .insert({
        user_id: req.userId,
        reminder_id,
        started_at: nowIso,
        source: sourceStr,
        target_minutes: duration_minutes ?? null,
      })
      .select('id, reminder_id, started_at, source, target_minutes')
      .single();

    if (logError || !log) {
      res.status(500).json({ error: 'Failed to start focus session' });
      return;
    }

    // Only transition status if the reminder isn't already completed.
    if (reminder.status !== 'completed') {
      await supabaseAdmin
        .from('reminders')
        .update({
          status: 'in_progress',
          started_at: reminder.started_at ?? nowIso,
          updated_at: nowIso,
        })
        .eq('id', reminder_id)
        .eq('user_id', req.userId);
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
// the reminder as completed (and syncs Google Tasks). Otherwise the reminder
// stays in whatever status it was.
router.post('/:logId/end', validateBody(endSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { logId } = req.params;
    const { complete } = req.body as z.infer<typeof endSchema>;

    const { data: log, error: findError } = await supabaseAdmin
      .from('todo_time_log')
      .select('id, reminder_id, started_at, ended_at, user_id')
      .eq('id', logId)
      .eq('user_id', req.userId)
      .single();

    if (findError || !log) {
      res.status(404).json({ error: 'Focus session not found' });
      return;
    }

    if (log.ended_at) {
      res.status(409).json({ error: 'Focus session already ended' });
      return;
    }

    const nowIso = new Date().toISOString();

    const { data: updatedLog, error: updateError } = await supabaseAdmin
      .from('todo_time_log')
      .update({ ended_at: nowIso })
      .eq('id', logId)
      .eq('user_id', req.userId)
      .select('id, reminder_id, started_at, ended_at')
      .single();

    if (updateError || !updatedLog) {
      res.status(500).json({ error: 'Failed to end focus session' });
      return;
    }

    let reminderUpdate: Record<string, unknown> | null = null;
    if (complete) {
      // Mark the reminder completed + sync to Google Tasks.
      const { data: reminder } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id, completed_at')
        .eq('id', log.reminder_id)
        .eq('user_id', req.userId)
        .single();

      if (reminder?.google_task_id && reminder?.google_list_id) {
        try {
          await updateGoogleTask(req.userId!, reminder.google_list_id, reminder.google_task_id, {
            status: 'completed',
          });
        } catch (err) {
          console.warn('[focus] Google Tasks sync on completion failed:', err);
        }
      }

      const { data: r2 } = await supabaseAdmin
        .from('reminders')
        .update({
          status: 'completed',
          is_completed: true,
          completed_at: reminder?.completed_at ?? nowIso,
          updated_at: nowIso,
        })
        .eq('id', log.reminder_id)
        .eq('user_id', req.userId)
        .select()
        .single();
      reminderUpdate = r2;
    }

    invalidateSummaryCache(req.userId!);
    res.json({ log: updatedLog, reminder: reminderUpdate });
  } catch (err) {
    console.error('Failed to end focus session:', err);
    res.status(500).json({ error: 'Failed to end focus session' });
  }
});

export default router;
