'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { BarChart3, Clock } from 'lucide-react';
import api from '@/lib/api';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/store/chat';

type Range = '7' | '30' | '90';

interface TimelineItem {
  reminder_id: string;
  title: string;
  color: string | null;
  minutes: number;
  tags: string[];
}

interface TimelineDay {
  date: string;
  total_minutes: number;
  items: TimelineItem[];
}

const FALLBACK_PALETTE = [
  '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
];

function colorForReminder(reminderId: string, explicitColor: string | null): string {
  if (explicitColor) return explicitColor;
  // Stable pseudo-random hash from id → palette index.
  let h = 0;
  for (let i = 0; i < reminderId.length; i++) h = (h * 31 + reminderId.charCodeAt(i)) | 0;
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length];
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '1분 미만';
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export default function InsightsPage() {
  const { setContext } = useChatStore();
  const [range, setRange] = useState<Range>('7');

  useEffect(() => {
    setContext('home');
  }, [setContext]);

  const { from, to } = useMemo(() => {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (Number(range) - 1));
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(fromDate), to: fmt(today) };
  }, [range]);

  const { data: timeline = [], isLoading } = useQuery<TimelineDay[]>({
    queryKey: ['insights-timeline', from, to],
    queryFn: async () => {
      const res = await api.get('/api/insights/timeline', { params: { from, to } });
      return res.data;
    },
    staleTime: 60_000,
  });

  // Render a contiguous date axis even for days with no data.
  const days = useMemo<TimelineDay[]>(() => {
    const dailyMap = new Map(timeline.map((d) => [d.date, d]));
    const result: TimelineDay[] = [];
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push(dailyMap.get(key) ?? { date: key, total_minutes: 0, items: [] });
    }
    return result;
  }, [timeline, from, to]);

  const maxMinutes = useMemo(
    () => Math.max(60, ...days.map((d) => d.total_minutes)),
    [days],
  );
  const totalMinutes = useMemo(
    () => days.reduce((s, d) => s + d.total_minutes, 0),
    [days],
  );
  const activeDays = useMemo(
    () => days.filter((d) => d.total_minutes > 0).length,
    [days],
  );
  const avgPerActiveDay = activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;

  // Top reminders aggregated across the range.
  const topReminders = useMemo(() => {
    const agg = new Map<string, { id: string; title: string; color: string | null; minutes: number }>();
    for (const day of days) {
      for (const item of day.items) {
        const cur = agg.get(item.reminder_id);
        if (cur) cur.minutes += item.minutes;
        else agg.set(item.reminder_id, { id: item.reminder_id, title: item.title, color: item.color, minutes: item.minutes });
      }
    }
    return [...agg.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  }, [days]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          <h1 className="text-xl font-bold">인사이트</h1>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList variant="line">
            <TabsTrigger value="7">최근 7일</TabsTrigger>
            <TabsTrigger value="30">최근 30일</TabsTrigger>
            <TabsTrigger value="90">최근 90일</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-8 p-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="총 시간" value={formatDuration(totalMinutes)} />
            <SummaryCard label="활동한 날" value={`${activeDays}일`} />
            <SummaryCard label="활동일 평균" value={formatDuration(avgPerActiveDay)} />
          </div>

          {/* Daily stacked bar list */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">일별 시간 분포</h2>
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
              </div>
            ) : totalMinutes === 0 ? (
              <EmptyState />
            ) : (
              <ul className="space-y-2">
                {days.map((day) => (
                  <DayRow key={day.date} day={day} maxMinutes={maxMinutes} />
                ))}
              </ul>
            )}
          </section>

          {/* Top reminders */}
          {topReminders.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">시간을 가장 많이 쓴 ToDo</h2>
              <ul className="space-y-1.5">
                {topReminders.map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded"
                      style={{ backgroundColor: colorForReminder(r.id, r.color) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDuration(r.minutes)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DayRow({ day, maxMinutes }: { day: TimelineDay; maxMinutes: number }) {
  const widthPct = maxMinutes > 0 ? Math.round((day.total_minutes / maxMinutes) * 100) : 0;
  const date = new Date(`${day.date}T00:00:00`);
  // Aggregate items by reminder so the stacked bar uses one segment per ToDo,
  // not one per individual log entry.
  const agg = new Map<string, { id: string; title: string; color: string | null; minutes: number }>();
  for (const item of day.items) {
    const cur = agg.get(item.reminder_id);
    if (cur) cur.minutes += item.minutes;
    else agg.set(item.reminder_id, { id: item.reminder_id, title: item.title, color: item.color, minutes: item.minutes });
  }
  const segments = [...agg.values()].sort((a, b) => b.minutes - a.minutes);
  return (
    <li className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">
        {format(date, 'M월 d일 (EEE)', { locale: ko })}
      </span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
        {day.total_minutes > 0 && (
          <div
            className="flex h-full"
            style={{ width: `${widthPct}%` }}
          >
            {segments.map((seg) => {
              const segPct = day.total_minutes > 0 ? (seg.minutes / day.total_minutes) * 100 : 0;
              return (
                <div
                  key={seg.id}
                  title={`${seg.title} • ${formatDuration(seg.minutes)}`}
                  className="h-full"
                  style={{
                    width: `${segPct}%`,
                    backgroundColor: colorForReminder(seg.id, seg.color),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {day.total_minutes > 0 ? formatDuration(day.total_minutes) : '—'}
      </span>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 py-10 text-center text-zinc-400 dark:border-zinc-800">
      <Clock className="h-6 w-6" />
      <p className="text-sm">기록된 시간 데이터가 없습니다.</p>
      <p className="text-xs">ToDo를 진행 중으로 바꾸거나 캘린더에 시간을 잡으면 데이터가 쌓입니다.</p>
    </div>
  );
}
