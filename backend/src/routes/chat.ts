import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';
import { parseUserMessage } from '../services/gemini';
import { getCalendarClient } from '../services/google-calendar';
import { AIAction } from '../types';
import type { calendar_v3 } from 'googleapis';

const router = Router();

router.use(authMiddleware);

const COLOR_NAME_TO_ID: Record<string, string> = {
  lavender: '1',
  sage: '2',
  grape: '3',
  flamingo: '4',
  banana: '5',
  tangerine: '6',
  peacock: '7',
  graphite: '8',
  blueberry: '9',
  basil: '10',
  tomato: '11',
};

function colorNameToId(color: string): string | undefined {
  if (/^\d+$/.test(color)) return color;
  return COLOR_NAME_TO_ID[color.toLowerCase()] || undefined;
}

// Accept an optional pre-fetched calendar client to avoid re-creating per action
async function executeAction(
  action: AIAction,
  userId: string,
  calendarClient?: calendar_v3.Calendar,
) {
  // Helper to get calendar — reuses passed client or fetches once
  const getCalendar = async () => {
    if (calendarClient) return calendarClient;
    const { calendar } = await getCalendarClient(userId);
    return calendar;
  };

  switch (action.type) {
    case 'create_event': {
      const { title, date, start_time, end_time, description, color, reminder_minutes } = action.data as Record<string, string>;
      const calendar = await getCalendar();
      const colorId = color ? colorNameToId(color) : colorNameToId('peacock');
      const result = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description,
          start: {
            dateTime: `${date}T${start_time}:00`,
            timeZone: 'Asia/Seoul',
          },
          end: {
            dateTime: `${date}T${end_time}:00`,
            timeZone: 'Asia/Seoul',
          },
          ...(colorId && { colorId }),
          ...(reminder_minutes && {
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: Number(reminder_minutes) }],
            },
          }),
        },
      });
      return { type: 'event_created', data: result.data };
    }

    case 'update_event': {
      const { id, title, date, start_time, end_time, description, color, reminder_minutes } = action.data as Record<string, string>;
      const calendar = await getCalendar();
      const colorId = color ? colorNameToId(color) : undefined;
      const result = await calendar.events.patch({
        calendarId: 'primary',
        eventId: id,
        requestBody: {
          ...(title && { summary: title }),
          ...(description !== undefined && { description }),
          ...(date && start_time && {
            start: { dateTime: `${date}T${start_time}:00`, timeZone: 'Asia/Seoul' },
          }),
          ...(date && end_time && {
            end: { dateTime: `${date}T${end_time}:00`, timeZone: 'Asia/Seoul' },
          }),
          ...(colorId && { colorId }),
          ...(reminder_minutes && {
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: Number(reminder_minutes) }],
            },
          }),
        },
      });
      return { type: 'event_updated', data: result.data };
    }

    case 'delete_event': {
      const { id } = action.data as Record<string, string>;
      const calendar = await getCalendar();
      await calendar.events.delete({ calendarId: 'primary', eventId: id });
      return { type: 'event_deleted', data: { id } };
    }

    case 'create_reminder': {
      const { title, priority, due_date, notify } = action.data as Record<string, unknown>;
      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .insert({
          user_id: userId,
          title,
          priority: priority || 'medium',
          due_date: due_date || null,
          notify: notify || false,
          is_completed: false,
        })
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_created', data: reminder };
    }

    case 'update_reminder': {
      const { id, ...updateData } = action.data as Record<string, unknown>;
      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_updated', data: reminder };
    }

    case 'delete_reminder': {
      const { id } = action.data as Record<string, string>;
      await supabaseAdmin
        .from('reminders')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { type: 'reminder_deleted', data: { id } };
    }

    case 'complete_reminder': {
      const { id } = action.data as Record<string, string>;
      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .update({ is_completed: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_completed', data: reminder };
    }

    case 'save_instruction': {
      const { content } = action.data as Record<string, string>;
      const { data: instruction, error } = await supabaseAdmin
        .from('user_instructions')
        .insert({ user_id: userId, content })
        .select()
        .single();
      if (error) throw error;
      return { type: 'instruction_saved', data: instruction };
    }

    case 'delete_instruction': {
      const { id } = action.data as Record<string, string>;
      await supabaseAdmin
        .from('user_instructions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { type: 'instruction_deleted', data: { id } };
    }

    default:
      return { type: 'unknown', data: null };
  }
}

const chatMessageSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  message: z.string().min(1).max(5000).optional(),
  context: z.enum(['home', 'calendar', 'reminder']).default('home'),
}).refine((data) => data.content || data.message, {
  message: 'Message is required (content or message field)',
});

// POST / - Send message to AI
router.post('/', validateBody(chatMessageSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { content, message, context = 'home' } = req.body;
    const userMessage = content || message;

    // Fetch all context data in parallel for maximum speed
    const [chatHistoryResult, instructionsResult, calendarResult, remindersResult] =
      await Promise.all([
        // 1. Chat history
        supabaseAdmin
          .from('chat_messages')
          .select('role, content')
          .eq('user_id', req.userId)
          .eq('context', context)
          .order('created_at', { ascending: false })
          .limit(20), // 20 messages (not 40 — we only need recent context)

        // 2. User instructions
        supabaseAdmin
          .from('user_instructions')
          .select('id, content')
          .eq('user_id', req.userId)
          .order('created_at', { ascending: true }),

        // 3. Calendar events (with error handling)
        (async (): Promise<{ events: calendar_v3.Schema$Event[]; error: string | null }> => {
          try {
            const { calendar } = await getCalendarClient(req.userId!);
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const monthLater = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);
            const eventsResponse = await calendar.events.list({
              calendarId: 'primary',
              timeMin: startOfToday.toISOString(),
              timeMax: monthLater.toISOString(),
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: 50,
            });
            return { events: eventsResponse.data.items || [], error: null };
          } catch (err) {
            return {
              events: [],
              error: err instanceof Error ? err.message : 'Google Calendar 연결 실패',
            };
          }
        })(),

        // 4. Incomplete reminders
        supabaseAdmin
          .from('reminders')
          .select('id, title, priority, due_date, is_completed')
          .eq('user_id', req.userId)
          .eq('is_completed', false),
      ]);

    // Log any Supabase query errors (gracefully degrade with empty data)
    if (chatHistoryResult.error) console.error('Chat history fetch error:', chatHistoryResult.error);
    if (instructionsResult.error) console.error('Instructions fetch error:', instructionsResult.error);
    if (remindersResult.error) console.error('Reminders fetch error:', remindersResult.error);

    const chatHistory = (chatHistoryResult.data || [])
      .reverse()
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

    const userInstructions = (instructionsResult.data || []) as { id: string; content: string }[];

    const calendarError = calendarResult.error;
    const existingEvents = calendarResult.events.map((item) => {
      const start = item.start as { dateTime?: string; date?: string } | undefined;
      const end = item.end as { dateTime?: string; date?: string } | undefined;
      return {
        id: item.id,
        title: item.summary || '(제목 없음)',
        date: start?.dateTime?.slice(0, 10) || start?.date || '',
        start_time: start?.dateTime?.slice(11, 16) || '',
        end_time: end?.dateTime?.slice(11, 16) || '',
        allDay: !start?.dateTime,
        colorId: item.colorId || '',
        description: item.description || '',
      };
    });

    const existingReminders = (remindersResult.data || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      due_date: r.due_date,
      is_completed: r.is_completed,
    }));

    // Parse message with Gemini
    const aiResponse = await parseUserMessage({
      content: userMessage,
      context,
      existingEvents,
      existingReminders,
      chatHistory,
      userInstructions,
      calendarError,
    });

    // Pre-fetch calendar client once for all action executions
    let calendarClient: calendar_v3.Calendar | undefined;
    const hasCalendarActions = aiResponse.actions.some(
      (a) => a.type === 'create_event' || a.type === 'update_event' || a.type === 'delete_event'
    );
    if (hasCalendarActions) {
      try {
        const { calendar } = await getCalendarClient(req.userId!);
        calendarClient = calendar;
      } catch {
        // Will fall back to per-action fetching
      }
    }

    // Execute actions
    const actionResults = [];
    for (const action of aiResponse.actions) {
      try {
        const result = await executeAction(action, req.userId!, calendarClient);
        actionResults.push(result);
      } catch (err) {
        actionResults.push({
          type: `${action.type}_error`,
          data: { error: err instanceof Error ? err.message : 'Action failed' },
        });
      }
    }

    // Save chat messages
    const { data: savedMessages } = await supabaseAdmin.from('chat_messages').insert([
      {
        user_id: req.userId,
        role: 'user',
        content: userMessage,
        context,
        metadata: {},
      },
      {
        user_id: req.userId,
        role: 'assistant',
        content: aiResponse.response,
        context,
        metadata: { actions: aiResponse.actions, results: actionResults },
      },
    ]).select();

    const assistantMessage = savedMessages?.[1] ?? {
      id: crypto.randomUUID(),
      user_id: req.userId,
      role: 'assistant',
      content: aiResponse.response,
      context,
      metadata: { actions: aiResponse.actions, results: actionResults },
      created_at: new Date().toISOString(),
    };

    res.json({
      response: aiResponse.response,
      actions: aiResponse.actions,
      results: actionResults,
      message: assistantMessage,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process message' });
  }
});

// GET /history - Get chat history with pagination
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context, limit: limitStr, before } = req.query;
    const limit = Math.min(Number(limitStr) || 50, 100);

    let query = supabaseAdmin
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (context) {
      query = query.eq('context', context as string);
    }

    // Cursor-based pagination: fetch messages before a given timestamp
    if (before) {
      query = query.lt('created_at', before as string);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to fetch chat history' });
      return;
    }

    // Reverse to chronological order for the client
    const sorted = (messages || []).reverse();

    res.json({
      messages: sorted,
      hasMore: (messages?.length || 0) === limit,
      total: count,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// DELETE /history - Clear chat history for a context
router.delete('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context } = req.query;

    let query = supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('user_id', req.userId);

    if (context) {
      query = query.eq('context', context as string);
    }

    const { error } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to clear chat history' });
      return;
    }

    res.json({ message: 'Chat history cleared' });
  } catch {
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

export default router;
