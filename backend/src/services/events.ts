import { and, asc, eq, gt, lt } from 'drizzle-orm';
import { db } from '../db';
import { events, type EventRow } from '../db/schema';

// Events are stored in Postgres. The public shape below keeps the
// { summary, start: { dateTime | date }, end, colorId } layout the chat UI,
// the summary endpoint and the Gemini prompts were written against.

export const APP_TIME_ZONE = 'Asia/Seoul';
// Korea has no DST, so a fixed offset is exact.
const APP_UTC_OFFSET = '+09:00';
const APP_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface EventTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface EventResource {
  id: string;
  summary: string;
  description: string | null;
  colorId: string | null;
  start: EventTime;
  end: EventTime;
  reminderMinutes: number | null;
  created: string;
  updated: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Render an instant as local Seoul wall-clock time with an explicit offset,
// e.g. 2026-09-24T10:00:00+09:00. Callers slice(0,10) / slice(11,16) on this.
function toLocalDateTime(d: Date): string {
  const local = new Date(d.getTime() + APP_OFFSET_MS);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${APP_UTC_OFFSET}`;
}

function toLocalDate(d: Date): string {
  return toLocalDateTime(d).slice(0, 10);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse an incoming start/end value.
 * - 'YYYY-MM-DD'                → all-day boundary (midnight Seoul)
 * - 'YYYY-MM-DDTHH:mm[:ss]'     → Seoul wall-clock time
 * - ISO string with Z / offset  → that exact instant
 */
export function parseEventTime(value: string): { at: Date; dateOnly: boolean } {
  const v = value.trim();
  if (DATE_ONLY_RE.test(v)) {
    return { at: new Date(`${v}T00:00:00${APP_UTC_OFFSET}`), dateOnly: true };
  }
  const withOffset = HAS_OFFSET_RE.test(v) ? v : `${v}${APP_UTC_OFFSET}`;
  const at = new Date(withOffset);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`잘못된 날짜 형식입니다: ${value}`);
  }
  return { at, dateOnly: false };
}

export function toEventResource(row: EventRow): EventResource {
  const start: EventTime = row.all_day
    ? { date: toLocalDate(row.start_at) }
    : { dateTime: toLocalDateTime(row.start_at), timeZone: APP_TIME_ZONE };
  const end: EventTime = row.all_day
    ? { date: toLocalDate(row.end_at) }
    : { dateTime: toLocalDateTime(row.end_at), timeZone: APP_TIME_ZONE };
  return {
    id: row.id,
    summary: row.title,
    description: row.description,
    colorId: row.color,
    start,
    end,
    reminderMinutes: row.reminder_minutes,
    created: row.created_at.toISOString(),
    updated: row.updated_at.toISOString(),
  };
}

export async function listEvents(
  userId: string,
  opts: { timeMin?: Date; timeMax?: Date; limit?: number } = {},
): Promise<EventResource[]> {
  // Overlap semantics: an event is included when it ends after timeMin and
  // starts before timeMax.
  const conditions = [eq(events.user_id, userId)];
  if (opts.timeMin) conditions.push(gt(events.end_at, opts.timeMin));
  if (opts.timeMax) conditions.push(lt(events.start_at, opts.timeMax));

  const query = db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.start_at), asc(events.created_at));
  const rows = opts.limit ? await query.limit(opts.limit) : await query;
  return rows.map(toEventResource);
}

export async function getEvent(userId: string, eventId: string): Promise<EventResource | null> {
  if (!isUuid(eventId)) return null;
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.user_id, userId)))
    .limit(1);
  return row ? toEventResource(row) : null;
}

export interface EventInput {
  title: string;
  start: string;
  end: string;
  description?: string | null;
  color?: string | null;
  reminderMinutes?: number | null;
}

export async function createEvent(userId: string, input: EventInput): Promise<EventResource> {
  const start = parseEventTime(input.start);
  const end = parseEventTime(input.end);
  const [row] = await db
    .insert(events)
    .values({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      start_at: start.at,
      end_at: end.at,
      all_day: start.dateOnly && end.dateOnly,
      color: input.color ?? null,
      reminder_minutes: input.reminderMinutes ?? null,
    })
    .returning();
  return toEventResource(row);
}

export async function updateEvent(
  userId: string,
  eventId: string,
  patch: Partial<EventInput>,
): Promise<EventResource> {
  if (!isUuid(eventId)) throw new Error('일정을 찾을 수 없습니다.');

  const set: Partial<typeof events.$inferInsert> = { updated_at: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.reminderMinutes !== undefined) set.reminder_minutes = patch.reminderMinutes;
  if (patch.start !== undefined) {
    const s = parseEventTime(patch.start);
    set.start_at = s.at;
    set.all_day = s.dateOnly;
  }
  if (patch.end !== undefined) set.end_at = parseEventTime(patch.end).at;

  const [row] = await db
    .update(events)
    .set(set)
    .where(and(eq(events.id, eventId), eq(events.user_id, userId)))
    .returning();
  if (!row) throw new Error('일정을 찾을 수 없습니다.');
  return toEventResource(row);
}

export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  if (!isUuid(eventId)) return false;
  const deleted = await db
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.user_id, userId)))
    .returning({ id: events.id });
  return deleted.length > 0;
}
