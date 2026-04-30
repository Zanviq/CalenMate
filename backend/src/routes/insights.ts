import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';

const router = Router();

router.use(authMiddleware);

interface TimelineItem {
  reminder_id: string;
  title: string;
  color: string | null;
  minutes: number;
  tags: string[];
}

interface TimelineDay {
  date: string; // YYYY-MM-DD
  total_minutes: number;
  items: TimelineItem[];
}

// GET /timeline?from=YYYY-MM-DD&to=YYYY-MM-DD
// Aggregates time spent per day from reminders' started_at/completed_at and
// any focus session logs (todo_time_log). Both signals are populated by the
// app itself — F1 auto-transition fills the reminder timestamps from linked
// calendar events, manual status cycling fills them from user clicks, and
// focus sessions log explicit blocks.
router.get('/timeline', async (req: AuthRequest, res: Response) => {
  try {
    const fromStr = (req.query.from as string | undefined)?.slice(0, 10);
    const toStr = (req.query.to as string | undefined)?.slice(0, 10);

    const today = new Date();
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 7);

    const fromIso = fromStr ? `${fromStr}T00:00:00.000Z` : defaultFrom.toISOString();
    const toIso = toStr ? `${toStr}T23:59:59.999Z` : today.toISOString();

    // Pull both signals in parallel.
    const [reminderRes, logRes] = await Promise.all([
      supabaseAdmin
        .from('reminders')
        .select('id, title, color, started_at, completed_at, tags')
        .eq('user_id', req.userId)
        .not('started_at', 'is', null)
        .not('completed_at', 'is', null)
        .gte('started_at', fromIso)
        .lte('started_at', toIso),
      supabaseAdmin
        .from('todo_time_log')
        .select('reminder_id, started_at, ended_at')
        .eq('user_id', req.userId)
        .not('ended_at', 'is', null)
        .gte('started_at', fromIso)
        .lte('started_at', toIso)
        // Tolerate missing table on databases that haven't migrated yet.
        .then((r) => r, () => ({ data: [], error: null })),
    ]);

    if (reminderRes.error) {
      res.status(500).json({ error: 'Failed to fetch timeline' });
      return;
    }

    const buckets = new Map<string, TimelineDay>();
    const ensureBucket = (date: string): TimelineDay => {
      let b = buckets.get(date);
      if (!b) {
        b = { date, total_minutes: 0, items: [] };
        buckets.set(date, b);
      }
      return b;
    };

    // Reminder-derived signal: status transition timestamps.
    for (const row of reminderRes.data ?? []) {
      if (!row.started_at || !row.completed_at) continue;
      const start = new Date(row.started_at);
      const end = new Date(row.completed_at);
      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      if (minutes <= 0) continue;
      const date = start.toISOString().slice(0, 10);
      const bucket = ensureBucket(date);
      bucket.total_minutes += minutes;
      bucket.items.push({
        reminder_id: row.id,
        title: row.title,
        color: row.color,
        minutes,
        tags: (row.tags ?? []) as string[],
      });
    }

    // Focus-session signal: enrich/augment the same buckets when logs exist.
    // We resolve each log's reminder context via a small lookup so the chart
    // can attribute the time to the right ToDo even when started_at on the
    // reminder itself was never recomputed.
    const logRows = (logRes as { data?: Array<{ reminder_id: string; started_at: string; ended_at: string | null }> })?.data ?? [];
    if (logRows.length > 0) {
      const reminderIds = [...new Set(logRows.map((l) => l.reminder_id))];
      const { data: extraReminders } = await supabaseAdmin
        .from('reminders')
        .select('id, title, color, tags')
        .eq('user_id', req.userId)
        .in('id', reminderIds);
      const lookup = new Map<string, { id: string; title: string; color: string | null; tags: string[] }>();
      for (const r of extraReminders ?? []) {
        lookup.set(r.id, { id: r.id, title: r.title, color: r.color, tags: (r.tags ?? []) as string[] });
      }
      for (const log of logRows) {
        if (!log.ended_at) continue;
        const start = new Date(log.started_at);
        const end = new Date(log.ended_at);
        const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
        if (minutes <= 0) continue;
        const meta = lookup.get(log.reminder_id);
        if (!meta) continue;
        const date = start.toISOString().slice(0, 10);
        const bucket = ensureBucket(date);
        bucket.total_minutes += minutes;
        bucket.items.push({
          reminder_id: meta.id,
          title: meta.title,
          color: meta.color,
          minutes,
          tags: meta.tags,
        });
      }
    }

    const result = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
    res.json(result);
  } catch (err) {
    console.error('Failed to compute timeline:', err);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

export default router;
