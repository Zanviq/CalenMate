'use client';

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import {
  Send,
  Bot,
  User,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  ListChecks,
  BookOpen,
  Terminal,
  ChevronDown,
  Clock,
  Palette,
  Bell,
  FileText,
  Flag,
  CalendarDays,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/chat';
import { commands, executeCommand } from '@/lib/chat-commands';
import type { ChatMessage } from '@/types';

const contextLabels: Record<string, string> = {
  home: 'Home',
  calendar: 'Calendar',
  reminder: 'Reminder',
};

const ACTION_LABELS: Record<string, { label: string; icon: typeof Calendar }> = {
  event_created: { label: '일정 추가됨', icon: Calendar },
  event_updated: { label: '일정 수정됨', icon: Calendar },
  event_deleted: { label: '일정 삭제됨', icon: Calendar },
  reminder_created: { label: '리마인더 추가됨', icon: ListChecks },
  reminder_updated: { label: '리마인더 수정됨', icon: ListChecks },
  reminder_deleted: { label: '리마인더 삭제됨', icon: ListChecks },
  reminder_completed: { label: '리마인더 완료됨', icon: ListChecks },
  instruction_saved: { label: '지시사항 저장됨', icon: BookOpen },
  instruction_deleted: { label: '지시사항 삭제됨', icon: BookOpen },
};

const COLOR_ID_TO_NAME: Record<string, { label: string; hex: string }> = {
  '1': { label: 'Lavender', hex: '#7986cb' },
  '2': { label: 'Sage', hex: '#33b679' },
  '3': { label: 'Grape', hex: '#8e24aa' },
  '4': { label: 'Flamingo', hex: '#e67c73' },
  '5': { label: 'Banana', hex: '#f6bf26' },
  '6': { label: 'Tangerine', hex: '#f4511e' },
  '7': { label: 'Peacock', hex: '#039be5' },
  '8': { label: 'Graphite', hex: '#616161' },
  '9': { label: 'Blueberry', hex: '#3f51b5' },
  '10': { label: 'Basil', hex: '#0b8043' },
  '11': { label: 'Tomato', hex: '#d50000' },
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: '낮음', color: 'text-blue-500' },
  medium: { label: '보통', color: 'text-yellow-500' },
  high: { label: '높음', color: 'text-red-500' },
};

function formatDateTime(dateTimeStr: string | undefined): string {
  if (!dateTimeStr) return '';
  try {
    const d = new Date(dateTimeStr);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return dateTimeStr;
  }
}

function formatDateOnly(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
      <span className="text-zinc-400">{label}:</span>
      <span className="text-zinc-700 dark:text-zinc-200">{value}</span>
    </div>
  );
}

function EventDetails({ data }: { data: Record<string, unknown> }) {
  const summary = data.summary as string | undefined;
  const description = data.description as string | undefined;
  const start = data.start as { dateTime?: string; date?: string } | undefined;
  const end = data.end as { dateTime?: string; date?: string } | undefined;
  const colorId = data.colorId as string | undefined;
  const reminders = data.reminders as { useDefault?: boolean; overrides?: { method: string; minutes: number }[] } | undefined;

  const isAllDay = !start?.dateTime;
  const colorInfo = colorId ? COLOR_ID_TO_NAME[colorId] : null;

  const hasReminder = reminders && !reminders.useDefault && reminders.overrides && reminders.overrides.length > 0;

  return (
    <div className="mt-1 flex flex-col gap-1 text-[11px]">
      {summary && <DetailRow icon={Calendar} label="제목" value={summary} />}
      {isAllDay && start?.date && (
        <DetailRow icon={CalendarDays} label="날짜" value={`${formatDateOnly(start.date)} (종일)`} />
      )}
      {!isAllDay && start?.dateTime && (
        <DetailRow icon={Clock} label="시작" value={formatDateTime(start.dateTime)} />
      )}
      {!isAllDay && end?.dateTime && (
        <DetailRow icon={Clock} label="종료" value={formatDateTime(end.dateTime)} />
      )}
      {colorInfo && (
        <div className="flex items-center gap-1.5">
          <Palette className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
          <span className="text-zinc-400">색상:</span>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorInfo.hex }} />
          <span className="text-zinc-700 dark:text-zinc-200">{colorInfo.label}</span>
        </div>
      )}
      {hasReminder && (
        <DetailRow
          icon={Bell}
          label="알림"
          value={reminders.overrides!.map((o) => `${o.minutes}분 전`).join(', ')}
        />
      )}
      {!hasReminder && reminders?.useDefault !== false && (
        <DetailRow icon={Bell} label="알림" value="기본 알림" />
      )}
      {!hasReminder && reminders?.useDefault === false && (
        <DetailRow icon={Bell} label="알림" value="없음" />
      )}
      {description && <DetailRow icon={FileText} label="설명" value={description} />}
    </div>
  );
}

function ReminderDetails({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string | undefined;
  const priority = data.priority as string | undefined;
  const dueDate = data.due_date as string | undefined;
  const notify = data.notify as boolean | undefined;
  const isCompleted = data.is_completed as boolean | undefined;
  const description = data.description as string | undefined;

  const priorityInfo = priority ? PRIORITY_LABELS[priority] : null;

  return (
    <div className="mt-1 flex flex-col gap-1 text-[11px]">
      {title && <DetailRow icon={ListChecks} label="제목" value={title} />}
      {priorityInfo && (
        <div className="flex items-center gap-1.5">
          <Flag className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
          <span className="text-zinc-400">우선순위:</span>
          <span className={priorityInfo.color}>{priorityInfo.label}</span>
        </div>
      )}
      {dueDate && <DetailRow icon={CalendarDays} label="기한" value={formatDateOnly(dueDate)} />}
      {notify !== undefined && <DetailRow icon={Bell} label="알림" value={notify ? '켜짐' : '꺼짐'} />}
      {isCompleted !== undefined && <DetailRow icon={CheckCircle2} label="완료" value={isCompleted ? '완료됨' : '미완료'} />}
      {description && <DetailRow icon={FileText} label="설명" value={description} />}
    </div>
  );
}

function InstructionDetails({ data }: { data: Record<string, unknown> }) {
  const content = data.content as string | undefined;
  return (
    <div className="mt-1 flex flex-col gap-1 text-[11px]">
      {content && <DetailRow icon={BookOpen} label="내용" value={content} />}
    </div>
  );
}

function ActionDetail({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (type.startsWith('event_')) return <EventDetails data={data} />;
  if (type.startsWith('reminder_')) return <ReminderDetails data={data} />;
  if (type.startsWith('instruction_')) return <InstructionDetails data={data} />;
  return null;
}

function ActionBadgeItem({ result }: { result: { type: string; data: Record<string, unknown> } }) {
  const [expanded, setExpanded] = useState(false);
  const isError = result.type.endsWith('_error');
  const info = ACTION_LABELS[result.type];

  if (isError) {
    const errorMsg = String(result.data?.error || '알 수 없는 오류');
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-400">
        <XCircle className="h-3 w-3 shrink-0" />
        <span>실패: {errorMsg}</span>
      </div>
    );
  }

  if (!info) return null;

  const Icon = info.icon;
  const hasDetails = result.data && Object.keys(result.data).length > 1;

  return (
    <div className="overflow-hidden rounded-md bg-green-100 dark:bg-green-950">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-green-700 dark:text-green-400 ${hasDetails ? 'cursor-pointer hover:bg-green-200 dark:hover:bg-green-900' : 'cursor-default'}`}
      >
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <Icon className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left">{info.label}</span>
        {hasDetails && (
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>
      {expanded && hasDetails && (
        <div className="border-t border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-900 dark:bg-green-950/50">
          <ActionDetail type={result.type} data={result.data} />
        </div>
      )}
    </div>
  );
}

const ActionBadges = memo(function ActionBadges({ metadata }: { metadata: Record<string, unknown> }) {
  const results = metadata?.results as
    | { type: string; data: Record<string, unknown> }[]
    | undefined;
  if (!results || results.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {results.map((r, i) => (
        <ActionBadgeItem key={i} result={r} />
      ))}
    </div>
  );
});

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const isCommand = msg.metadata?.isCommand === true;

  if (isCommand) {
    return (
      <div className="flex gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300">
          <Terminal className="h-4 w-4" />
        </div>
        <div className="max-w-[85%]">
          <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm whitespace-pre-wrap text-violet-900 dark:bg-violet-950 dark:text-violet-200">
            {msg.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
            isUser
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
          }`}
        >
          {msg.content}
        </div>
        {!isUser && msg.metadata && <ActionBadges metadata={msg.metadata} />}
      </div>
    </div>
  );
});

export function ChatPanel() {
  const {
    messagesByContext,
    hasMoreByContext,
    isLoadingMore,
    context,
    isLoading,
    error,
    sendMessage,
    loadHistory,
    loadOlderMessages,
    addMessage,
    clearMessages,
  } = useChatStore();
  const messages = messagesByContext[context];
  const hasMore = hasMoreByContext[context];
  const [input, setInput] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  // Slash command autocomplete
  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const query = input.slice(1).toLowerCase();
    return commands.filter((c) => c.name.startsWith(query));
  }, [input]);

  const showCommands = filteredCommands.length > 0 && input.startsWith('/');

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommands.length]);

  const selectCommand = useCallback((name: string) => {
    setInput(`/${name} `);
  }, []);

  // Load history when context changes (only if empty)
  useEffect(() => {
    if (messages.length === 0) {
      loadHistory();
    }
  }, [context, loadHistory, messages.length]);

  // Auto-scroll to bottom using a sentinel ref instead of DOM query
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Intersection Observer for infinite scroll (load older messages)
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadOlderMessages();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadOlderMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');

    // Check for slash commands
    if (text.startsWith('/')) {
      const result = await executeCommand(text, context);
      if (result) {
        if (result.effects?.clearMessages) {
          clearMessages();
        }
        addMessage(result.message);
        return;
      }
    }

    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1,
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        // If the input exactly matches a command, Enter sends it; otherwise autocomplete
        const exactMatch = input.trim() === `/${filteredCommands[selectedCommandIndex].name}`;
        if (e.key === 'Tab' || !exactMatch) {
          e.preventDefault();
          const cmd = filteredCommands[selectedCommandIndex];
          setInput(`/${cmd.name}`);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <aside className="flex h-full w-80 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Bot className="h-5 w-5 text-zinc-500" />
        <div>
          <h2 className="text-sm font-semibold">AI Assistant</h2>
          <p className="text-xs text-zinc-500">{contextLabels[context]}</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollAreaRef}>
        <div className="flex flex-col gap-3 p-4">
          {/* Top sentinel for infinite scroll */}
          <div ref={topSentinelRef} />
          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            </div>
          )}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400">
              <Bot className="mb-3 h-10 w-10" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="mt-1 text-xs">
                Ask me to manage your schedule
              </p>
              <p className="mt-2 text-xs text-zinc-300">
                /help 로 명령어를 확인하세요
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {isLoading && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-500 dark:bg-zinc-800">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce [animation-delay:0.2s]">.</span>
                  <span className="animate-bounce [animation-delay:0.4s]">.</span>
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {/* Scroll sentinel */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="relative border-t border-zinc-200 p-3 dark:border-zinc-800">
        {/* Command autocomplete */}
        {showCommands && (
          <div
            ref={commandListRef}
            className="absolute bottom-full left-0 right-0 z-10 mx-3 mb-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="px-3 py-1.5 text-[11px] font-medium text-zinc-400">
              명령어
            </div>
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedCommandIndex
                    ? 'bg-zinc-100 dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
                onMouseEnter={() => setSelectedCommandIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCommand(cmd.name);
                }}
              >
                <Terminal className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  /{cmd.name}
                </span>
                <span className="truncate text-xs text-zinc-400">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 또는 /명령어 입력..."
            className="flex-1 text-sm"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
