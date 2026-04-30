import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'CalenMate',
  description: 'AI-powered calendar & reminder management',
};

// Inline FOUC-prevention script — runs synchronously before paint to apply the
// persisted/system theme class on <html>. Lives in <head> of the Server Component
// layout so it streams once with the SSR HTML and is never re-rendered/hydrated
// (which would trigger React 19's "script in client component" warning).
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var r=(t==='dark'||t==='light')?t:s;var d=document.documentElement;if(r==='dark'){d.classList.add('dark');}else{d.classList.remove('dark');}d.style.colorScheme=r;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script>{themeInitScript}</script>
      </head>
      <body className="h-full">
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
