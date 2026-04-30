import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { generateReminderNote, GeminiUnavailableError } from '../services/gemini';

const router = Router();

router.use(authMiddleware);

// GET /:id/notes - Get notes for a reminder
router.get('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify reminder ownership
    const { data: reminder, error: reminderError } = await supabaseAdmin
      .from('reminders')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (reminderError || !reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const { data: note, error } = await supabaseAdmin
      .from('reminder_notes')
      .select('*')
      .eq('reminder_id', id)
      .eq('user_id', req.userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Failed to fetch notes' });
      return;
    }

    res.json(note);
  } catch {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /:id/notes - Create or update note (upsert)
router.post('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Verify reminder ownership
    const { data: reminder, error: reminderError } = await supabaseAdmin
      .from('reminders')
      .select('id')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (reminderError || !reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const { data: note, error } = await supabaseAdmin
      .from('reminder_notes')
      .upsert(
        {
          reminder_id: id,
          user_id: req.userId,
          content,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'reminder_id,user_id',
        }
      )
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to save note' });
      return;
    }

    res.json(note);
  } catch {
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// POST /:id/notes/generate - AI-generate note for a reminder
router.post('/:id/notes/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch reminder
    const { data: reminder, error: reminderError } = await supabaseAdmin
      .from('reminders')
      .select('id, title, description, due_date, priority')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (reminderError || !reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const content = await generateReminderNote(reminder);

    // Save as note (upsert)
    const { data: note, error } = await supabaseAdmin
      .from('reminder_notes')
      .upsert(
        {
          reminder_id: id,
          user_id: req.userId,
          content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'reminder_id,user_id' }
      )
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to save generated note' });
      return;
    }

    res.json(note);
  } catch (err) {
    // Surface the friendly Korean message for known overload/quota cases.
    if (err instanceof GeminiUnavailableError) {
      res.status(503).json({ error: err.userMessage });
      return;
    }
    console.error('reminder-notes generate failed:', err);
    res.status(500).json({ error: 'Failed to generate note' });
  }
});

export default router;
