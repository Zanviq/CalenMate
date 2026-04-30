'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Reminder } from '@/types';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogDescription,
} from '@/components/ui/dialog';

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface LinkEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminderId: string;
}

export function LinkEventDialog({ open, onOpenChange, reminderId }: LinkEventDialogProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [autoComplete, setAutoComplete] = useState(true);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error('날짜를 선택해주세요');
      const res = await api.post(`/api/reminders/${reminderId}/link-event`, {
        date: toLocalDateString(date),
        start_time: startTime,
        duration_minutes: Number(duration),
        auto_complete_on_event_end: autoComplete,
      });
      return res.data as Reminder;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['reminders', reminderId], updated);
      queryClient.invalidateQueries({ queryKey: ['reminders'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'], exact: false });
      toast.success('캘린더에 시간을 잡았습니다');
      onOpenChange(false);
    },
    onError: () => {
      toast.error('일정 연결에 실패했습니다');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>캘린더에 시간 잡기</DialogTitle>
          <DialogDescription>
            이 ToDo를 캘린더에 블록으로 추가합니다. 일정이 끝나면 자동으로 완료 처리됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">날짜</label>
            <Popover>
              <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                {date ? (
                  format(date, 'yyyy년 M월 d일 (EEE)', { locale: ko })
                ) : (
                  <span className="text-muted-foreground">날짜 선택</span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Start time */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">시작 시간</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">소요 시간</label>
            <Select value={duration} onValueChange={(v) => v && setDuration(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15분</SelectItem>
                <SelectItem value="30">30분</SelectItem>
                <SelectItem value="60">1시간</SelectItem>
                <SelectItem value="90">1시간 30분</SelectItem>
                <SelectItem value="120">2시간</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto-complete */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={autoComplete}
              onCheckedChange={(v) => setAutoComplete(!!v)}
            />
            <label className="text-sm">일정 종료 시 자동 완료</label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => linkMutation.mutate()}
            disabled={linkMutation.isPending || !date}
            className="gap-1.5"
          >
            {linkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            시간 잡기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
