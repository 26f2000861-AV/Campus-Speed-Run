'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, BookOpen, Check, GraduationCap, Landmark, Lock, X } from 'lucide-react';
import type { ComplaintGroupView } from '@/lib/types';
import { StatusBadge, slaInfo, statusTone } from '@/components/ui';
import { EASE_OUT, staggerChild, staggerParent } from '@/components/motion';
import { viewHref, type ConsoleView } from '@/components/console/ConsoleShell';

export type StaffTier = 'TEACHER' | 'FACULTY' | 'ADMINISTRATIVE';

// What each tier is for and what it may do. Mirrors lib/store.ts (NEXT_TIER,
// requireTicketAtTier) and the SQL auto_escalate_stale_complaints() function.
export const TIER_INFO: Record<
  StaffTier,
  { n: number; label: string; plural: string; view: ConsoleView; icon: typeof BookOpen; duty: string; window: string; next: string | null }
> = {
  TEACHER: {
    n: 1,
    label: 'Teacher',
    plural: 'Teachers',
    view: 'tier-teacher',
    icon: BookOpen,
    duty: 'First response. Every new complaint starts here.',
    window: '72 hours, then it moves to Faculty automatically.',
    next: 'Faculty',
  },
  FACULTY: {
    n: 2,
    label: 'Faculty',
    plural: 'Faculty',
    view: 'tier-faculty',
    icon: GraduationCap,
    duty: 'Escalated complaints that need departmental authority.',
    window: '72 hours, then it moves to Administration automatically.',
    next: 'Administration',
  },
  ADMINISTRATIVE: {
    n: 3,
    label: 'Administration',
    plural: 'Administration',
    view: 'tier-admin',
    icon: Landmark,
    duty: 'Final authority for campus-wide and high-cost issues.',
    window: '72-hour target. Final tier — overdue complaints stay flagged until resolved.',
    next: null,
  },
};

const TIERS: StaffTier[] = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'];

function tierStats(rows: ComplaintGroupView[], now: number) {
  const levels = rows.map((r) => slaInfo(r.stage_deadline, now).level);
  return {
    open: rows.length,
    waiting: rows.filter((r) => statusTone(r.status) === 'bad').length,
    working: rows.filter((r) => statusTone(r.status) === 'warn').length,
    dueSoon: levels.filter((l) => l === 'warn').length,
    overdue: levels.filter((l) => l === 'breached').length,
  };
}

function Permission({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-2 text-sm ${allowed ? '' : 'text-fg-subtle'}`}>
      {allowed ? (
        <Check className="w-4 h-4 mt-0.5 shrink-0 text-ok" aria-hidden="true" />
      ) : (
        <X className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      )}
      <span>
        <span className="sr-only">{allowed ? 'Allowed: ' : 'Not allowed: '}</span>
        {children}
      </span>
    </li>
  );
}

/** Three-tier overview: who holds what, how loaded each tier is, and how complaints move up. */
export function EscalationChain({
  chain,
  role,
  now,
  onOpen,
  loading,
}: {
  chain: ComplaintGroupView[];
  role: StaffTier;
  now: number;
  onOpen: (t: ComplaintGroupView, opener: HTMLElement | null) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <motion.ol
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-stretch"
        aria-label="Escalation chain"
      >
        {TIERS.map((tier, i) => {
          const info = TIER_INFO[tier];
          const rows = chain.filter((c) => c.current_handler_role === tier);
          const s = tierStats(rows, now);
          const mine = tier === role;
          return [
            <motion.li
              key={tier}
              variants={staggerChild}
              aria-current={mine ? 'true' : undefined}
              className={`cs-card p-5 flex flex-col ${mine ? 'border-fg/25 shadow-lift' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="w-10 h-10 rounded-xl border border-line bg-white/[0.04] inline-flex items-center justify-center">
                  <info.icon className="w-5 h-5" aria-hidden="true" />
                </span>
                {mine && <span className="h-6 px-2 rounded-md bg-fg text-ink-950 text-xs font-medium inline-flex items-center">Your tier</span>}
              </div>
              <p className="mt-4 text-xs font-mono text-fg-subtle">Tier {info.n}</p>
              <h2 className="text-lg font-semibold">{info.label}</h2>
              <p className="mt-1 text-sm text-fg-muted">{info.duty}</p>

              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  { k: 'Open', v: s.open, cls: '' },
                  { k: 'Waiting', v: s.waiting, cls: s.waiting ? 'text-bad-soft' : '' },
                  { k: 'Overdue', v: s.overdue, cls: s.overdue ? 'text-bad-soft' : '' },
                ].map((d) => (
                  <div key={d.k} className="rounded-lg border border-line bg-ink-950/50 py-2">
                    <dd className={`text-xl font-semibold tabular-nums ${d.cls}`}>{loading ? '–' : d.v}</dd>
                    <dt className="text-[11px] text-fg-subtle">{d.k}</dt>
                  </div>
                ))}
              </dl>

              {/* Share of this tier's queue that is waiting vs being worked on */}
              <div className="mt-3 h-1.5 rounded-full bg-white/[0.05] overflow-hidden flex" aria-hidden="true">
                <motion.span
                  className="h-full bg-bad"
                  initial={{ width: 0 }}
                  animate={{ width: s.open ? `${(s.waiting / s.open) * 100}%` : 0 }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.1, ease: EASE_OUT }}
                />
                <motion.span
                  className="h-full bg-warn"
                  initial={{ width: 0 }}
                  animate={{ width: s.open ? `${(s.working / s.open) * 100}%` : 0 }}
                  transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: EASE_OUT }}
                />
              </div>

              <ul className="mt-4 space-y-1 flex-1">
                {loading ? (
                  <li className="skeleton h-10" aria-hidden="true" />
                ) : rows.length === 0 ? (
                  <li className="text-sm text-fg-subtle py-2">Nothing at this tier.</li>
                ) : (
                  rows.slice(0, 3).map((c) => (
                    <li key={c.tracking_id}>
                      <button
                        type="button"
                        onClick={(e) => onOpen(c, e.currentTarget)}
                        className="w-full flex items-center gap-2 -mx-2 px-2 py-2 rounded-lg text-left hover:bg-white/[0.03]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm truncate">{c.normalized_title || c.title}</span>
                          <span className="block text-xs text-fg-subtle font-mono">{c.tracking_id}</span>
                        </span>
                        <StatusBadge status={c.status} />
                      </button>
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-4 pt-4 border-t border-line flex items-center justify-between gap-2">
                <span className="text-xs text-fg-subtle">{info.window}</span>
                <Link href={viewHref(info.view, role)} className="btn-ghost h-8 px-2 text-xs shrink-0">
                  Open <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            </motion.li>,
            i < TIERS.length - 1 && (
              <li key={`${tier}-arrow`} aria-hidden="true" className="flex xl:flex-col items-center justify-center gap-2 py-1 text-fg-subtle">
                <ArrowRight className="hidden xl:block w-5 h-5" />
                <ArrowDown className="xl:hidden w-5 h-5" />
                <span className="text-[11px] text-center leading-tight">
                  72h or
                  <br className="hidden xl:block" /> forward
                </span>
              </li>
            ),
          ];
        })}
      </motion.ol>

      <section className="cs-card p-5 sm:p-6" aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="text-[15px] font-semibold">
          How complaints move
        </h2>
        <ol className="mt-4 grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm text-fg-muted list-decimal list-inside marker:text-fg-subtle">
          <li>Every new complaint starts with Teachers, with a 72-hour clock.</li>
          <li>The tier holding a complaint can acknowledge it, start work, or resolve it.</li>
          <li>Teachers can forward to Faculty, and Faculty to Administration — one step up, never down.</li>
          <li>If the clock runs out, the complaint escalates automatically and the next tier is notified.</li>
          <li>Each move restarts the 72-hour clock. Administration is the final tier.</li>
          <li>Other tiers can see a complaint here, but only its current tier can change it.</li>
        </ol>
      </section>
    </div>
  );
}

/** Header for a single tier's section: its job, its permissions and its live load. */
export function TierHeader({
  tier,
  role,
  rows,
  now,
  loading,
}: {
  tier: StaffTier;
  role: StaffTier;
  rows: ComplaintGroupView[];
  now: number;
  loading: boolean;
}) {
  const info = TIER_INFO[tier];
  const s = tierStats(rows, now);
  const mine = tier === role;
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
      <section className={`cs-card p-5 sm:p-6 ${mine ? 'border-fg/25' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl border border-line bg-white/[0.04] inline-flex items-center justify-center">
            <info.icon className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-mono text-fg-subtle">Tier {info.n}</p>
            <p className="text-lg font-semibold">{info.plural}</p>
          </div>
          {mine ? (
            <span className="ml-auto h-6 px-2 rounded-md bg-fg text-ink-950 text-xs font-medium inline-flex items-center">Your tier</span>
          ) : (
            <span className="ml-auto h-6 px-2 rounded-md border border-line text-xs text-fg-muted inline-flex items-center gap-1">
              <Lock className="w-3 h-3" aria-hidden="true" /> View only
            </span>
          )}
        </div>
        <p className="mt-4 text-sm text-fg-muted">{info.duty}</p>
        <p className="mt-1 text-sm text-fg-muted">Window: {info.window}</p>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { k: 'Open', v: s.open, cls: '' },
            { k: 'Waiting', v: s.waiting, cls: s.waiting ? 'text-bad-soft' : '' },
            { k: 'In progress', v: s.working, cls: s.working ? 'text-warn-soft' : '' },
            { k: 'Overdue', v: s.overdue, cls: s.overdue ? 'text-bad-soft' : '' },
          ].map((d) => (
            <div key={d.k} className="rounded-xl border border-line bg-ink-950/50 p-3">
              <dt className="text-xs text-fg-subtle">{d.k}</dt>
              <dd className={`mt-1 text-xl font-semibold tabular-nums ${d.cls}`}>{loading ? '–' : d.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="cs-card p-5 sm:p-6" aria-label={`${info.label} permissions`}>
        <h2 className="text-sm font-medium text-fg-muted">At this tier, staff can</h2>
        <ul className="mt-4 space-y-2.5">
          <Permission allowed>Acknowledge and start work</Permission>
          <Permission allowed>Resolve with a note for the student</Permission>
          <Permission allowed={!!info.next}>{info.next ? `Forward to ${info.next}` : 'Forward — this is the final tier'}</Permission>
          <Permission allowed={tier === 'ADMINISTRATIVE'}>Run the +72h escalation test</Permission>
          <Permission allowed={tier === 'ADMINISTRATIVE'}>Issue staff registration codes</Permission>
        </ul>
        {!mine && (
          <p className="mt-4 pt-4 border-t border-line text-xs text-fg-subtle">
            You can open these complaints, but only {info.plural} can change them.
          </p>
        )}
      </section>
    </div>
  );
}
