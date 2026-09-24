import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { reminders } from '../db/schema';
import { listEvents } from '../services/events';
import { summarizeSchedule, GeminiUnavailableError } from '../services/gemini';

const router = Router();

router.use(authMiddleware);

// In-memory cache for summaries per user+period
interface CachedSummary {
  summary: string;
  events: Record<string, unknown>[];
  reminders: Record<string, unknown>[];
  expiresAt: number;
}

const summaryCache = new Map<string, CachedSummary>();
const SUMMARY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (Gemini calls are expensive)

export function invalidateSummaryCache(userId: string) {
  summaryCache.delete(`${userId}:today`);
  summaryCache.delete(`${userId}:week`);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of summaryCache) {
    if (now >= entry.expiresAt) {
      summaryCache.delete(key);
    }
  }
}, 60_000).unref();

// GET /today - Get today's schedule summary
router.get('/today', async (req: AuthRequest, res: Response) => {
  try {
    const cacheKey = `${req.userId}:today`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.json({ summary: cached.summary, events: cached.events, reminders: cached.reminders });
      return;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Fetch events and reminders in parallel
    const [eventsResult, remindersResult] = await Promise.all([
      (async () => {
        try {
          const items = await listEvents(req.userId!, { timeMin: startOfDay, timeMax: endOfDay });
          return items as unknown as Record<string, unknown>[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        // Pull all incomplete reminders (regardless of due_date — including null
        // and future) so the summarizer has the full ToDo backlog. The summarizer
        // is responsible for prioritizing today-relevant items.
        const rows = await db
          .select({
            id: reminders.id,
            title: reminders.title,
            description: reminders.description,
            priority: reminders.priority,
            due_date: reminders.due_date,
            status: reminders.status,
            is_completed: reminders.is_completed,
            started_at: reminders.started_at,
            completed_at: reminders.completed_at,
            linked_event_id: reminders.linked_event_id,
            tags: reminders.tags,
            checklist: reminders.checklist,
            color: reminders.color,
          })
          .from(reminders)
          .where(and(eq(reminders.user_id, req.userId!), eq(reminders.is_completed, false)))
          .orderBy(sql`${reminders.due_date} asc nulls last`)
          .limit(100);
        return rows as Record<string, unknown>[];
      })(),
    ]);

    let summary: string;
    try {
      summary = await summarizeSchedule(eventsResult, remindersResult, 'today');
    } catch (err) {
      // Show the friendly Korean message in the summary card so the user
      // understands what's going on instead of seeing an empty fallback.
      if (err instanceof GeminiUnavailableError) {
        res.json({ summary: err.userMessage, events: eventsResult, reminders: remindersResult });
        return;
      }
      throw err;
    }

    // Cache the result
    summaryCache.set(cacheKey, {
      summary,
      events: eventsResult,
      reminders: remindersResult,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    res.json({ summary, events: eventsResult, reminders: remindersResult });
  } catch (err) {
    console.error('summary/today failed:', err);
    res.status(500).json({ error: 'Failed to generate today summary' });
  }
});

// GET /week - Get this week's schedule summary
router.get('/week', async (req: AuthRequest, res: Response) => {
  try {
    const cacheKey = `${req.userId}:week`;
    const cached = summaryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.json({ summary: cached.summary, events: cached.events, reminders: cached.reminders });
      return;
    }

    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch events and reminders in parallel
    const [eventsResult, remindersResult] = await Promise.all([
      (async () => {
        try {
          const items = await listEvents(req.userId!, { timeMin: startOfWeek, timeMax: endOfWeek });
          return items as unknown as Record<string, unknown>[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        // Same as /today — fetch the full incomplete backlog. due_date filtering
        // here would silently drop NULL-due ToDos and any item due past the week,
        // which is exactly what the user reported as "todo의 일정을 가져오지 못함".
        const rows = await db
          .select({
            id: reminders.id,
            title: reminders.title,
            description: reminders.description,
            priority: reminders.priority,
            due_date: reminders.due_date,
            status: reminders.status,
            is_completed: reminders.is_completed,
            started_at: reminders.started_at,
            completed_at: reminders.completed_at,
            linked_event_id: reminders.linked_event_id,
            tags: reminders.tags,
            checklist: reminders.checklist,
            color: reminders.color,
          })
          .from(reminders)
          .where(and(eq(reminders.user_id, req.userId!), eq(reminders.is_completed, false)))
          .orderBy(sql`${reminders.due_date} asc nulls last`)
          .limit(100);
        return rows as Record<string, unknown>[];
      })(),
    ]);

    let summary: string;
    try {
      summary = await summarizeSchedule(eventsResult, remindersResult, 'week');
    } catch (err) {
      if (err instanceof GeminiUnavailableError) {
        res.json({ summary: err.userMessage, events: eventsResult, reminders: remindersResult });
        return;
      }
      throw err;
    }

    // Cache the result
    summaryCache.set(cacheKey, {
      summary,
      events: eventsResult,
      reminders: remindersResult,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    res.json({ summary, events: eventsResult, reminders: remindersResult });
  } catch (err) {
    console.error('summary/week failed:', err);
    res.status(500).json({ error: 'Failed to generate week summary' });
  }
});

export default router;
