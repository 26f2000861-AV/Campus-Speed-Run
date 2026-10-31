'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import type { StatusHistoryView, StudentReportView, TrackedComplaintView } from '@/lib/types';
import {
  HashtagPill,
  SlaChip,
  StatusBadge,
  SummaryLines,
  TIER_LABEL,
  TONE_DOT,
  UrgencyPill,
  formatDate,
  nextStepText,
  statusTone,
  useNow,
} from '@/components/ui';
import { EASE_OUT } from '@/components/motion';
import { AlertCircle, ArrowRight, Check, Clock, Loader2, MapPin, Search, Users } from 'lucide-react';

// History rows read as sentences ("Teacher acknowledged it") instead of enum pairs.
const ACTOR_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  FACULTY: 'Faculty',
  ADMINISTRATIVE: 'Administration',
  SYSTEM: 'System',
};
const ACTION_LABEL: Record<string, string> = {
  SUBMITTED: 'reported the issue',
  CLUSTERED: 'added a matching report',
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

const ID_PATTERN = /^(CSR|REP)-\d{5}$/;
const RECENT_KEY = 'csr_recent_tickets';

const TIERS = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'] as const;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && ID_PATTERN.test(x)) : [];
  } catch {
    return [];
  }
}

type StageState = 'done' | 'current' | 'upcoming';
interface Stage {
  label: string;
  detail?: string;
  at?: string;
  state: StageState;
}

/** Timeline stages backed by the ticket's real status and history only. */
function buildStages(status: string, history: StatusHistoryView[], holder: string): Stage[] {
  const first = (action: string) => history.find((h) => h.action === action);
  const last = (pred: (h: StatusHistoryView) => boolean) => [...history].reverse().find(pred);
  const submitted = first('SUBMITTED');
  const acknowledged = last((h) => h.action === 'ACKNOWLEDGED');
  const started = last((h) => h.action === 'IN_PROGRESS');
  const resolved = last((h) => h.action === 'RESOLVED');
  const escalated = last((h) => h.action === 'FORWARDED' || h.action === 'AUTO_ESCALATED');

  const reviewed = ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'].includes(status);
  const working = status === 'IN_PROGRESS' || status === 'RESOLVED';
  const isResolved = status === 'RESOLVED';

  const stages: Stage[] = [
    { label: 'Submitted', at: submitted?.created_at, state: 'done' },
    {
      label: 'Under review',
      detail: reviewed
        ? `Acknowledged by ${ACTOR_LABEL[acknowledged?.actor_role ?? holder] ?? 'staff'}`
        : `Waiting for ${TIER_LABEL[holder] ?? 'staff'}`,
      at: acknowledged?.created_at,
      state: reviewed ? 'done' : 'current',
    },
  ];
  if (escalated) {
    stages.push({
      label: escalated.action === 'AUTO_ESCALATED' ? 'Escalated automatically' : 'Forwarded up',
      detail: `Now with ${TIER_LABEL[holder] ?? holder}`,
      at: escalated.created_at,
      state: 'done',
    });
  }
  stages.push(
    {
      label: 'Resolution in progress',
      at: started?.created_at,
      state: working && !isResolved ? 'current' : working ? 'done' : 'upcoming',
    },
    { label: 'Resolved', detail: resolved?.note ?? undefined, at: resolved?.created_at, state: isResolved ? 'done' : 'upcoming' }
  );
  // An escalated ticket is back to waiting for review at the new tier.
  if (status === 'ESCALATED' || status === 'UNACKNOWLEDGED') stages[1].state = 'current';
  return stages;
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
      setErrorMsg('Enter an ID like CSR-12345 or REP-12345.');
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
        setErrorMsg(typeof data.error === 'string' ? data.error : `We couldn’t find "${id}". Check the ID and try again.`);
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
      setErrorMsg('We couldn’t reach the server. Check your connection and try again.');
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
  const tierIndex = group ? TIERS.indexOf(group.current_handler_role as (typeof TIERS)[number]) : -1;
  const isResolved = group?.status === 'RESOLVED';
  const stages = group && result ? buildStages(group.status, result.history, group.current_handler_role) : [];
  const lastUpdate = result?.history.length ? result.history[result.history.length - 1].created_at : group?.created_at;
  const tone = group ? statusTone(group.status) : 'bad';

  return (
    <div className="max-w-3xl mx-auto py-10 sm:py-16 px-4 sm:px-6 space-y-5">
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {loading ? 'Looking up complaint…' : group ? `Complaint ${group.tracking_id} loaded, status ${group.status}.` : errorMsg || ''}
      </div>

      {/* Search */}
      <motion.section
        aria-labelledby="track-heading"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      >
        <h1 id="track-heading" className="text-3xl sm:text-4xl font-semibold">
          Track a complaint
        </h1>
        <p className="mt-2 text-fg-muted">Enter your reference (CSR-) or receipt (REP-) ID. No sign-in needed.</p>

        <form onSubmit={handleSubmit} className="mt-6 cs-glass p-2 flex flex-col sm:flex-row gap-2" role="search">
          <label htmlFor="track-id" className="sr-only">
            Reference ID
          </label>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
            <input
              id="track-id"
              type="text"
              autoComplete="off"
              spellCheck={false}
              suppressHydrationWarning
              value={searchId}
              onChange={(e) => setSearchId(e.target.value.toUpperCase())}
              placeholder="CSR-48291"
              aria-invalid={errorCode === 'INVALID_ID' ? true : undefined}
              aria-describedby={errorMsg ? 'track-error' : undefined}
              className="cs-input h-12 pl-10 border-transparent bg-transparent font-mono uppercase placeholder:font-sans focus:ring-0 focus:border-transparent"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary h-12 px-6">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            <span>{loading ? 'Searching…' : 'Track'}</span>
          </button>
        </form>

        {(recentIds.length > 0 || myReports.length > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-fg-muted">{myReports.length > 0 ? 'Your reports:' : 'Recent:'}</span>
            {(myReports.length > 0 ? myReports.map((r) => r.tracking_id) : recentIds).slice(0, 6).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={group?.tracking_id === id ? 'true' : undefined}
                className={`h-8 px-2.5 rounded-lg border font-mono text-xs transition-colors ${
                  group?.tracking_id === id ? 'border-fg/40 text-fg bg-white/[0.06]' : 'border-line text-fg-muted hover:text-fg hover:border-line-strong'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        )}
      </motion.section>

      {/* Errors */}
      {errorMsg &&
        (errorCode === 'UNTRACKABLE_GUEST' ? (
          <div role="alert" id="track-error" className="alert-warn flex-col">
            <span className="font-medium">Tracking isn&apos;t available for this complaint</span>
            <span className="text-fg-muted">{errorMsg}</span>
            <Link href="/student/submit" className="inline-flex items-center gap-1.5 text-fg font-medium hover:underline underline-offset-4">
              Report while signed in <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div role="alert" id="track-error" className="alert-error items-center">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        ))}

      {/* Loading skeleton */}
      {loading && !group && (
        <div className="cs-card p-6 space-y-4" aria-hidden="true">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-7 w-3/4" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-32 w-full" />
        </div>
      )}

      {/* Result */}
      <AnimatePresence mode="wait">
        {group && result && (
          <motion.div
            key={group.tracking_id}
            ref={resultRef}
            tabIndex={-1}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="space-y-4 focus:outline-none"
            aria-label={`Complaint ${group.tracking_id}`}
          >
            {/* Summary card */}
            <section className="cs-card p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
                  <span className="font-mono text-sm text-fg-muted">{group.tracking_id}</span>
                  {lookedUp.startsWith('REP-') && <span className="text-xs text-fg-subtle">via {lookedUp}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <UrgencyPill priority={group.priority} score={group.priority_score} calm />
                  <StatusBadge status={group.status} />
                </div>
              </div>

              <h2 className="mt-4 text-xl sm:text-2xl font-semibold leading-snug">{group.normalized_title || group.title}</h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  {group.location_zone}
                </span>
                {group.report_count > 1 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="w-4 h-4" aria-hidden="true" />
                    {group.report_count} reports
                  </span>
                )}
              </p>

              <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-line bg-line">
                {[
                  { k: 'Filed', v: formatDate(group.created_at, false) },
                  { k: 'With', v: TIER_LABEL[group.current_handler_role] ?? group.current_handler_role },
                  { k: 'Queue position', v: result.queue_position !== null ? `#${result.queue_position}` : '—' },
                  { k: 'Last updated', v: lastUpdate ? formatDate(lastUpdate) : '—' },
                ].map((d) => (
                  <div key={d.k} className="bg-ink-900 p-3.5 min-w-0">
                    <dt className="text-xs text-fg-subtle">{d.k}</dt>
                    <dd className="mt-1 text-sm font-medium truncate">{d.v}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-sm text-fg">{nextStepText(group, now)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isResolved ? 'Escalation clock stopped.' : 'Escalation clock:'}</span>
                <SlaChip deadline={group.stage_deadline} now={now} resolved={isResolved} />
              </div>
            </section>

            {/* Timeline + escalation */}
            <section className="cs-card p-5 sm:p-7" aria-labelledby="progress-heading">
              <h2 id="progress-heading" className="text-sm font-medium text-fg-muted">
                Progress
              </h2>
              <ol className="mt-5 relative">
                {stages.map((s, i) => {
                  const isLast = i === stages.length - 1;
                  const dot =
                    s.state === 'done'
                      ? 'bg-ok border-ok'
                      : s.state === 'current'
                      ? tone === 'warn'
                        ? 'bg-warn border-warn'
                        : 'bg-bad border-bad'
                      : 'bg-transparent border-line-strong';
                  return (
                    <motion.li
                      key={s.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease: EASE_OUT }}
                      aria-current={s.state === 'current' ? 'step' : undefined}
                      className="relative pl-9 pb-6 last:pb-0"
                    >
                      {!isLast && (
                        <span className="absolute left-[9px] top-5 bottom-0 w-px bg-line" aria-hidden="true">
                          <motion.span
                            className="block w-full bg-ok origin-top"
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: s.state === 'done' && stages[i + 1].state !== 'upcoming' ? 1 : 0 }}
                            transition={{ duration: 0.5, delay: 0.2 + i * 0.1, ease: EASE_OUT }}
                            style={{ height: '100%' }}
                          />
                        </span>
                      )}
                      <span className={`absolute left-0 top-0.5 w-[19px] h-[19px] rounded-full border-2 flex items-center justify-center ${dot}`}>
                        {s.state === 'done' && <Check className="w-3 h-3 text-ink-950" strokeWidth={3} aria-hidden="true" />}
                        {s.state === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-ink-950" aria-hidden="true" />}
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className={`text-[15px] font-medium ${s.state === 'upcoming' ? 'text-fg-subtle' : ''}`}>{s.label}</span>
                        {s.at && (
                          <time dateTime={s.at} className="text-xs text-fg-subtle">
                            {formatDate(s.at)}
                          </time>
                        )}
                      </div>
                      {s.detail && <p className="mt-0.5 text-sm text-fg-muted">{s.detail}</p>}
                      <span className="sr-only">{s.state === 'done' ? '(done)' : s.state === 'current' ? '(current)' : '(not yet)'}</span>
                    </motion.li>
                  );
                })}
              </ol>

              <div className="mt-7 pt-5 border-t border-line">
                <h3 className="text-sm font-medium text-fg-muted">Escalation stage</h3>
                <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Escalation tier">
                  {TIERS.map((t, i) => {
                    const current = i === tierIndex;
                    const done = i < tierIndex;
                    return (
                      <li
                        key={t}
                        aria-current={current ? 'step' : undefined}
                        className={`rounded-xl border p-3 ${
                          current ? 'border-fg/30 bg-white/[0.05]' : done ? 'border-line bg-ink-950/50' : 'border-line/60 text-fg-subtle'
                        }`}
                      >
                        <span className="block text-xs font-mono text-fg-subtle">Tier {i + 1}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                          {done && <Check className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />}
                          {TIER_LABEL[t]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>

            {/* AI summary */}
            <section className="cs-card p-5 sm:p-7 space-y-4" aria-labelledby="summary-heading">
              <h2 id="summary-heading" className="text-sm font-medium text-fg-muted">
                Summary
              </h2>
              <SummaryLines summary={group.ai_summary} />
              {group.hashtags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                  {group.hashtags.map((tag) => (
                    <li key={tag}>
                      <HashtagPill tag={tag} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Update log */}
            <section className="cs-card p-5 sm:p-7" aria-labelledby="history-heading">
              <h2 id="history-heading" className="text-sm font-medium text-fg-muted">
                Updates
              </h2>
              {result.history.length === 0 ? (
                <p className="mt-3 text-sm text-fg-muted">Submitted. Waiting for the first review.</p>
              ) : (
                <ol className="mt-4 divide-y divide-line">
                  {[...result.history].reverse().map((item, idx) => (
                    <li key={`${item.created_at}-${idx}`} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium">{historyLine(item.actor_role, item.action)}</span>
                        <time dateTime={item.created_at} className="text-xs text-fg-subtle">
                          {formatDate(item.created_at)}
                        </time>
                      </div>
                      {item.note && <p className="mt-0.5 text-sm text-fg-muted">{item.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-fg-muted" aria-label="Loading" />
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  );
}
