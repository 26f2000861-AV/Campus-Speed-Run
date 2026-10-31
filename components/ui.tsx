'use client';

import { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CircleDot, MinusCircle } from 'lucide-react';
import type { ComplaintPriority, ComplaintStatus } from '@/lib/types';

// ---------------------------------------------------------------------------
// Urgency (spec 04 §4): CRITICAL crimson pulsing, HIGH amber, MEDIUM indigo,
// LOW slate. Colour is always paired with the text label + numeric score.
// ---------------------------------------------------------------------------
const PRIORITY_STYLE: Record<ComplaintPriority, { pill: string; dot: string; Icon: typeof AlertOctagon }> = {
  CRITICAL: { pill: 'bg-red-950/70 text-red-200 border-red-700', dot: 'bg-red-500', Icon: AlertOctagon },
  HIGH: { pill: 'bg-amber-950/70 text-amber-200 border-amber-700', dot: 'bg-amber-400', Icon: AlertTriangle },
  MEDIUM: { pill: 'bg-indigo-950/70 text-indigo-200 border-indigo-700', dot: 'bg-indigo-400', Icon: CircleDot },
  LOW: { pill: 'bg-slate-800 text-slate-300 border-slate-600', dot: 'bg-slate-400', Icon: MinusCircle },
};

function priorityStyle(priority: string | null | undefined) {
  return PRIORITY_STYLE[(priority as ComplaintPriority) in PRIORITY_STYLE ? (priority as ComplaintPriority) : 'LOW'];
}

export function UrgencyPill({
  priority,
  score,
  className = '',
  calm = false,
  pulse = false,
}: {
  priority: string | null | undefined;
  score?: number | null;
  className?: string;
  /** Student-facing views: never pulse. */
  calm?: boolean;
  /** Staff queue: pulse only for tickets that still need someone to act on a safety risk. */
  pulse?: boolean;
}) {
  const s = priorityStyle(priority);
  const label = priority || 'PENDING';
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 max-w-full px-2.5 py-0.5 rounded-full border text-xs font-mono font-semibold ${s.pill} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${pulse && !calm ? 'animate-pulse' : ''}`} aria-hidden="true" />
      <s.Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{label}</span>
      {typeof score === 'number' && (
        <>
          <span aria-hidden="true">&bull;</span>
          <span>Score: {score}/100</span>
        </>
      )}
    </span>
  );
}

/** Thin score meter bar (decorative; the number is always shown next to it). */
export function ScoreMeter({ priority, score }: { priority: string; score: number }) {
  const bar =
    priority === 'CRITICAL'
      ? 'bg-red-500'
      : priority === 'HIGH'
      ? 'bg-amber-400'
      : priority === 'MEDIUM'
      ? 'bg-indigo-400'
      : 'bg-slate-400';
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
      <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hashtag pills (spec 08 §4)
// ---------------------------------------------------------------------------
export function HashtagPill({
  tag,
  onClick,
  active = false,
}: {
  tag: string;
  onClick?: (tag: string) => void;
  active?: boolean;
}) {
  if (!onClick) return <span className="hashtag-pill">{tag}</span>;
  return (
    <button
      type="button"
      onClick={() => onClick(tag)}
      aria-pressed={active}
      aria-label={`Filter queue by ${tag}`}
      className={`hashtag-pill py-1.5 min-h-[30px] transition-colors hover:border-indigo-500 hover:text-indigo-200 ${
        active ? 'ring-2 ring-indigo-400 text-indigo-100' : ''
      }`}
    >
      {tag}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Execution status (spec 09 §2 axis B)
// ---------------------------------------------------------------------------
const STATUS_STYLE: Record<ComplaintStatus, { cls: string; dot: string; label: string }> = {
  UNACKNOWLEDGED: { cls: 'text-red-200 border-red-800 bg-red-950/40', dot: 'bg-red-500', label: 'Unacknowledged' },
  ACKNOWLEDGED: { cls: 'text-amber-200 border-amber-800 bg-amber-950/40', dot: 'bg-amber-400', label: 'Acknowledged' },
  IN_PROGRESS: {
    cls: 'text-indigo-200 border-indigo-800 bg-indigo-950/40',
    dot: 'bg-indigo-400',
    label: 'In Progress',
  },
  ESCALATED: { cls: 'text-orange-200 border-orange-800 bg-orange-950/40', dot: 'bg-orange-400', label: 'Escalated' },
  RESOLVED: { cls: 'text-emerald-200 border-emerald-800 bg-emerald-950/40', dot: 'bg-emerald-400', label: 'Resolved' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status as ComplaintStatus] ?? STATUS_STYLE.UNACKNOWLEDGED;
  return (
    <span className={`inline-flex items-center gap-1.5 max-w-full px-2.5 py-0.5 rounded-full border text-xs font-semibold [overflow-wrap:anywhere] ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      <span>{s.label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// SLA helpers
// ---------------------------------------------------------------------------
export const TIER_LABEL: Record<string, string> = {
  TEACHER: 'Teacher',
  FACULTY: 'Faculty',
  ADMINISTRATIVE: 'Administrative',
};

export const NEXT_TIER: Record<string, 'FACULTY' | 'ADMINISTRATIVE' | undefined> = {
  TEACHER: 'FACULTY',
  FACULTY: 'ADMINISTRATIVE',
};

export type SlaLevel = 'ok' | 'warn' | 'breached';

export function slaInfo(deadline: string | null | undefined, now: number): { text: string; level: SlaLevel } {
  const t = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(t)) return { text: 'No deadline', level: 'ok' };
  const diff = t - now;
  if (diff <= 0) return { text: 'SLA window expired — escalation pending', level: 'breached' };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return { text: `${h}h ${String(m).padStart(2, '0')}m left`, level: h < 24 ? 'warn' : 'ok' };
}

export function SlaChip({ deadline, now, resolved = false }: { deadline: string; now: number; resolved?: boolean }) {
  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-800 bg-emerald-950/40 text-emerald-200 text-xs font-mono">
        SLA clock stopped
      </span>
    );
  }
  const sla = slaInfo(deadline, now);
  const cls =
    sla.level === 'breached'
      ? 'border-red-700 bg-red-950/60 text-red-200'
      : sla.level === 'warn'
      ? 'border-amber-600 bg-amber-950/60 text-amber-200'
      : 'border-slate-700 bg-slate-800 text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono tabular-nums ${cls}`}>
      {sla.level !== 'ok' && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
      <span>
        {sla.level === 'warn' ? 'Under 24h: ' : ''}
        {sla.text}
      </span>
    </span>
  );
}

/** Ticking clock for countdowns (default every 30s). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Read a JSON error body into a readable sentence. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const msg = typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : '';
  if (res.status === 401) return 'Your session has expired. Please sign in again.';
  if (res.status === 403) return msg || 'You are not allowed to act on this ticket at your tier.';
  if (res.status === 409) return msg || 'This ticket changed in the meantime. The queue has been refreshed.';
  return msg || fallback;
}

/** "INFRASTRUCTURE" / "IT_NETWORK" → "Infrastructure" / "IT network" for display. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const words = value.replace(/_/g, ' ').toLowerCase().split(' ');
  const keepUpper = new Set(['it', 'mca', 'ai', 'sla']);
  return words
    .map((w, i) => (keepUpper.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ---------------------------------------------------------------------------
// AI summary (spec 03): Gemini writes "Problem Narration: … Impact Assessment: …
// Recommended Execution: …". Show it as three short labelled lines instead of
// one long paragraph with form labels; plain summaries render unchanged.
// ---------------------------------------------------------------------------
const SUMMARY_PARTS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Problem', pattern: /problem(?:\s+narration)?\s*:/i },
  { label: 'Impact', pattern: /impact(?:\s+assessment)?\s*:/i },
  { label: 'Action', pattern: /(?:recommended\s+execution|execution\s+required|recommended\s+action)\s*:/i },
];

function splitSummary(summary: string): Array<{ label: string; text: string }> | null {
  const marks = SUMMARY_PARTS.map((p) => {
    const m = p.pattern.exec(summary);
    return m ? { label: p.label, start: m.index, end: m.index + m[0].length } : null;
  }).filter((m): m is { label: string; start: number; end: number } => m !== null);
  if (marks.length < 2) return null;
  marks.sort((a, b) => a.start - b.start);
  return marks
    .map((m, i) => ({ label: m.label, text: summary.slice(m.end, marks[i + 1]?.start ?? summary.length).trim() }))
    .filter((p) => p.text.length > 0);
}

export function SummaryLines({ summary, className = '' }: { summary: string | null | undefined; className?: string }) {
  const text = (summary || '').trim();
  if (!text) return null;
  const parts = splitSummary(text);
  if (!parts) return <p className={`text-sm text-slate-300 leading-relaxed max-w-[34rem] ${className}`}>{text}</p>;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm leading-relaxed max-w-[34rem] ${className}`}>
      {parts.map((p) => (
        <div key={p.label} className="contents">
          <dt className="cs-label text-slate-400 pt-0.5">{p.label}</dt>
          <dd className="text-slate-300">{p.text}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Score explanation (spec 04 formula, shown so tied 100/100 tickets still mean
// something): base by urgency + crowd boost + damage + safety, capped at 100.
// ---------------------------------------------------------------------------
const BASE_WEIGHT: Record<string, number> = { CRITICAL: 80, HIGH: 60, MEDIUM: 40, LOW: 20 };

export function scoreParts(t: {
  priority: string;
  report_count: number;
  is_damage_prone: boolean;
  is_safety_critical: boolean;
}): string {
  const base = BASE_WEIGHT[t.priority] ?? 40;
  const parts = [`${humanize(t.priority)} ${base}`];
  const crowd = Math.min(15, Math.max(0, (t.report_count - 1) * 3));
  if (crowd) parts.push(`+${crowd} for ${t.report_count} reports`);
  if (t.is_damage_prone) parts.push('+10 damage-prone');
  if (t.is_safety_critical) parts.push('+15 safety risk');
  const raw = base + crowd + (t.is_damage_prone ? 10 : 0) + (t.is_safety_critical ? 15 : 0);
  return `${parts.join(' · ')}${raw > 100 ? ` = ${raw}, capped at 100` : ''}`;
}

/** Plain-language "what happens next" for students and the public tracker. */
export function nextStepText(
  t: { status: string; current_handler_role: string; stage_deadline: string },
  now: number
): string {
  if (t.status === 'RESOLVED') return 'Fixed and closed. The timeline has the note staff left.';
  const holder = TIER_LABEL[t.current_handler_role] ?? t.current_handler_role;
  const next = NEXT_TIER[t.current_handler_role];
  const when = new Date(t.stage_deadline).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  if (slaInfo(t.stage_deadline, now).level === 'breached') {
    return next
      ? `${holder} missed the deadline, so it is moving up to ${TIER_LABEL[next]} automatically.`
      : `${holder} is past the 72-hour target; this is the final tier, so it stays flagged until fixed.`;
  }
  return next
    ? `${holder} has until ${when} to act. If not, it moves up to ${TIER_LABEL[next]} automatically.`
    : `${holder} has it, the final tier. Target: ${when}.`;
}

