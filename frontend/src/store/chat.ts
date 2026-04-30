import { create } from 'zustand';
import api from '@/lib/api';
import type { ChatMessage, AIAction } from '@/types';

type ChatContext = 'home' | 'calendar' | 'reminder';

interface ActionResult {
  type: string;
  data: Record<string, unknown>;
}

interface SendMessageResult {
  actions: AIAction[];
  results: ActionResult[];
  response: string;
}

interface HistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  total: number | null;
}

interface ChatState {
  /** Messages keyed by context — preserves history when switching */
  messagesByContext: Record<ChatContext, ChatMessage[]>;
  /** Whether older messages exist per context */
  hasMoreByContext: Record<ChatContext, boolean>;
  /** Loading state for pagination (loading older messages) */
  isLoadingMore: boolean;
  context: ChatContext;
  isLoading: boolean;
  error: string | null;
  calendarActionCount: number;
  reminderActionCount: number;
  instructionActionCount: number;
  setContext: (context: ChatContext) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  clearAllMessages: () => void;
  replaceMessages: (messages: ChatMessage[]) => void;
  sendMessage: (content: string) => Promise<SendMessageResult | null>;
  confirmActions: (messageId: string) => Promise<void>;
  cancelActions: (messageId: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
}

const HISTORY_PAGE_SIZE = 50;

// Single source of truth for which action types map to which downstream
// invalidation. link_reminder_event touches BOTH calendar and reminder data
// (creates a calendar event AND patches reminder.linked_event_id), so it's in
// both groups intentionally.
const CALENDAR_ACTION_TYPES = new Set<AIAction['type']>([
  'create_event',
  'update_event',
  'delete_event',
  'link_reminder_event',
]);

const REMINDER_ACTION_TYPES = new Set<AIAction['type']>([
  'create_reminder',
  'update_reminder',
  'delete_reminder',
  'complete_reminder',
  'set_reminder_status',
  'link_reminder_event',
]);

const INSTRUCTION_ACTION_TYPES = new Set<AIAction['type']>([
  'save_instruction',
  'delete_instruction',
]);

function detectActionFlags(actions: AIAction[]): {
  calendar: boolean;
  reminder: boolean;
  instruction: boolean;
} {
  let calendar = false;
  let reminder = false;
  let instruction = false;
  for (const a of actions) {
    if (CALENDAR_ACTION_TYPES.has(a.type)) calendar = true;
    if (REMINDER_ACTION_TYPES.has(a.type)) reminder = true;
    if (INSTRUCTION_ACTION_TYPES.has(a.type)) instruction = true;
  }
  return { calendar, reminder, instruction };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByContext: { home: [], calendar: [], reminder: [] },
  hasMoreByContext: { home: false, calendar: false, reminder: false },
  isLoadingMore: false,
  context: 'home',
  isLoading: false,
  error: null,
  calendarActionCount: 0,
  reminderActionCount: 0,
  instructionActionCount: 0,

  setContext: (context) => {
    const prev = get().context;
    if (prev === context) return;
    set({ context });
    // Load history only if the target context has no messages yet
    if (get().messagesByContext[context].length === 0) {
      get().loadHistory();
    }
  },

  addMessage: (message) =>
    set((state) => {
      const ctx = state.context;
      return {
        messagesByContext: {
          ...state.messagesByContext,
          [ctx]: [...state.messagesByContext[ctx], message],
        },
      };
    }),

  setMessages: (messages) =>
    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [state.context]: messages,
      },
    })),

  setLoading: (isLoading) => set({ isLoading }),

  clearMessages: () =>
    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [state.context]: [],
      },
      hasMoreByContext: {
        ...state.hasMoreByContext,
        [state.context]: false,
      },
    })),

  clearAllMessages: () =>
    set({
      messagesByContext: { home: [], calendar: [], reminder: [] },
      hasMoreByContext: { home: false, calendar: false, reminder: false },
    }),

  replaceMessages: (messages: ChatMessage[]) =>
    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [state.context]: messages,
      },
      hasMoreByContext: {
        ...state.hasMoreByContext,
        [state.context]: false,
      },
    })),

  sendMessage: async (content: string) => {
    const { context } = get();

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: '',
      role: 'user',
      content,
      context,
      metadata: {},
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [context]: [...state.messagesByContext[context], userMessage],
      },
      isLoading: true,
      error: null,
    }));

    try {
      const { data } = await api.post<{
        actions: AIAction[];
        response: string;
        results: { type: string; data: Record<string, unknown> }[];
        message: ChatMessage;
      }>('/api/chat', { content, context });

      const assistantMsg: ChatMessage = data.message ?? {
        id: crypto.randomUUID(),
        user_id: '',
        role: 'assistant',
        content: data.response,
        context,
        metadata: {},
        created_at: new Date().toISOString(),
      };

      const flags = detectActionFlags(data.actions);

      set((state) => ({
        messagesByContext: {
          ...state.messagesByContext,
          [context]: [...state.messagesByContext[context], assistantMsg],
        },
        isLoading: false,
        ...(flags.calendar && { calendarActionCount: state.calendarActionCount + 1 }),
        ...(flags.reminder && { reminderActionCount: state.reminderActionCount + 1 }),
        ...(flags.instruction && { instructionActionCount: state.instructionActionCount + 1 }),
      }));

      return { actions: data.actions, results: data.results || [], response: data.response };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }, status?: number }, message?: string };
      const errorMessage = axiosErr.response?.data?.error
        || axiosErr.message
        || 'Failed to send message';
      console.error('Chat error:', axiosErr.response?.status, axiosErr.response?.data);
      set({ isLoading: false, error: errorMessage });
      return null;
    }
  },

  confirmActions: async (messageId: string) => {
    const { context } = get();
    const messages = get().messagesByContext[context];
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    const pendingActions = msg.metadata?.pendingActions as AIAction[] | undefined;
    if (!pendingActions?.length) return;

    // Patch the message's metadata with the supplied keys. Deletes are signalled
    // by setting a key to `undefined` so the renderer's `pendingActions` check
    // returns false on subsequent renders.
    const patchMetadata = (updates: Record<string, unknown>) => {
      set((state) => ({
        messagesByContext: {
          ...state.messagesByContext,
          [context]: state.messagesByContext[context].map((m) => {
            if (m.id !== messageId) return m;
            const nextMeta: Record<string, unknown> = { ...m.metadata, ...updates };
            for (const k of Object.keys(updates)) {
              if (updates[k] === undefined) delete nextMeta[k];
            }
            return { ...m, metadata: nextMeta };
          }),
        },
      }));
    };

    patchMetadata({ confirmationStatus: 'executing' });

    try {
      const { data } = await api.post<{
        results: { type: string; data: Record<string, unknown> }[];
      }>('/api/chat/execute', { actions: pendingActions, messageId });

      // Drop pendingActions optimistically so the UI immediately stops showing
      // the confirmation flow shell and the next render goes through the
      // ActionBadges branch (which also surfaces the "확인됨" indicator).
      patchMetadata({
        confirmationStatus: 'confirmed',
        results: data.results,
        pendingActions: undefined,
      });

      // Increment action counters
      const flags = detectActionFlags(pendingActions);

      set((state) => ({
        ...(flags.calendar && { calendarActionCount: state.calendarActionCount + 1 }),
        ...(flags.reminder && { reminderActionCount: state.reminderActionCount + 1 }),
        ...(flags.instruction && { instructionActionCount: state.instructionActionCount + 1 }),
      }));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      patchMetadata({
        confirmationStatus: 'error',
        confirmationError: axiosErr.response?.data?.error || axiosErr.message || '실행 실패',
        // Keep pendingActions on error so the user can see what was supposed
        // to happen; the renderer treats 'error' as terminal anyway.
      });
    }
  },

  cancelActions: async (messageId: string) => {
    const { context } = get();
    // Snapshot for rollback if persistence fails.
    const previous = get().messagesByContext[context];
    const target = previous.find((m) => m.id === messageId);
    if (!target) return;

    // Optimistically clear pendingActions and stamp 'cancelled'. Same shape as
    // what the backend writes, so reload yields identical state.
    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [context]: previous.map((m) => {
          if (m.id !== messageId) return m;
          const nextMeta: Record<string, unknown> = {
            ...m.metadata,
            confirmationStatus: 'cancelled',
          };
          delete nextMeta.pendingActions;
          return { ...m, metadata: nextMeta };
        }),
      },
    }));

    // Await persistence; revert if it fails so the user can retry.
    try {
      await api.post('/api/chat/cancel', { messageId });
    } catch (err) {
      console.error('Failed to persist cancel:', err);
      set((state) => ({
        messagesByContext: { ...state.messagesByContext, [context]: previous },
        error: '취소를 저장하지 못했습니다. 다시 시도해주세요.',
      }));
    }
  },

  loadHistory: async () => {
    const requestContext = get().context;

    try {
      const { data } = await api.get<HistoryResponse>('/api/chat/history', {
        params: { context: requestContext, limit: HISTORY_PAGE_SIZE },
      });
      if (get().context === requestContext) {
        set((state) => ({
          messagesByContext: {
            ...state.messagesByContext,
            [requestContext]: data.messages,
          },
          hasMoreByContext: {
            ...state.hasMoreByContext,
            [requestContext]: data.hasMore,
          },
        }));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load chat history';
      set({ error: errorMessage });
    }
  },

  loadOlderMessages: async () => {
    const requestContext = get().context;
    const currentMessages = get().messagesByContext[requestContext];

    if (!get().hasMoreByContext[requestContext] || get().isLoadingMore || currentMessages.length === 0) {
      return;
    }

    set({ isLoadingMore: true });

    try {
      const oldestMessage = currentMessages[0];
      const { data } = await api.get<HistoryResponse>('/api/chat/history', {
        params: {
          context: requestContext,
          limit: HISTORY_PAGE_SIZE,
          before: oldestMessage.created_at,
        },
      });

      if (get().context === requestContext) {
        set((state) => ({
          messagesByContext: {
            ...state.messagesByContext,
            [requestContext]: [...data.messages, ...state.messagesByContext[requestContext]],
          },
          hasMoreByContext: {
            ...state.hasMoreByContext,
            [requestContext]: data.hasMore,
          },
          isLoadingMore: false,
        }));
      } else {
        set({ isLoadingMore: false });
      }
    } catch {
      set({ isLoadingMore: false });
    }
  },
}));
