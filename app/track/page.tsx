'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import type { StudentReportView, TrackedComplaintView } from '@/lib/types';
import { HashtagPill, SlaChip, StatusBadge, SummaryLines, TIER_LABEL, UrgencyPill, nextStepText, useNow } from '@/components/ui';

// History rows read as sentences ("Teacher acknowledged") instead of enum pairs.
const ACTOR_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  FACULTY: 'Faculty',
  ADMINISTRATIVE: 'Administration',
  SYSTEM: 'System',
};
const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: 'reported the issue',
  ACKNOWLEDGED: 'acknowledged it',
  IN_PROGRESS: 'started work on it',
  FORWARDED: 'forwarded it up',
  AUTO_ESCALATED: 'escalated it automatically',
  ESCALATED: 'escalated it',
  RESOLVED: 'resolved it',
};
function historyLine(actor: string, action: string): string {
  const who = ACTOR_LABEL[actor] ?? actor.charAt(0) + actor.slice(1).toLowerCase();
  const what = ACTION_LABEL[action] ?? action.replace(/_/g, ' ').toLowerCase();
  return `${who} ${what}`;
}
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';

const ID_PATTERN = /^(CSR|REP)-\d{5}$/;
const RECENT_KEY = 'csr_recent_tickets';

const TIERS = [
  { role: 'TEACHER', label: 'Teacher Review', hint: 'Days 0–3' },
  { role: 'FACULTY', label: 'Faculty Escalation', hint: 'Days 3–6' },
  { role: 'ADMINISTRATIVE', label: 'Administrative Command', hint: 'Day 6+' },
] as const;

const PIPELINE = [
  { status: 'UNACKNOWLEDGED', label: 'Unacknowledged' },
  { status: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'ESCALATED', label: 'Escalated' },
  { status: 'RESOLVED', label: 'Resolved' },
] as const;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && ID_PATTERN.test(x)) : [];
  } catch {
    return [];
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function TrackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialId = (searchParams.get('id') || '').trim().toUpperCase();
  const { user } = useAuth();
  const now = useNow(30_000);

  const [searchId, setSearchId] = useState(initialId);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<TrackedComplaintView | null>(null);
  const [lookedUp, setLookedUp] = useState('');

  const [myReports, setMyReports] = useState<StudentReportView[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecentIds(readRecent());
  }, []);

  // Students may also see their own recent reports. Staff never call my-reports.
  useEffect(() => {
    if (user?.role !== 'STUDENT') {
      setMyReports([]);
      return;
    }
    let cancelled = false;
    fetch('/api/complaints/my-reports', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.complaints)) setMyReports(data.complaints);
      })
      .catch(() => {
        /* optional panel; the public lookup still works */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const saveRecent = (id: string) => {
    try {
      const updated = Array.from(new Set([id, ...readRecent()])).slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      setRecentIds(updated);
    } catch {
      /* storage unavailable */
    }
  };

  const executeLookup = useCallback(async (raw: string) => {
    const id = raw.trim().toUpperCase();
    setErrorMsg(null);
    setErrorCode(null);
    if (!ID_PATTERN.test(id)) {
      setResult(null);
      setErrorCode('INVALID_ID');
      setErrorMsg('Enter a tracking ID in the form CSR-12345 or REP-12345.');
      return;
    }
    setLoading(true);
    setLookedUp(id);
    try {
      const res = await fetch(`/api/complaints/track?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.group) {
        setResult(null);
        setErrorCode(typeof data.code === 'string' ? data.code : 'ERROR');
        setErrorMsg(typeof data.error === 'string' ? data.error : `No ticket found for "${id}".`);
        return;
      }
      setResult({
        group: data.group,
        history: Array.isArray(data.history) ? data.history : [],
        queue_position: typeof data.queue_position === 'number' ? data.queue_position : null,
      });
      saveRecent(data.group.tracking_id);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch {
      setResult(null);
      setErrorCode('ERROR');
      setErrorMsg('Network error while looking up the ticket. Please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) executeLookup(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const go = (id: string) => {
    const clean = id.trim().toUpperCase();
    setSearchId(clean);
    if (clean === initialId) executeLookup(clean);
    else router.push(`/track?id=${encodeURIComponent(clean)}`, { scroll: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    go(searchId);
  };

  const group = result?.group;
  const tierIndex = group ? TIERS.findIndex((t) => t.role === group.current_handler_role) : -1;
  const pipelineIndex = group ? PIPELINE.findIndex((p) => p.status === group.status) : -1;
  const isResolved = group?.status === 'RESOLVED';
  const resolvedEntry = result?.history.filter((h) => h.action === 'RESOLVED').slice(-1)[0];

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 space-y-6">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {loading ? 'Looking up ticket...' : group ? `Ticket ${group.tracking_id} loaded, status ${group.status}.` : errorMsg || ''}
      </div>

      {/* Search */}
      <section className="cs-card p-6 sm:p-8 space-y-5" aria-labelledby="track-heading">
        <div>
          <h1 id="track-heading" className="font-serif text-3xl sm:text-4xl text-slate-100 tracking-tight">
            Track a complaint
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Enter your ticket ID (CSR-XXXXX) or personal receipt ID (REP-XXXXX). No sign-in needed, and no name or email is
            ever shown.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3" role="search">
          <label htmlFor="track-id" className="sr-only">
            Tracking ID
          </label>
          <input
            id="track-id"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            suppressHydrationWarning
            value={searchId}
            onChange={(e) => setSearchId(e.target.value.toUpperCase())}
            placeholder="CSR-48291 or REP-90312"
            aria-invalid={errorCode === 'INVALID_ID' ? true : undefined}
            aria-describedby={errorMsg ? 'track-error' : undefined}
            className="cs-input flex-1 rounded-full px-5 py-3.5 uppercase placeholder:normal-case placeholder:font-sans"
          />
          <button type="submit" disabled={loading} className="btn-primary px-8 py-3.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Search className="w-4 h-4" aria-hidden="true" />}
            <span>{loading ? 'Searching...' : 'Track'}</span>
          </button>
        </form>

        {recentIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-400 text-xs mr-1">Recent on this device:</span>
            {recentIds.map((id) => (
              <button key={id} type="button" onClick={() => go(id)} className="pill-tag font-mono hover:border-slate-500 hover:text-white">
                {id}
              </button>
            ))}
          </div>
        )}

        {myReports.length > 0 && (
          <div className="pt-4 border-t border-slate-800 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">My reports ({myReports.length})</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {myReports.map((r) => (
                <li key={r.tracking_id}>
                  <button
                    type="button"
                    onClick={() => go(r.tracking_id)}
                    aria-current={group?.tracking_id === r.tracking_id ? 'true' : undefined}
                    className={`w-full p-3 rounded-2xl border text-left flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      group?.tracking_id === r.tracking_id ? 'border-indigo-500 bg-indigo-950/40' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-bold text-slate-100">#{r.tracking_id}</span>
                      <span className="block text-xs text-slate-300 truncate">{r.normalized_title}</span>
                      {r.receipt_ids.length > 0 && (
                        <span className="block text-xs font-mono text-slate-400 truncate">{r.receipt_ids.join(', ')}</span>
                      )}
                    </span>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Errors */}
      {errorCode === 'UNTRACKABLE_GUEST' ? (
        <div role="alert" id="track-error" className="p-5 rounded-2xl bg-amber-950/40 border border-amber-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm text-amber-100">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
            Tracking unavailable for this ticket
          </div>
          <p className="text-sm text-amber-50/90 leading-relaxed">
            {errorMsg} Reports filed without a signed-in student account cannot be followed in the resolution pipeline.
          </p>
          <Link href="/student/submit" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 hover:text-white underline underline-offset-4">
            File a new report while signed in <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        errorMsg && (
          <div role="alert" id="track-error" className="alert-error items-center">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )
      )}

      {/* Result */}
      {group && result && (
        <div ref={resultRef} tabIndex={-1} className="space-y-6 focus:outline-none" aria-label={`Ticket ${group.tracking_id}`}>
          <section className="cs-card p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="text-2xl font-bold font-mono tracking-tight text-slate-100">{group.tracking_id}</div>
                {lookedUp.startsWith('REP-') && (
                  <p className="text-xs text-slate-400">Found via receipt {lookedUp}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <UrgencyPill priority={group.priority} score={group.priority_score} calm />
                  <StatusBadge status={group.status} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-right">
                <div className="cs-inset px-4 py-2.5">
                  <dt className="text-xs uppercase tracking-wider text-slate-400">Queue position</dt>
                  <dd className="font-serif text-2xl text-slate-100 tabular-nums">
                    {result.queue_position !== null ? `#${result.queue_position}` : '—'}
                  </dd>
                  <dd className="text-xs text-slate-400">
                    {result.queue_position !== null ? `in ${TIER_LABEL[group.current_handler_role] || group.current_handler_role} queue` : 'closed'}
                  </dd>
                </div>
                <div className="cs-inset px-4 py-2.5">
                  <dt className="text-xs uppercase tracking-wider text-slate-400">Cluster</dt>
                  <dd className="font-serif text-2xl text-slate-100 tabular-nums">{group.report_count}</dd>
                  <dd className="text-xs text-slate-400">student report{group.report_count === 1 ? '' : 's'}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h2 className="font-serif text-2xl text-slate-100 leading-snug">{group.normalized_title || group.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <Building className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  {group.location_zone}
                </span>
                <span className="font-mono text-slate-400">Filed {formatDateTime(group.created_at)}</span>
              </div>
            </div>

            <div className="cs-inset p-4">
              <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-indigo-200 mb-1">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> AI summary
              </span>
              <SummaryLines summary={group.ai_summary} />
              <p className="text-sm text-slate-200 max-w-[34rem]">{nextStepText(group, now)}</p>
            </div>

            {group.hashtags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Routing hashtags">
                {group.hashtags.map((tag) => (
                  <li key={tag}>
                    <HashtagPill tag={tag} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-800 text-xs">
              <span className="text-slate-300">
                {isResolved
                  ? 'Resolved — the escalation clock has stopped.'
                  : `Auto-escalates ${group.current_handler_role === 'ADMINISTRATIVE' ? '(final tier)' : `to ${TIER_LABEL[TIERS[tierIndex + 1]?.role ?? ''] || 'next tier'}`} when the 72h window ends`}
              </span>
              <SlaChip deadline={group.stage_deadline} now={now} resolved={isResolved} />
            </div>
          </section>

          {/* 2-axis tracker (spec 09 §2) */}
          <section className="cs-card p-6 sm:p-8 space-y-7" aria-labelledby="progress-heading">
            <h2 id="progress-heading" className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Progress
            </h2>

            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-slate-400">A &mdash; Who holds the ticket</h3>
              <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {TIERS.map((t, i) => {
                  const current = i === tierIndex;
                  const done = i < tierIndex;
                  return (
                    <li
                      key={t.role}
                      aria-current={current ? 'step' : undefined}
                      className={`p-3.5 rounded-2xl border ${
                        current
                          ? 'border-indigo-400 bg-indigo-950/50 text-indigo-50'
                          : done
                          ? 'border-slate-700 bg-slate-800 text-slate-300'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400'
                      }`}
                    >
                      <span className="block text-xs uppercase tracking-wider">
                        {done ? 'Passed' : current ? (isResolved ? 'Resolved here' : 'Current tier') : 'Pending'} &bull; {t.hint}
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5 text-sm font-semibold">
                        {done && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        {i + 1}. {t.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-slate-400">B &mdash; What is happening</h3>
              <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {PIPELINE.map((p, i) => {
                  const current = i === pipelineIndex;
                  const done = i < pipelineIndex && group.status !== 'ESCALATED';
                  return (
                    <li
                      key={p.status}
                      aria-current={current ? 'step' : undefined}
                      className={`p-2.5 rounded-xl border text-center text-xs ${
                        current
                          ? p.status === 'RESOLVED'
                            ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100 font-bold'
                            : 'border-indigo-400 bg-indigo-950/50 text-indigo-50 font-bold'
                          : done
                          ? 'border-slate-700 bg-slate-800 text-slate-300'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400'
                      }`}
                    >
                      {current && p.status === 'RESOLVED' && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />}
                      {p.label}
                      {current && <span className="sr-only"> (current)</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>

          {resolvedEntry && (
            <section className="p-5 rounded-2xl border border-emerald-800 bg-emerald-950/40 space-y-1" aria-label="Resolution note">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                Resolved by {TIER_LABEL[resolvedEntry.actor_role] || resolvedEntry.actor_role} &bull; {formatDateTime(resolvedEntry.created_at)}
              </div>
              {resolvedEntry.note && <p className="text-sm text-emerald-50/90">{resolvedEntry.note}</p>}
            </section>
          )}

          {/* History timeline */}
          <section className="cs-card p-6 sm:p-8 space-y-4" aria-labelledby="history-heading">
            <h2 id="history-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
              <Calendar className="w-4 h-4" aria-hidden="true" /> History
            </h2>
            {result.history.length === 0 ? (
              <p className="text-sm text-slate-400">Filed. Waiting for the first review.</p>
            ) : (
              <ol className="relative border-l border-slate-700 ml-2 space-y-4">
                {result.history.map((item, idx) => (
                  <li key={`${item.created_at}-${idx}`} className="pl-5 relative">
                    <span
                      className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${
                        item.action === 'RESOLVED' ? 'bg-emerald-400' : item.action.includes('ESCALAT') ? 'bg-orange-400' : 'bg-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                      <span className="font-semibold text-slate-100">
                        {historyLine(item.actor_role, item.action)}
                      </span>
                      <time dateTime={item.created_at} className="text-slate-400">
                        {formatDateTime(item.created_at)}
                      </time>
                    </div>
                    {item.note && <p className="mt-0.5 text-sm text-slate-300">{item.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">Loading tracker...</div>}>
      <TrackContent />
    </Suspense>
  );
}
