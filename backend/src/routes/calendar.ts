import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type EventResource,
} from '../services/events';
import { invalidateSummaryCache } from './summary';

const router = Router();

router.use(authMiddleware);

const createEventSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다'),
  start: z.string().min(1, '시작 시간은 필수입니다'),
  end: z.string().min(1, '종료 시간은 필수입니다'),
  description: z.string().optional(),
  color: z.string().optional(),
});

const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
});

function toCalendarEvent(item: EventResource) {
  const allDay = !item.start.dateTime;
  return {
    id: item.id,
    title: item.summary || '(제목 없음)',
    description: item.description ?? undefined,
    start: item.start.dateTime ?? item.start.date ?? '',
    end: item.end.dateTime ?? item.end.date ?? '',
    color: item.colorId ?? undefined,
    allDay,
  };
}

function parseQueryDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// GET /events - List events
router.get('/events', async (req: AuthRequest, res: Response) => {
  try {
    const items = await listEvents(req.userId!, {
      timeMin: parseQueryDate(req.query.timeMin),
      timeMax: parseQueryDate(req.query.timeMax),
    });
    res.json(items.map(toCalendarEvent));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch events';
    res.status(500).json({ error: message });
  }
});

// POST /events - Create event
router.post('/events', validateBody(createEventSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { title, start, end, description, color } = req.body;
    const event = await createEvent(req.userId!, { title, start, end, description, color });

    invalidateSummaryCache(req.userId!);
    res.status(201).json(toCalendarEvent(event));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create event';
    res.status(500).json({ error: message });
  }
});

// PUT /events/:id - Update event
router.put('/events/:id', validateBody(updateEventSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, start, end, description, color } = req.body;

    const event = await updateEvent(req.userId!, id, {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(start && { start }),
      ...(end && { end }),
      ...(color && { color }),
    });

    invalidateSummaryCache(req.userId!);
    res.json(toCalendarEvent(event));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update event';
    res.status(500).json({ error: message });
  }
});

// DELETE /events/:id - Delete event
router.delete('/events/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await deleteEvent(req.userId!, id);
    if (!deleted) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    invalidateSummaryCache(req.userId!);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete event';
    res.status(500).json({ error: message });
  }
});

export default router;
