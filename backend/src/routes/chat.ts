import { Router, Response } from 'express';
import { z } from 'zod';
import { and, asc, count, desc, eq, gte, lt, or, type SQL } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import { authMiddleware } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { db } from '../db';
import { chatMessages, reminders, userInstructions } from '../db/schema';
import { parseUserMessage } from '../services/gemini';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  type EventResource,
} from '../services/events';
import {
  createReminder,
  updateReminder,
  setReminderStatus,
  deleteReminder,
  linkReminderEvent,
} from '../services/reminders';
import { isUuid } from '../services/events';
import { invalidateSummaryCache } from './summary';
import { AIAction, ChecklistItem } from '../types';

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
      const colorId = color ? colorNameToId(color) : colorNameToId('peacock');
      const result = await createEvent(userId, {
        title,
        description,
        start: `${date}T${start_time}:00`,
        end: `${date}T${end_time}:00`,
        color: colorId,
        reminderMinutes: reminder_minutes ? Number(reminder_minutes) : null,
      });
      return { type: 'event_created', data: result };
    }

    case 'update_event': {
      const { id, title, date, start_time, end_time, description, color, reminder_minutes } = action.data as Record<string, string>;
      const colorId = color ? colorNameToId(color) : undefined;
      const result = await updateEvent(userId, id, {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(date && start_time && { start: `${date}T${start_time}:00` }),
        ...(date && end_time && { end: `${date}T${end_time}:00` }),
        ...(colorId && { color: colorId }),
        ...(reminder_minutes && { reminderMinutes: Number(reminder_minutes) }),
      });
      return { type: 'event_updated', data: result };
    }

    case 'delete_event': {
      const { id } = action.data as Record<string, string>;
      // Fetch event details before deleting so we can show what was deleted
      const existing = await getEvent(userId, id);
      const deleted = await deleteEvent(userId, id);
      if (!deleted) throw new Error('일정을 찾을 수 없습니다.');
      return { type: 'event_deleted', data: { ...(existing ?? { id }), _deleted: true } };
    }

    case 'create_reminder': {
      const { title, priority, due_date, notify, list_id, tags, checklist } = action.data as Record<string, unknown>;
      const reminder = await createReminder(userId, {
        title: title as string,
        priority: (priority as 'low' | 'medium' | 'high') || 'medium',
        due_date: due_date as string | undefined,
        notify: (notify as boolean) || false,
        list_id: list_id as string | undefined,
        tags: Array.isArray(tags) ? (tags as string[]) : [],
        checklist: Array.isArray(checklist) ? (checklist as ChecklistItem[]) : [],
      });
      return { type: 'reminder_created', data: reminder };
    }

    case 'update_reminder': {
      const { id, title, description, due_date, priority, notify, checklist, tags } = action.data as Record<string, unknown>;
      const reminder = await updateReminder(userId, id as string, {
        ...(title !== undefined && { title: title as string }),
        ...(description !== undefined && { description: description as string | null }),
        ...(due_date !== undefined && { due_date: due_date as string | null }),
        ...(priority !== undefined && { priority: priority as 'low' | 'medium' | 'high' }),
        ...(notify !== undefined && { notify: notify as boolean }),
        ...(checklist !== undefined && { checklist: checklist as ChecklistItem[] }),
        ...(tags !== undefined && Array.isArray(tags) && { tags: tags as string[] }),
      });
      if (!reminder) throw new Error('Reminder not found');
      return { type: 'reminder_updated', data: reminder };
    }

    case 'set_reminder_status': {
      const { id, status } = action.data as Record<string, unknown>;
      const reminder = await setReminderStatus(
        userId,
        id as string,
        status as 'not_started' | 'in_progress' | 'completed',
      );
      if (!reminder) throw new Error('Reminder not found');
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
      const reminder = await linkReminderEvent(userId, id as string, {
        event_id: event_id as string | undefined,
        date: date as string | undefined,
        start_time: start_time as string | undefined,
        end_time: end_time as string | undefined,
        duration_minutes: duration_minutes as number | undefined,
        auto_complete_on_event_end: auto_complete_on_event_end as boolean | undefined,
      });
      return { type: 'reminder_linked', data: reminder };
    }

    case 'delete_reminder': {
      const { id } = action.data as Record<string, string>;
      // Return the deleted row so the UI can show what was removed
      const deleted = await deleteReminder(userId, id);
      return { type: 'reminder_deleted', data: deleted ? { ...deleted, _deleted: true } : { id } };
    }

    case 'complete_reminder': {
      const { id } = action.data as Record<string, string>;
      const reminder = await setReminderStatus(userId, id, 'completed');
      if (!reminder) throw new Error('Reminder not found');
      return { type: 'reminder_completed', data: reminder };
    }

    case 'save_instruction': {
      const { content } = action.data as Record<string, string>;
      const [instruction] = await db
        .insert(userInstructions)
        .values({ user_id: userId, content })
        .returning();
      return { type: 'instruction_saved', data: instruction };
    }

    case 'delete_instruction': {
      const { id } = action.data as Record<string, string>;
      if (isUuid(id)) {
        await db
          .delete(userInstructions)
          .where(and(eq(userInstructions.id, id), eq(userInstructions.user_id, userId)));
      }
      return { type: 'instruction_deleted', data: { id } };
    }

    default:
      return { type: 'unknown', data: null };
  }
}

// Compact event shape for the AI prompt.
function toPromptEvent(item: EventResource) {
  return {
    id: item.id,
    title: item.summary || '(제목 없음)',
    date: item.start.dateTime?.slice(0, 10) || item.start.date || '',
    start_time: item.start.dateTime?.slice(11, 16) || '',
    end_time: item.end.dateTime?.slice(11, 16) || '',
    allDay: !item.start.dateTime,
    colorId: item.colorId || '',
    description: item.description || '',
  };
}

// Insert the user message + assistant reply as a pair (explicit timestamps
// keep the ordering stable on reload) and return the saved assistant row.
async function saveExchange(
  userId: string,
  context: 'home' | 'calendar' | 'reminder',
  userMessage: string,
  assistantContent: string,
  assistantMetadata: Record<string, unknown>,
) {
  const now = new Date();
  const saved = await db
    .insert(chatMessages)
    .values([
      { user_id: userId, role: 'user', content: userMessage, context, metadata: {}, created_at: now },
      {
        user_id: userId,
        role: 'assistant',
        content: assistantContent,
        context,
        metadata: assistantMetadata,
        created_at: new Date(now.getTime() + 1000),
      },
    ])
    .returning();
  return saved.find((m) => m.role === 'assistant');
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
    const userId = req.userId!;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Fetch all context data in parallel for maximum speed
    const [chatHistoryRows, userInstructionRows, calendarResult, reminderRows] =
      await Promise.all([
        // 1. Chat history — fetch globally (no context filter) so the AI has
        //    cross-tab memory. The UI continues to filter by context via GET /history.
        //    Tiebreaker by role for stable ordering on equal timestamps.
        db
          .select({ role: chatMessages.role, content: chatMessages.content, context: chatMessages.context })
          .from(chatMessages)
          .where(eq(chatMessages.user_id, userId))
          .orderBy(desc(chatMessages.created_at), asc(chatMessages.role))
          .limit(40)
          .catch((err) => {
            console.error('Chat history fetch error:', err);
            return [];
          }),

        // 2. User instructions
        db
          .select({ id: userInstructions.id, content: userInstructions.content })
          .from(userInstructions)
          .where(eq(userInstructions.user_id, userId))
          .orderBy(asc(userInstructions.created_at))
          .catch((err) => {
            console.error('Instructions fetch error:', err);
            return [];
          }),

        // 3. Calendar events for today ~ +7 days
        (async (): Promise<{ events: EventResource[]; error: string | null }> => {
          try {
            const events = await listEvents(userId, { timeMin: startOfToday, timeMax: weekLater, limit: 50 });
            return { events, error: null };
          } catch (err) {
            console.error('Calendar fetch error in chat context:', err);
            return { events: [], error: '캘린더 조회 실패' };
          }
        })(),

        // 4. Reminders (full state) — include both incomplete and recently-completed
        //    (last 14 days) so the AI can answer "어제 완료한 일?" or reference
        //    just-completed items conversationally. Order by recency; cap to keep
        //    the prompt within sensible token budget.
        db
          .select()
          .from(reminders)
          .where(and(
            eq(reminders.user_id, userId),
            or(eq(reminders.is_completed, false), gte(reminders.completed_at, twoWeeksAgo)),
          ))
          .orderBy(desc(reminders.updated_at))
          .limit(150)
          .catch((err) => {
            console.error('Reminders fetch error:', err);
            return [];
          }),
      ]);

    // Tag cross-context messages so the AI knows which tab a memory came from.
    // Current-context messages stay untagged for cleanliness.
    const chatHistory = [...chatHistoryRows]
      .reverse()
      .map((m) => ({
        role: m.role,
        content: m.context && m.context !== context ? `[${m.context}] ${m.content}` : m.content,
      }));

    const calendarError = calendarResult.error;
    const existingEvents = calendarResult.events.map(toPromptEvent);

    // Map reminders into a compact AI-readable shape. Includes status/tags/checklist
    // progress/linked_event so the AI can reason about state without per-question lookups.
    const existingReminders = reminderRows.map((r) => {
      const checklist = Array.isArray(r.checklist) ? r.checklist : [];
      const checklistDone = checklist.filter((c) => c.done).length;
      return {
        id: r.id,
        title: r.title,
        description: r.description ?? null,
        priority: r.priority,
        status: r.status ?? (r.is_completed ? 'completed' : 'not_started'),
        is_completed: r.is_completed,
        due_date: r.due_date,
        started_at: r.started_at ?? null,
        completed_at: r.completed_at ?? null,
        linked_event_id: r.linked_event_id ?? null,
        auto_complete_on_event_end: r.auto_complete_on_event_end ?? false,
        tags: Array.isArray(r.tags) ? r.tags : [],
        checklist_progress: checklist.length > 0 ? `${checklistDone}/${checklist.length}` : null,
        notify: r.notify ?? false,
        notify_at: r.notify_at ?? null,
        color: r.color ?? null,
        list_id: r.list_id,
      };
    });

    // Parse message with Gemini
    let aiResponse = await parseUserMessage({
      content: userMessage,
      context,
      existingEvents,
      existingReminders,
      chatHistory,
      userInstructions: userInstructionRows,
      calendarError,
    });

    // Handle query_events: fetch requested range, then re-call AI with full context
    const queryAction = aiResponse.actions.find((a) => a.type === 'query_events');
    if (queryAction) {
      try {
        const { timeMin, timeMax } = queryAction.data as { timeMin: string; timeMax: string };
        const queried = await listEvents(userId, {
          timeMin: new Date(timeMin),
          timeMax: new Date(timeMax + 'T23:59:59'),
          limit: 100,
        });
        const queriedEvents = queried.map((item) => {
          const { colorId: _colorId, ...rest } = toPromptEvent(item);
          void _colorId;
          return rest;
        });
        // Re-call with queried events so AI can generate actions (delete, update, etc.)
        aiResponse = await parseUserMessage({
          content: userMessage,
          context,
          existingEvents: queriedEvents,
          existingReminders,
          chatHistory,
          userInstructions: userInstructionRows,
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
      const metadata = { pendingActions: aiResponse.actions, confirmationStatus: 'pending' };
      const assistantMessage = await saveExchange(userId, context, userMessage, aiResponse.response, metadata);

      res.json({
        response: aiResponse.response,
        actions: [],
        results: [],
        pendingActions: aiResponse.actions,
        message: assistantMessage,
      });
      return;
    }

    // Execute actions in parallel.
    // Distinct event/reminder IDs are independent; concurrent execution is safe.
    const actionResults = await Promise.all(
      aiResponse.actions.map(async (action) => {
        try {
          return await executeAction(action, userId);
        } catch (err) {
          return {
            type: `${action.type}_error`,
            data: { error: err instanceof Error ? err.message : 'Action failed' },
          };
        }
      })
    );

    // Invalidate summary cache only when at least one schedule-changing action actually succeeded.
    // This avoids paying for re-summarization (Gemini call) when all actions failed.
    const SUCCESS_TYPES = new Set([
      'event_created', 'event_updated', 'event_deleted',
      'reminder_created', 'reminder_updated', 'reminder_deleted', 'reminder_completed',
      'reminder_status_updated', 'reminder_linked',
    ]);
    const hasSuccessfulScheduleAction = actionResults.some((r) => SUCCESS_TYPES.has(r.type));
    if (hasSuccessfulScheduleAction) {
      invalidateSummaryCache(userId);
    }

    const assistantMessage = await saveExchange(userId, context, userMessage, aiResponse.response, {
      actions: aiResponse.actions,
      results: actionResults,
    });

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

    // Execute all actions
    const actionResults = [];
    for (const action of actions) {
      try {
        const result = await executeAction(action as AIAction, req.userId!);
        actionResults.push(result);
      } catch (err) {
        actionResults.push({
          type: `${action.type}_error`,
          data: { error: err instanceof Error ? err.message : 'Action failed' },
        });
      }
    }

    // Update the original message metadata. We deliberately DROP pendingActions
    // here so the UI knows the confirmation flow has terminated — leaving them
    // in caused the "buttons reappear on reload" bug because the renderer fell
    // through to the pending-state branch when status detection got out of sync.
    await db
      .update(chatMessages)
      .set({
        metadata: {
          confirmationStatus: 'confirmed',
          results: actionResults,
        },
      })
      .where(and(eq(chatMessages.id, messageId), eq(chatMessages.user_id, req.userId!)));

    // Invalidate caches
    if (actions.length > 0) {
      invalidateSummaryCache(req.userId!);
    }

    res.json({ results: actionResults });
  } catch (err) {
    console.error('Execute error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to execute actions' });
  }
});

// POST /cancel - Persist cancellation of pending actions on a message.
// Without this the cancellation lives only in client state and re-appears on
// reload — confusing UX. The endpoint marks confirmationStatus='cancelled' so
// the UI consistently hides the confirm/cancel buttons next time.
const cancelSchema = z.object({
  messageId: z.string().uuid(),
});

router.post('/cancel', validateBody(cancelSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.body as { messageId: string };
    const ownMessage = and(eq(chatMessages.id, messageId), eq(chatMessages.user_id, req.userId!));

    const [existing] = await db
      .select({ metadata: chatMessages.metadata })
      .from(chatMessages)
      .where(ownMessage)
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Strip pendingActions on cancel for the same reason as /execute — once
    // the user has acted, the UI must not see "pending" pending actions on
    // reload or it'll reflash the confirm buttons.
    const existingMeta = existing.metadata ?? {};
    const { pendingActions: _pendingActions, ...rest } = existingMeta;
    void _pendingActions;

    await db
      .update(chatMessages)
      .set({ metadata: { ...rest, confirmationStatus: 'cancelled' } })
      .where(ownMessage);

    res.json({ message: 'Cancelled' });
  } catch {
    res.status(500).json({ error: 'Failed to cancel actions' });
  }
});

// GET /history - Get chat history with pagination
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context, limit: limitStr, before } = req.query;
    const limit = Math.min(Number(limitStr) || 50, 100);

    const conditions: SQL[] = [eq(chatMessages.user_id, req.userId!)];
    if (context) {
      conditions.push(eq(chatMessages.context, context as 'home' | 'calendar' | 'reminder'));
    }
    // Cursor-based pagination: fetch messages before a given timestamp
    if (before) {
      const beforeDate = new Date(before as string);
      if (!Number.isNaN(beforeDate.getTime())) conditions.push(lt(chatMessages.created_at, beforeDate));
    }
    const where = and(...conditions);

    // Order by created_at DESC, then role ASC as tiebreaker.
    // 'assistant' < 'user' alphabetically → after JS reverse(), user appears before assistant.
    const [messages, [{ total }]] = await Promise.all([
      db
        .select()
        .from(chatMessages)
        .where(where)
        .orderBy(desc(chatMessages.created_at), asc(chatMessages.role))
        .limit(limit),
      db.select({ total: count() }).from(chatMessages).where(where),
    ]);

    // Reverse to chronological order for the client
    const sorted = [...messages].reverse();

    res.json({
      messages: sorted,
      hasMore: messages.length === limit,
      total,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// DELETE /history - Clear chat history for a context
router.delete('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { context } = req.query;

    const conditions: SQL[] = [eq(chatMessages.user_id, req.userId!)];
    if (context) {
      conditions.push(eq(chatMessages.context, context as 'home' | 'calendar' | 'reminder'));
    }

    await db.delete(chatMessages).where(and(...conditions));

    res.json({ message: 'Chat history cleared' });
  } catch {
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

export default router;
