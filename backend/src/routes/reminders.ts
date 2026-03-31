import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

const createReminderSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다').max(500),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  notify: z.boolean().default(false),
  notify_at: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

const updateReminderSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notify: z.boolean().optional(),
  notify_at: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// GET / - List reminders for user (supports ?status=active|completed for server-side filtering)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let query = supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('user_id', req.userId)
      .order('due_date', { ascending: true });

    const { status } = req.query;
    if (status === 'active') {
      query = query.eq('is_completed', false);
    } else if (status === 'completed') {
      query = query.eq('is_completed', true);
    }

    const { data: reminders, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to fetch reminders' });
      return;
    }

    res.json(reminders);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// POST / - Create reminder
router.post('/', validateBody(createReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, due_date, priority, notify, notify_at, color } = req.body;

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .insert({
        user_id: req.userId,
        title,
        description: description || null,
        due_date: due_date || null,
        priority: priority || 'medium',
        is_completed: false,
        notify: notify || false,
        notify_at: notify_at || null,
        color: color || null,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to create reminder' });
      return;
    }

    res.status(201).json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PUT /:id - Update reminder (single query with user_id check)
router.put('/:id', validateBody(updateReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, due_date, priority, notify, notify_at, color } = req.body;

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(due_date !== undefined && { due_date }),
        ...(priority !== undefined && { priority }),
        ...(notify !== undefined && { notify }),
        ...(notify_at !== undefined && { notify_at }),
        ...(color !== undefined && { color }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      // PGRST116 = no rows returned (not found or not owned)
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Reminder not found' });
        return;
      }
      res.status(500).json({ error: 'Failed to update reminder' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /:id - Delete reminder (single query with user_id check)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error, count } = await supabaseAdmin
      .from('reminders')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) {
      res.status(500).json({ error: 'Failed to delete reminder' });
      return;
    }

    if (count === 0) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json({ message: 'Reminder deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// PATCH /:id/complete - Toggle is_completed (single query using SQL NOT)
router.patch('/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch + toggle in two queries, but skip the separate ownership check
    const { data: existing, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('id, is_completed')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        is_completed: !existing.is_completed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update reminder' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to toggle reminder completion' });
  }
});

export default router;
