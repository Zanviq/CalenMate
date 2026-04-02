'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { DatesSetArg, EventInput } from '@fullcalendar/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

import api from '@/lib/api';
import { useChatStore } from '@/store/chat';
import { Button } from '@/components/ui/button';
import { EventDialog } from '@/components/calendar/event-dialog';
import type { CalendarEvent } from '@/types';

// Google Calendar colorId → hex color mapping
const GOOGLE_COLOR_MAP: Record<string, string> = {
  '1': '#7986cb',  // lavender
  '2': '#33b679',  // sage
  '3': '#8e24aa',  // grape
  '4': '#e67c73',  // flamingo
  '5': '#f6bf26',  // banana
  '6': '#f4511e',  // tangerine
  '7': '#039be5',  // peacock
  '8': '#616161',  // graphite
  '9': '#3f51b5',  // blueberry
  '10': '#0b8043', // basil
  '11': '#d50000', // tomato
};

function resolveEventColor(color?: string): string {
  if (!color) return '#3b82f6';
  if (GOOGLE_COLOR_MAP[color]) return GOOGLE_COLOR_MAP[color];
  if (color.startsWith('#')) return color;
  return '#3b82f6';
}

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

const VIEW_MAP: Record<string, ViewType> = {
  month: 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
};

const VIEW_LABELS: Record<string, string> = {
  month: '월',
  week: '주',
  day: '일',
};

export default function CalendarPage() {
  const { setContext, calendarActionCount } = useChatStore();
  const calendarRef = useRef<FullCalendar>(null);
  const queryClient = useQueryClient();
  const prevActionCountRef = useRef(calendarActionCount);

  const [activeView, setActiveView] = useState<'month' | 'week' | 'day'>('month');
  const [currentTitle, setCurrentTitle] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date().toISOString(),
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    setContext('calendar');
  }, [setContext]);

  // Invalidate calendar events when AI chat modifies them (instead of putting count in query key)
  useEffect(() => {
    if (calendarActionCount > prevActionCountRef.current) {
      prevActionCountRef.current = calendarActionCount;
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    }
  }, [calendarActionCount, queryClient]);

  // Fetch events from backend
  const { data: events = [], error: eventsError } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events', dateRange.start, dateRange.end],
    queryFn: async () => {
      try {
        const { data } = await api.get('/api/calendar/events', {
          params: {
            timeMin: dateRange.start,
            timeMax: dateRange.end,
          },
        });
        return data;
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
        throw new Error(
          axiosErr.response?.data?.error || axiosErr.message || '일정을 불러오지 못했습니다.'
        );
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 2,
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (newEvent: {
      title: string;
      description: string;
      start: string;
      end: string;
      allDay: boolean;
      color?: string;
    }) => {
      const { data } = await api.post('/api/calendar/events', newEvent);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  // Convert CalendarEvent[] to FullCalendar EventInput[]
  const fcEvents: EventInput[] = useMemo(
    () =>
      events.map((event) => {
        const color = resolveEventColor(event.color);
        return {
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay ?? false,
          backgroundColor: color,
          borderColor: color,
          extendedProps: {
            description: event.description,
          },
        };
      }),
    [events],
  );

  // Events for the selected date (for dialog)
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events.filter((event) => isSameDay(new Date(event.start), selectedDate));
  }, [events, selectedDate]);

  // Calendar navigation handlers
  const handlePrev = useCallback(() => {
    calendarRef.current?.getApi().prev();
  }, []);

  const handleNext = useCallback(() => {
    calendarRef.current?.getApi().next();
  }, []);

  const handleToday = useCallback(() => {
    calendarRef.current?.getApi().today();
  }, []);

  const handleViewChange = useCallback((view: 'month' | 'week' | 'day') => {
    setActiveView(view);
    calendarRef.current?.getApi().changeView(VIEW_MAP[view]);
  }, []);

  // When FullCalendar changes its date range
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    });
    setCurrentTitle(arg.view.title);
  }, []);

  // Click on a date
  const handleDateClick = useCallback((arg: DateClickArg) => {
    setSelectedDate(arg.date);
    setDialogOpen(true);
  }, []);

  // Create event from dialog
  const handleCreateEvent = useCallback(
    (newEvent: {
      title: string;
      description: string;
      start: string;
      end: string;
      allDay: boolean;
      color?: string;
    }) => {
      createEventMutation.mutate(newEvent);
    },
    [createEventMutation],
  );

  const errorMessage = eventsError
    ? (eventsError as Error & { response?: { data?: { error?: string } } })
        ?.response?.data?.error
      || (eventsError as Error).message
      || '일정을 불러오지 못했습니다.'
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">캘린더</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={handlePrev}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              오늘
            </Button>
            <Button variant="outline" size="icon-sm" onClick={handleNext}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {currentTitle}
          </span>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => handleViewChange(v)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                activeView === v
                  ? 'bg-white font-medium shadow-sm dark:bg-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-auto p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          locale="ko"
          events={fcEvents}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          height="100%"
          dayMaxEvents={3}
          nowIndicator
          dayHeaderFormat={{ weekday: 'short' }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          allDayText="종일"
          moreLinkText={(n) => `+${n}개`}
          buttonText={{
            today: '오늘',
            month: '월',
            week: '주',
            day: '일',
          }}
        />
      </div>

      {/* Event Dialog */}
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        date={selectedDate}
        events={selectedDateEvents}
        onCreateEvent={handleCreateEvent}
      />
    </div>
  );
}
