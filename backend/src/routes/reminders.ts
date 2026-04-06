import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';
import {
  getTasks,
  getTask as getGoogleTask,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
} from '../services/google-tasks';

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
  list_id: z.string().optional(),
});

const updateReminderSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notify: z.boolean().optional(),
  notify_at: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  google_task_id: z.string().nullable().optional(),
  google_list_id: z.string().nullable().optional(),
});

// Helper: merge Google Task data with Supabase metadata
function mergeTaskWithMetadata(
  googleTask: { id?: string | null; title?: string | null; notes?: string | null; due?: string | null; status?: string | null },
  meta: Record<string, unknown> | null,
) {
  const dueRaw = googleTask.due;
  const dueDate = dueRaw ? dueRaw.slice(0, 10) : null;

  return {
    id: meta?.id ?? googleTask.id,
    user_id: meta?.user_id ?? '',
    title: googleTask.title || (meta?.title as string) || '',
    description: googleTask.notes || (meta?.description as string) || null,
    due_date: dueDate || (meta?.due_date as string) || null,
    priority: (meta?.priority as string) || 'medium',
    is_completed: googleTask.status === 'completed',
    notify: (meta?.notify as boolean) ?? false,
    notify_at: (meta?.notify_at as string) || null,
    color: (meta?.color as string) || null,
    google_task_id: googleTask.id || (meta?.google_task_id as string) || null,
    google_list_id: (meta?.google_list_id as string) || '@default',
    created_at: (meta?.created_at as string) || new Date().toISOString(),
    updated_at: (meta?.updated_at as string) || new Date().toISOString(),
  };
}

// GET / - List reminders (merged from Google Tasks + Supabase metadata)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const listId = (req.query.listId as string) || '@default';
    const { status } = req.query;
    const showCompleted = status !== 'active';

    // Fetch Google Tasks and Supabase metadata in parallel
    const [googleTasks, { data: metaRows }] = await Promise.all([
      getTasks(req.userId!, listId, showCompleted),
      supabaseAdmin
        .from('reminders')
        .select('*')
        .eq('user_id', req.userId)
        .eq('google_list_id', listId),
    ]);

    // Build a lookup from google_task_id → Supabase metadata
    const metaByTaskId = new Map<string, Record<string, unknown>>();
    const metaBySupaId = new Map<string, Record<string, unknown>>();
    for (const row of metaRows || []) {
      if (row.google_task_id) {
        metaByTaskId.set(row.google_task_id, row);
      }
      metaBySupaId.set(row.id, row);
    }

    // Merge Google Tasks with Supabase metadata
    let reminders = googleTasks.map((gt) => {
      const meta = gt.id ? metaByTaskId.get(gt.id) ?? null : null;
      return mergeTaskWithMetadata(gt, meta);
    });

    // Include legacy Supabase-only reminders (google_task_id is null) in @default list
    if (listId === '@default') {
      const legacyRows = (metaRows || []).filter((r) => !r.google_task_id);
      for (const row of legacyRows) {
        reminders.push({
          id: row.id,
          user_id: row.user_id,
          title: row.title,
          description: row.description,
          due_date: row.due_date,
          priority: row.priority,
          is_completed: row.is_completed,
          notify: row.notify,
          notify_at: row.notify_at,
          color: row.color,
          google_task_id: null,
          google_list_id: '@default',
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
    }

    // Apply status filter
    if (status === 'active') {
      reminders = reminders.filter((r) => !r.is_completed);
    } else if (status === 'completed') {
      reminders = reminders.filter((r) => r.is_completed);
    }

    // Sort by due_date ascending (nulls last)
    reminders.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    res.json(reminders);
  } catch (err) {
    console.error('Failed to fetch reminders:', err);
    if (err instanceof Error && err.message.includes('insufficient')) {
      res.status(403).json({ error: 'Google Tasks 권한이 없습니다. 다시 로그인해주세요.' });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// GET /:id - Get single reminder
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: meta, error } = await supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (error || !meta) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    // If linked to Google Tasks, fetch latest data
    if (meta.google_task_id && meta.google_list_id) {
      try {
        const gt = await getGoogleTask(req.userId!, meta.google_list_id, meta.google_task_id);
        res.json(mergeTaskWithMetadata(gt, meta));
        return;
      } catch {
        // Google Task may have been deleted externally; return Supabase data
      }
    }

    res.json(meta);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

// POST / - Create reminder (Google Tasks + Supabase metadata)
router.post('/', validateBody(createReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, due_date, priority, notify, notify_at, color, list_id } = req.body;
    const listId = list_id || '@default';

    // Create in Google Tasks
    const googleTask = await createGoogleTask(req.userId!, listId, {
      title,
      notes: description || undefined,
      due: due_date || undefined,
    });

    // Store metadata in Supabase
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
        google_task_id: googleTask.id,
        google_list_id: listId,
      })
      .select()
      .single();

    if (error) {
      // Attempt to clean up the Google Task if Supabase fails
      try {
        if (googleTask.id) await deleteGoogleTask(req.userId!, listId, googleTask.id);
      } catch { /* best effort cleanup */ }
      res.status(500).json({ error: 'Failed to create reminder' });
      return;
    }

    res.status(201).json(reminder);
  } catch (err) {
    console.error('Failed to create reminder:', err);
    if (err instanceof Error && err.message.includes('insufficient')) {
      res.status(403).json({ error: 'Google Tasks 권한이 없습니다. 다시 로그인해주세요.' });
      return;
    }
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PUT /:id - Update reminder
router.put('/:id', validateBody(updateReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, due_date, priority, notify, notify_at, color,
            google_task_id: bodyTaskId, google_list_id: bodyListId } = req.body;

    // Use IDs from request body if provided, otherwise fetch from DB
    let googleTaskId = bodyTaskId as string | undefined;
    let googleListId = bodyListId as string | undefined;

    if (!googleTaskId || !googleListId) {
      const { data: existing, error: findError } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id')
        .eq('id', id)
        .eq('user_id', req.userId)
        .single();

      if (findError || !existing) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
      }
      googleTaskId = existing.google_task_id;
      googleListId = existing.google_list_id;
    }

    // Build Google Tasks updates
    const googleUpdates: Record<string, string | null | undefined> = {};
    if (title !== undefined) googleUpdates.title = title;
    if (description !== undefined) googleUpdates.notes = description;
    if (due_date !== undefined) googleUpdates.due = due_date;

    // Run Google Tasks update + Supabase update in parallel
    const supabaseUpdate = supabaseAdmin
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

    const googleUpdate = (googleTaskId && googleListId && Object.keys(googleUpdates).length > 0)
      ? updateGoogleTask(req.userId!, googleListId, googleTaskId, googleUpdates)
      : Promise.resolve(null);

    const [{ data: reminder, error }, _googleResult] = await Promise.all([supabaseUpdate, googleUpdate]);

    if (error) {
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

// DELETE /:id - Delete reminder
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { google_task_id: bodyTaskId, google_list_id: bodyListId } = req.query;

    let googleTaskId = bodyTaskId as string | undefined;
    let googleListId = bodyListId as string | undefined;

    // If IDs not in query params, fetch from DB
    if (!googleTaskId || !googleListId) {
      const { data: existing, error: findError } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id')
        .eq('id', id)
        .eq('user_id', req.userId)
        .single();

      if (findError || !existing) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
      }
      googleTaskId = existing.google_task_id;
      googleListId = existing.google_list_id;
    }

    // Delete from Google Tasks + Supabase in parallel
    const googleDelete = (googleTaskId && googleListId)
      ? deleteGoogleTask(req.userId!, googleListId, googleTaskId).catch(() => { /* may already be deleted */ })
      : Promise.resolve();

    const supabaseDelete = supabaseAdmin
      .from('reminders')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', req.userId);

    const [, { error, count }] = await Promise.all([googleDelete, supabaseDelete]);

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

// PATCH /:id/complete - Toggle completion status
router.patch('/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { google_task_id: bodyTaskId, google_list_id: bodyListId, is_completed: bodyCompleted } = req.body ?? {};

    let googleTaskId = bodyTaskId as string | undefined;
    let googleListId = bodyListId as string | undefined;
    let currentCompleted = bodyCompleted as boolean | undefined;

    // If IDs not in body, fetch from DB (fallback)
    if (!googleTaskId || !googleListId || currentCompleted === undefined) {
      const { data: existing, error: findError } = await supabaseAdmin
        .from('reminders')
        .select('id, is_completed, google_task_id, google_list_id')
        .eq('id', id)
        .eq('user_id', req.userId)
        .single();

      if (findError || !existing) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
      }
      googleTaskId = googleTaskId || existing.google_task_id;
      googleListId = googleListId || existing.google_list_id;
      if (currentCompleted === undefined) currentCompleted = existing.is_completed;
    }

    const newCompleted = !currentCompleted;

    // Update Google Tasks + Supabase in parallel
    const googleUpdate = (googleTaskId && googleListId)
      ? updateGoogleTask(
          req.userId!,
          googleListId,
          googleTaskId,
          { status: newCompleted ? 'completed' : 'needsAction' },
        )
      : Promise.resolve(null);

    const supabaseUpdate = supabaseAdmin
      .from('reminders')
      .update({
        is_completed: newCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    const [, { data: reminder, error }] = await Promise.all([googleUpdate, supabaseUpdate]);

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
