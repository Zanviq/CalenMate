import { Router, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { events, reminders, type ReminderRow } from '../db/schema';
import { getEvent } from '../services/events';
import { resolveListId } from '../services/task-lists';
import {
  getOwnedReminder,
  createReminder,
  updateReminder,
  setReminderStatus,
  deleteReminder,
  linkReminderEvent,
  LinkEventError,
} from '../services/reminders';
import { ReminderStatus, LinkedEventInfo } from '../types';
import { invalidateSummaryCache } from './summary';

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

// Lazy auto-transition: when a ToDo is linked to a calendar event, derive its
// status from the event's start/end timestamps without a background worker.
// Returns the updated reminder shape (in-memory) and an optional persistence patch.
type AutoTransitionPatch = {
  id: string;
  status: ReminderStatus;
  started_at?: Date | null;
  completed_at?: Date | null;
  is_completed?: boolean;
};

function computeAutoTransition(
  reminder: ReminderRow,
  event: { start?: Date | null; end?: Date | null } | null,
  now: Date,
): { reminder: ReminderRow; patch: AutoTransitionPatch | null } {
  // Already completed or no event linked → nothing to do.
  if (!event || reminder.status === 'completed' || !reminder.linked_event_id) {
    return { reminder, patch: null };
  }

  const startMs = event.start ? event.start.getTime() : NaN;
  const endMs = event.end ? event.end.getTime() : NaN;
  const nowMs = now.getTime();

  // Event end → completed (only when user opted in).
  if (
    reminder.auto_complete_on_event_end &&
    Number.isFinite(endMs) && nowMs >= endMs
  ) {
    const next: ReminderRow = {
      ...reminder,
      status: 'completed',
      is_completed: true,
      completed_at: reminder.completed_at ?? new Date(endMs),
      started_at: reminder.started_at ?? (Number.isFinite(startMs) ? new Date(startMs) : null),
    };
    return {
      reminder: next,
      patch: {
        id: reminder.id,
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
    const next: ReminderRow = {
      ...reminder,
      status: 'in_progress',
      started_at: reminder.started_at ?? new Date(startMs),
    };
    return {
      reminder: next,
      patch: {
        id: reminder.id,
        status: 'in_progress',
        started_at: next.started_at,
      },
    };
  }

  return { reminder, patch: null };
}

function persistAutoTransition(userId: string, patch: AutoTransitionPatch) {
  const set: Partial<typeof reminders.$inferInsert> = {
    status: patch.status,
    updated_at: new Date(),
  };
  if (patch.started_at !== undefined) set.started_at = patch.started_at;
  if (patch.completed_at !== undefined) set.completed_at = patch.completed_at;
  if (patch.is_completed !== undefined) set.is_completed = patch.is_completed;
  return db
    .update(reminders)
    .set(set)
    .where(and(eq(reminders.id, patch.id), eq(reminders.user_id, userId)));
}

// GET / - List reminders
// listId semantics:
//   undefined or 'all' → every list (used by Home, AI summary)
//   '@default' or specific id → single-list view (used by /reminders page)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const rawListId = req.query.listId as string | undefined;
    const aggregateAll = !rawListId || rawListId === 'all';
    const { status } = req.query;

    // Tag filter: ?tags=foo,bar — AND-match (reminder must contain all listed tags).
    const tagsParam = (req.query.tags as string | undefined)?.trim();
    const requiredTags = tagsParam
      ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const conditions = [eq(reminders.user_id, req.userId!)];
    if (!aggregateAll) {
      conditions.push(eq(reminders.list_id, await resolveListId(req.userId!, rawListId)));
    }

    let rows = await db
      .select()
      .from(reminders)
      .where(and(...conditions))
      .orderBy(asc(reminders.created_at));

    // Lazy auto-transition for ToDos linked to a calendar event.
    // Linked events are fetched in a single query.
    const linkedIds = [...new Set(rows.map((r) => r.linked_event_id).filter((id): id is string => !!id))];
    if (linkedIds.length > 0) {
      const linkedEvents = await db
        .select({ id: events.id, start_at: events.start_at, end_at: events.end_at })
        .from(events)
        .where(and(eq(events.user_id, req.userId!), inArray(events.id, linkedIds)));
      const eventById = new Map(linkedEvents.map((e) => [e.id, e]));
      const now = new Date();
      const patches: AutoTransitionPatch[] = [];
      rows = rows.map((r) => {
        if (!r.linked_event_id) return r;
        const ev = eventById.get(r.linked_event_id);
        const { reminder: updated, patch } = computeAutoTransition(
          r,
          ev ? { start: ev.start_at, end: ev.end_at } : null,
          now,
        );
        if (patch) patches.push(patch);
        return updated;
      });

      // Persist transitions in the background — don't block the response.
      if (patches.length > 0) {
        void Promise.all(patches.map((p) => persistAutoTransition(req.userId!, p)))
          .catch((err) => console.error('[reminders] auto-transition persist failed:', err));
      }
    }

    // Apply status filter
    if (status === 'active') {
      rows = rows.filter((r) => !r.is_completed);
    } else if (status === 'completed') {
      rows = rows.filter((r) => r.is_completed);
    }

    // Apply tag filter (AND-match: every required tag must be present).
    if (requiredTags.length > 0) {
      rows = rows.filter((r) =>
        requiredTags.every((t) => (r.tags ?? []).includes(t)),
      );
    }

    // Sort by due_date ascending (nulls last)
    rows.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch reminders:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// GET /tags - Distinct tags used by this user (for autocomplete + filter chips).
// Defined before /:id so the /tags literal isn't shadowed by the :id param.
router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const data = await db
      .select({ tags: reminders.tags })
      .from(reminders)
      .where(eq(reminders.user_id, req.userId!));

    const counts = new Map<string, number>();
    for (const row of data) {
      for (const t of row.tags ?? []) {
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
    const id = req.params.id as string;

    let reminder = await getOwnedReminder(req.userId!, id);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    // Lazy auto-transition + linked-event sidecar (single fetch).
    let linkedEvent: LinkedEventInfo | null = null;
    if (reminder.linked_event_id) {
      const ev = await getEvent(req.userId!, reminder.linked_event_id);
      if (ev) {
        const startDt = ev.start.dateTime ?? ev.start.date ?? null;
        const endDt = ev.end.dateTime ?? ev.end.date ?? null;
        linkedEvent = {
          id: ev.id,
          summary: ev.summary ?? null,
          start: startDt,
          end: endDt,
          all_day: !!ev.start.date && !ev.start.dateTime,
        };

        const { reminder: updated, patch } = computeAutoTransition(
          reminder,
          {
            start: startDt ? new Date(startDt) : null,
            end: endDt ? new Date(endDt) : null,
          },
          new Date(),
        );
        reminder = updated;

        if (patch) {
          // Background persist — don't block the response.
          void persistAutoTransition(req.userId!, patch)
            .catch((err) => console.error('[reminders] auto-transition persist failed:', err));
        }
      }
    }

    res.json({ ...reminder, linked_event: linkedEvent });
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

// POST / - Create reminder
router.post('/', validateBody(createReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const reminder = await createReminder(req.userId!, req.body as z.infer<typeof createReminderSchema>);

    invalidateSummaryCache(req.userId!);
    res.status(201).json(reminder);
  } catch (err) {
    console.error('Failed to create reminder:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PUT /:id - Update reminder
router.put('/:id', validateBody(updateReminderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const reminder = await updateReminder(req.userId!, id, req.body as z.infer<typeof updateReminderSchema>);

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    invalidateSummaryCache(req.userId!);
    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /:id - Delete reminder
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await deleteReminder(req.userId!, id);

    if (!deleted) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    invalidateSummaryCache(req.userId!);
    res.json({ message: 'Reminder deleted successfully' });
  } catch {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// PATCH /:id/complete - Toggle completion status
router.patch('/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const existing = await getOwnedReminder(req.userId!, id);
    if (!existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const newCompleted = !existing.is_completed;
    const now = new Date();
    const [reminder] = await db
      .update(reminders)
      .set({
        is_completed: newCompleted,
        status: newCompleted ? 'completed' : 'not_started',
        completed_at: newCompleted ? now : null,
        updated_at: now,
      })
      .where(and(eq(reminders.id, id), eq(reminders.user_id, req.userId!)))
      .returning();

    invalidateSummaryCache(req.userId!);
    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to toggle reminder completion' });
  }
});

// PATCH /:id/status - Set multi-state status (not_started / in_progress / completed)
router.patch('/:id/status', validateBody(statusSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status: newStatus } = req.body as { status: ReminderStatus };

    const reminder = await setReminderStatus(req.userId!, id, newStatus);
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    invalidateSummaryCache(req.userId!);
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
    const id = req.params.id as string;
    const { until } = req.body as { until: string };

    const newDueDate = resolveSnoozeUntil(until);
    if (!newDueDate) {
      res.status(400).json({ error: 'Invalid snooze target' });
      return;
    }

    const reminder = await updateReminder(req.userId!, id, { due_date: newDueDate });
    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    invalidateSummaryCache(req.userId!);
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
    const id = req.params.id as string;
    const reminder = await linkReminderEvent(req.userId!, id, req.body as z.infer<typeof linkEventSchema>);

    invalidateSummaryCache(req.userId!);
    res.json(reminder);
  } catch (err) {
    if (err instanceof LinkEventError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Failed to link event:', err);
    res.status(500).json({ error: 'Failed to link event' });
  }
});

// DELETE /:id/link-event - Unlink a calendar event from a ToDo (event itself is preserved)
router.delete('/:id/link-event', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await getOwnedReminder(req.userId!, id);
    if (!existing) {
      res.status(404).json({ error: 'Reminder not found' });
      return;
    }

    const [reminder] = await db
      .update(reminders)
      .set({
        linked_event_id: null,
        auto_complete_on_event_end: false,
        updated_at: new Date(),
      })
      .where(and(eq(reminders.id, id), eq(reminders.user_id, req.userId!)))
      .returning();

    invalidateSummaryCache(req.userId!);
    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to unlink event' });
  }
});

export default router;
