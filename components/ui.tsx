'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ComplaintPriority, ComplaintStatus } from '@/lib/types';

// ---------------------------------------------------------------------------
// Urgency (spec 04 §4). Neutral pill with a coloured dot so priority never
// competes with status colour; CRITICAL is the only red. Colour is always
// paired with the text label + numeric score.
// ---------------------------------------------------------------------------
const PRIORITY_STYLE: Record<ComplaintPriority, { dot: string; text: string; label: string }> = {
  CRITICAL: { dot: 'bg-bad', text: 'text-bad-soft', label: 'Critical' },
  HIGH: { dot: 'bg-orange-400', text: 'text-orange-200', label: 'High' },
  MEDIUM: { dot: 'bg-steel', text: 'text-fg', label: 'Medium' },
  LOW: { dot: 'bg-fg-subtle', text: 'text-fg-muted', label: 'Low' },
};

export const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

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
  const known = (priority as ComplaintPriority) in PRIORITY_STYLE;
  const s = PRIORITY_STYLE[known ? (priority as ComplaintPriority) : 'LOW'];
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full h-6 px-2 rounded-md border border-line bg-white/[0.03] text-xs font-medium whitespace-nowrap ${s.text} ${className}`}
    >
      <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
        {pulse && !calm && <span className={`absolute inset-0 rounded-full ${s.dot} animate-ping opacity-60`} />}
        <span className={`relative w-1.5 h-1.5 rounded-full ${s.dot}`} />
      </span>
      <span>{known ? s.label : 'Pending'}</span>
      {typeof score === 'number' && (
        <span className="font-mono text-fg-muted tabular-nums">
          <span className="sr-only">, score </span>
          {score}
        </span>
      )}
    </span>
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
      aria-label={`Filter by ${tag}`}
      className={`hashtag-pill h-8 px-2.5 transition-colors hover:text-fg hover:border-line-strong ${
        active ? 'bg-fg text-ink-950 border-fg hover:text-ink-950' : ''
      }`}
    >
      {tag}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Execution status (spec 09 §2 axis B). Green = resolved, yellow = being
// worked on, red = nobody has picked it up yet (or it was escalated).
// ---------------------------------------------------------------------------
export type Tone = 'ok' | 'warn' | 'bad';

export function statusTone(status: string): Tone {
  if (status === 'RESOLVED') return 'ok';
  if (status === 'ACKNOWLEDGED' || status === 'IN_PROGRESS') return 'warn';
  return 'bad';
}

export const TONE_DOT: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' };
export const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok-soft', warn: 'text-warn-soft', bad: 'text-bad-soft' };
const TONE_BADGE: Record<Tone, string> = {
  ok: 'bg-ok/10 border-ok/25',
  warn: 'bg-warn/10 border-warn/25',
  bad: 'bg-bad/10 border-bad/25',
};

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  UNACKNOWLEDGED: 'New',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-full h-6 px-2 rounded-md border text-xs font-medium whitespace-nowrap ${TONE_BADGE[tone]} ${TONE_TEXT[tone]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      <span>{STATUS_LABEL[status as ComplaintStatus] ?? status}</span>
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
      <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-ok/25 bg-ok/10 text-ok-soft text-xs font-medium whitespace-nowrap">
        Clock stopped
      </span>
    );
  }
  const sla = slaInfo(deadline, now);
  const cls =
    sla.level === 'breached'
      ? 'border-bad/30 bg-bad/10 text-bad-soft'
      : sla.level === 'warn'
      ? 'border-warn/30 bg-warn/10 text-warn-soft'
      : 'border-line bg-white/[0.03] text-fg-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md border text-xs font-mono tabular-nums whitespace-nowrap ${cls}`}>
      {sla.level !== 'ok' && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
      <span>{sla.level === 'breached' ? 'Overdue — escalating' : sla.text}</span>
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
  if (!parts) return <p className={`text-sm text-fg-muted leading-relaxed max-w-[38rem] ${className}`}>{text}</p>;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm leading-relaxed max-w-[38rem] ${className}`}>
      {parts.map((p) => (
        <div key={p.label} className="contents">
          <dt className="text-xs font-medium text-fg-subtle pt-0.5 w-14">{p.label}</dt>
          <dd className="text-fg-muted">{p.text}</dd>
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


export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <span className="mx-auto w-11 h-11 rounded-xl border border-line bg-white/[0.02] flex items-center justify-center text-fg-muted">
        <Icon className="w-5 h-5" />
      </span>
      <p className="mt-4 text-[15px] font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-fg-muted max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function formatDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return withTime ? `${date}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : date;
}
