'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

interface ActiveFocus {
  id: string;
  reminder_id: string;
  started_at: string;
  target_minutes: number | null;
  reminder: { id: string; title: string; color: string | null } | null;
}

function formatMMSS(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusBanner() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const { data: active } = useQuery<ActiveFocus | null>({
    queryKey: ['focus-active'],
    queryFn: async () => {
      const res = await api.get('/api/focus/active');
      return res.data ?? null;
    },
    // Cheap fallback in case another tab/device ends/starts a session.
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  // Tick the local clock once per second only when a session is active.
  useEffect(() => {
    if (!active) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [active]);

  // Fire a one-shot completion notification when the target is reached.
  // Guard with sessionStorage so reload doesn't refire.
  useEffect(() => {
    if (!active || !active.target_minutes) return;
    const startMs = new Date(active.started_at).getTime();
    const elapsedSec = Math.floor((now - startMs) / 1000);
    const targetSec = active.target_minutes * 60;
    if (elapsedSec >= targetSec) {
      const key = `focus-notified:${active.id}`;
      if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('포커스 세션 종료', {
            body: `${active.reminder?.title ?? 'ToDo'} • ${active.target_minutes}분이 끝났습니다.`,
          });
        }
        toast.info('포커스 시간이 끝났습니다 🎉');
      }
    }
  }, [active, now]);

  const endMutation = useMutation({
    mutationFn: async ({ logId, complete }: { logId: string; complete: boolean }) => {
      const res = await api.post(`/api/focus/${logId}/end`, { complete });
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['focus-active'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['insights-timeline'], exact: false });
      toast.success(vars.complete ? 'ToDo를 완료했습니다' : '포커스 세션을 중지했습니다');
    },
    onError: () => {
      toast.error('포커스 세션 종료에 실패했습니다');
    },
  });

  if (!active) return null;

  const startMs = new Date(active.started_at).getTime();
  const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));
  const targetSec = active.target_minutes ? active.target_minutes * 60 : null;
  const remainingSec = targetSec != null ? Math.max(0, targetSec - elapsedSec) : null;
  const display = remainingSec != null ? formatMMSS(remainingSec) : formatMMSS(elapsedSec);
  const progressPct = targetSec ? Math.min(100, (elapsedSec / targetSec) * 100) : 0;
  const overTarget = targetSec != null && elapsedSec >= targetSec;

  return (
    <div
      className={`border-b px-4 py-2 transition-colors ${
        overTarget
          ? 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30'
          : 'border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30'
      }`}
      role="status"
    >
      <div className="flex items-center gap-3">
        <Hourglass className={`h-4 w-4 ${overTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
        <span
          className={`text-sm font-medium ${
            overTarget ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
          }`}
        >
          포커스
        </span>
        <Link
          href={`/reminders/${active.reminder_id}`}
          className={`min-w-0 flex-1 truncate text-sm hover:underline ${
            overTarget ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
          }`}
        >
          {active.reminder?.title ?? '...'}
        </Link>
        <span
          className={`shrink-0 font-mono text-sm tabular-nums ${
            overTarget ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
          }`}
        >
          {display}
          {targetSec != null && (
            <span className="ml-1 text-xs opacity-70">/ {active.target_minutes}분</span>
          )}
        </span>
        <Button
          variant="outline"
          size="xs"
          className="gap-1"
          onClick={() => endMutation.mutate({ logId: active.id, complete: true })}
          disabled={endMutation.isPending}
          title="ToDo 완료 처리"
        >
          <CheckCircle2 className="h-3 w-3" />
          완료
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="gap-1"
          onClick={() => endMutation.mutate({ logId: active.id, complete: false })}
          disabled={endMutation.isPending}
          title="중지하고 시간만 기록"
        >
          <X className="h-3 w-3" />
          중지
        </Button>
      </div>
      {targetSec != null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-amber-200/70 dark:bg-amber-900/40">
          <div
            className={`h-full transition-all ${overTarget ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
