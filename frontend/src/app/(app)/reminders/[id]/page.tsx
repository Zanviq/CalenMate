'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { ArrowLeft, Save, Loader2, List, Trash2, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import api from '@/lib/api';
import type { Reminder, ReminderNote, TaskList } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/store/chat';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

const reminderSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  description: z.string().optional(),
  due_date: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  notify: z.boolean(),
  color: z.string().optional().nullable(),
});

type ReminderForm = z.infer<typeof reminderSchema>;

const colorOptions = [
  { value: '', label: '없음' },
  { value: '#ef4444', label: '빨강' },
  { value: '#f97316', label: '주황' },
  { value: '#eab308', label: '노랑' },
  { value: '#22c55e', label: '초록' },
  { value: '#3b82f6', label: '파랑' },
  { value: '#8b5cf6', label: '보라' },
  { value: '#ec4899', label: '분홍' },
];

export default function ReminderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setContext } = useChatStore();
  const [activeTab, setActiveTab] = useState('edit');
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    setContext('reminder');
  }, [setContext]);

  // Fetch task lists for display
  const { data: taskLists = [] } = useQuery<TaskList[]>({
    queryKey: ['task-lists'],
    queryFn: async () => {
      const res = await api.get('/api/task-lists');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch reminder
  const { data: reminder, isLoading: reminderLoading } = useQuery<Reminder>({
    queryKey: ['reminders', id],
    queryFn: async () => {
      const res = await api.get(`/api/reminders/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  // Fetch notes
  const { data: notes, isLoading: notesLoading } = useQuery<ReminderNote>({
    queryKey: ['reminders', id, 'notes'],
    queryFn: async () => {
      const res = await api.get(`/api/reminders/${id}/notes`);
      return res.data;
    },
    enabled: !!id,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<ReminderForm>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      title: '',
      description: '',
      due_date: null,
      priority: 'medium',
      notify: false,
      color: null,
    },
  });

  // Reset form when reminder data loads
  useEffect(() => {
    if (reminder) {
      reset({
        title: reminder.title,
        description: reminder.description ?? '',
        due_date: reminder.due_date,
        priority: reminder.priority,
        notify: reminder.notify,
        color: reminder.color,
      });
    }
  }, [reminder, reset]);

  // Set note content when notes load
  useEffect(() => {
    if (notes) {
      setNoteContent(notes.content ?? '');
    }
  }, [notes]);

  // Save reminder mutation
  const saveMutation = useMutation({
    mutationFn: (data: ReminderForm) => api.put(`/api/reminders/${id}`, {
      ...data,
      google_task_id: reminder?.google_task_id,
      google_list_id: reminder?.google_list_id,
    }),
    onSuccess: (res) => {
      // Update cache in-place instead of full refetch
      queryClient.setQueryData(['reminders', id], res.data);
      queryClient.invalidateQueries({ queryKey: ['reminders'], exact: false });
    },
  });

  // Toggle completion
  const toggleCompleteMutation = useMutation({
    mutationFn: () => api.patch(`/api/reminders/${id}/complete`, {
      google_task_id: reminder?.google_task_id,
      google_list_id: reminder?.google_list_id,
      is_completed: reminder?.is_completed,
    }),
    onSuccess: (res) => {
      queryClient.setQueryData(['reminders', id], res.data);
      queryClient.invalidateQueries({ queryKey: ['reminders'], exact: false });
    },
    onError: () => {
      toast.error('상태 변경에 실패했습니다');
    },
  });

  // Delete reminder
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/reminders/${id}`, {
      params: {
        google_task_id: reminder?.google_task_id,
        google_list_id: reminder?.google_list_id,
      },
    }),
    onSuccess: () => {
      // Remove this specific reminder from cache first to prevent refetch of deleted item
      queryClient.removeQueries({ queryKey: ['reminders', id] });
      router.push('/reminders');
      // Invalidate list queries after navigation to refresh the list
      queryClient.invalidateQueries({ queryKey: ['reminders'], exact: false });
    },
    onError: () => {
      toast.error('리마인더 삭제에 실패했습니다');
    },
  });

  const onSubmitReminder = (data: ReminderForm) => {
    saveMutation.mutate(data);
  };

  // AI generate note
  const generateNoteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/reminders/${id}/notes/generate`);
      return res.data;
    },
    onSuccess: (data) => {
      setNoteContent(data.content ?? '');
      queryClient.invalidateQueries({ queryKey: ['reminders', id, 'notes'] });
      toast.success('AI 노트가 생성되었습니다');
      setActiveTab('notes');
    },
    onError: () => {
      toast.error('AI 노트 생성에 ��패했습니다');
    },
  });

  // Save notes
  const handleSaveNotes = async () => {
    setNoteSaving(true);
    try {
      await api.post(`/api/reminders/${id}/notes`, { content: noteContent });
      queryClient.invalidateQueries({ queryKey: ['reminders', id, 'notes'] });
    } finally {
      setNoteSaving(false);
    }
  };

  if (reminderLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (!reminder) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
        <p className="text-sm">리마인더를 찾을 수 없습니다.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/reminders')}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push('/reminders')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">
          {reminder.title}
        </h1>
        {reminder.google_list_id && (
          <span className="flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
            <List className="h-3 w-3" />
            {taskLists.find((l) => l.id === reminder.google_list_id)?.title || '기본 목록'}
          </span>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant={reminder.is_completed ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => toggleCompleteMutation.mutate()}
            disabled={toggleCompleteMutation.isPending}
          >
            {reminder.is_completed ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
            {reminder.is_completed ? '완료됨' : '완료'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-zinc-400 hover:text-destructive"
                />
              }
            >
              <Trash2 className="h-4 w-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>리마인더 삭제</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{reminder.title}&rdquo;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-6 py-2">
          <TabsList variant="line">
            <TabsTrigger value="edit">편집</TabsTrigger>
            <TabsTrigger value="notes">AI 노트</TabsTrigger>
          </TabsList>
        </div>

        {/* Edit Tab */}
        <TabsContent value="edit" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <form
              onSubmit={handleSubmit(onSubmitReminder)}
              className="mx-auto max-w-2xl space-y-5 p-6"
            >
              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  제목 <span className="text-destructive">*</span>
                </label>
                <Input {...register('title')} />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">설명</label>
                <Textarea
                  placeholder="설명을 입력하세요"
                  {...register('description')}
                />
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">마감일</label>
                <Controller
                  name="due_date"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          {field.value ? (
                            format(new Date(field.value), 'yyyy년 M월 d일', {
                              locale: ko,
                            })
                          ) : (
                            <span className="text-muted-foreground">
                              날짜 선택
                            </span>
                          )}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? new Date(field.value) : undefined
                            }
                            onSelect={(date) =>
                              field.onChange(
                                date ? date.toISOString() : null
                              )
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      {field.value && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => field.onChange(null)}
                        >
                          초기화
                        </Button>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">우선순위</label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">낮음</SelectItem>
                        <SelectItem value="medium">보통</SelectItem>
                        <SelectItem value="high">높음</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Color */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">색상</label>
                <Controller
                  name="color"
                  control={control}
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`h-7 w-7 rounded-full border-2 transition-all ${
                            (field.value ?? '') === opt.value
                              ? 'border-foreground scale-110'
                              : 'border-transparent'
                          }`}
                          style={{
                            backgroundColor: opt.value || '#e4e4e7',
                          }}
                          title={opt.label}
                          onClick={() =>
                            field.onChange(opt.value || null)
                          }
                        />
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* Notify */}
              <div className="flex items-center gap-2">
                <Controller
                  name="notify"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <label className="text-sm">알림 받기</label>
              </div>

              {/* Save Button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || !isDirty}
                  className="gap-1.5"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  저장
                </Button>
                {saveMutation.isSuccess && (
                  <span className="text-xs text-green-600">저장되었습니다</span>
                )}
                {saveMutation.isError && (
                  <span className="text-xs text-destructive">
                    저장에 실패했습니다
                  </span>
                )}
              </div>
            </form>
          </ScrollArea>
        </TabsContent>

        {/* AI Notes Tab */}
        <TabsContent value="notes" className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-6 py-3">
              <p className="text-sm text-muted-foreground">
                리마인더에 대한 메모를 자유롭��� 작성하세요.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => generateNoteMutation.mutate()}
                  disabled={generateNoteMutation.isPending}
                >
                  {generateNoteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI 생성
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleSaveNotes}
                  disabled={noteSaving}
                >
                  {noteSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  저장
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-6" data-color-mode="light">
              {notesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
                </div>
              ) : (
                <MDEditor
                  value={noteContent}
                  onChange={(val) => setNoteContent(val ?? '')}
                  height="100%"
                  preview="live"
                />
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
