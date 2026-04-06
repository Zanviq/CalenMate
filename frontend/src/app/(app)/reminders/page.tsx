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
  ListTodo,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Reminder } from '@/types';
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

export default function RemindersPage() {
  const { setContext, reminderActionCount } = useChatStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedListId, setSelectedListId] = useState<string>('@default');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContext('reminder');
  }, [setContext]);

  // Refetch reminders when AI chat modifies reminders
  useEffect(() => {
    if (reminderActionCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    }
  }, [reminderActionCount, queryClient]);

  // Server-side filtering: pass status and listId params
  const statusParam = filter === 'all' ? undefined : filter === 'active' ? 'active' : 'completed';
  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: ['reminders', filter, selectedListId],
    queryFn: async () => {
      const params: Record<string, string> = { listId: selectedListId };
      if (statusParam) params.status = statusParam;
      const res = await api.get('/api/reminders', { params });
      return res.data;
    },
    staleTime: 30_000,
  });

  const toggleCompleteMutation = useMutation({
    mutationFn: (reminder: Reminder) => api.patch(`/api/reminders/${reminder.id}/complete`, {
      google_task_id: reminder.google_task_id,
      google_list_id: reminder.google_list_id,
      is_completed: reminder.is_completed,
    }),
    onMutate: async (reminder) => {
      await queryClient.cancelQueries({ queryKey: ['reminders', filter, selectedListId] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders', filter, selectedListId]);
      queryClient.setQueryData<Reminder[]>(['reminders', filter, selectedListId], (old) =>
        old?.map((r) =>
          r.id === reminder.id ? { ...r, is_completed: !r.is_completed } : r
        )
      );
      return { previous };
    },
    onError: (_err, _reminder, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders', filter, selectedListId], ctx.previous);
      }
      toast.error('리마인더 상태 변경에 실패했습니다');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reminder: Reminder) => api.delete(`/api/reminders/${reminder.id}`, {
      params: {
        google_task_id: reminder.google_task_id,
        google_list_id: reminder.google_list_id,
      },
    }),
    onMutate: async (reminder) => {
      await queryClient.cancelQueries({ queryKey: ['reminders', filter, selectedListId] });
      const previous = queryClient.getQueryData<Reminder[]>(['reminders', filter, selectedListId]);
      queryClient.setQueryData<Reminder[]>(['reminders', filter, selectedListId], (old) =>
        old?.filter((r) => r.id !== reminder.id)
      );
      return { previous };
    },
    onError: (_err, _reminder, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['reminders', filter, selectedListId], ctx.previous);
      }
      toast.error('리마인더 삭제에 실패했습니다');
    },
    onSettled: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  // Server already filters by status, just sort client-side
  const filtered = [...reminders].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const handleToggleComplete = (e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    toggleCompleteMutation.mutate(reminder);
  };

  const handleDelete = (e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    if (deleteTarget === reminder.id) {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteMutation.mutate(reminder);
    } else {
      setDeleteTarget(reminder.id);
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = setTimeout(() => setDeleteTarget(null), 3000);
    }
  };

  const handleConfirmDelete = (e: React.MouseEvent, reminder: Reminder) => {
    e.stopPropagation();
    if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
    deleteMutation.mutate(reminder);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">리마인더</h1>
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
                  ? '완료된 리마인더가 없습니다.'
                  : filter === 'active'
                    ? '진행 중인 리마인더가 없습니다.'
                    : '아직 리마인더가 없습니다.'}
              </p>
              <p className="mt-1 text-xs">
                AI 채팅으로 &ldquo;할 일 추가해줘&rdquo;라고 말해보세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((reminder) => (
              <div
                key={reminder.id}
                className="flex cursor-pointer items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                onClick={() => router.push(`/reminders/${reminder.id}`)}
              >
                {/* Checkbox */}
                <div onClick={(e) => handleToggleComplete(e, reminder)}>
                  <Checkbox
                    checked={reminder.is_completed}
                    onCheckedChange={() => {}}
                  />
                </div>

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
                          : 'text-foreground'
                      }`}
                    >
                      {reminder.title}
                    </span>
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

                {/* Completed indicator */}
                {reminder.is_completed && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                )}

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-zinc-400 hover:text-destructive"
                  onClick={(e) => handleDelete(e, reminder)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {deleteTarget === reminder.id && (
                  <span
                    className="cursor-pointer text-xs font-medium text-destructive hover:underline"
                    onClick={(e) => handleConfirmDelete(e, reminder)}
                  >
                    삭제 확인
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Create Dialog */}
      <CreateReminderDialog open={dialogOpen} onOpenChange={setDialogOpen} listId={selectedListId} />
    </div>
  );
}
