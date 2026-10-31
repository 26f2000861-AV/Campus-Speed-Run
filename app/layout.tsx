import type { Metadata } from 'next';
import { JetBrains_Mono, Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import Navbar from '@/components/Navbar';

// Self-hosted, subset, non-blocking fonts: only the weights the UI actually uses.
const serif = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
});
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Campus Speedrun — AI-Powered Academic & Infrastructure Triage Engine',
  description: 'Anonymous campus issue reporting with AI triage, priority scoring and 72-hour three-tier auto-escalation.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`bg-slate-950 ${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body
        className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans relative"
        suppressHydrationWarning
      >
        <AuthProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:bg-slate-100 focus:text-slate-950 focus:text-xs focus:font-semibold"
          >
            Skip to content
          </a>

          <Navbar />

          <main id="main" className="flex-1 relative z-10">
            {children}
          </main>

          <footer className="relative z-10 border-t border-slate-800 mt-16 py-10 text-xs text-slate-400 bg-slate-950">
            <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="md:col-span-2 space-y-2">
                <div className="font-serif text-base text-slate-100">Campus Speedrun</div>
                <p className="max-w-sm leading-relaxed">
                  AI-Powered Academic &amp; Infrastructure Triage Engine. Anonymous reporting, objective priority
                  scoring and a 72-hour, three-tier escalation chain.
                </p>
              </div>
              <div>
                <h2 className="cs-label text-slate-300 mb-3">Escalation</h2>
                <ul className="space-y-1.5">
                  <li>Tier 1 &mdash; Teacher</li>
                  <li>Tier 2 &mdash; Faculty</li>
                  <li>Tier 3 &mdash; Administrative</li>
                </ul>
              </div>
              <div>
                <h2 className="cs-label text-slate-300 mb-3">Guarantees</h2>
                <ul className="space-y-1.5">
                  <li>Anonymous to all staff</li>
                  <li>CSR- / REP- tracking IDs</li>
                  <li>Email &amp; password only</li>
                </ul>
              </div>
            </div>
            <div className="max-w-7xl mx-auto px-6 mt-8 pt-5 border-t border-slate-800 text-xs text-slate-400">
              &copy; {new Date().getFullYear()} Campus Speedrun
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
