import api from '@/lib/api';
import type { ChatMessage } from '@/types';

interface CommandResult {
  /** System message to display in chat */
  message: ChatMessage;
  /** Side effects to trigger */
  effects?: {
    clearMessages?: boolean;
    refreshInstructions?: boolean;
  };
}

interface CommandDefinition {
  name: string;
  description: string;
  execute: (context: string) => Promise<CommandResult>;
}

function systemMessage(content: string, context: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    user_id: '',
    role: 'assistant',
    content,
    context: context as ChatMessage['context'],
    metadata: { isCommand: true },
    created_at: new Date().toISOString(),
  };
}

export const commands: CommandDefinition[] = [
  {
    name: 'help',
    description: '사용 가능한 명령어 목록',
    execute: async (context) => {
      const lines = commands.map((c) => `  /${c.name} — ${c.description}`);
      return {
        message: systemMessage(
          `사용 가능한 명령어:\n${lines.join('\n')}`,
          context,
        ),
      };
    },
  },
  {
    name: 'instructions',
    description: '주요 지시사항 보기',
    execute: async (context) => {
      try {
        const { data } = await api.get<{ id: string; content: string }[]>(
          '/api/instructions',
        );
        if (data.length === 0) {
          return {
            message: systemMessage(
              '저장된 주요 지시사항이 없습니다.\nAI 채팅에서 "주요 지시사항에 저장해줘"라고 말하거나 홈 페이지에서 추가할 수 있습니다.',
              context,
            ),
          };
        }
        const list = data
          .map((inst, i) => `${i + 1}. ${inst.content}`)
          .join('\n');
        return {
          message: systemMessage(`주요 지시사항:\n${list}`, context),
        };
      } catch {
        return {
          message: systemMessage(
            '지시사항을 불러오는 데 실패했습니다.',
            context,
          ),
        };
      }
    },
  },
  {
    name: 'reset_memory',
    description: '현재 대화 세션의 기억 초기화',
    execute: async (context) => {
      try {
        await api.delete('/api/chat/history', {
          params: { context },
        });
        return {
          message: systemMessage(
            '대화 기억이 초기화되었습니다. AI는 이전 대화를 기억하지 않습니다.',
            context,
          ),
          effects: { clearMessages: true },
        };
      } catch {
        return {
          message: systemMessage(
            '대화 기억 초기화에 실패했습니다.',
            context,
          ),
        };
      }
    },
  },
  {
    name: 'reset_all',
    description: '모든 컨텍스트의 대화 기억 초기화',
    execute: async (context) => {
      try {
        await api.delete('/api/chat/history');
        return {
          message: systemMessage(
            '모든 대화 기억이 초기화되었습니다.',
            context,
          ),
          effects: { clearMessages: true },
        };
      } catch {
        return {
          message: systemMessage(
            '대화 기억 초기화에 실패했습니다.',
            context,
          ),
        };
      }
    },
  },
  {
    name: 'today',
    description: '오늘 일정 빠르게 보기',
    execute: async (context) => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        const { data } = await api.get<
          { title: string; start: string; end: string; allDay?: boolean }[]
        >('/api/calendar/events', {
          params: {
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
          },
        });
        if (data.length === 0) {
          return {
            message: systemMessage('오늘 등록된 일정이 없습니다.', context),
          };
        }
        const lines = data.map((e) => {
          if (e.allDay) return `  • ${e.title} (종일)`;
          const s = new Date(e.start).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const en = new Date(e.end).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          return `  • ${s}~${en}  ${e.title}`;
        });
        return {
          message: systemMessage(
            `오늘의 일정 (${data.length}건):\n${lines.join('\n')}`,
            context,
          ),
        };
      } catch {
        return {
          message: systemMessage(
            '일정을 불러오는 데 실패했습니다.',
            context,
          ),
        };
      }
    },
  },
  {
    name: 'reminders',
    description: '진행 중인 리마인더 목록 보기',
    execute: async (context) => {
      try {
        const { data } = await api.get<
          { title: string; priority: string; due_date: string | null; is_completed: boolean }[]
        >('/api/reminders', { params: { status: 'active' } });
        if (data.length === 0) {
          return {
            message: systemMessage('진행 중인 리마인더가 없습니다.', context),
          };
        }
        const priorityLabel: Record<string, string> = { high: '🔴', medium: '🟡', low: '🔵' };
        const lines = data.map((r) => {
          const pri = priorityLabel[r.priority] || '⚪';
          const due = r.due_date
            ? ` (${new Date(r.due_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })})`
            : '';
          return `  ${pri} ${r.title}${due}`;
        });
        return {
          message: systemMessage(
            `진행 중인 리마인더 (${data.length}건):\n${lines.join('\n')}`,
            context,
          ),
        };
      } catch {
        return {
          message: systemMessage('리마인더를 불러오는 데 실패했습니다.', context),
        };
      }
    },
  },
  {
    name: 'clear',
    description: '현재 채팅 기록 삭제',
    execute: async (context) => {
      try {
        await api.delete('/api/chat/history', {
          params: { context },
        });
        return {
          message: systemMessage('채팅 기록이 삭제되었습니다.', context),
          effects: { clearMessages: true },
        };
      } catch {
        return {
          message: systemMessage('채팅 기록 삭제에 실패했습니다.', context),
        };
      }
    },
  },
];

/**
 * Check if input is a slash command and execute it.
 * Returns null if input is not a command.
 */
export async function executeCommand(
  input: string,
  context: string,
): Promise<CommandResult | null> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const commandName = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  const command = commands.find((c) => c.name === commandName);

  if (!command) {
    return {
      message: systemMessage(
        `알 수 없는 명령어: /${commandName}\n/help 를 입력하여 사용 가능한 명령어를 확인하세요.`,
        context,
      ),
    };
  }

  return command.execute(context);
}
