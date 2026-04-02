import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { getCalendarClient } from '../services/google-calendar';
import { summarizeSchedule } from '../services/gemini';

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
          const { calendar } = await getCalendarClient(req.userId!);
          const eventsResponse = await calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });
          return (eventsResponse.data.items || []) as Record<string, unknown>[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        const todayStr = startOfDay.toISOString().split('T')[0];
        const { data: reminders } = await supabaseAdmin
          .from('reminders')
          .select('*')
          .eq('user_id', req.userId)
          .eq('is_completed', false)
          .lte('due_date', todayStr);
        return (reminders || []) as Record<string, unknown>[];
      })(),
    ]);

    const summary = await summarizeSchedule(eventsResult, remindersResult, 'today');

    // Cache the result
    summaryCache.set(cacheKey, {
      summary,
      events: eventsResult,
      reminders: remindersResult,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    res.json({ summary, events: eventsResult, reminders: remindersResult });
  } catch {
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
          const { calendar } = await getCalendarClient(req.userId!);
          const eventsResponse = await calendar.events.list({
            calendarId: 'primary',
            timeMin: startOfWeek.toISOString(),
            timeMax: endOfWeek.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });
          return (eventsResponse.data.items || []) as Record<string, unknown>[];
        } catch {
          return [];
        }
      })(),
      (async () => {
        const endOfWeekStr = endOfWeek.toISOString().split('T')[0];
        const { data: reminders } = await supabaseAdmin
          .from('reminders')
          .select('*')
          .eq('user_id', req.userId)
          .eq('is_completed', false)
          .lte('due_date', endOfWeekStr);
        return (reminders || []) as Record<string, unknown>[];
      })(),
    ]);

    const summary = await summarizeSchedule(eventsResult, remindersResult, 'week');

    // Cache the result
    summaryCache.set(cacheKey, {
      summary,
      events: eventsResult,
      reminders: remindersResult,
      expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    });

    res.json({ summary, events: eventsResult, reminders: remindersResult });
  } catch {
    res.status(500).json({ error: 'Failed to generate week summary' });
  }
});

export default router;
