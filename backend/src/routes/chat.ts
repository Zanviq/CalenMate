import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { supabaseAdmin } from '../services/supabase';
import { parseUserMessage } from '../services/gemini';
import { getCalendarClient } from '../services/google-calendar';
import { isInvalidGrantError, handleInvalidGrant } from '../services/google-auth';
import { invalidateSummaryCache } from './summary';
import {
  getTasksClient,
  createGoogleTask,
  updateGoogleTask,
  deleteGoogleTask,
  getTask as getGoogleTask,
} from '../services/google-tasks';
import { AIAction } from '../types';
import type { calendar_v3, tasks_v1 } from 'googleapis';

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

// Accept optional pre-fetched clients to avoid re-creating per action
async function executeAction(
  action: AIAction,
  userId: string,
  calendarClient?: calendar_v3.Calendar,
  tasksClient?: tasks_v1.Tasks,
) {
  // Helper to get calendar — reuses passed client or fetches once
  const getCalendar = async () => {
    if (calendarClient) return calendarClient;
    const { calendar } = await getCalendarClient(userId);
    return calendar;
  };

  const getTasksApi = async () => {
    if (tasksClient) return tasksClient;
    return getTasksClient(userId);
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
      // Fetch event details before deleting so we can show what was deleted
      let eventData: Record<string, unknown> = { id };
      try {
        const existing = await calendar.events.get({ calendarId: 'primary', eventId: id });
        eventData = { ...existing.data, _deleted: true };
      } catch { /* proceed with delete even if fetch fails */ }
      await calendar.events.delete({ calendarId: 'primary', eventId: id });
      return { type: 'event_deleted', data: eventData };
    }

    case 'create_reminder': {
      const { title, priority, due_date, notify, list_id, tags, checklist } = action.data as Record<string, unknown>;
      const listId = (list_id as string) || '@default';

      // Create in Google Tasks
      const googleTask = await createGoogleTask(userId, listId, {
        title: title as string,
        due: due_date as string | undefined,
      });

      // Store metadata in Supabase
      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .insert({
          user_id: userId,
          title,
          priority: priority || 'medium',
          due_date: due_date || null,
          notify: notify || false,
          is_completed: false,
          tags: Array.isArray(tags) ? tags : [],
          checklist: Array.isArray(checklist) ? checklist : [],
          google_task_id: googleTask.id,
          google_list_id: listId,
        })
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_created', data: reminder };
    }

    case 'update_reminder': {
      const { id, title, description, due_date, priority, notify, checklist, tags } = action.data as Record<string, unknown>;

      // Fetch existing for google_task_id
      const { data: existing } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      // Update Google Tasks
      if (existing?.google_task_id && existing?.google_list_id) {
        const googleUpdates: Record<string, unknown> = {};
        if (title !== undefined) googleUpdates.title = title;
        if (description !== undefined) googleUpdates.notes = description;
        if (due_date !== undefined) googleUpdates.due = due_date;
        if (Object.keys(googleUpdates).length > 0) {
          await updateGoogleTask(userId, existing.google_list_id, existing.google_task_id, googleUpdates as Record<string, string>);
        }
      }

      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateFields.title = title;
      if (description !== undefined) updateFields.description = description;
      if (due_date !== undefined) updateFields.due_date = due_date;
      if (priority !== undefined) updateFields.priority = priority;
      if (notify !== undefined) updateFields.notify = notify;
      if (checklist !== undefined) updateFields.checklist = checklist;
      if (tags !== undefined && Array.isArray(tags)) updateFields.tags = tags;

      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .update(updateFields)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_updated', data: reminder };
    }

    case 'set_reminder_status': {
      const { id, status } = action.data as Record<string, unknown>;
      const newStatus = status as 'not_started' | 'in_progress' | 'completed';
      const isCompleted = newStatus === 'completed';

      const { data: existing } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id, started_at, completed_at')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (existing?.google_task_id && existing?.google_list_id) {
        await updateGoogleTask(userId, existing.google_list_id, existing.google_task_id, {
          status: isCompleted ? 'completed' : 'needsAction',
        });
      }

      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: newStatus,
        is_completed: isCompleted,
        updated_at: nowIso,
      };
      if (newStatus === 'in_progress' && !existing?.started_at) update.started_at = nowIso;
      if (isCompleted) update.completed_at = existing?.completed_at ?? nowIso;
      else if (newStatus === 'not_started') {
        update.completed_at = null;
        update.started_at = null;
      }

      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .update(update)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_status_updated', data: reminder };
    }

    case 'link_reminder_event': {
      const {
        id,
        event_id,
        date,
        start_time,
        end_time,
        duration_minutes,
        auto_complete_on_event_end,
      } = action.data as Record<string, unknown>;

      const { data: existing } = await supabaseAdmin
        .from('reminders')
        .select('id, title, description')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (!existing) throw new Error('Reminder not found');

      let linkedEventId = event_id as string | undefined;

      if (!linkedEventId) {
        if (!date || !start_time) throw new Error('event_id 또는 date+start_time이 필요합니다');
        let resolvedEnd = end_time as string | undefined;
        if (!resolvedEnd) {
          const minutes = (duration_minutes as number) ?? 60;
          const [h, m] = (start_time as string).split(':').map(Number);
          const startMin = h * 60 + m;
          const endMin = Math.min(startMin + minutes, 24 * 60 - 1);
          const eh = Math.floor(endMin / 60);
          const em = endMin % 60;
          resolvedEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        }
        const calendar = await getCalendar();
        const created = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: existing.title,
            description: existing.description ?? undefined,
            start: { dateTime: `${date}T${start_time}:00`, timeZone: 'Asia/Seoul' },
            end: { dateTime: `${date}T${resolvedEnd}:00`, timeZone: 'Asia/Seoul' },
          },
        });
        linkedEventId = created.data.id ?? undefined;
      }

      if (!linkedEventId) throw new Error('Failed to obtain event id');

      const { data: reminder, error } = await supabaseAdmin
        .from('reminders')
        .update({
          linked_event_id: linkedEventId,
          auto_complete_on_event_end: (auto_complete_on_event_end as boolean) ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return { type: 'reminder_linked', data: reminder };
    }

    case 'delete_reminder': {
      const { id } = action.data as Record<string, string>;
      // Fetch reminder details before deleting
      let reminderData: Record<string, unknown> = { id };
      const { data: existing } = await supabaseAdmin
        .from('reminders')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (existing) {
        reminderData = { ...existing, _deleted: true };
        // Delete from Google Tasks
        if (existing.google_task_id && existing.google_list_id) {
          try {
            await deleteGoogleTask(userId, existing.google_list_id, existing.google_task_id);
          } catch { /* may already be deleted */ }
        }
      }
      await supabaseAdmin
        .from('reminders')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      return { type: 'reminder_deleted', data: reminderData };
    }

    case 'complete_reminder': {
      const { id } = action.data as Record<string, string>;

      // Fetch existing for google_task_id
      const { data: existing } = await supabaseAdmin
        .from('reminders')
        .select('google_task_id, google_list_id')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      // Update Google Tasks status
      if (existing?.google_task_id && existing?.google_list_id) {
        await updateGoogleTask(userId, existing.google_list_id, existing.google_task_id, {
          status: 'completed',
        });
      }

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
        // 1. Chat history (tiebreaker by role for stable ordering on equal timestamps)
        supabaseAdmin
          .from('chat_messages')
          .select('role, content')
          .eq('user_id', req.userId)
          .eq('context', context)
          .order('created_at', { ascending: false })
          .order('role', { ascending: true })
          .limit(40),

        // 2. User instructions
        supabaseAdmin
          .from('user_instructions')
          .select('id, content')
          .eq('user_id', req.userId)
          .order('created_at', { ascending: true }),

        // 3. Calendar events (with error handling)
        (async (): Promise<{ events: calendar_v3.Schema$Event[]; error: string | null; isAuthError?: boolean }> => {
          try {
            const { calendar } = await getCalendarClient(req.userId!);
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekLater = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
            const eventsResponse = await calendar.events.list({
              calendarId: 'primary',
              timeMin: startOfToday.toISOString(),
              timeMax: weekLater.toISOString(),
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: 50,
            });
            return { events: eventsResponse.data.items || [], error: null };
          } catch (err) {
            if (isInvalidGrantError(err)) {
              const msg = await handleInvalidGrant(req.userId!);
              return { events: [], error: msg, isAuthError: true };
            }
            // Don't leak raw provider error strings (e.g. raw "invalid_grant" tokens) to the AI/user
            console.error('Calendar fetch error in chat context:', err);
            return {
              events: [],
              error: 'Google Calendar 연결 실패',
            };
          }
        })(),

        // 4. Incomplete reminders (Supabase metadata with google_list_id)
        supabaseAdmin
          .from('reminders')
          .select('id, title, priority, due_date, is_completed, google_task_id, google_list_id')
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
    const isAuthError = !!(calendarResult as { isAuthError?: boolean }).isAuthError;

    // If Google auth is invalid, skip AI processing and return auth error directly
    if (isAuthError && calendarError) {
      const authErrorResponse = calendarError;
      const now = new Date();
      const { data: savedMessages } = await supabaseAdmin.from('chat_messages').insert([
        { user_id: req.userId, role: 'user', content: userMessage, context, metadata: {}, created_at: now.toISOString() },
        { user_id: req.userId, role: 'assistant', content: authErrorResponse, context, metadata: {}, created_at: new Date(now.getTime() + 1000).toISOString() },
      ]).select();

      const assistantMessage = savedMessages?.[1] ?? {
        id: crypto.randomUUID(),
        user_id: req.userId,
        role: 'assistant',
        content: authErrorResponse,
        context,
        metadata: {},
        created_at: new Date().toISOString(),
      };

      res.json({ response: authErrorResponse, actions: [], results: [], message: assistantMessage });
      return;
    }

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
      google_list_id: r.google_list_id || '@default',
    }));

    // Parse message with Gemini
    let aiResponse = await parseUserMessage({
      content: userMessage,
      context,
      existingEvents,
      existingReminders,
      chatHistory,
      userInstructions,
      calendarError,
    });

    // Handle query_events: fetch requested range, then re-call AI with full context
    const queryAction = aiResponse.actions.find((a) => a.type === 'query_events');
    if (queryAction) {
      try {
        const { timeMin, timeMax } = queryAction.data as { timeMin: string; timeMax: string };
        const { calendar } = await getCalendarClient(req.userId!);
        const eventsResponse = await calendar.events.list({
          calendarId: 'primary',
          timeMin: new Date(timeMin).toISOString(),
          timeMax: new Date(timeMax + 'T23:59:59').toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        });
        const queriedEvents = (eventsResponse.data.items || []).map((item) => {
          const start = item.start as { dateTime?: string; date?: string } | undefined;
          const end = item.end as { dateTime?: string; date?: string } | undefined;
          return {
            id: item.id,
            title: item.summary || '(제목 없음)',
            date: start?.dateTime?.slice(0, 10) || start?.date || '',
            start_time: start?.dateTime?.slice(11, 16) || '',
            end_time: end?.dateTime?.slice(11, 16) || '',
            allDay: !start?.dateTime,
            description: item.description || '',
          };
        });
        // Re-call with queried events so AI can generate actions (delete, update, etc.)
        aiResponse = await parseUserMessage({
          content: userMessage,
          context,
          existingEvents: queriedEvents,
          existingReminders,
          chatHistory,
          userInstructions,
          calendarError: null,
          eventsLabel: `${timeMin} ~ ${timeMax}`,
        });
        // Prevent recursive query_events
        aiResponse.actions = aiResponse.actions.filter((a) => a.type !== 'query_events');
      } catch (err) {
        aiResponse = {
          actions: [],
          response: `일정 조회 중 오류가 발생했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        };
      }
    }

    // If confirmation required, save actions as pending and return without executing
    if (aiResponse.requiresConfirmation && aiResponse.actions.length > 0) {
      const now = new Date();
      const { data: savedMessages } = await supabaseAdmin.from('chat_messages').insert([
        {
          user_id: req.userId,
          role: 'user',
          content: userMessage,
          context,
          metadata: {},
          created_at: now.toISOString(),
        },
        {
          user_id: req.userId,
          role: 'assistant',
          content: aiResponse.response,
          context,
          metadata: { pendingActions: aiResponse.actions, confirmationStatus: 'pending' },
          created_at: new Date(now.getTime() + 1000).toISOString(),
        },
      ]).select();

      const assistantMessage = savedMessages?.[1] ?? {
        id: crypto.randomUUID(),
        user_id: req.userId,
        role: 'assistant',
        content: aiResponse.response,
        context,
        metadata: { pendingActions: aiResponse.actions, confirmationStatus: 'pending' },
        created_at: new Date().toISOString(),
      };

      res.json({
        response: aiResponse.response,
        actions: [],
        results: [],
        pendingActions: aiResponse.actions,
        message: assistantMessage,
      });
      return;
    }

    // Pre-fetch calendar client once for all action executions
    let calendarClient: calendar_v3.Calendar | undefined;
    let tasksApiClient: tasks_v1.Tasks | undefined;
    const hasCalendarActions = aiResponse.actions.some(
      (a) => a.type === 'create_event' || a.type === 'update_event' || a.type === 'delete_event' || a.type === 'link_reminder_event'
    );
    const hasTaskActions = aiResponse.actions.some(
      (a) => ['create_reminder', 'update_reminder', 'delete_reminder', 'complete_reminder', 'set_reminder_status', 'link_reminder_event'].includes(a.type)
    );
    if (hasCalendarActions) {
      try {
        const { calendar } = await getCalendarClient(req.userId!);
        calendarClient = calendar;
      } catch (err) {
        // Falls back to per-action fetching; log so deterministic failures
        // (invalid_grant, quota) don't disappear silently.
        console.warn('[chat] Calendar pre-fetch failed, falling back per-action:', err);
      }
    }
    if (hasTaskActions) {
      try {
        tasksApiClient = await getTasksClient(req.userId!);
      } catch (err) {
        console.warn('[chat] Tasks pre-fetch failed, falling back per-action:', err);
      }
    }

    // Execute actions in parallel.
    // Distinct event/reminder IDs are independent; concurrent execution is safe.
    // invalid_grant is handled once after all results settle (same token error would repeat anyway).
    const INVALID_GRANT_MARKER = '__CALENMATE_INVALID_GRANT__';
    const actionResults = await Promise.all(
      aiResponse.actions.map(async (action) => {
        try {
          return await executeAction(action, req.userId!, calendarClient, tasksApiClient);
        } catch (err) {
          if (isInvalidGrantError(err)) {
            return {
              type: `${action.type}_error`,
              data: { error: INVALID_GRANT_MARKER },
            };
          }
          return {
            type: `${action.type}_error`,
            data: { error: err instanceof Error ? err.message : 'Action failed' },
          };
        }
      })
    );

    // Resolve invalid_grant once (token is shared across all actions)
    if (actionResults.some((r) => (r.data as Record<string, unknown>)?.error === INVALID_GRANT_MARKER)) {
      const msg = await handleInvalidGrant(req.userId!);
      for (const r of actionResults) {
        const data = r.data as Record<string, unknown> | null;
        if (data && data.error === INVALID_GRANT_MARKER) {
          data.error = msg;
        }
      }
    }

    // Invalidate summary cache only when at least one schedule-changing action actually succeeded.
    // This avoids paying for re-summarization (Gemini call) when all actions failed.
    const SUCCESS_TYPES = new Set([
      'event_created', 'event_updated', 'event_deleted',
      'reminder_created', 'reminder_updated', 'reminder_deleted', 'reminder_completed',
      'reminder_status_updated', 'reminder_linked',
    ]);
    const hasSuccessfulScheduleAction = actionResults.some((r) => SUCCESS_TYPES.has(r.type));
    if (hasSuccessfulScheduleAction) {
      invalidateSummaryCache(req.userId!);
    }

    // Save chat messages (explicit timestamps to guarantee ordering on reload)
    const now = new Date();
    const { data: savedMessages } = await supabaseAdmin.from('chat_messages').insert([
      {
        user_id: req.userId,
        role: 'user',
        content: userMessage,
        context,
        metadata: {},
        created_at: now.toISOString(),
      },
      {
        user_id: req.userId,
        role: 'assistant',
        content: aiResponse.response,
        context,
        metadata: { actions: aiResponse.actions, results: actionResults },
        created_at: new Date(now.getTime() + 1000).toISOString(),
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

// POST /execute - Execute confirmed pending actions (no AI re-call)
const executeSchema = z.object({
  actions: z.array(z.object({
    type: z.string(),
    data: z.record(z.string(), z.unknown()),
  })),
  messageId: z.string().uuid(),
});

router.post('/execute', validateBody(executeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { actions, messageId } = req.body as { actions: AIAction[]; messageId: string };

    // Pre-fetch clients
    let calendarClient: calendar_v3.Calendar | undefined;
    let tasksApiClient: tasks_v1.Tasks | undefined;
    const hasCalendarActions = actions.some(
      (a) => a.type === 'create_event' || a.type === 'update_event' || a.type === 'delete_event' || a.type === 'link_reminder_event'
    );
    const hasTaskActions = actions.some(
      (a) => ['create_reminder', 'update_reminder', 'delete_reminder', 'complete_reminder', 'set_reminder_status', 'link_reminder_event'].includes(a.type)
    );
    if (hasCalendarActions) {
      try {
        const { calendar } = await getCalendarClient(req.userId!);
        calendarClient = calendar;
      } catch (err) {
        console.warn('[chat/execute] Calendar pre-fetch failed, falling back per-action:', err);
      }
    }
    if (hasTaskActions) {
      try {
        tasksApiClient = await getTasksClient(req.userId!);
      } catch (err) {
        console.warn('[chat/execute] Tasks pre-fetch failed, falling back per-action:', err);
      }
    }

    // Execute all actions
    const actionResults = [];
    for (const action of actions) {
      try {
        const result = await executeAction(action as AIAction, req.userId!, calendarClient, tasksApiClient);
        actionResults.push(result);
      } catch (err) {
        actionResults.push({
          type: `${action.type}_error`,
          data: { error: err instanceof Error ? err.message : 'Action failed' },
        });
      }
    }

    // Update the original message metadata
    await supabaseAdmin
      .from('chat_messages')
      .update({
        metadata: {
          pendingActions: actions,
          confirmationStatus: 'confirmed',
          results: actionResults,
        },
      })
      .eq('id', messageId)
      .eq('user_id', req.userId);

    // Invalidate caches
    if (hasCalendarActions || hasTaskActions) {
      invalidateSummaryCache(req.userId!);
    }

    res.json({ results: actionResults });
  } catch (err) {
    console.error('Execute error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to execute actions' });
  }
});

// GET /history - Get chat history with pagination
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context, limit: limitStr, before } = req.query;
    const limit = Math.min(Number(limitStr) || 50, 100);

    // Order by created_at DESC, then role ASC as tiebreaker.
    // Tiebreaker matters because a single chat exchange can have user/assistant rows
    // with identical created_at if the DB column resolution drops sub-second precision.
    // 'assistant' < 'user' alphabetically → after JS reverse(), user appears before assistant.
    let query = supabaseAdmin
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .order('role', { ascending: true })
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
