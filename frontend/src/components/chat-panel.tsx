'use client';

import { useState, useRef, useEffect, memo } from 'react';
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
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/chat';
import { executeCommand } from '@/lib/chat-commands';
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

const ActionBadges = memo(function ActionBadges({ metadata }: { metadata: Record<string, unknown> }) {
  const results = metadata?.results as
    | { type: string; data: Record<string, unknown> }[]
    | undefined;
  if (!results || results.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {results.map((r, i) => {
        const isError = r.type.endsWith('_error');
        const info = ACTION_LABELS[r.type];

        if (isError) {
          const errorMsg = String(r.data?.error || '알 수 없는 오류');
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-400"
            >
              <XCircle className="h-3 w-3 shrink-0" />
              <span>실패: {errorMsg}</span>
            </div>
          );
        }

        if (info) {
          const Icon = info.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded-md bg-green-100 px-2 py-1 text-[11px] text-green-700 dark:bg-green-950 dark:text-green-400"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <Icon className="h-3 w-3 shrink-0" />
              <span>{info.label}</span>
            </div>
          );
        }

        return null;
      })}
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

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
      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
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
