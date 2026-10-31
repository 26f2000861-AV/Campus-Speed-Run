'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import StudentDashboard from '@/components/StudentDashboard';
import type { ComplaintGroupView, DamageHotspot, DepartmentCode, NotificationItem, UserRole } from '@/lib/types';
import {
  HashtagPill,
  NEXT_TIER,
  SlaChip,
  StatusBadge,
  SummaryLines,
  TIER_LABEL,
  UrgencyPill,
  humanize,
  scoreParts,
  readApiError,
  slaInfo,
  useNow,
} from '@/components/ui';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building,
  CheckCircle2,
  Eye,
  Filter,
  Flame,
  Key,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
  ChevronDown,
} from 'lucide-react';

type StaffRole = Exclude<UserRole, 'STUDENT'>;

const HASHTAG_FILTERS = [
  '#BTech',
  '#technical',
  '#MCA',
  '#AppliedSciences',
  '#Infrastructure',
  '#ITSupport',
  '#Sanitation',
  '#LabDamage',
];

const DEPARTMENTS: { code: DepartmentCode; label: string }[] = [
  { code: 'BTECH', label: 'B.Tech / Technical' },
  { code: 'MCA', label: 'MCA' },
  { code: 'SCI', label: 'Applied Sciences' },
  { code: 'INFRA', label: 'Infrastructure' },
  { code: 'IT', label: 'IT & Network' },
  { code: 'SAN', label: 'Sanitation' },
];

const TIER_NUMBER: Record<StaffRole, number> = { TEACHER: 1, FACULTY: 2, ADMINISTRATIVE: 3 };

const NOTIFICATION_STYLE: Record<string, { text: string; dot: string }> = {
  NEW_ASSIGNMENT: { text: 'text-indigo-200', dot: 'bg-indigo-400' },
  SLA_WARNING: { text: 'text-amber-200', dot: 'bg-amber-400' },
  CRITICAL_ESCALATION: { text: 'text-red-200', dot: 'bg-red-500' },
  RESOLVED: { text: 'text-emerald-200', dot: 'bg-emerald-400' },
};

const NOTIFICATION_LABEL: Record<string, string> = {
  NEW_ASSIGNMENT: 'New assignment',
  SLA_WARNING: 'SLA warning',
  CRITICAL_ESCALATION: 'Auto-escalated',
  RESOLVED: 'Resolved',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

// ---------------------------------------------------------------------------
// Gate screens
// ---------------------------------------------------------------------------
function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="cs-card w-full max-w-md p-8 sm:p-10 text-center space-y-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily AI Executive Briefing (spec 03 §2.4) — aggregates only, no identity.
// ---------------------------------------------------------------------------
function DailyBriefing({
  complaints,
  role,
  now,
  loading,
}: {
  complaints: ComplaintGroupView[];
  role: StaffRole;
  now: number;
  loading: boolean;
}) {
  const stats = useMemo(() => {
    const byDept = new Map<DepartmentCode, number>();
    for (const c of complaints) {
      const depts = new Set<DepartmentCode>([c.primary_department_code, ...(c.collaborating_department_codes || [])]);
      depts.forEach((d) => byDept.set(d, (byDept.get(d) || 0) + 1));
    }
    return {
      total: complaints.length,
      critical: complaints.filter((c) => c.priority === 'CRITICAL').length,
      high: complaints.filter((c) => c.priority === 'HIGH').length,
      damage: complaints.filter((c) => c.is_damage_prone).length,
      safety: complaints.filter((c) => c.is_safety_critical).length,
      slaWarn: complaints.filter((c) => slaInfo(c.stage_deadline, now).level !== 'ok').length,
      reports: complaints.reduce((sum, c) => sum + (c.report_count || 0), 0),
      newToday: complaints.filter((c) => now - Date.parse(c.created_at) < 86_400_000).length,
      byDept,
    };
  }, [complaints, now]);

  const figures = [
    { label: 'open', value: stats.total, cls: 'text-slate-100' },
    { label: 'critical', value: stats.critical, cls: stats.critical ? 'text-red-300' : 'text-slate-100' },
    { label: 'high', value: stats.high, cls: stats.high ? 'text-amber-300' : 'text-slate-100' },
    { label: 'damage-prone', value: stats.damage, cls: 'text-slate-100' },
    { label: 'under 24h', value: stats.slaWarn, cls: stats.slaWarn ? 'text-amber-300' : 'text-slate-100' },
    { label: 'student reports', value: stats.reports, cls: 'text-slate-100' },
  ];
  const depts = DEPARTMENTS.filter((d) => (stats.byDept.get(d.code) || 0) > 0);

  return (
    <section aria-labelledby="briefing-heading" className="cs-card px-5 py-4 sm:px-6 space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="briefing-heading" className="cs-label flex items-center gap-2 text-slate-200">
          <Sparkles className="w-4 h-4 text-indigo-300" aria-hidden="true" />
          Daily AI Executive Briefing
        </h2>
        <span className="text-xs text-slate-400">
          {TIER_LABEL[role]} queue &middot; {loading ? 'loading' : `${stats.newToday} new in the last 24h`} &middot; reporters anonymous
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {figures.map((f) => (
          <div key={f.label} className="flex items-baseline gap-1.5">
            <dd className={`font-mono font-semibold tabular-nums ${loading ? 'text-slate-400' : f.cls}`}>{loading ? '–' : f.value}</dd>
            <dt className="text-slate-400">{f.label}</dt>
          </div>
        ))}
      </dl>
      {!loading && (depts.length > 0 || stats.safety > 0) && (
        <p className="text-xs text-slate-400 leading-relaxed">
          {depts.length > 0 && (
            <>
              By department:{' '}
              {depts.map((d, i) => (
                <span key={d.code}>
                  {i > 0 && ', '}
                  <span className="text-slate-300">{d.label}</span> {stats.byDept.get(d.code)}
                </span>
              ))}
              .{' '}
            </>
          )}
          {stats.safety > 0 && (
            <span className="text-red-200">
              {stats.safety} safety-critical ticket{stats.safety > 1 ? 's need' : ' needs'} the area isolated now.
            </span>
          )}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Damage-Prone Areas & Physical Hazard Radar (spec 05 §4). Collapsible so the
// queue stays near the top; it opens by itself while a zone filter is active.
// ---------------------------------------------------------------------------
function HazardRadar({
  hotspots,
  zone,
  onZone,
}: {
  hotspots: DamageHotspot[];
  zone: string | null;
  onZone: (z: string | null) => void;
}) {
  const top = hotspots[0];
  return (
    <section aria-labelledby="radar-heading">
    <h2 id="radar-heading" className="sr-only">Damage-Prone Areas &amp; Physical Hazard Radar</h2>
    <details open={zone ? true : undefined} className="cs-card group">
      <summary className="cursor-pointer list-none px-5 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-3xl hover:bg-slate-800/40">
        <span className="cs-label flex items-center gap-2 text-slate-200" aria-hidden="true">
          <Flame className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Damage-Prone Areas &amp; Physical Hazard Radar
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          {hotspots.length === 0
            ? 'No flagged zones'
            : `${hotspots.length} zone${hotspots.length === 1 ? '' : 's'} flagged · worst: ${top.location_zone} (${top.peak_severity}/100)`}
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>

      <div className="px-5 pb-5 sm:px-6">
        {hotspots.length === 0 ? (
          <p className="text-xs text-slate-400">No damage-prone zones among open tickets campus-wide.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hotspots.map((spot) => {
              const active = zone === spot.location_zone;
              return (
                <li
                  key={spot.location_zone}
                  className={`p-4 rounded-2xl border space-y-2 ${active ? 'border-amber-500 bg-amber-950/40' : 'border-slate-800 bg-slate-950/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100">{spot.location_zone}</span>
                    <span className="shrink-0 text-xs font-mono text-red-200">Peak {spot.peak_severity}/100</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    <span className="text-amber-200 font-medium">
                      {spot.damage_incident_count} active hazard{spot.damage_incident_count === 1 ? '' : 's'}
                    </span>{' '}
                    &middot; {spot.total_clusters} ticket{spot.total_clusters === 1 ? '' : 's'} &middot;{' '}
                    {spot.total_student_reports} student report{spot.total_student_reports === 1 ? '' : 's'}
                  </p>
                  {spot.hazards.length > 0 && (
                    <ul className="pt-2 border-t border-slate-800 space-y-1">
                      {spot.hazards.slice(0, 3).map((h) => (
                        <li key={h.tracking_id} className="text-xs text-slate-300 leading-snug">
                          <span className="font-mono text-slate-200">#{h.tracking_id}</span> {h.title}
                        </li>
                      ))}
                      {spot.hazards.length > 3 && <li className="text-xs text-slate-400">+{spot.hazards.length - 3} more</li>}
                    </ul>
                  )}
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Show only ${spot.location_zone} in the queue`}
                    onClick={() => onZone(active ? null : spot.location_zone)}
                    className="inline-flex items-center min-h-[32px] text-xs font-semibold text-indigo-300 hover:text-indigo-100 underline-offset-4 hover:underline"
                  >
                    {active ? 'Showing only this zone (select to clear)' : 'Show only this zone in the queue'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notification drawer (spec 09 §3)
// ---------------------------------------------------------------------------
function NotificationDrawer({ items, onClose }: { items: NotificationItem[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close notifications" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-heading"
        className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 id="notif-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
            <Bell className="w-4 h-4" aria-hidden="true" />
            Notifications ({items.length})
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {items.length === 0 && <li className="text-xs text-slate-400">No notifications for your tier yet.</li>}
          {items.map((n) => (
            <li
              key={n.id}
              className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`cs-label flex items-center gap-2 ${NOTIFICATION_STYLE[n.notification_type]?.text ?? 'text-slate-200'}`}>
                  <span className={`w-2 h-2 rounded-full ${NOTIFICATION_STYLE[n.notification_type]?.dot ?? 'bg-slate-400'}`} aria-hidden="true" />
                  {NOTIFICATION_LABEL[n.notification_type] || n.notification_type}
                </span>
                <span className="text-xs text-slate-400 font-mono">{formatTime(n.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-200 leading-relaxed">{n.message}</p>
              <Link href={`/track?id=${encodeURIComponent(n.tracking_id)}`} className="mt-1 inline-flex items-center min-h-[32px] text-xs font-mono text-indigo-300 hover:text-indigo-100 hover:underline underline-offset-4">
                Open #{n.tracking_id}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticket card (spec 04 §4, 06 §3 layer 3)
// ---------------------------------------------------------------------------
type TicketAction = 'ack' | 'progress' | 'forward' | 'resolve';

function TicketCard({
  ticket,
  rank,
  role,
  now,
  busy,
  error,
  activeHashtag,
  onHashtag,
  onAction,
  tieNote,
}: {
  ticket: ComplaintGroupView;
  rank: number;
  tieNote?: string | null;
  role: StaffRole;
  now: number;
  busy: TicketAction | null;
  error: string | null;
  activeHashtag: string | null;
  onHashtag: (tag: string) => void;
  onAction: (ticket: ComplaintGroupView, action: TicketAction, note?: string) => Promise<boolean>;
}) {
  const [resolving, setResolving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [forwardNote, setForwardNote] = useState('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const next = NEXT_TIER[role];
  const headingId = `ticket-${ticket.tracking_id}`;
  const sla = slaInfo(ticket.stage_deadline, now);
  const canAck = ticket.status === 'UNACKNOWLEDGED' || ticket.status === 'ESCALATED';
  const canProgress = ticket.status !== 'IN_PROGRESS';

  const submitForward = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onAction(ticket, 'forward', forwardNote.trim() || undefined);
    if (ok) {
      setForwarding(false);
      setForwardNote('');
    }
  };

  const submitResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 5) {
      setNoteError('Add a short resolution note (at least 5 characters).');
      document.getElementById(`note-${ticket.tracking_id}`)?.focus();
      return;
    }
    setNoteError(null);
    const ok = await onAction(ticket, 'resolve', note.trim());
    if (ok) {
      setResolving(false);
      setNote('');
    }
  };

  return (
    <article
      aria-labelledby={headingId}
      data-ticket={ticket.tracking_id}
      tabIndex={-1}
      className={`cs-card p-6 sm:p-7 space-y-4 ${sla.level !== 'ok' ? 'border-amber-900/80' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-950 font-mono font-bold text-xs">#{rank} Priority</span>
          <UrgencyPill
            priority={ticket.priority}
            score={ticket.priority_score}
            pulse={ticket.is_safety_critical && (ticket.status === 'UNACKNOWLEDGED' || ticket.status === 'ESCALATED')}
          />
          <StatusBadge status={ticket.status} />
        </div>
        <SlaChip deadline={ticket.stage_deadline} now={now} />
      </div>

      <p className="text-xs text-slate-400">
        <span className="text-slate-300">Score:</span> {scoreParts(ticket)}
        {tieNote && <span className="block sm:inline sm:before:content-['_·_']">{tieNote}</span>}
      </p>

      <div>
        <h3 id={headingId} className="font-serif text-xl text-slate-100 leading-snug">
          {ticket.normalized_title || ticket.title}
        </h3>
        <p className="mt-1.5 text-xs text-slate-400">
          Ticket <span className="font-mono text-slate-300">#{ticket.tracking_id}</span> &bull; Reported by Anonymous Student (Cluster Count: {ticket.report_count})
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1">
            <Building className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            {ticket.location_zone}
          </span>
          <span className="text-slate-400">
            {humanize(ticket.category)}
            {ticket.subcategory ? ` · ${ticket.subcategory}` : ''}
          </span>
          {ticket.is_damage_prone && (
            <span className="inline-flex items-center gap-1 text-amber-200 font-medium">
              <Flame className="w-3.5 h-3.5" aria-hidden="true" /> Damage-prone
            </span>
          )}
          {ticket.is_safety_critical && (
            <span className="inline-flex items-center gap-1 text-red-200 font-medium">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" /> Safety-critical
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`details-${ticket.tracking_id}`}
        className="sm:hidden inline-flex items-center gap-1 min-h-[32px] text-xs font-semibold text-slate-300"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        {expanded ? 'Hide AI summary' : 'Show AI summary'}
      </button>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6 items-start">
      <div id={`details-${ticket.tracking_id}`} className={`${expanded ? '' : 'hidden'} sm:block`}>
        <SummaryLines summary={ticket.ai_summary} />
      </div>

      <div className="max-w-[34rem] px-4 py-3 rounded-xl bg-indigo-950/50">
        <span className="cs-label flex items-center gap-1.5 text-indigo-200 mb-1">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          AI Priority Justification
        </span>
        <p className="text-sm text-indigo-50 leading-relaxed">{ticket.routing_reasoning || 'No justification recorded.'}</p>
      </div>
      </div>

      {ticket.hashtags.length > 0 && (
        <ul className={`${expanded ? 'flex' : 'hidden'} sm:flex flex-wrap gap-1.5`} aria-label="Hashtags (select to filter)">
          {ticket.hashtags.map((h) => (
            <li key={h}>
              <HashtagPill tag={h} active={activeHashtag?.toLowerCase() === h.toLowerCase()} onClick={onHashtag} />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" className="alert-error">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-800">
        {canAck && (
          <button
            type="button"
            onClick={() => onAction(ticket, 'ack')}
            disabled={busy !== null}
            className="btn-secondary px-3.5 py-2"
          >
            {busy === 'ack' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
            Acknowledge
          </button>
        )}
        {canProgress && (
          <button
            type="button"
            onClick={() => onAction(ticket, 'progress')}
            disabled={busy !== null}
            className="btn-secondary px-3.5 py-2"
          >
            {busy === 'progress' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Mark In Progress
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => {
              setForwarding((v) => !v);
              setResolving(false);
            }}
            disabled={busy !== null}
            aria-expanded={forwarding}
            aria-controls={`forward-${ticket.tracking_id}`}
            className="btn-secondary px-3.5 py-2 border-indigo-700 text-indigo-200 hover:border-indigo-400"
          >
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            Forward to {TIER_LABEL[next]}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setResolving((v) => !v);
            setForwarding(false);
          }}
          disabled={busy !== null}
          aria-expanded={resolving}
          aria-controls={`resolve-${ticket.tracking_id}`}
          className="btn-secondary px-3.5 py-2 border-emerald-700 text-emerald-200 hover:border-emerald-500"
        >
          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
          Resolve
        </button>
        <Link
          href={`/track?id=${encodeURIComponent(ticket.tracking_id)}`}
          className="ml-auto inline-flex items-center min-h-[36px] px-2 text-xs font-semibold text-slate-300 hover:text-slate-100 underline-offset-4 hover:underline"
        >
          Open tracker
        </Link>
      </div>

      {forwarding && next && (
        <form
          id={`forward-${ticket.tracking_id}`}
          onSubmit={submitForward}
          className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800 space-y-3"
        >
          <p className="text-sm text-indigo-50">
            Forward Ticket <span className="font-mono">#{ticket.tracking_id}</span> to {TIER_LABEL[next]}? It leaves your queue and
            their 72-hour clock starts now. This can&apos;t be undone from your tier.
          </p>
          <label htmlFor={`fwd-note-${ticket.tracking_id}`} className="block text-xs font-semibold text-indigo-100">
            Note for {TIER_LABEL[next]} (optional)
          </label>
          <textarea
            id={`fwd-note-${ticket.tracking_id}`}
            autoFocus
            rows={2}
            maxLength={500}
            value={forwardNote}
            onChange={(e) => setForwardNote(e.target.value)}
            placeholder="Why it needs their authority"
            className="cs-input text-xs"
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy !== null} className="btn-secondary px-4 py-1.5 border-indigo-500 text-indigo-100">
              {busy === 'forward' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
              Confirm forward
            </button>
            <button type="button" onClick={() => setForwarding(false)} className="px-3 py-1.5 min-h-[32px] text-xs text-slate-300 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      {resolving && (
        <form
          id={`resolve-${ticket.tracking_id}`}
          onSubmit={submitResolve}
          className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800 space-y-3"
        >
          <label htmlFor={`note-${ticket.tracking_id}`} className="block text-xs font-semibold text-emerald-100">
            Resolution note for Ticket #{ticket.tracking_id}
          </label>
          <textarea
            id={`note-${ticket.tracking_id}`}
            autoFocus
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? `note-err-${ticket.tracking_id}` : undefined}
            placeholder="What was done, e.g. Electrician replaced the fan capacitor and secured the mount."
            className="cs-input text-xs"
          />
          {noteError && (
            <p id={`note-err-${ticket.tracking_id}`} role="alert" className="text-xs text-red-200">
              {noteError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy !== null}
              className="btn-resolve px-4 py-1.5"
            >
              {busy === 'resolve' && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              Confirm resolution
            </button>
            <button type="button" onClick={() => setResolving(false)} className="px-3 py-1.5 min-h-[32px] text-xs text-slate-300 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const now = useNow(30_000);

  const role = user && user.role !== 'STUDENT' ? (user.role as StaffRole) : null;

  const [complaints, setComplaints] = useState<ComplaintGroupView[]>([]);
  const [hotspots, setHotspots] = useState<DamageHotspot[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ id: string; action: TicketAction } | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [jumping, setJumping] = useState(false);
  const [canTimeJump, setCanTimeJump] = useState(false);

  // Visible toast + screen-reader announcement for every queue action.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAnnouncement(''), 6000);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const bellRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    bellRef.current?.focus();
  }, []);

  // Tier = session role; keep the URL's ?role= in step with it (the API ignores it).
  useEffect(() => {
    if (role && searchParams.get('role') !== role) {
      router.replace(`/dashboard?role=${role}`, { scroll: false });
    }
  }, [role, searchParams, router]);

  const fetchData = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/complaints/list', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) {
        setLoadError(await readApiError(res, 'Could not load the queue.'));
        return;
      }
      const data = await res.json();
      setComplaints(Array.isArray(data.complaints) ? data.complaints : []);
      setHotspots(Array.isArray(data.hotspots) ? data.hotspots : []);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setCanTimeJump(data.canTimeJump === true);
      if (typeof data.escalated === 'number' && data.escalated > 0) {
        announce(`${data.escalated} stale ticket(s) were auto-escalated past their 72-hour window.`);
      }
    } catch {
      setLoadError('Network error while loading the queue. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, [role, router, announce]);

  useEffect(() => {
    if (role) fetchData();
  }, [role, fetchData]);

  const visible = useMemo(() => {
    const tag = activeHashtag?.toLowerCase();
    return complaints
      .map((c, i) => ({ ticket: c, rank: i + 1 }))
      .filter(({ ticket }) => !tag || ticket.hashtags.some((h) => h.toLowerCase() === tag))
      .filter(({ ticket }) => !zone || ticket.location_zone === zone);
  }, [complaints, activeHashtag, zone]);

  // Keyboard path for power users: j/k move between tickets, r refreshes, n opens
  // notifications. Ignored while typing in a field or when a modifier is held.
  useEffect(() => {
    if (!role) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || drawerOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.key === 'r') {
        e.preventDefault();
        fetchData();
      } else if (e.key === 'n') {
        e.preventDefault();
        setDrawerOpen(true);
      } else if (e.key === 'j' || e.key === 'k') {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('article[data-ticket]'));
        if (cards.length === 0) return;
        e.preventDefault();
        const current = cards.findIndex((c) => c.contains(document.activeElement));
        const next = current === -1 ? 0 : Math.min(cards.length - 1, Math.max(0, current + (e.key === 'j' ? 1 : -1)));
        cards[next].focus();
        cards[next].scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, drawerOpen, fetchData]);

  const tickerItems = useMemo(
    () => notifications.filter((n) => n.notification_type === 'SLA_WARNING' || n.notification_type === 'CRITICAL_ESCALATION').slice(0, 3),
    [notifications]
  );
  const unread = notifications.filter((n) => !n.is_read).length;

  const handleAction = useCallback(
    async (ticket: ComplaintGroupView, action: TicketAction, note?: string): Promise<boolean> => {
      if (!role) return false;
      const id = ticket.tracking_id;
      setBusy({ id, action });
      setCardErrors((prev) => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });

      const request =
        action === 'forward'
          ? { url: '/api/complaints/forward', body: { trackingId: id, note } }
          : action === 'resolve'
          ? { url: '/api/complaints/resolve', body: { trackingId: id, resolutionNote: note } }
          : { url: '/api/complaints/status', body: { trackingId: id, status: action === 'ack' ? 'ACKNOWLEDGED' : 'IN_PROGRESS' } };

      try {
        const res = await fetch(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(request.body),
        });
        if (res.status === 401) {
          router.replace('/login');
          return false;
        }
        if (!res.ok) {
          const msg = await readApiError(res, 'The action failed. Please retry.');
          setCardErrors((prev) => ({ ...prev, [id]: msg }));
          announce(msg);
          if (res.status === 409 || res.status === 403) await fetchData();
          return false;
        }
        const data = await res.json().catch(() => ({}));
        announce(typeof data.message === 'string' ? data.message : `Ticket #${id} updated.`);
        const order = Array.from(document.querySelectorAll<HTMLElement>('article[data-ticket]')).map((a) => a.dataset.ticket);
        await fetchData();
        requestAnimationFrame(() => {
          const same = document.querySelector<HTMLElement>(`article[data-ticket="${id}"]`);
          const after = order.slice(order.indexOf(id) + 1).map((t) => document.querySelector<HTMLElement>(`article[data-ticket="${t}"]`)).find(Boolean);
          (same || after || document.querySelector<HTMLElement>('article[data-ticket]'))?.focus();
        });
        return true;
      } catch {
        const msg = 'Network error. The action may not have been applied; refresh to check.';
        setCardErrors((prev) => ({ ...prev, [id]: msg }));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [role, router, fetchData, announce]
  );

  const handleTimeJump = async () => {
    setJumping(true);
    try {
      const res = await fetch('/api/complaints/escalate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ simulateJump: true }),
      });
      if (res.status === 403) {
        setCanTimeJump(false);
        announce(await readApiError(res, 'Time jump is restricted to ADMINISTRATIVE.'));
        return;
      }
      if (!res.ok) {
        announce(await readApiError(res, 'Time jump failed.'));
        return;
      }
      const data = await res.json().catch(() => ({}));
      announce(typeof data.message === 'string' ? data.message : 'Simulated +72h.');
      await fetchData();
    } catch {
      announce('Network error during time jump.');
    } finally {
      setJumping(false);
    }
  };

  // ----- gates -----
  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center gap-2 text-sm text-slate-300" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return (
      <GateCard>
        <Key className="w-6 h-6 text-slate-400 mx-auto" aria-hidden="true" />
        <h1 className="font-serif text-3xl text-slate-100">Sign in required</h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          The triage dashboard is for teachers, faculty and administrative staff. Sign in with your staff account.
        </p>
        <Link href="/login?portal=staff" className="btn-primary w-full py-3.5">
          Sign in to the dashboard
        </Link>
      </GateCard>
    );
  }

  // Students get their own priority-ranked view of the reports they filed.
  if (!role) return <StudentDashboard />;

  const showJump = canTimeJump;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,32rem)] transition-opacity ${
          announcement ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {announcement && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-slate-100 text-slate-950 text-sm shadow-2xl shadow-black/50">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
            <span className="flex-1">{announcement}</span>
            <button type="button" onClick={() => setAnnouncement('')} aria-label="Dismiss message" className="p-1 -m-1 rounded-full hover:bg-slate-200">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <header className="cs-card p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl text-slate-100 tracking-tight">
            {TIER_LABEL[role]} Priority Queue
          </h1>
          <p className="text-sm text-slate-300 mt-1">
            Open tickets at your tier, ranked by priority score then by 72-hour deadline.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="px-2.5 py-0.5 rounded-full border border-indigo-800 bg-indigo-950 text-indigo-200 font-semibold">
              Tier {TIER_NUMBER[role]} &middot; {TIER_LABEL[role]}
            </span>
            {user.department_code && <span>Department {user.department_code}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {showJump && (
            <button
              type="button"
              onClick={handleTimeJump}
              disabled={jumping}
              className="btn-secondary px-4 py-2 border-amber-700 text-amber-200 hover:border-amber-500"
              title="Wind every open ticket's deadline back 72 hours and run auto-escalation"
            >
              {jumping ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Zap className="w-3.5 h-3.5" aria-hidden="true" />}
              {jumping ? 'Simulating...' : 'Simulate +3 Days Time Jump'}
            </button>
          )}
          <div className="flex items-center gap-2.5">
          <button type="button" onClick={fetchData} disabled={loading} className="btn-secondary px-4 py-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            ref={bellRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative p-2.5 rounded-full border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800"
            aria-label={`Notifications, ${unread} unread`}
            aria-haspopup="dialog"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center font-mono">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
          </div>
        </div>
      </header>

      {/* Top ticker (spec 09 §3) */}
      {tickerItems.length > 0 && (
        <div className="rounded-2xl border border-amber-800 bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="cs-label flex items-center gap-1.5 text-amber-200 shrink-0">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> Live alerts
          </span>
          <ul className="flex-1 min-w-0 space-y-1 text-xs text-amber-50">
            {tickerItems.map((n) => (
              <li key={n.id} className="truncate" title={n.message}>
                {n.message}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setDrawerOpen(true)} className="inline-flex items-center min-h-[36px] px-2 text-xs font-semibold text-amber-200 hover:text-white underline underline-offset-4 shrink-0">
            View all
          </button>
        </div>
      )}

      {loadError && (
        <div role="alert" className="alert-error">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={fetchData} className="underline font-semibold">
            Retry
          </button>
        </div>
      )}

      <DailyBriefing complaints={complaints} role={role} now={now} loading={loading && complaints.length === 0} />

      <HazardRadar hotspots={hotspots} zone={zone} onZone={setZone} />

      {/* Filters */}
      <div className="cs-card p-3 sm:p-4 flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto [scrollbar-width:thin] [&>*]:shrink-0" role="group" aria-label="Filter queue by hashtag">
        <span className="text-xs text-slate-400 mr-1 inline-flex items-center gap-1">
          <Filter className="w-3.5 h-3.5" aria-hidden="true" /> Filter
        </span>
        <button
          type="button"
          aria-pressed={!activeHashtag}
          onClick={() => setActiveHashtag(null)}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            !activeHashtag ? 'bg-slate-100 text-slate-950 border-slate-100 font-bold' : 'border-slate-700 text-slate-300 hover:border-slate-500'
          }`}
        >
          All
        </button>
        {HASHTAG_FILTERS.map((tag) => (
          <HashtagPill key={tag} tag={tag} active={activeHashtag === tag} onClick={(t) => setActiveHashtag(activeHashtag === t ? null : t)} />
        ))}
        {zone && (
          <span className="inline-flex items-center gap-1.5 pl-3 pr-1 py-0.5 rounded-full border border-amber-700 bg-amber-950/50 text-amber-100 text-xs">
            Zone: {zone}
            <button type="button" onClick={() => setZone(null)} aria-label="Clear zone filter" className="p-0.5 rounded-full hover:bg-amber-900">
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {/* Queue */}
      <section aria-labelledby="queue-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400">
          <h2 id="queue-heading" className="uppercase tracking-wider text-slate-300 font-semibold">
            {TIER_LABEL[role]} queue &bull;{' '}
            {loading && complaints.length === 0 ? 'loading' : `${visible.length} of ${complaints.length} shown`}
          </h2>
          <span className="hidden sm:inline">
            Keys: <kbd className="font-mono text-slate-300">j</kbd>/<kbd className="font-mono text-slate-300">k</kbd> next/previous &middot;{' '}
            <kbd className="font-mono text-slate-300">r</kbd> refresh &middot; <kbd className="font-mono text-slate-300">n</kbd> notifications
          </span>
        </div>

        {loading && complaints.length === 0 ? (
          <div className="cs-card p-12 flex items-center justify-center gap-2 text-xs text-slate-400" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading queue...
          </div>
        ) : visible.length === 0 ? (
          <div className="cs-card p-12 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" aria-hidden="true" />
            <p className="font-serif text-lg text-slate-100">
              {complaints.length === 0 ? 'Queue clear' : 'No tickets match these filters'}
            </p>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              {complaints.length === 0
                ? 'There are no open tickets at your tier right now.'
                : zone
                ? 'Tickets in this zone may be held at another tier. Clear the filters to see your whole queue.'
                : 'Clear the filters to see your whole queue.'}
            </p>
          </div>
        ) : (
          visible.map(({ ticket, rank }) => (
            <TicketCard
              key={ticket.tracking_id}
              ticket={ticket}
              rank={rank}
              tieNote={
                rank > 1 && complaints[rank - 2]?.priority_score === ticket.priority_score
                  ? `Same score as #${rank - 1}, which is due sooner.`
                  : null
              }
              role={role}
              now={now}
              busy={busy?.id === ticket.tracking_id ? busy.action : null}
              error={cardErrors[ticket.tracking_id] || null}
              activeHashtag={activeHashtag}
              onHashtag={(t) => setActiveHashtag(activeHashtag?.toLowerCase() === t.toLowerCase() ? null : t)}
              onAction={handleAction}
            />
          ))
        )}
      </section>

      {drawerOpen && <NotificationDrawer items={notifications} onClose={closeDrawer} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
