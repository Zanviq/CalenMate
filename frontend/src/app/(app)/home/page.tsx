'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Calendar,
  CheckSquare,
  Sparkles,
  Clock,
  ChevronRight,
  Loader2,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import api from '@/lib/api';
import type { CalendarEvent, Reminder, UserInstruction } from '@/types';

export default function HomePage() {
  const { user } = useAuthStore();
  const { setContext, instructionActionCount, reminderActionCount, calendarActionCount } = useChatStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    setContext('home');
  }, [setContext]);

  // Refetch data when AI chat modifies them
  useEffect(() => {
    if (instructionActionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['user-instructions'] });
    }
  }, [instructionActionCount, queryClient]);

  useEffect(() => {
    if (reminderActionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    }
  }, [reminderActionCount, queryClient]);

  useEffect(() => {
    if (calendarActionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['today-events'] });
      queryClient.invalidateQueries({ queryKey: ['today-summary'] });
    }
  }, [calendarActionCount, queryClient]);

  const now = new Date();
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  const { data: todayEvents = [], isLoading: eventsLoading } = useQuery<CalendarEvent[]>({
    queryKey: ['today-events'],
    queryFn: async () => {
      const { data } = await api.get('/api/calendar/events', {
        params: { timeMin: todayStart, timeMax: todayEnd },
      });
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const { data: reminders = [], isLoading: remindersLoading } = useQuery<Reminder[]>({
    queryKey: ['reminders'],
    queryFn: async () => {
      const { data } = await api.get('/api/reminders');
      return data;
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<{ summary: string }>({
    queryKey: ['today-summary'],
    queryFn: async () => {
      const { data } = await api.get('/api/summary/today');
      return data;
    },
  });

  // Instructions
  const { data: instructions = [], isLoading: instructionsLoading } = useQuery<UserInstruction[]>({
    queryKey: ['user-instructions'],
    queryFn: async () => {
      const { data } = await api.get('/api/instructions');
      return data;
    },
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: async (reminder: Reminder) => {
      const res = await api.patch(`/api/reminders/${reminder.id}/complete`, {
        google_task_id: reminder.google_task_id,
        google_list_id: reminder.google_list_id,
        is_completed: reminder.is_completed,
      });
      return res.data as Reminder;
    },
    onMutate: async (reminder) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders']);
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        old?.map((r) =>
          r.id === reminder.id ? { ...r, is_completed: !r.is_completed } : r
        )
      );
      return { previous };
    },
    onError: (_err, _reminder, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders'], ctx.previous);
      }
      toast.error('리마인더 상태 변경에 실패했습니다');
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        old?.map((r) => r.id === updated.id ? { ...r, ...updated } : r)
      );
    },
  });

  const createInstructionMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data } = await api.post('/api/instructions', { content });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-instructions'] }),
  });

  const updateInstructionMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { data } = await api.put(`/api/instructions/${id}`, { content });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-instructions'] }),
  });

  const deleteInstructionMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/instructions/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-instructions'] }),
  });

  // Instruction editing state
  const [newInstruction, setNewInstruction] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const handleAddInstruction = () => {
    const text = newInstruction.trim();
    if (!text) return;
    createInstructionMutation.mutate(text);
    setNewInstruction('');
  };

  const handleStartEdit = (instruction: UserInstruction) => {
    setEditingId(instruction.id);
    setEditingContent(instruction.content);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingContent.trim()) return;
    updateInstructionMutation.mutate({ id: editingId, content: editingContent.trim() });
    setEditingId(null);
    setEditingContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const activeReminders = reminders.filter((r) => !r.is_completed).slice(0, 5);
  const activeCount = reminders.filter((r) => !r.is_completed).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          안녕하세요, {user?.display_name ?? '사용자'}님
        </h1>
        <p className="text-sm text-zinc-500">
          {format(now, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
        </p>
      </div>

      {/* AI Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            AI 일정 요약
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              요약 생성 중...
            </div>
          ) : summary?.summary ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3">
              <ReactMarkdown>{summary.summary}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              오른쪽 채팅창에서 &ldquo;오늘 일정 알려줘&rdquo;라고 말해보세요.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Today's Events */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                오늘의 일정
                <Badge variant="secondary">{todayEvents.length}</Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => router.push('/calendar')}
              >
                더보기 <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : todayEvents.length === 0 ? (
              <p className="text-sm text-zinc-400">오늘 예정된 일정이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {todayEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <div
                      className="h-8 w-1 rounded-full"
                      style={{ backgroundColor: event.color || '#3b82f6' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{event.title}</p>
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <Clock className="h-3 w-3" />
                        {event.allDay
                          ? '종일'
                          : `${format(new Date(event.start), 'HH:mm')} - ${format(new Date(event.end), 'HH:mm')}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Reminders */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckSquare className="h-4 w-4" />
                할 일
                <Badge variant="secondary">{activeCount}</Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => router.push('/reminders')}
              >
                더보기 <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {remindersLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : activeReminders.length === 0 ? (
              <p className="text-sm text-zinc-400">진행 중인 할 일이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {activeReminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                  >
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompleteMutation.mutate(reminder);
                      }}
                    >
                      <Checkbox checked={reminder.is_completed} onCheckedChange={() => {}} />
                    </div>
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => router.push(`/reminders/${reminder.id}`)}
                    >
                      <p className="truncate text-sm">{reminder.title}</p>
                    </div>
                    <Badge
                      variant={
                        reminder.priority === 'high'
                          ? 'destructive'
                          : reminder.priority === 'medium'
                            ? 'default'
                            : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {reminder.priority === 'high'
                        ? '높음'
                        : reminder.priority === 'medium'
                          ? '보통'
                          : '낮음'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            주요 지시사항
            <Badge variant="secondary">{instructions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {instructionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : instructions.length === 0 ? (
            <p className="text-sm text-zinc-400">
              저장된 지시사항이 없습니다. AI 채팅에서 &ldquo;주요 지시사항에 저장해줘&rdquo;라고 말하거나 아래에서 직접 추가하세요.
            </p>
          ) : (
            <div className="space-y-2">
              {instructions.map((inst) => (
                <div
                  key={inst.id}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  {editingId === inst.id ? (
                    <>
                      <Input
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="flex-1 text-sm"
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveEdit}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 text-sm">{inst.content}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-zinc-400 hover:text-zinc-600"
                        onClick={() => handleStartEdit(inst)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-zinc-400 hover:text-red-500"
                        onClick={() => deleteInstructionMutation.mutate(inst.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add new instruction */}
          <div className="flex gap-2 pt-1">
            <Input
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddInstruction();
              }}
              placeholder="새 지시사항 입력..."
              className="flex-1 text-sm"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleAddInstruction}
              disabled={!newInstruction.trim()}
              className="shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
