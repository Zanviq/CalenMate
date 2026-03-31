'use client';

import { Sidebar } from '@/components/sidebar';
import { ChatPanel } from '@/components/chat-panel';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <ChatPanel />
    </div>
  );
}
