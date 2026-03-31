import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { getCalendarClient } from '../services/google-calendar';
import { summarizeSchedule } from '../services/gemini';

const router = Router();

router.use(authMiddleware);

// GET /today - Get today's schedule summary
router.get('/today', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Fetch today's events
    let events: Record<string, unknown>[] = [];
    try {
      const { calendar } = await getCalendarClient(req.userId!);
      const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      events = (eventsResponse.data.items || []) as Record<string, unknown>[];
    } catch {
      // Calendar may not be connected
    }

    // Fetch today's reminders
    const todayStr = startOfDay.toISOString().split('T')[0];
    const { data: reminders } = await supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('user_id', req.userId)
      .eq('is_completed', false)
      .lte('due_date', todayStr);

    const summary = await summarizeSchedule(
      events,
      (reminders || []) as Record<string, unknown>[],
      'today'
    );

    res.json({ summary, events, reminders: reminders || [] });
  } catch {
    res.status(500).json({ error: 'Failed to generate today summary' });
  }
});

// GET /week - Get this week's schedule summary
router.get('/week', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch week's events
    let events: Record<string, unknown>[] = [];
    try {
      const { calendar } = await getCalendarClient(req.userId!);
      const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfWeek.toISOString(),
        timeMax: endOfWeek.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      events = (eventsResponse.data.items || []) as Record<string, unknown>[];
    } catch {
      // Calendar may not be connected
    }

    // Fetch week's reminders
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];
    const { data: reminders } = await supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('user_id', req.userId)
      .eq('is_completed', false)
      .lte('due_date', endOfWeekStr);

    const summary = await summarizeSchedule(
      events,
      (reminders || []) as Record<string, unknown>[],
      'week'
    );

    res.json({ summary, events, reminders: reminders || [] });
  } catch {
    res.status(500).json({ error: 'Failed to generate week summary' });
  }
});

export default router;
