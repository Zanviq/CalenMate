'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { LogOut, CheckCircle2, Bell, Palette } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function SettingsPage() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();

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

      {/* Calendar Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            캘린더 동기화
          </CardTitle>
          <CardDescription>Google 캘린더와 연동 상태를 확인합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Google Calendar</span>
            <Badge variant="secondary" className="bg-green-50 text-green-700">
              연동됨
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            로그인 시 캘린더 읽기/쓰기 권한이 부여되어 자동으로 동기화됩니다.
          </p>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            알림 설정
          </CardTitle>
          <CardDescription>리마인더 및 일정 알림을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400">
            브라우저 알림 기능은 추후 업데이트 예정입니다.
          </p>
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
          <p className="text-sm text-zinc-400">
            테마 설정은 추후 업데이트 예정입니다.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* Sign Out */}
      <Button variant="outline" className="w-full gap-2" onClick={handleSignOut}>
        <LogOut className="h-4 w-4" />
        로그아웃
      </Button>
    </div>
  );
}
