'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StudentReportView } from '@/lib/types';
import { ScoreMeter, StatusBadge, SummaryLines, TIER_LABEL, UrgencyPill, nextStepText, readApiError, useNow } from '@/components/ui';
import { ArrowRight, Building, Check, FilePlus2, Loader2, RefreshCw, Search, Users } from 'lucide-react';

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
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Escalation tier">
      {TIERS.map((tier, i) => {
        const done = i < idx || (resolved && i === idx);
        const active = i === idx && !resolved;
        return (
          <li key={tier} className="flex items-center gap-1.5">
            {i > 0 && <span className={`w-4 h-px ${i <= idx ? 'bg-slate-400' : 'bg-slate-700'}`} aria-hidden="true" />}
            <span
              aria-current={active ? 'step' : undefined}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                active
                  ? 'border-indigo-500 bg-indigo-950 text-indigo-100'
                  : done
                  ? 'border-slate-600 bg-slate-800 text-slate-200'
                  : 'border-slate-800 text-slate-400'
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

function ReportCard({ report, rank, now }: { report: StudentReportView; rank: number | null; now: number }) {
  const resolved = report.status === 'RESOLVED';
  const headingId = `report-${report.tracking_id}`;
  return (
    <article
      aria-labelledby={headingId}
      className={`cs-card p-5 sm:p-6 space-y-4 ${resolved ? 'opacity-80' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {rank !== null && (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-950 text-xs font-mono font-bold">
              #{rank} of your reports
            </span>
          )}
          <UrgencyPill priority={report.priority} score={report.priority_score} calm />
          <StatusBadge status={report.status} />
        </div>
      </div>

      <ScoreMeter priority={report.priority} score={report.priority_score} />

      <div className="space-y-1.5">
        <h2 id={headingId} className="font-serif text-xl text-slate-100 leading-snug">
          {report.normalized_title || report.title}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 font-mono">
          <span>Ticket #{report.tracking_id}</span>
          {report.receipt_ids.length > 0 && <span>Receipt {report.receipt_ids.join(', ')}</span>}
          <span className="inline-flex items-center gap-1 font-sans">
            <Building className="w-3.5 h-3.5" aria-hidden="true" />
            {report.location_zone}
          </span>
          {report.report_count > 1 && (
            <span className="inline-flex items-center gap-1 font-sans">
              <Users className="w-3.5 h-3.5" aria-hidden="true" />
              {report.report_count} students reported this
            </span>
          )}
        </p>
      </div>

      <SummaryLines summary={report.ai_summary} />

      <p className="text-sm text-slate-200 max-w-[34rem]">{nextStepText(report, now)}</p>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="space-y-2">
          <TierStepper current={report.current_handler_role} resolved={resolved} />
          {!resolved && report.queue_position !== null && (
            <p className="text-xs text-slate-300">
              {report.queue_position === 1
                ? `First in the ${TIER_LABEL[report.current_handler_role] ?? ''} queue.`
                : `${report.queue_position - 1} more urgent ticket${report.queue_position - 1 === 1 ? ' is' : 's are'} ahead of it in the ${
                    TIER_LABEL[report.current_handler_role] ?? ''
                  } queue.`}
            </p>
          )}
        </div>
        <Link href={`/track?id=${encodeURIComponent(report.tracking_id)}`} className="btn-secondary px-4 py-2.5 shrink-0">
          View timeline <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

    </article>
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
      if (!res.ok) throw new Error(await readApiError(res, 'Could not load your reports.'));
      const data = await res.json();
      setReports(Array.isArray(data.complaints) ? data.complaints : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your reports.');
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
  const counts = {
    open: open.length,
    urgent: open.filter((r) => r.priority === 'CRITICAL' || r.priority === 'HIGH').length,
    escalated: open.filter((r) => r.current_handler_role !== 'TEACHER').length,
    resolved: sorted.length - open.length,
  };

  const tabs: Array<{ id: View; label: string; count: number }> = [
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'resolved', label: 'Resolved', count: counts.resolved },
    { id: 'all', label: 'All', count: sorted.length },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <header className="cs-card p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-slate-100 tracking-tight">My Reports</h1>
          <p className="text-sm text-slate-300 mt-1">
            Your reports, highest priority first. Staff only ever see the ticket number, never your name.
          </p>
          <p className="text-xs text-slate-400 mt-2 max-w-[34rem]">
            How it works: a Teacher reviews each report first and has 72 hours to act. If not, it moves up to Faculty, then
            to Administration, automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/student/submit" className="btn-primary px-5 py-3">
            <FilePlus2 className="w-4 h-4" aria-hidden="true" /> File a report
          </Link>
          <button type="button" onClick={load} disabled={loading} className="btn-secondary px-4 py-3" aria-label="Refresh reports">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {!loading && counts.open > 0 && (
        <p className="text-sm text-slate-300">
          {counts.urgent > 0 ? (
            <span className="text-amber-200 font-semibold">
              {counts.urgent} of your {counts.open} open report{counts.open === 1 ? '' : 's'} {counts.urgent === 1 ? 'is' : 'are'} critical or
              high priority.
            </span>
          ) : (
            <span>
              You have {counts.open} open report{counts.open === 1 ? '' : 's'}, none critical or high.
            </span>
          )}{' '}
          {counts.escalated > 0
            ? `${counts.escalated} ha${counts.escalated === 1 ? 's' : 've'} moved up past the teacher.`
            : counts.open === 1
            ? 'It is still with the teacher.'
            : 'All are still with the teacher.'}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Show reports" className="inline-flex flex-wrap max-w-full p-1 rounded-3xl bg-slate-900 border border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={view === t.id}
              onClick={() => setView(t.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                view === t.id ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label} <span className="font-mono tabular-nums">{loading && reports.length === 0 ? '–' : t.count}</span>
            </button>
          ))}
        </div>
        <Link href="/track" className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white py-2">
          <Search className="w-3.5 h-3.5" aria-hidden="true" /> Look up a ticket by ID
        </Link>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {loading ? 'Loading your reports' : `${shown.length} reports shown`}
      </div>

      {error && (
        <div role="alert" className="alert-error flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2 shrink-0">
            Try again
          </button>
        </div>
      )}

      {loading && reports.length === 0 ? (
        <div className="cs-card p-10 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your reports...
        </div>
      ) : shown.length === 0 && !error ? (
        <div className="cs-card p-10 text-center space-y-3">
          <h2 className="font-serif text-2xl text-slate-100">
            {view === 'resolved' ? 'Nothing resolved yet' : sorted.length ? 'No open reports' : 'You have not filed a report yet'}
          </h2>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            {sorted.length
              ? 'Switch tabs to see your other reports.'
              : 'Spotted a broken fan, a leak or a dead network port? File it and track it here until it is fixed.'}
          </p>
          {!sorted.length && (
            <Link href="/student/submit" className="btn-primary px-5 py-3 inline-flex">
              <FilePlus2 className="w-4 h-4" aria-hidden="true" /> File your first report
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => (
            <ReportCard key={r.tracking_id} report={r} rank={r.status === 'RESOLVED' ? null : open.indexOf(r) + 1} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
