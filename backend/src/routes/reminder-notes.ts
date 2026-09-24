import { Router, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { reminderNotes } from '../db/schema';
import { getOwnedReminder } from '../services/reminders';
import { generateReminderNote, GeminiUnavailableError } from '../services/gemini';

const router = Router();

router.use(authMiddleware);

// Insert or replace the single note a user keeps per reminder.
async function upsertNote(reminderId: string, userId: string, content: string) {
  const now = new Date();
  const [note] = await db
    .insert(reminderNotes)
    .values({ reminder_id: reminderId, user_id: userId, content, updated_at: now })
    .onConflictDoUpdate({
      target: [reminderNotes.reminder_id, reminderNotes.user_id],
      set: { content, updated_at: now },
    })
    .returning();
  return note;
}

// GET /:id/notes - Get notes for a reminder
router.get('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    // Verify reminder ownership
    const reminder = await getOwnedReminder(req.userId!, id);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const [note] = await db
      .select()
      .from(reminderNotes)
      .where(and(eq(reminderNotes.reminder_id, id), eq(reminderNotes.user_id, req.userId!)))
      .limit(1);

    res.json(note ?? null);
  } catch {
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /:id/notes - Create or update note (upsert)
router.post('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { content } = req.body;

    // Verify reminder ownership
    const reminder = await getOwnedReminder(req.userId!, id);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const note = await upsertNote(id, req.userId!, typeof content === 'string' ? content : '');
    res.json(note);
  } catch {
    res.status(500).json({ error: 'Failed to save note' });
  }
});

// POST /:id/notes/generate - AI-generate note for a reminder
router.post('/:id/notes/generate', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const reminder = await getOwnedReminder(req.userId!, id);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const content = await generateReminderNote({
      title: reminder.title,
      description: reminder.description,
      due_date: reminder.due_date,
      priority: reminder.priority,
    });

    const note = await upsertNote(id, req.userId!, content);
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
