'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/theme';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LogOut,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Palette,
  Sun,
  Moon,
  Monitor,
  Calendar,
  Flag,
  ListTodo,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  defaultCalendarView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  defaultReminderPriority: 'low' | 'medium' | 'high';
  language: 'ko' | 'en';
}

type ConnectionState =
  | { connected: true }
  | { connected: false; reason: 'not_linked' | 'invalid_grant' | 'forbidden' | 'unknown'; message: string };

interface ConnectionStatus {
  googleLinked: boolean;
  calendar: ConnectionState;
  tasks: ConnectionState;
}

const themeOptions = [
  { value: 'light', label: '라이트', icon: Sun },
  { value: 'dark', label: '다크', icon: Moon },
  { value: 'system', label: '시스템', icon: Monitor },
] as const;

const calendarViewOptions = [
  { value: 'dayGridMonth', label: '월간' },
  { value: 'timeGridWeek', label: '주간' },
  { value: 'timeGridDay', label: '일간' },
] as const;

const priorityOptions = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
] as const;

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/api/settings');
      return res.data;
    },
  });

  const {
    data: connection,
    isFetching: connectionFetching,
    refetch: refetchConnection,
  } = useQuery<ConnectionStatus>({
    queryKey: ['connection-status'],
    queryFn: async () => {
      const res = await api.get('/api/auth/connection-status');
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Sync theme from server settings on load
  useEffect(() => {
    if (settings?.theme && settings.theme !== theme) {
      setTheme(settings.theme);
    }
  }, [settings?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettingsMutation = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const res = await api.patch('/api/settings', patch);
      return res.data as UserSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
    },
  });

  const handleThemeChange = (value: UserSettings['theme']) => {
    setTheme(value);
    updateSettingsMutation.mutate({ theme: value });
  };

  const handleCalendarViewChange = (value: string | null) => {
    if (!value) return;
    updateSettingsMutation.mutate({ defaultCalendarView: value as UserSettings['defaultCalendarView'] });
  };

  const handlePriorityChange = (value: string | null) => {
    if (!value) return;
    updateSettingsMutation.mutate({ defaultReminderPriority: value as UserSettings['defaultReminderPriority'] });
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-bold">설정</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">프로필</CardTitle>
          <CardDescription>Google 계정으로 로그인되어 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {user?.avatar_url && (
              <AvatarImage src={user.avatar_url} alt={user?.display_name} />
            )}
            <AvatarFallback className="text-lg">
              {user?.display_name?.[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-medium">{user?.display_name}</p>
            <p className="text-sm text-zinc-500">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Google 동기화 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Google 동기화
              </CardTitle>
              <CardDescription>캘린더와 ToDo(Tasks) 연동 상태입니다.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => refetchConnection()}
              disabled={connectionFetching}
              title="상태 다시 확인"
            >
              <RefreshCw className={`h-4 w-4 ${connectionFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConnectionRow
            icon={<Calendar className="h-4 w-4 text-zinc-500" />}
            label="Google Calendar"
            state={connection?.calendar}
            loading={connectionFetching && !connection}
          />
          <Separator />
          <ConnectionRow
            icon={<ListTodo className="h-4 w-4 text-zinc-500" />}
            label="Google Tasks (ToDo)"
            state={connection?.tasks}
            loading={connectionFetching && !connection}
          />
          {connection &&
            ((!connection.calendar.connected && connection.calendar.reason !== 'not_linked') ||
              (!connection.tasks.connected && connection.tasks.reason !== 'not_linked')) && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                연결에 문제가 있는 경우 로그아웃 후 다시 로그인하면 권한이 갱신됩니다.
              </p>
            )}
          {connection && !connection.googleLinked && (
            <p className="text-xs text-zinc-400">
              Google 계정으로 다시 로그인하면 캘린더/ToDo가 자동으로 연동됩니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            테마
          </CardTitle>
          <CardDescription>앱의 외관을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const isActive = (theme ?? 'system') === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleThemeChange(opt.value)}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                    isActive
                      ? 'border-foreground bg-muted'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            기본값 설정
          </CardTitle>
          <CardDescription>새 항목 생성 시 적용되는 기본값입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">기본 캘린더 뷰</p>
              <p className="text-xs text-muted-foreground">캘린더 페이지의 기본 표시 방식</p>
            </div>
            <Select
              value={settings?.defaultCalendarView ?? 'dayGridMonth'}
              onValueChange={handleCalendarViewChange}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {calendarViewOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Flag className="h-3.5 w-3.5" />
                기본 ToDo 우선순위
              </p>
              <p className="text-xs text-muted-foreground">새 ToDo의 기본 우선순위</p>
            </div>
            <Select
              value={settings?.defaultReminderPriority ?? 'medium'}
              onValueChange={handlePriorityChange}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardContent className="flex items-center justify-between pt-6">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">로그아웃</p>
            <p className="text-xs text-muted-foreground">현재 계정에서 로그아웃합니다.</p>
          </div>
          <Button variant="outline" className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface ConnectionRowProps {
  icon: React.ReactNode;
  label: string;
  state: ConnectionState | undefined;
  loading: boolean;
}

function ConnectionRow({ icon, label, state, loading }: ConnectionRowProps) {
  let badge: React.ReactNode;
  let detail: string | null = null;

  if (loading || !state) {
    badge = (
      <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        확인 중...
      </Badge>
    );
  } else if (state.connected) {
    badge = (
      <Badge variant="secondary" className="gap-1 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        연동됨
      </Badge>
    );
  } else if (state.reason === 'not_linked') {
    badge = (
      <Badge variant="secondary" className="gap-1 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <XCircle className="h-3 w-3" />
        미연결
      </Badge>
    );
    detail = state.message;
  } else {
    badge = (
      <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" />
        오류
      </Badge>
    );
    detail = state.message;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </span>
        {badge}
      </div>
      {detail && <p className="pl-6 text-xs text-zinc-400">{detail}</p>}
    </div>
  );
}
