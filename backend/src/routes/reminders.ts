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
import { getCalendarClient } from '../services/google-calendar';
import { ReminderStatus, ChecklistItem, LinkedEventInfo } from '../types';

const router = Router();

router.use(authMiddleware);

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().max(500),
  done: z.boolean(),
  order: z.number(),
});

const tagsSchema = z.array(z.string().min(1).max(50)).max(20);

const createReminderSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다').max(500),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  notify: z.boolean().default(false),
  notify_at: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  list_id: z.string().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  tags: tagsSchema.optional(),
});

const updateReminderSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notify: z.boolean().optional(),
  notify_at: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  checklist: z.array(checklistItemSchema).optional(),
  tags: tagsSchema.optional(),
  google_task_id: z.string().nullable().optional(),
  google_list_id: z.string().nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'completed']),
});

const snoozeSchema = z.object({
  // Either a keyword preset or a YYYY-MM-DD literal.
  until: z.string().min(1),
});

const linkEventSchema = z.object({
  // Either link to an existing event...
  event_id: z.string().optional(),
  // ...or create one inline (time-blocking).
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  duration_minutes: z.number().int().positive().max(24 * 60).optional(),
  auto_complete_on_event_end: z.boolean().optional(),
});

// Helper: merge Google Task data with Supabase metadata.
// Google = source of truth for shared fields (title, notes, due, completed).
// Supabase = source of truth for extension fields (priority, status, checklist, etc.).
function mergeTaskWithMetadata(
  googleTask: { id?: string | null; title?: string | null; notes?: string | null; due?: string | null; status?: string | null },
  meta: Record<string, unknown> | null,
) {
  const dueRaw = googleTask.due;
  const dueDate = dueRaw ? dueRaw.slice(0, 10) : null;
  const googleCompleted = googleTask.status === 'completed';
  const metaStatus = (meta?.status as ReminderStatus | undefined) ?? undefined;

  // Reconcile status with Google completion state.
  // Google completion always wins for the completed/needsAction split,
  // but we preserve 'in_progress' as long as Google says needsAction.
  let status: ReminderStatus;
  if (googleCompleted) {
    status = 'completed';
  } else if (metaStatus === 'in_progress') {
    status = 'in_progress';
  } else {
    status = 'not_started';
  }

  return {
    id: meta?.id ?? googleTask.id,
    user_id: meta?.user_id ?? '',
    title: googleTask.title || (meta?.title as string) || '',
    description: googleTask.notes || (meta?.description as string) || null,
    due_date: dueDate || (meta?.due_date as string) || null,
    priority: (meta?.priority as string) || 'medium',
    status,
    is_completed: status === 'completed',
    started_at: (meta?.started_at as string | null) ?? null,
    completed_at: (meta?.completed_at as string | null) ?? null,
    linked_event_id: (meta?.linked_event_id as string | null) ?? null,
    auto_complete_on_event_end: (meta?.auto_complete_on_event_end as boolean) ?? false,
    checklist: ((meta?.checklist as ChecklistItem[] | null) ?? []) as ChecklistItem[],
    tags: ((meta?.tags as string[] | null) ?? []) as string[],
    notify: (meta?.notify as boolean) ?? false,
    notify_at: (meta?.notify_at as string) || null,
    color: (meta?.color as string) || null,
    google_task_id: googleTask.id || (meta?.google_task_id as string) || null,
    google_list_id: (meta?.google_list_id as string) || '@default',
    created_at: (meta?.created_at as string) || new Date().toISOString(),
    updated_at: (meta?.updated_at as string) || new Date().toISOString(),
  };
}

// Lazy auto-transition: when a ToDo is linked to a calendar event, derive its
// status from the event's start/end timestamps without a background worker.
// Returns the updated reminder shape (in-memory) and an optional persistence patch.
type AutoTransitionPatch = {
  id: string;
  status: ReminderStatus;
  started_at?: string | null;
  completed_at?: string | null;
  is_completed?: boolean;
};

function computeAutoTransition(
  reminder: ReturnType<typeof mergeTaskWithMetadata>,
  event: { start?: string | null; end?: string | null } | null,
  now: Date,
): { reminder: ReturnType<typeof mergeTaskWithMetadata>; patch: AutoTransitionPatch | null } {
  // Already completed or no event linked → nothing to do.
  if (!event || reminder.status === 'completed' || !reminder.linked_event_id) {
    return { reminder, patch: null };
  }

  const startMs = event.start ? Date.parse(event.start) : NaN;
  const endMs = event.end ? Date.parse(event.end) : NaN;
  const nowMs = now.getTime();

  // Event end → completed (only when user opted in).
  if (
    reminder.auto_complete_on_event_end &&
    Number.isFinite(endMs) && nowMs >= endMs
  ) {
    const next = {
      ...reminder,
      status: 'completed' as const,
      is_completed: true,
      completed_at: reminder.completed_at ?? new Date(endMs).toISOString(),
      started_at: reminder.started_at ?? (Number.isFinite(startMs) ? new Date(startMs).toISOString() : null),
    };
    return {
      reminder: next,
      patch: {
        id: reminder.id as string,
        status: 'completed',
        completed_at: next.completed_at,
        started_at: next.started_at,
        is_completed: true,
      },
    };
  }

  // Event started but not ended → in_progress.
  if (
    Number.isFinite(startMs) && nowMs >= startMs &&
    reminder.status === 'not_started'
  ) {
    const next = {
      ...reminder,
      status: 'in_progress' as const,
      started_at: reminder.started_at ?? new Date(startMs).toISOString(),
    };
    return {
      reminder: next,
      patch: {
        id: reminder.id as string,
        status: 'in_progress',
        started_at: next.started_at,
      },
    };
  }

  return { reminder, patch: null };
}

// GET / - List reminders (merged from Google Tasks + Supabase metadata)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const listId = (req.query.listId as string) || '@default';
    const { status } = req.query;
    const showCompleted = status !== 'active';

    // Tag filter: ?tags=foo,bar — AND-match (reminder must contain all listed tags).
    const tagsParam = (req.query.tags as string | undefined)?.trim();
    const requiredTags = tagsParam
      ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

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
        const legacyStatus: ReminderStatus = row.is_completed
          ? 'completed'
          : (row.status as ReminderStatus) || 'not_started';
        reminders.push({
          id: row.id,
          user_id: row.user_id,
          title: row.title,
          description: row.description,
          due_date: row.due_date,
          priority: row.priority,
          status: legacyStatus,
          is_completed: legacyStatus === 'completed',
          started_at: row.started_at ?? null,
          completed_at: row.completed_at ?? null,
          linked_event_id: row.linked_event_id ?? null,
          auto_complete_on_event_end: row.auto_complete_on_event_end ?? false,
          checklist: (row.checklist ?? []) as ChecklistItem[],
          tags: (row.tags ?? []) as string[],
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

    // Lazy auto-transition for ToDos linked to a calendar event.
    // We only fetch events for reminders that actually have a linked_event_id,
    // and we batch them via a single Promise.all.
    const linkedReminders = reminders.filter((r) => r.linked_event_id);
    if (linkedReminders.length > 0) {
      try {
        const { calendar } = await getCalendarClient(req.userId!);
        const eventResults = await Promise.all(
          linkedReminders.map((r) =>
            calendar.events
              .get({ calendarId: 'primary', eventId: r.linked_event_id as string })
              .then((res) => ({
                id: r.id as string,
                start: res.data.start?.dateTime ?? res.data.start?.date ?? null,
                end: res.data.end?.dateTime ?? res.data.end?.date ?? null,
              }))
              .catch(() => ({ id: r.id as string, start: null, end: null })),
          ),
        );
        const eventById = new Map(eventResults.map((e) => [e.id, e]));
        const now = new Date();
        const patches: AutoTransitionPatch[] = [];
        reminders = reminders.map((r) => {
          if (!r.linked_event_id) return r;
          const ev = eventById.get(r.id as string) ?? null;
          const { reminder: updated, patch } = computeAutoTransition(r, ev, now);
          if (patch) patches.push(patch);
          return updated;
        });

        // Persist transitions in the background — don't block the response.
        if (patches.length > 0) {
          void Promise.all(
            patches.map((p) => {
              const upd: Record<string, unknown> = {
                status: p.status,
                updated_at: new Date().toISOString(),
              };
              if (p.started_at !== undefined) upd.started_at = p.started_at;
              if (p.completed_at !== undefined) upd.completed_at = p.completed_at;
              if (p.is_completed !== undefined) upd.is_completed = p.is_completed;
              return supabaseAdmin
                .from('reminders')
                .update(upd)
                .eq('id', p.id)
                .eq('user_id', req.userId);
            }),
          ).catch((err) => console.error('[reminders] auto-transition persist failed:', err));

          // Also push completion to Google Tasks for any newly auto-completed items.
          const completed = patches.filter((p) => p.status === 'completed');
          if (completed.length > 0) {
            void Promise.all(
              completed.map((p) => {
                const r = reminders.find((x) => x.id === p.id);
                if (!r?.google_task_id || !r.google_list_id) return Promise.resolve();
                return updateGoogleTask(req.userId!, r.google_list_id, r.google_task_id, {
                  status: 'completed',
                }).catch(() => { /* best effort */ });
              }),
            );
          }
        }
      } catch (err) {
        // Calendar unavailable: skip auto-transition this round, return raw data.
        console.warn('[reminders] auto-transition skipped (calendar unavailable):', err);
      }
    }

    // Apply status filter
    if (status === 'active') {
      reminders = reminders.filter((r) => !r.is_completed);
    } else if (status === 'completed') {
      reminders = reminders.filter((r) => r.is_completed);
    }

    // Apply tag filter (AND-match: every required tag must be present).
    if (requiredTags.length > 0) {
      reminders = reminders.filter((r) =>
        requiredTags.every((t) => (r.tags ?? []).includes(t)),
      );
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

// GET /tags - Distinct tags used by this user (for autocomplete + filter chips).
// Defined before /:id so the /tags literal isn't shadowed by the :id param.
router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('reminders')
      .select('tags')
      .eq('user_id', req.userId);

    if (error) {
      res.status(500).json({ error: 'Failed to fetch tags' });
      return;
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const rowTags = (row.tags ?? []) as string[];
      for (const t of rowTags) {
        if (!t) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }

    const tags = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    res.json(tags);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tags' });
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

    // Synthesize a Google Task shape from Supabase row so mergeTaskWithMetadata
    // can produce a normalized response even when no Google Task exists.
    const synthGoogleTask = {
      id: meta.google_task_id ?? null,
      title: meta.title ?? null,
      notes: meta.description ?? null,
      due: meta.due_date ?? null,
      status: meta.is_completed ? 'completed' : 'needsAction',
    };

    let merged: ReturnType<typeof mergeTaskWithMetadata>;
    if (meta.google_task_id && meta.google_list_id) {
      try {
        const gt = await getGoogleTask(req.userId!, meta.google_list_id, meta.google_task_id);
        merged = mergeTaskWithMetadata(gt, meta);
      } catch {
        // Google Task may have been deleted externally; fall back to synthesized shape.
        merged = mergeTaskWithMetadata(synthGoogleTask, meta);
      }
    } else {
      merged = mergeTaskWithMetadata(synthGoogleTask, meta);
    }

    // Lazy auto-transition + linked-event sidecar (single fetch).
    let linkedEvent: LinkedEventInfo | null = null;
    if (merged.linked_event_id) {
      try {
        const { calendar } = await getCalendarClient(req.userId!);
        const evRes = await calendar.events.get({
          calendarId: 'primary',
          eventId: merged.linked_event_id as string,
        });
        const startDt = evRes.data.start?.dateTime ?? evRes.data.start?.date ?? null;
        const endDt = evRes.data.end?.dateTime ?? evRes.data.end?.date ?? null;
        linkedEvent = {
          id: merged.linked_event_id as string,
          summary: evRes.data.summary ?? null,
          start: startDt,
          end: endDt,
          all_day: !!evRes.data.start?.date && !evRes.data.start?.dateTime,
        };

        const { reminder: updated, patch } = computeAutoTransition(
          merged,
          { start: startDt, end: endDt },
          new Date(),
        );
        merged = updated;

        if (patch) {
          const upd: Record<string, unknown> = {
            status: patch.status,
            updated_at: new Date().toISOString(),
          };
          if (patch.started_at !== undefined) upd.started_at = patch.started_at;
          if (patch.completed_at !== undefined) upd.completed_at = patch.completed_at;
          if (patch.is_completed !== undefined) upd.is_completed = patch.is_completed;

          // Background persist — don't block the response.
          void supabaseAdmin
            .from('reminders')
            .update(upd)
            .eq('id', id)
            .eq('user_id', req.userId)
            .then(({ error: persistErr }) => {
              if (persistErr) console.error('[reminders] auto-transition persist failed:', persistErr);
            });

          if (patch.status === 'completed' && merged.google_task_id && merged.google_list_id) {
            void updateGoogleTask(
              req.userId!,
              merged.google_list_id,
              merged.google_task_id,
              { status: 'completed' },
            ).catch(() => { /* best effort */ });
          }
        }
      } catch (err) {
        // Calendar unavailable or event missing: keep stale link, return reminder without sidecar.
        console.warn('[reminders] linked event fetch failed:', err);
      }
    }

    res.json({ ...merged, linked_event: linkedEvent });
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

// POST / - Create reminder (Google Tasks + Supabase metadata)
router.post('/', validateBody(createReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, due_date, priority, notify, notify_at, color, list_id, checklist, tags } = req.body;
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
        status: 'not_started',
        is_completed: false,
        notify: notify || false,
        notify_at: notify_at || null,
        color: color || null,
        checklist: checklist || [],
        tags: tags || [],
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
    const { title, description, due_date, priority, notify, notify_at, color, checklist, tags,
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
        ...(checklist !== undefined && { checklist }),
        ...(tags !== undefined && { tags }),
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

    // Only query DB if frontend didn't provide all required fields
    if (currentCompleted === undefined) {
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
      currentCompleted = existing.is_completed;
    }

    const newCompleted = !currentCompleted;

    // Sync Google Tasks first so it stays the source of truth for completion.
    // If Google fails, do NOT mutate Supabase — that prevents a "snap-back" on the
    // next list fetch (which uses Google Task status to override merged is_completed).
    if (googleTaskId && googleListId) {
      try {
        await updateGoogleTask(
          req.userId!,
          googleListId,
          googleTaskId,
          { status: newCompleted ? 'completed' : 'needsAction' },
        );
      } catch (err) {
        console.error('Google Tasks completion sync failed:', err);
        res.status(502).json({ error: 'Google Tasks 동기화에 실패했습니다. 잠시 후 다시 시도해주세요.' });
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        is_completed: newCompleted,
        status: newCompleted ? 'completed' : 'not_started',
        completed_at: newCompleted ? nowIso : null,
        updated_at: nowIso,
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

// PATCH /:id/status - Set multi-state status (not_started / in_progress / completed)
router.patch('/:id/status', validateBody(statusSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body as { status: ReminderStatus };

    const { data: existing, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('google_task_id, google_list_id, started_at, completed_at')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const nowIso = new Date().toISOString();
    const isCompleted = newStatus === 'completed';

    // Sync Google Tasks first (Google = source of truth for completion).
    if (existing.google_task_id && existing.google_list_id) {
      try {
        await updateGoogleTask(
          req.userId!,
          existing.google_list_id,
          existing.google_task_id,
          { status: isCompleted ? 'completed' : 'needsAction' },
        );
      } catch (err) {
        console.error('Google Tasks status sync failed:', err);
        res.status(502).json({ error: 'Google Tasks 동기화에 실패했습니다.' });
        return;
      }
    }

    const update: Record<string, unknown> = {
      status: newStatus,
      is_completed: isCompleted,
      updated_at: nowIso,
    };
    // Stamp transition timestamps idempotently.
    if (newStatus === 'in_progress' && !existing.started_at) {
      update.started_at = nowIso;
    }
    if (isCompleted) {
      update.completed_at = existing.completed_at ?? nowIso;
    } else if (newStatus === 'not_started') {
      update.completed_at = null;
      update.started_at = null;
    }

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update(update)
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to update reminder status' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder status' });
  }
});

// PATCH /:id/snooze - Quick-shift the due_date forward by a preset or literal date.
// Accepted `until` values: 'today' | 'tomorrow' | 'next_week' | 'next_monday' | 'YYYY-MM-DD'.
// Snooze keeps the existing status; it only moves the due date.
router.patch('/:id/snooze', validateBody(snoozeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { until } = req.body as { until: string };

    const newDueDate = resolveSnoozeUntil(until);
    if (!newDueDate) {
      res.status(400).json({ error: 'Invalid snooze target' });
      return;
    }

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

    // Best-effort Google Tasks sync — if it fails we still update Supabase so the
    // user's intent isn't silently dropped, but we surface the failure as a soft warning.
    if (existing.google_task_id && existing.google_list_id) {
      try {
        await updateGoogleTask(req.userId!, existing.google_list_id, existing.google_task_id, {
          due: newDueDate,
        });
      } catch (err) {
        console.warn('[reminders] snooze Google Tasks sync failed:', err);
      }
    }

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        due_date: newDueDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to snooze reminder' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to snooze reminder' });
  }
});

function resolveSnoozeUntil(until: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(until)) return until;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  switch (until) {
    case 'today':
      return fmt(today);
    case 'tomorrow': {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return fmt(d);
    }
    case 'next_week': {
      const d = new Date(today);
      d.setDate(d.getDate() + 7);
      return fmt(d);
    }
    case 'next_monday': {
      const dow = today.getDay(); // 0=Sun..6=Sat
      const offset = (8 - dow) % 7 || 7; // always future
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return fmt(d);
    }
    default:
      return null;
  }
}

// POST /:id/link-event - Link a calendar event (existing or new) to a ToDo.
// If date+start_time are provided (or duration_minutes), creates a new event.
// Otherwise event_id is required.
router.post('/:id/link-event', validateBody(linkEventSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      event_id,
      date,
      start_time,
      end_time,
      duration_minutes,
      auto_complete_on_event_end,
    } = req.body as z.infer<typeof linkEventSchema>;

    const { data: existing, error: findError } = await supabaseAdmin
      .from('reminders')
      .select('id, title, description')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (findError || !existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    let linkedEventId = event_id;

    // Time-blocking flow: create the event inline.
    if (!linkedEventId) {
      if (!date || !start_time) {
        res.status(400).json({ error: 'event_id 또는 date+start_time이 필요합니다.' });
        return;
      }

      // Resolve end_time from duration_minutes if not provided.
      let resolvedEnd = end_time;
      if (!resolvedEnd) {
        const minutes = duration_minutes ?? 60;
        const [h, m] = start_time.split(':').map(Number);
        const startMin = h * 60 + m;
        const endMin = Math.min(startMin + minutes, 24 * 60 - 1);
        const eh = Math.floor(endMin / 60);
        const em = endMin % 60;
        resolvedEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
      }

      try {
        const { calendar } = await getCalendarClient(req.userId!);
        const created = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: existing.title,
            description: existing.description ?? undefined,
            start: { dateTime: `${date}T${start_time}:00`, timeZone: 'Asia/Seoul' },
            end: { dateTime: `${date}T${resolvedEnd}:00`, timeZone: 'Asia/Seoul' },
          },
        });
        linkedEventId = created.data.id ?? undefined;
      } catch (err) {
        console.error('Failed to create linked event:', err);
        res.status(502).json({ error: '캘린더 이벤트 생성에 실패했습니다.' });
        return;
      }
    }

    if (!linkedEventId) {
      res.status(500).json({ error: 'Failed to obtain event id' });
      return;
    }

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        linked_event_id: linkedEventId,
        auto_complete_on_event_end: auto_complete_on_event_end ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Failed to link event' });
      return;
    }

    res.json(reminder);
  } catch (err) {
    console.error('Failed to link event:', err);
    res.status(500).json({ error: 'Failed to link event' });
  }
});

// DELETE /:id/link-event - Unlink a calendar event from a ToDo (event itself is preserved)
router.delete('/:id/link-event', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: reminder, error } = await supabaseAdmin
      .from('reminders')
      .update({
        linked_event_id: null,
        auto_complete_on_event_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error || !reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to unlink event' });
  }
});

export default router;
