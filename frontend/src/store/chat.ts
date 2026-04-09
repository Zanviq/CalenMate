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
  cancelActions: (messageId: string) => void;
  loadHistory: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
}

const HISTORY_PAGE_SIZE = 50;

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

      const hasCalendarAction = data.actions.some((a: AIAction) =>
        a.type === 'create_event' || a.type === 'update_event' || a.type === 'delete_event'
      );
      const hasReminderAction = data.actions.some((a: AIAction) =>
        a.type === 'create_reminder' || a.type === 'update_reminder' || a.type === 'delete_reminder' || a.type === 'complete_reminder'
      );
      const hasInstructionAction = data.actions.some((a: AIAction) =>
        a.type === 'save_instruction' || a.type === 'delete_instruction'
      );

      set((state) => ({
        messagesByContext: {
          ...state.messagesByContext,
          [context]: [...state.messagesByContext[context], assistantMsg],
        },
        isLoading: false,
        ...(hasCalendarAction && { calendarActionCount: state.calendarActionCount + 1 }),
        ...(hasReminderAction && { reminderActionCount: state.reminderActionCount + 1 }),
        ...(hasInstructionAction && { instructionActionCount: state.instructionActionCount + 1 }),
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

    // Update UI to show loading state
    const updateMessage = (updates: Record<string, unknown>) => {
      set((state) => ({
        messagesByContext: {
          ...state.messagesByContext,
          [context]: state.messagesByContext[context].map((m) =>
            m.id === messageId
              ? { ...m, metadata: { ...m.metadata, ...updates } }
              : m
          ),
        },
      }));
    };

    updateMessage({ confirmationStatus: 'executing' });

    try {
      const { data } = await api.post<{
        results: { type: string; data: Record<string, unknown> }[];
      }>('/api/chat/execute', { actions: pendingActions, messageId });

      updateMessage({
        confirmationStatus: 'confirmed',
        results: data.results,
      });

      // Increment action counters
      const hasCalendarAction = pendingActions.some((a) =>
        a.type === 'create_event' || a.type === 'update_event' || a.type === 'delete_event'
      );
      const hasReminderAction = pendingActions.some((a) =>
        a.type === 'create_reminder' || a.type === 'update_reminder' || a.type === 'delete_reminder' || a.type === 'complete_reminder'
      );
      const hasInstructionAction = pendingActions.some((a) =>
        a.type === 'save_instruction' || a.type === 'delete_instruction'
      );

      set((state) => ({
        ...(hasCalendarAction && { calendarActionCount: state.calendarActionCount + 1 }),
        ...(hasReminderAction && { reminderActionCount: state.reminderActionCount + 1 }),
        ...(hasInstructionAction && { instructionActionCount: state.instructionActionCount + 1 }),
      }));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      updateMessage({
        confirmationStatus: 'error',
        confirmationError: axiosErr.response?.data?.error || axiosErr.message || '실행 실패',
      });
    }
  },

  cancelActions: (messageId: string) => {
    const { context } = get();
    set((state) => ({
      messagesByContext: {
        ...state.messagesByContext,
        [context]: state.messagesByContext[context].map((m) =>
          m.id === messageId
            ? { ...m, metadata: { ...m.metadata, confirmationStatus: 'cancelled' } }
            : m
        ),
      },
    }));
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
