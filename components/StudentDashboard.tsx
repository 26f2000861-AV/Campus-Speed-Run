'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { StudentReportView } from '@/lib/types';
import {
  EmptyState,
  StatusBadge,
  TIER_LABEL,
  UrgencyPill,
  formatDate,
  nextStepText,
  readApiError,
  statusTone,
  useNow,
} from '@/components/ui';
import { ActivityRings, MetricCard } from '@/components/charts';
import { staggerChild, staggerParent } from '@/components/motion';
import {
  AlertOctagon,
  ArrowRight,
  Check,
  CheckCircle2,
  FilePlus2,
  Inbox,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Timer,
  Users,
} from 'lucide-react';

type View = 'open' | 'resolved' | 'all';

const TIERS = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'] as const;

/** Open reports first, ranked like the staff queue (spec 04): score desc, then nearest deadline. */
function comparePriority(a: StudentReportView, b: StudentReportView): number {
  const aOpen = a.status !== 'RESOLVED';
  const bOpen = b.status !== 'RESOLVED';
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (!aOpen) return Date.parse(b.created_at) - Date.parse(a.created_at);
  if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
  return Date.parse(a.stage_deadline) - Date.parse(b.stage_deadline);
}

/** Axis A of the spec 09 tracker: who currently holds the ticket. */
function TierStepper({ current, resolved }: { current: string; resolved: boolean }) {
  const idx = TIERS.indexOf(current as (typeof TIERS)[number]);
  return (
    <ol className="flex items-center gap-1.5 text-xs" aria-label="Escalation tier">
      {TIERS.map((tier, i) => {
        const done = i < idx || (resolved && i === idx);
        const active = i === idx && !resolved;
        return (
          <li key={tier} className="flex items-center gap-1.5">
            {i > 0 && <span className={`w-3 h-px ${i <= idx ? 'bg-fg-muted' : 'bg-line'}`} aria-hidden="true" />}
            <span
              aria-current={active ? 'step' : undefined}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border ${
                active ? 'border-fg/30 bg-white/[0.06] text-fg' : done ? 'border-line text-fg-muted' : 'border-line/60 text-fg-subtle'
              }`}
            >
              {done && <Check className="w-3 h-3" aria-hidden="true" />}
              {TIER_LABEL[tier]}
              <span className="sr-only">{active ? ' (has it now)' : done ? ' (done)' : ' (not yet)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ReportCard({ report, now }: { report: StudentReportView; now: number }) {
  const resolved = report.status === 'RESOLVED';
  const headingId = `report-${report.tracking_id}`;
  return (
    <motion.article
      layout
      variants={staggerChild}
      aria-labelledby={headingId}
      className="cs-card p-5 sm:p-6 transition-[border-color] duration-200 hover:border-line-strong"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fg-subtle mr-1">{report.tracking_id}</span>
        <StatusBadge status={report.status} />
        <UrgencyPill priority={report.priority} score={report.priority_score} calm />
      </div>

      <h3 id={headingId} className="mt-3 text-lg font-semibold leading-snug">
        {report.normalized_title || report.title}
      </h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
          {report.location_zone}
        </span>
        <span>{formatDate(report.created_at, false)}</span>
        {report.report_count > 1 && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            {report.report_count} students reported this
          </span>
        )}
      </p>

      <p className="mt-4 text-sm text-fg">{nextStepText(report, now)}</p>
      {!resolved && report.queue_position !== null && (
        <p className="mt-1 text-sm text-fg-muted">
          {report.queue_position === 1
            ? `First in the ${TIER_LABEL[report.current_handler_role] ?? ''} queue.`
            : `${report.queue_position - 1} more urgent ${report.queue_position - 1 === 1 ? 'issue is' : 'issues are'} ahead of it.`}
        </p>
      )}

      <div className="mt-5 pt-4 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <TierStepper current={report.current_handler_role} resolved={resolved} />
        <Link href={`/track?id=${encodeURIComponent(report.tracking_id)}`} className="btn-secondary h-9 shrink-0">
          View timeline <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
      {report.receipt_ids.length > 0 && (
        <p className="mt-3 text-xs text-fg-subtle font-mono">Receipt {report.receipt_ids.join(', ')}</p>
      )}
    </motion.article>
  );
}

export default function StudentDashboard() {
  const router = useRouter();
  const now = useNow(30_000);
  const [reports, setReports] = useState<StudentReportView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('open');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/complaints/my-reports', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) throw new Error(await readApiError(res, 'We couldn’t load your reports.'));
      const data = await res.json();
      setReports(Array.isArray(data.complaints) ? data.complaints : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t load your reports.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => [...reports].sort(comparePriority), [reports]);
  const open = sorted.filter((r) => r.status !== 'RESOLVED');
  const shown = view === 'open' ? open : view === 'resolved' ? sorted.filter((r) => r.status === 'RESOLVED') : sorted;
  const counts = useMemo(() => {
    const tones = sorted.map((r) => statusTone(r.status));
    return {
      total: sorted.length,
      resolved: tones.filter((t) => t === 'ok').length,
      inProgress: tones.filter((t) => t === 'warn').length,
      unresolved: tones.filter((t) => t === 'bad').length,
    };
  }, [sorted]);
  const urgent = open.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').slice(0, 4);
  const firstLoad = loading && reports.length === 0;

  const tabs: Array<{ id: View; label: string; count: number }> = [
    { id: 'open', label: 'Open', count: open.length },
    { id: 'resolved', label: 'Resolved', count: counts.resolved },
    { id: 'all', label: 'All', count: sorted.length },
  ];

  return (
    <div className="max-w-6xl mx-auto py-10 sm:py-14 px-4 sm:px-6 space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold">My reports</h1>
          <p className="mt-2 text-fg-muted">Staff only ever see a ticket number, never your name.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/student/submit" className="btn-primary flex-1 sm:flex-none">
            <FilePlus2 className="w-4 h-4" aria-hidden="true" /> Report an issue
          </Link>
          <Link href="/track" className="btn-secondary flex-1 sm:flex-none">
            <Search className="w-4 h-4" aria-hidden="true" /> Track
          </Link>
          <button type="button" onClick={load} disabled={loading} className="btn-icon shrink-0" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="alert-error items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2 shrink-0 font-medium">
            Try again
          </button>
        </div>
      )}

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total reports', value: counts.total, icon: Inbox },
          { label: 'Resolved', value: counts.resolved, icon: CheckCircle2, tone: 'ok' as const },
          { label: 'In progress', value: counts.inProgress, icon: Timer, tone: 'warn' as const },
          { label: 'Unresolved', value: counts.unresolved, icon: AlertOctagon, tone: 'bad' as const },
        ].map((m) => (
          <motion.div key={m.label} variants={staggerChild}>
            <MetricCard {...m} loading={firstLoad} />
          </motion.div>
        ))}
      </motion.div>

      <div className="grid lg:grid-cols-[minmax(0,380px)_1fr] gap-4">
        <section className="cs-card p-5 sm:p-6" aria-labelledby="overview-heading">
          <h2 id="overview-heading" className="text-sm font-medium text-fg-muted">
            Status overview
          </h2>
          <div className="mt-5">
            <ActivityRings
              loading={firstLoad}
              total={counts.total}
              centerLabel={counts.total === 1 ? 'report' : 'reports'}
              data={[
                { label: 'Resolved', count: counts.resolved, tone: 'ok' },
                { label: 'In progress', count: counts.inProgress, tone: 'warn' },
                { label: 'Unresolved', count: counts.unresolved, tone: 'bad' },
              ]}
            />
          </div>
        </section>

        <section className="cs-card p-5 sm:p-6 flex flex-col" aria-labelledby="urgent-heading">
          <h2 id="urgent-heading" className="text-sm font-medium text-fg-muted">
            Urgent issues
          </h2>
          {firstLoad ? (
            <div className="mt-4 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : urgent.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={CheckCircle2} title="Nothing urgent" body="None of your open reports are high or critical priority." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {urgent.map((r) => (
                <li key={r.tracking_id}>
                  <Link
                    href={`/track?id=${encodeURIComponent(r.tracking_id)}`}
                    className="group flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-white/[0.03]"
                  >
                    <UrgencyPill priority={r.priority} calm />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{r.normalized_title || r.title}</span>
                      <span className="block text-xs text-fg-subtle truncate">
                        {r.tracking_id} · {r.location_zone}
                      </span>
                    </span>
                    <StatusBadge status={r.status} />
                    <ArrowRight className="hidden sm:block w-4 h-4 text-fg-subtle group-hover:text-fg transition-colors" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="reports-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="reports-heading" className="text-lg font-semibold">
            Reports
          </h2>
          <div role="tablist" aria-label="Filter reports" className="inline-flex p-1 rounded-xl bg-ink-900 border border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={view === t.id}
                onClick={() => setView(t.id)}
                className={`relative h-8 px-3 rounded-lg text-sm transition-colors ${view === t.id ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
              >
                {view === t.id && (
                  <motion.span
                    layoutId="student-tab"
                    className="absolute inset-0 rounded-lg bg-white/[0.08]"
                    transition={{ type: 'spring', stiffness: 450, damping: 38 }}
                  />
                )}
                <span className="relative">
                  {t.label} <span className="font-mono text-xs text-fg-subtle">{firstLoad ? '–' : t.count}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {loading ? 'Loading your reports' : `${shown.length} reports shown`}
        </div>

        {firstLoad ? (
          <div className="cs-card p-10 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your reports…
          </div>
        ) : shown.length === 0 && !error ? (
          <div className="cs-card">
            <EmptyState
              icon={Inbox}
              title={view === 'resolved' ? 'Nothing resolved yet' : sorted.length ? 'No open reports' : 'No reports yet'}
              body={
                sorted.length
                  ? 'Switch tabs to see your other reports.'
                  : 'Spotted a broken fan, a leak or a dead network port? Report it and follow it here.'
              }
              action={
                !sorted.length && (
                  <Link href="/student/submit" className="btn-primary">
                    <FilePlus2 className="w-4 h-4" aria-hidden="true" /> Report your first issue
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div key={view} variants={staggerParent} initial="hidden" animate="show" className="grid md:grid-cols-2 gap-4">
              {shown.map((r) => (
                <ReportCard key={r.tracking_id} report={r} now={now} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}
