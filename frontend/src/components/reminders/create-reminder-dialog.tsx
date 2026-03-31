'use client';

import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const createReminderSchema = z.object({
  title: z.string().min(1, '제목을 입력해주세요'),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  notify: z.boolean(),
});

type CreateReminderForm = z.infer<typeof createReminderSchema>;

interface CreateReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateReminderDialog({
  open,
  onOpenChange,
}: CreateReminderDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateReminderForm>({
    resolver: zodResolver(createReminderSchema),
    defaultValues: {
      title: '',
      description: '',
      due_date: undefined,
      priority: 'medium',
      notify: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateReminderForm) => api.post('/api/reminders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      reset();
      onOpenChange(false);
    },
  });

  const onSubmit = (data: CreateReminderForm) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>리마인더 추가</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              제목 <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="할 일을 입력하세요"
              {...register('title')}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">설명</label>
            <Textarea
              placeholder="설명을 입력하세요 (선택)"
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
                <Popover>
                  <PopoverTrigger
                    className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {field.value ? (
                      format(new Date(field.value), 'yyyy년 M월 d일', {
                        locale: ko,
                      })
                    ) : (
                      <span className="text-muted-foreground">날짜 선택</span>
                    )}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) =>
                        field.onChange(date ? date.toISOString() : undefined)
                      }
                    />
                  </PopoverContent>
                </Popover>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '추가 중...' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
