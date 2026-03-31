import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

// GET / - List reminders for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { data: reminders, error } = await supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('user_id', req.userId)
      .order('due_date', { ascending: true });

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
router.post('/', async (req: AuthRequest, res: Response) => {
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

// PUT /:id - Update reminder
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { data: existing, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

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
      res.status(500).json({ error: 'Failed to update reminder' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /:id - Delete reminder
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const { data: existing, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', req.userId);

    if (error) {
      res.status(500).json({ error: 'Failed to delete reminder' });
      return;
    }

    res.json({ message: 'Reminder deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// PATCH /:id/complete - Toggle is_completed
router.patch('/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch current state
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
