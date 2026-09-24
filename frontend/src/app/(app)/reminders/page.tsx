'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleDashed,
  ListTodo,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { ChecklistItem, Reminder, ReminderStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/store/chat';
import { CreateReminderDialog } from '@/components/reminders/create-reminder-dialog';
import { TaskListSelector } from '@/components/reminders/task-list-selector';

type FilterTab = 'all' | 'active' | 'completed';

const priorityConfig = {
  high: { label: '높음', variant: 'destructive' as const },
  medium: { label: '보통', variant: 'default' as const },
  low: { label: '낮음', variant: 'secondary' as const },
};

// Cycle: not_started → in_progress → completed → not_started
function nextStatus(current: ReminderStatus): ReminderStatus {
  if (current === 'not_started') return 'in_progress';
  if (current === 'in_progress') return 'completed';
  return 'not_started';
}

function StatusIcon({ status }: { status: ReminderStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-green-600" strokeWidth={2.5} />;
  }
  if (status === 'in_progress') {
    return <CircleDashed className="h-4 w-4 animate-spin text-blue-500" style={{ animationDuration: '4s' }} strokeWidth={2.5} />;
  }
  return <Circle className="h-4 w-4 text-zinc-400" strokeWidth={2} />;
}

export default function RemindersPage() {
  const { setContext, reminderActionCount } = useChatStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedListId, setSelectedListId] = useState<string>('@default');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    setContext('reminder');
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    };
  }, [setContext]);

  // Refetch reminders when AI chat modifies reminders
  useEffect(() => {
    if (reminderActionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      // AI may have changed tags via update_reminder — keep filter bar fresh.
      queryClient.invalidateQueries({ queryKey: ['reminder-tags'] });
    }
  }, [reminderActionCount, queryClient]);

  // Server-side filtering: pass status, listId, and tags params
  const statusParam = filter === 'all' ? undefined : filter === 'active' ? 'active' : 'completed';
  const sortedSelectedTags = [...selectedTags].sort();
  const tagsKey = sortedSelectedTags.join(',');
  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: ['reminders', filter, selectedListId, tagsKey],
    queryFn: async () => {
      const params: Record<string, string> = { listId: selectedListId };
      if (statusParam) params.status = statusParam;
      if (tagsKey) params.tags = tagsKey;
      const res = await api.get('/api/reminders', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: allTags = [] } = useQuery<{ name: string; count: number }[]>({
    queryKey: ['reminder-tags'],
    queryFn: async () => {
      const res = await api.get('/api/reminders/tags');
      return res.data;
    },
    staleTime: 60_000,
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ reminder, status }: { reminder: Reminder; status: ReminderStatus }) => {
      const res = await api.patch(`/api/reminders/${reminder.id}/status`, { status });
      return res.data as Reminder;
    },
    onMutate: async ({ reminder, status }) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders', filter, selectedListId, tagsKey]);
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        Array.isArray(old)
          ? old.map((r) =>
              r.id === reminder.id
                ? { ...r, status, is_completed: status === 'completed' }
                : r
            )
          : old
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders', filter, selectedListId, tagsKey], ctx.previous);
      }
      toast.error('ToDo 상태 변경에 실패했습니다');
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        Array.isArray(old)
          ? old.map((r) => r.id === updated.id ? { ...r, ...updated } : r)
          : old
      );
    },
  });

  // Inline checklist toggle from the list expansion. Sends only the new checklist
  // array.
  const updateChecklistMutation = useMutation({
    mutationFn: async ({ reminder, checklist }: { reminder: Reminder; checklist: ChecklistItem[] }) => {
      const res = await api.put(`/api/reminders/${reminder.id}`, {
        checklist,
      });
      return res.data as Reminder;
    },
    onMutate: async ({ reminder, checklist }) => {
      await queryClient.cancelQueries({ queryKey: ['reminders'] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders', filter, selectedListId, tagsKey]);
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        Array.isArray(old)
          ? old.map((r) => (r.id === reminder.id ? { ...r, checklist } : r))
          : old,
      );
      // Also patch the detail cache if it's hydrated.
      const detail = queryClient.getQueryData<Reminder>(['reminders', reminder.id]);
      if (detail) {
        queryClient.setQueryData<Reminder>(['reminders', reminder.id], { ...detail, checklist });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders', filter, selectedListId, tagsKey], ctx.previous);
      }
      toast.error('체크리스트 저장에 실패했습니다');
    },
    onSuccess: (updated) => {
      queryClient.setQueriesData<Reminder[]>({ queryKey: ['reminders'] }, (old) =>
        Array.isArray(old)
          ? old.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          : old,
      );
      queryClient.setQueryData(['reminders', updated.id], (prev: Reminder | undefined) =>
        prev ? { ...prev, ...updated } : updated,
      );
    },
  });

  const toggleChecklistItem = (reminder: Reminder, itemId: string) => {
    const next = (reminder.checklist ?? []).map((it) =>
      it.id === itemId ? { ...it, done: !it.done } : it,
    );
    updateChecklistMutation.mutate({ reminder, checklist: next });
  };

  const deleteMutation = useMutation({
    mutationFn: (reminder: Reminder) => api.delete(`/api/reminders/${reminder.id}`),
    onMutate: async (reminder) => {
      await queryClient.cancelQueries({ queryKey: ['reminders', filter, selectedListId, tagsKey] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders', filter, selectedListId, tagsKey]);
      queryClient.setQueryData<Reminder[]>(['reminders', filter, selectedListId, tagsKey], (old) =>
        old?.filter((r) => r.id !== reminder.id)
      );
      return { previous };
    },
    onError: (_err, _reminder, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders', filter, selectedListId, tagsKey], ctx.previous);
      }
      toast.error('ToDo 삭제에 실패했습니다');
    },
    onSettled: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-tags'] });
    },
  });

  // Server already filters by status, just sort client-side
  const filtered = [...reminders].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const handleCycleStatus = (e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    const current: ReminderStatus = reminder.status ?? (reminder.is_completed ? 'completed' : 'not_started');
    setStatusMutation.mutate({ reminder, status: nextStatus(current) });
  };

  const handleDeleteStart = (e: React.MouseEvent, reminderId: string) => {
    e.stopPropagation();
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    setDeleteTarget(reminderId);
    deleteTimeoutRef.current = setTimeout(() => setDeleteTarget(null), 3000);
  };

  const handleDeleteConfirm = (e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    deleteMutation.mutate(reminder);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">ToDo</h1>
          <TaskListSelector value={selectedListId} onChange={setSelectedListId} />
        </div>
        <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          추가
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="border-b px-6 py-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
          <TabsList variant="line">
            <TabsTrigger value="all">
              전체
            </TabsTrigger>
            <TabsTrigger value="active">
              진행 중
            </TabsTrigger>
            <TabsTrigger value="completed">
              완료
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tag Filter Bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-6 py-2">
          <span className="text-xs text-muted-foreground">태그</span>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.name}
                type="button"
                onClick={() =>
                  setSelectedTags(
                    active
                      ? selectedTags.filter((t) => t !== tag.name)
                      : [...selectedTags, tag.name],
                  )
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-zinc-200 hover:bg-muted dark:border-zinc-800'
                }`}
              >
                <span>#{tag.name}</span>
                <span className="text-[10px] opacity-60">{tag.count}</span>
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="ml-1 text-xs text-muted-foreground hover:text-foreground"
            >
              초기화
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-20 text-zinc-400">
            <div className="text-center">
              <ListTodo className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm">
                {filter === 'completed'
                  ? '완료된 ToDo가 없습니다.'
                  : filter === 'active'
                    ? '진행 중인 ToDo가 없습니다.'
                    : '아직 ToDo가 없습니다.'}
              </p>
              <p className="mt-1 text-xs">
                AI 채팅으로 &ldquo;할 일 추가해줘&rdquo;라고 말해보세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((reminder) => {
              const hasChecklist = !!reminder.checklist && reminder.checklist.length > 0;
              const isExpanded = expandedIds.has(reminder.id);
              return (
                <div key={reminder.id}>
                  <div
                    className="flex cursor-pointer items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                    onClick={() => router.push(`/reminders/${reminder.id}`)}
                  >
                    {/* Status toggle (3-state cycle) */}
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
                      onClick={(e) => handleCycleStatus(e, reminder)}
                      title={
                        reminder.status === 'completed'
                          ? '완료됨 (클릭하여 시작 안 함으로)'
                          : reminder.status === 'in_progress'
                            ? '진행 중 (클릭하여 완료로)'
                            : '시작 안 함 (클릭하여 진행 중으로)'
                      }
                    >
                      <StatusIcon
                        status={reminder.status ?? (reminder.is_completed ? 'completed' : 'not_started')}
                      />
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {reminder.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: reminder.color }}
                          />
                        )}
                        <span
                          className={`truncate text-sm font-medium ${
                            reminder.is_completed
                              ? 'text-zinc-400 line-through'
                              : reminder.status === 'in_progress'
                                ? 'text-foreground'
                                : 'text-foreground'
                          }`}
                        >
                          {reminder.title}
                        </span>
                        {reminder.linked_event_id && (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                            title="캘린더 일정과 연결됨"
                          >
                            <LinkIcon className="h-2.5 w-2.5" />
                            링크
                          </span>
                        )}
                        {hasChecklist && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(reminder.id);
                            }}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/70"
                            title={isExpanded ? '체크리스트 접기' : '체크리스트 펼치기'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-2.5 w-2.5" />
                            ) : (
                              <ChevronDown className="h-2.5 w-2.5" />
                            )}
                            {reminder.checklist!.filter((c) => c.done).length}/{reminder.checklist!.length}
                          </button>
                        )}
                        {reminder.tags && reminder.tags.length > 0 && reminder.tags.map((t) => (
                          <span
                            key={t}
                            className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                      {reminder.due_date && (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400">
                          <CalendarIcon className="h-3 w-3" />
                          {format(new Date(reminder.due_date), 'M월 d일 (EEE)', {
                            locale: ko,
                          })}
                        </div>
                      )}
                    </div>

                    {/* Priority badge */}
                    <Badge variant={priorityConfig[reminder.priority].variant}>
                      {priorityConfig[reminder.priority].label}
                    </Badge>

                    {/* Notify indicator */}
                    {reminder.notify && (
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                    )}

                    {/* Delete */}
                    {deleteTarget === reminder.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs font-medium text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleDeleteConfirm(e, reminder)}
                      >
                        삭제 확인
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 text-zinc-400 hover:text-destructive"
                        onClick={(e) => handleDeleteStart(e, reminder.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Expanded checklist (read + toggleable) */}
                  {isExpanded && hasChecklist && (
                    <div
                      className="space-y-1.5 bg-muted/30 px-6 pb-3 pl-[3.25rem] pt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[...reminder.checklist!]
                        .sort((a, b) => a.order - b.order)
                        .map((item) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={item.done}
                              onCheckedChange={() => toggleChecklistItem(reminder, item.id)}
                            />
                            <span
                              className={`text-xs ${
                                item.done ? 'text-muted-foreground line-through' : 'text-foreground'
                              }`}
                            >
                              {item.text}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Create Dialog */}
      <CreateReminderDialog open={dialogOpen} onOpenChange={setDialogOpen} listId={selectedListId} />
    </div>
  );
}
