'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { CalendarEvent } from '@/types';

const EVENT_COLORS = [
  { id: '11', name: '토마토', hex: '#d50000' },
  { id: '4', name: '플라밍고', hex: '#e67c73' },
  { id: '6', name: '귤', hex: '#f4511e' },
  { id: '5', name: '바나나', hex: '#f6bf26' },
  { id: '2', name: '세이지', hex: '#33b679' },
  { id: '10', name: '바질', hex: '#0b8043' },
  { id: '7', name: '피콕', hex: '#039be5' },
  { id: '9', name: '블루베리', hex: '#3f51b5' },
  { id: '1', name: '라벤더', hex: '#7986cb' },
  { id: '3', name: '포도', hex: '#8e24aa' },
  { id: '8', name: '그래파이트', hex: '#616161' },
];

const GOOGLE_COLOR_MAP: Record<string, string> = Object.fromEntries(
  EVENT_COLORS.map((c) => [c.id, c.hex])
);

function resolveColor(color?: string): string {
  if (!color) return '#3b82f6';
  if (GOOGLE_COLOR_MAP[color]) return GOOGLE_COLOR_MAP[color];
  if (color.startsWith('#')) return color;
  return '#3b82f6';
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  events: CalendarEvent[];
  onCreateEvent: (event: {
    title: string;
    description: string;
    start: string;
    end: string;
    allDay: boolean;
    color?: string;
  }) => void;
}

export function EventDialog({
  open,
  onOpenChange,
  date,
  events,
  onCreateEvent,
}: EventDialogProps) {
  const [mode, setMode] = useState<'view' | 'create'>('view');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartTime('09:00');
    setEndTime('10:00');
    setAllDay(false);
    setSelectedColor(undefined);
    setMode('view');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleCreate = () => {
    if (!title.trim() || !date) return;

    const dateStr = format(date, 'yyyy-MM-dd');
    onCreateEvent({
      title: title.trim(),
      description: description.trim(),
      start: allDay ? dateStr : `${dateStr}T${startTime}:00`,
      end: allDay ? dateStr : `${dateStr}T${endTime}:00`,
      allDay,
      color: selectedColor,
    });

    resetForm();
    onOpenChange(false);
  };

  if (!date) return null;

  const dateLabel = format(date, 'yyyy년 M월 d일 (EEEE)', { locale: ko });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dateLabel}</DialogTitle>
          <DialogDescription>
            {mode === 'view'
              ? events.length > 0
                ? `${events.length}개의 일정이 있습니다.`
                : '일정이 없습니다.'
              : '새 일정을 추가합니다.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'view' ? (
          <div className="flex flex-col gap-3">
            {events.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div
                      className="mt-1 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: resolveColor(event.color) }}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-tight">
                        {event.title}
                      </span>
                      {!event.allDay && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(event.start), 'HH:mm')} –{' '}
                          {format(new Date(event.end), 'HH:mm')}
                        </span>
                      )}
                      {event.allDay && (
                        <span className="text-xs text-muted-foreground">종일</span>
                      )}
                      {event.description && (
                        <span className="text-xs text-muted-foreground">
                          {event.description}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                이 날짜에 일정이 없습니다.
              </p>
            )}

            <DialogFooter>
              <Button onClick={() => setMode('create')} size="sm">
                새 일정 추가
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="event-title" className="text-sm font-medium">
                제목
              </label>
              <Input
                id="event-title"
                placeholder="일정 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="event-description" className="text-sm font-medium">
                설명
              </label>
              <Textarea
                id="event-description"
                placeholder="설명 (선택)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="event-allday"
                checked={allDay}
                onCheckedChange={(checked) => setAllDay(checked === true)}
              />
              <label htmlFor="event-allday" className="text-sm">
                종일
              </label>
            </div>

            {!allDay && (
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="event-start" className="text-sm font-medium">
                    시작
                  </label>
                  <Input
                    id="event-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <label htmlFor="event-end" className="text-sm font-medium">
                    종료
                  </label>
                  <Input
                    id="event-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Color picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">색상</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.name}
                    onClick={() =>
                      setSelectedColor(selectedColor === c.id ? undefined : c.id)
                    }
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      selectedColor === c.id
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setMode('view')}>
                취소
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
                추가
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
