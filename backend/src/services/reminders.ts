import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { reminders, type ReminderRow } from '../db/schema';
import { ChecklistItem, ReminderStatus } from '../types';
import { createEvent, getEvent, isUuid } from './events';
import { resolveListId } from './task-lists';

// Shared ToDo operations used by both the REST routes and the AI chat actions.
// Every query is scoped by user_id (row ownership check, formerly RLS).

export function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, 10);
}

export function toTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ownedBy = (userId: string, id: string) =>
  and(eq(reminders.id, id), eq(reminders.user_id, userId));

export async function getOwnedReminder(userId: string, id: unknown): Promise<ReminderRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(reminders).where(ownedBy(userId, id)).limit(1);
  return row ?? null;
}

export interface CreateReminderInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: 'low' | 'medium' | 'high';
  notify?: boolean;
  notify_at?: string | null;
  color?: string | null;
  list_id?: string | null;
  checklist?: ChecklistItem[];
  tags?: string[];
}

export async function createReminder(userId: string, input: CreateReminderInput): Promise<ReminderRow> {
  const listId = await resolveListId(userId, input.list_id);
  const [row] = await db
    .insert(reminders)
    .values({
      user_id: userId,
      list_id: listId,
      title: input.title,
      description: input.description || null,
      due_date: toDateOnly(input.due_date),
      priority: input.priority || 'medium',
      status: 'not_started',
      is_completed: false,
      notify: input.notify || false,
      notify_at: toTimestamp(input.notify_at),
      color: input.color || null,
      checklist: input.checklist || [],
      tags: input.tags || [],
    })
    .returning();
  return row;
}

export interface UpdateReminderInput {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: 'low' | 'medium' | 'high';
  notify?: boolean;
  notify_at?: string | null;
  color?: string | null;
  checklist?: ChecklistItem[];
  tags?: string[];
}

export async function updateReminder(
  userId: string,
  id: string,
  input: UpdateReminderInput,
): Promise<ReminderRow | null> {
  if (!isUuid(id)) return null;
  const set: Partial<typeof reminders.$inferInsert> = { updated_at: new Date() };
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description;
  if (input.due_date !== undefined) set.due_date = toDateOnly(input.due_date);
  if (input.priority !== undefined) set.priority = input.priority;
  if (input.notify !== undefined) set.notify = input.notify;
  if (input.notify_at !== undefined) set.notify_at = toTimestamp(input.notify_at);
  if (input.color !== undefined) set.color = input.color;
  if (input.checklist !== undefined) set.checklist = input.checklist;
  if (input.tags !== undefined) set.tags = input.tags;

  const [row] = await db.update(reminders).set(set).where(ownedBy(userId, id)).returning();
  return row ?? null;
}

/** Set the multi-state status and stamp started_at / completed_at idempotently. */
export async function setReminderStatus(
  userId: string,
  id: string,
  newStatus: ReminderStatus,
): Promise<ReminderRow | null> {
  const existing = await getOwnedReminder(userId, id);
  if (!existing) return null;

  const now = new Date();
  const isCompleted = newStatus === 'completed';
  const set: Partial<typeof reminders.$inferInsert> = {
    status: newStatus,
    is_completed: isCompleted,
    updated_at: now,
  };
  if (newStatus === 'in_progress' && !existing.started_at) set.started_at = now;
  if (isCompleted) {
    set.completed_at = existing.completed_at ?? now;
  } else if (newStatus === 'not_started') {
    set.completed_at = null;
    set.started_at = null;
  }

  const [row] = await db.update(reminders).set(set).where(ownedBy(userId, id)).returning();
  return row ?? null;
}

/** Deletes a reminder and returns the deleted row (null when not found). */
export async function deleteReminder(userId: string, id: string): Promise<ReminderRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.delete(reminders).where(ownedBy(userId, id)).returning();
  return row ?? null;
}

export interface LinkEventInput {
  event_id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  auto_complete_on_event_end?: boolean;
}

export class LinkEventError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Link a calendar event to a ToDo. Either links an existing event (event_id)
 * or creates a new time block from date + start_time (+ end_time / duration).
 */
export async function linkReminderEvent(
  userId: string,
  id: string,
  input: LinkEventInput,
): Promise<ReminderRow> {
  const existing = await getOwnedReminder(userId, id);
  if (!existing) throw new LinkEventError('Reminder not found', 404);

  let linkedEventId = input.event_id;

  if (linkedEventId) {
    if (!(await getEvent(userId, linkedEventId))) {
      throw new LinkEventError('연결할 일정을 찾을 수 없습니다.', 404);
    }
  } else {
    const { date, start_time } = input;
    if (!date || !start_time) {
      throw new LinkEventError('event_id 또는 date+start_time이 필요합니다.', 400);
    }

    // Resolve end_time from duration_minutes if not provided.
    let resolvedEnd = input.end_time;
    if (!resolvedEnd) {
      const minutes = input.duration_minutes ?? 60;
      const [h, m] = start_time.split(':').map(Number);
      const startMin = h * 60 + m;
      const endMin = Math.min(startMin + minutes, 24 * 60 - 1);
      const eh = Math.floor(endMin / 60);
      const em = endMin % 60;
      resolvedEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    const created = await createEvent(userId, {
      title: existing.title,
      description: existing.description,
      start: `${date}T${start_time}:00`,
      end: `${date}T${resolvedEnd}:00`,
    });
    linkedEventId = created.id;
  }

  const [row] = await db
    .update(reminders)
    .set({
      linked_event_id: linkedEventId,
      auto_complete_on_event_end: input.auto_complete_on_event_end ?? true,
      updated_at: new Date(),
    })
    .where(ownedBy(userId, id))
    .returning();
  return row;
}
