'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Home, Calendar, CheckSquare, Settings, LogOut, User } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/store/auth';

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/reminders', label: 'Reminders', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const initials = user?.display_name
    ? user.display_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <aside className="flex h-full w-16 flex-col items-center bg-zinc-900 py-4 text-zinc-400">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-sm font-bold text-white">
        CM
      </div>

      <Separator className="mx-auto mb-4 w-8 bg-zinc-700" />

      <nav className="flex flex-1 flex-col items-center gap-2">
        <TooltipProvider>
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Tooltip key={href}>
                <TooltipTrigger
                  render={
                    <Link
                      href={href}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                        isActive
                          ? 'bg-zinc-700 text-white'
                          : 'hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    />
                  }
                >
                  <Icon className="h-5 w-5" />
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      <Separator className="mx-auto mb-4 w-8 bg-zinc-700" />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-zinc-800" />}
        >
            <Avatar className="h-8 w-8">
              {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={user.display_name} />}
              <AvatarFallback className="bg-zinc-700 text-xs text-zinc-300">
                {initials}
              </AvatarFallback>
            </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{user?.display_name ?? 'Guest'}</p>
            <p className="text-xs text-muted-foreground">{user?.email ?? ''}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/settings')}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}
