'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight, Search, Clock, Flame, Sparkles, LayoutDashboard } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  return (
    // Homepage keeps its original light design inside the site's dark shell.
    <div className="bg-[#F8FAFC] text-slate-900">
    <div className="relative min-h-[calc(100vh-80px)] flex flex-col justify-between max-w-7xl mx-auto px-6 py-8 sm:py-12">
      {/* Top Tag */}
      <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-4 font-semibold tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-900"></span>
        <span>CAMPUS SPEEDRUN &mdash; ACADEMIC & FACILITIES REDRESSAL</span>
      </div>

      {/* Main Hero Section with High-Contrast Editorial Typography */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center my-auto">
        <div className="lg:col-span-8 space-y-6">
          {/* Stunning Large Serif Title */}
          <h1 className="font-serif text-5xl sm:text-7xl lg:text-8xl font-normal tracking-tight text-slate-900 leading-[1.05]">
            Turn Reports into <br />
            <span className="italic font-light text-slate-600">Rapid Action</span>
          </h1>

          <div className="max-w-xl space-y-4 pt-2">
            <p className="text-base sm:text-lg text-slate-600 font-light leading-relaxed">
              An institutional engine for anonymous problem reporting, automated hazard triage, and strict 72-hour multi-tier escalation across department coordinators.
            </p>

            {/* Pill CTA Button */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {user ? (
                <Link
                  href={user.role === 'STUDENT' ? '/dashboard' : `/dashboard?role=${user.role}`}
                  className="px-8 py-3.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-2.5 group"
                >
                  <LayoutDashboard className="w-4 h-4 text-white" />
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                </Link>
              ) : (
                <button
                  onClick={() => router.push('/login')}
                  className="px-8 py-3.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 font-semibold text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-2.5 group"
                >
                  <span>Register / Sign In</span>
                  <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-1 transition-transform" />
                </button>
              )}

              <Link
                href="/student/submit"
                className="px-6 py-3.5 rounded-full border border-slate-300 hover:border-slate-800 text-slate-800 text-xs font-semibold tracking-wide flex items-center gap-2 transition-all hover:bg-slate-100"
              >
                <span>File Report</span>
              </Link>

              <Link
                href="/track"
                className="px-6 py-3.5 rounded-full border border-slate-300 hover:border-slate-800 text-slate-800 text-xs font-semibold tracking-wide flex items-center gap-2 transition-all hover:bg-slate-100"
              >
                <Search className="w-3.5 h-3.5 text-slate-600" />
                <span>Track Ticket</span>
              </Link>
            </div>

            {!user && !loading && (
              <div className="pt-2 text-xs text-slate-500">
                Staff or Faculty coordinator?{' '}
                <Link href="/login" className="text-slate-900 font-medium hover:underline underline-offset-4">
                  Access portal here
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Editorial Stat & Escalation Showcase Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/90 shadow-sm p-6 sm:p-7 rounded-3xl space-y-4 relative overflow-hidden group hover:border-slate-400 transition-colors">
            <div className="flex items-center justify-between text-xs">
              <span className="pill-tag text-xs font-mono font-medium">
                72h Auto-Escalation
              </span>
              <Clock className="w-4 h-4 text-slate-600" />
            </div>

            <div className="pt-2">
              <div className="font-serif text-4xl sm:text-5xl font-light text-slate-900 tracking-tight">
                3 Tiers
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1 font-medium">
                Teacher &rarr; Faculty &rarr; Administration
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
              If a ticket is unaddressed within 3 days (72 hours), the system automatically advances it to the next authority level with SLA alert notifications.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Floating Visual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-12">
        {/* Editorial Feature Card */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg space-y-3 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-white/10 text-white text-xs font-mono font-semibold">
              Anonymous
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-mono">
              Zero PII
            </span>
          </div>

          <div>
            <h3 className="font-serif text-lg font-bold text-white tracking-tight leading-snug">
              Report Freely Without Fear of Retaliation
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Student names and emails are mathematically detached from incident reports. Staff sees only your issue description and ticket reference.
            </p>
          </div>

          <Link
            href="/student/submit"
            className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pt-2 hover:translate-x-1 transition-transform"
          >
            <span>Submit a Report</span>
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </Link>
        </div>

        {/* Light Glass Card: Hazard Radar */}
        <div className="bg-white border border-slate-200/90 shadow-sm p-6 rounded-3xl space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="pill-tag text-xs font-mono">
              Hazard Radar
            </span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-slate-900 tracking-tight leading-snug">
              Damage-Prone Hotspots
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Automatically flags repeated equipment failures across laboratories, lecture halls, and engineering workshops before catastrophic breakdown.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-500 pt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-900"></span>
            <span>Academic facilities only &bull; Zero hostels</span>
          </div>
        </div>

        {/* Light Glass Card: Triage Engine */}
        <div className="bg-white border border-slate-200/90 shadow-sm p-6 rounded-3xl space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="pill-tag text-xs font-mono">
              Priority Scoring
            </span>
            <Sparkles className="w-4 h-4 text-slate-600" />
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-slate-900 tracking-tight leading-snug">
              Objective Risk Ranking
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              High-voltage electrical hazards, physical wobbling fixtures, and class disruptions are calculated between 0 and 100, ranking above chronological queues.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-500 pt-2">
            Deterministic 0&ndash;100 scoring
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
