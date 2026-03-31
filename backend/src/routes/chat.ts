import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabase';
import { parseUserMessage } from '../services/gemini';
import { getCalendarClient } from '../services/google-calendar';
import { AIAction } from '../types';

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

async function executeAction(action: AIAction, userId: string) {
  switch (action.type) {
    case 'create_event': {
      const { title, date, start_time, end_time, description, color, reminder_minutes } = action.data as Record<string, string>;
      const { calendar } = await getCalendarClient(userId);
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
      const { calendar } = await getCalendarClient(userId);
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
      const { calendar } = await getCalendarClient(userId);
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

// POST / - Send message to AI
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { content, message, context = 'home' } = req.body;
    const userMessage = content || message;

    if (!userMessage) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Fetch last 20 turns of chat history for context
    const { data: recentMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', req.userId)
      .eq('context', context)
      .order('created_at', { ascending: false })
      .limit(40); // 40 rows = 20 turns (user+assistant pairs)

    const chatHistory = (recentMessages || [])
      .reverse()
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

    // Fetch user instructions
    const { data: instructions } = await supabaseAdmin
      .from('user_instructions')
      .select('id, content')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: true });

    const userInstructions = (instructions || []) as { id: string; content: string }[];

    // Fetch existing events and reminders for context
    let existingEvents: Record<string, unknown>[] = [];
    let existingReminders: Record<string, unknown>[] = [];

    try {
      const { calendar } = await getCalendarClient(req.userId!);
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const eventsResponse = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });
      existingEvents = (eventsResponse.data.items || []) as Record<string, unknown>[];
    } catch {
      // Calendar may not be connected
    }

    const { data: reminders } = await supabaseAdmin
      .from('reminders')
      .select('*')
      .eq('user_id', req.userId)
      .eq('is_completed', false);
    existingReminders = (reminders || []) as Record<string, unknown>[];

    // Parse message with Gemini
    const aiResponse = await parseUserMessage({
      content: userMessage,
      context,
      existingEvents,
      existingReminders,
      chatHistory,
      userInstructions,
    });

    // Execute actions
    const actionResults = [];
    for (const action of aiResponse.actions) {
      try {
        const result = await executeAction(action, req.userId!);
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

// GET /history - Get chat history
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context } = req.query;

    let query = supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: true });

    if (context) {
      query = query.eq('context', context as string);
    }

    const { data: messages, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Failed to fetch chat history' });
      return;
    }

    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

export default router;
