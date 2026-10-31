import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Navbar from '@/components/Navbar';
import SiteBackdrop from '@/components/SiteBackdrop';
import SiteFooter from '@/components/SiteFooter';
import { MotionProvider } from '@/components/motion';

const sans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});
const mono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Campus Pulse+ — Report, track and resolve campus issues',
  description:
    'Report campus issues anonymously, track their progress, and see them resolved through a 72-hour, three-tier escalation chain.',
};

// Locked to device width for the installed app (PWA / Capacitor).
export const viewport: Viewport = {
  themeColor: '#08090B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`bg-ink-950 ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-ink-950 text-fg font-sans relative" suppressHydrationWarning>
        <AuthProvider>
          <MotionProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-fg focus:text-ink-950 focus:text-sm focus:font-medium"
            >
              Skip to content
            </a>

            <SiteBackdrop />
            <Navbar />

            <main id="main" className="flex-1 relative z-10">
              {children}
            </main>

            <SiteFooter />
          </MotionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
