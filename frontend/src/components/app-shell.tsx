'use client';

import { Sidebar } from '@/components/sidebar';
import { ChatPanel } from '@/components/chat-panel';
import { FocusBanner } from '@/components/focus-banner';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <FocusBanner />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <ChatPanel />
    </div>
  );
}
