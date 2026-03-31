import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { getCalendarClient } from '../services/google-calendar';

const router = Router();

router.use(authMiddleware);

interface GoogleCalendarEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  colorId?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}

function toCalendarEvent(item: GoogleCalendarEvent) {
  const allDay = !item.start?.dateTime;
  return {
    id: item.id ?? '',
    title: item.summary ?? '(제목 없음)',
    description: item.description ?? undefined,
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    color: item.colorId ?? undefined,
    allDay,
  };
}

// GET /events - List events
router.get('/events', async (req: AuthRequest, res: Response) => {
  try {
    const { timeMin, timeMax } = req.query;

    const { calendar } = await getCalendarClient(req.userId!);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin as string,
      timeMax: timeMax as string,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (response.data.items || []).map(toCalendarEvent);
    res.json(events);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch events';
    res.status(500).json({ error: message });
  }
});

// POST /events - Create event
router.post('/events', async (req: AuthRequest, res: Response) => {
  try {
    const { title, start, end, description, color } = req.body;

    const { calendar } = await getCalendarClient(req.userId!);

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: {
          dateTime: start,
          timeZone: 'Asia/Seoul',
        },
        end: {
          dateTime: end,
          timeZone: 'Asia/Seoul',
        },
        ...(color && { colorId: color }),
      },
    });

    res.status(201).json(toCalendarEvent(event.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create event';
    res.status(500).json({ error: message });
  }
});

// PUT /events/:id - Update event
router.put('/events/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, start, end, description, color } = req.body;

    const { calendar } = await getCalendarClient(req.userId!);

    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: id,
      requestBody: {
        ...(title && { summary: title }),
        ...(description !== undefined && { description }),
        ...(start && {
          start: {
            dateTime: start,
            timeZone: 'Asia/Seoul',
          },
        }),
        ...(end && {
          end: {
            dateTime: end,
            timeZone: 'Asia/Seoul',
          },
        }),
        ...(color && { colorId: color }),
      },
    });

    res.json(toCalendarEvent(response.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update event';
    res.status(500).json({ error: message });
  }
});

// DELETE /events/:id - Delete event
router.delete('/events/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;

    const { calendar } = await getCalendarClient(req.userId!);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: id,
    });

    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete event';
    res.status(500).json({ error: message });
  }
});

export default router;
