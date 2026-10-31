'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  Flame,
  Loader2,
  PlayCircle,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { ComplaintGroupView, StatusHistoryView, UserRole } from '@/lib/types';
import {
  HashtagPill,
  NEXT_TIER,
  SlaChip,
  StatusBadge,
  SummaryLines,
  TIER_LABEL,
  UrgencyPill,
  formatDate,
  humanize,
  nextStepText,
  scoreParts,
} from '@/components/ui';
import { EASE_OUT } from '@/components/motion';

export type TicketAction = 'ack' | 'progress' | 'forward' | 'resolve';
type StaffRole = Exclude<UserRole, 'STUDENT'>;

const TIERS = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'] as const;

const ACTION_TEXT: Record<string, string> = {
  SUBMITTED: 'Reported',
  CLUSTERED: 'Matching report merged',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'Work started',
  FORWARDED: 'Forwarded up',
  AUTO_ESCALATED: 'Escalated automatically',
  RESOLVED: 'Resolved',
};

export default function DetailPanel({
  ticket,
  actionable,
  role,
  now,
  busy,
  error,
  tieNote,
  onAction,
  onClose,
}: {
  ticket: ComplaintGroupView;
  actionable: boolean;
  role: StaffRole;
  now: number;
  busy: TicketAction | null;
  error: string | null;
  tieNote?: string | null;
  onAction: (ticket: ComplaintGroupView, action: TicketAction, note?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [history, setHistory] = useState<StatusHistoryView[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [mode, setMode] = useState<'none' | 'forward' | 'resolve'>('none');
  const [forwardNote, setForwardNote] = useState('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const next = NEXT_TIER[role];
  const resolved = ticket.status === 'RESOLVED';
  const canAck = ticket.status === 'UNACKNOWLEDGED' || ticket.status === 'ESCALATED';
  const canProgress = ticket.status !== 'IN_PROGRESS';
  const tierIdx = TIERS.indexOf(ticket.current_handler_role as (typeof TIERS)[number]);

  // Focus the close button on open; Escape closes; Tab stays inside the panel.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Status history comes from the public tracker endpoint (no identity fields).
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryError(false);
    fetch(`/api/complaints/track?id=${encodeURIComponent(ticket.tracking_id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setHistory(Array.isArray(d.history) ? d.history : []);
      })
      .catch(() => {
        if (!cancelled) setHistoryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticket.tracking_id, ticket.status, ticket.current_handler_role]);

  useEffect(() => {
    setMode('none');
    setNoteError(null);
  }, [ticket.tracking_id]);

  const submitForward = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onAction(ticket, 'forward', forwardNote.trim() || undefined);
    if (ok) {
      setMode('none');
      setForwardNote('');
    }
  };

  const submitResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 5) {
      setNoteError('Add a short note on what was done (at least 5 characters).');
      document.getElementById('resolve-note')?.focus();
      return;
    }
    setNoteError(null);
    const ok = await onAction(ticket, 'resolve', note.trim());
    if (ok) {
      setMode('none');
      setNote('');
    }
  };

  const facts: Array<{ k: string; v: React.ReactNode }> = [
    { k: 'Location', v: ticket.location_zone },
    { k: 'Submitted', v: formatDate(ticket.created_at) },
    { k: 'Category', v: `${humanize(ticket.category)}${ticket.subcategory ? ` · ${ticket.subcategory}` : ''}` },
    { k: 'Reports', v: `${ticket.report_count} student${ticket.report_count === 1 ? '' : 's'}` },
    { k: 'Assigned', v: `${TIER_LABEL[ticket.current_handler_role] ?? ticket.current_handler_role} · ${ticket.primary_department_code}` },
    { k: 'Deadline', v: resolved ? '—' : formatDate(ticket.stage_deadline) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.button
        type="button"
        aria-label="Close details"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
        transition={{ duration: 0.36, ease: EASE_OUT }}
        className="relative w-full sm:max-w-xl h-full bg-ink-900 border-l border-line shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 h-16 border-b border-line shrink-0">
          <span className="font-mono text-sm text-fg-muted">{ticket.tracking_id}</span>
          <div className="flex items-center gap-1">
            <Link
              href={`/track?id=${encodeURIComponent(ticket.tracking_id)}`}
              className="btn-ghost h-9 text-xs"
              aria-label={`Open public tracker for ${ticket.tracking_id}`}
            >
              Tracker <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
            <button ref={closeRef} type="button" onClick={onClose} className="btn-icon w-9 h-9" aria-label="Close details">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6 space-y-7">
          <section>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={ticket.status} />
              <UrgencyPill priority={ticket.priority} score={ticket.priority_score} />
              <SlaChip deadline={ticket.stage_deadline} now={now} resolved={resolved} />
            </div>
            <h2 id="detail-title" className="mt-3 text-xl font-semibold leading-snug">
              {ticket.normalized_title || ticket.title}
            </h2>
            {(ticket.is_safety_critical || ticket.is_damage_prone) && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {ticket.is_safety_critical && (
                  <span className="inline-flex items-center gap-1.5 text-bad-soft">
                    <ShieldAlert className="w-4 h-4" aria-hidden="true" /> Safety-critical
                  </span>
                )}
                {ticket.is_damage_prone && (
                  <span className="inline-flex items-center gap-1.5 text-orange-200">
                    <Flame className="w-4 h-4" aria-hidden="true" /> Damage-prone
                  </span>
                )}
              </p>
            )}
          </section>

          {error && (
            <div role="alert" className="alert-error">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-line bg-line">
            {facts.map((f) => (
              <div key={f.k} className="bg-ink-900 p-3.5 min-w-0">
                <dt className="text-xs text-fg-subtle">{f.k}</dt>
                <dd className="mt-1 text-sm [overflow-wrap:anywhere]">{f.v}</dd>
              </div>
            ))}
          </dl>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-fg-muted">Summary</h3>
            <SummaryLines summary={ticket.ai_summary} />
          </section>

          <section className="rounded-xl border border-line bg-ink-950/50 p-4 space-y-2">
            <h3 className="text-sm font-medium">Priority score · {ticket.priority_score}/100</h3>
            <p className="text-sm text-fg-muted">{scoreParts(ticket)}</p>
            {tieNote && <p className="text-xs text-fg-subtle">{tieNote}</p>}
            {ticket.routing_reasoning && <p className="text-sm text-fg-muted pt-2 border-t border-line">{ticket.routing_reasoning}</p>}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-fg-muted">Escalation</h3>
            <ol className="grid grid-cols-3 gap-2" aria-label="Escalation tier">
              {TIERS.map((t, i) => (
                <li
                  key={t}
                  aria-current={i === tierIdx ? 'step' : undefined}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    i === tierIdx ? 'border-fg/30 bg-white/[0.05]' : i < tierIdx ? 'border-line text-fg-muted' : 'border-line/60 text-fg-subtle'
                  }`}
                >
                  <span className="block text-[11px] font-mono text-fg-subtle">Tier {i + 1}</span>
                  {TIER_LABEL[t]}
                </li>
              ))}
            </ol>
            <p className="text-sm text-fg-muted">{nextStepText(ticket, now)}</p>
          </section>

          {ticket.hashtags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {ticket.hashtags.map((h) => (
                <li key={h}>
                  <HashtagPill tag={h} />
                </li>
              ))}
            </ul>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-fg-muted">Status history</h3>
            {history === null && !historyError ? (
              <div className="space-y-2" aria-hidden="true">
                <div className="skeleton h-10" />
                <div className="skeleton h-10" />
              </div>
            ) : historyError ? (
              <p className="text-sm text-fg-muted">History couldn&apos;t be loaded. The public tracker has the full log.</p>
            ) : history && history.length === 0 ? (
              <p className="text-sm text-fg-muted">No updates yet.</p>
            ) : (
              <ol className="relative border-l border-line ml-1.5 space-y-4">
                {[...(history || [])].reverse().map((h, i) => (
                  <li key={`${h.created_at}-${i}`} className="pl-5 relative">
                    <span
                      className={`absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full ${
                        h.action === 'RESOLVED' ? 'bg-ok' : h.action.includes('ESCALAT') || h.action === 'FORWARDED' ? 'bg-bad' : h.action === 'IN_PROGRESS' || h.action === 'ACKNOWLEDGED' ? 'bg-warn' : 'bg-fg-subtle'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium">
                        {ACTION_TEXT[h.action] ?? humanize(h.action)}
                        <span className="text-fg-subtle font-normal"> · {TIER_LABEL[h.actor_role] ?? humanize(h.actor_role)}</span>
                      </span>
                      <time dateTime={h.created_at} className="text-xs text-fg-subtle">
                        {formatDate(h.created_at)}
                      </time>
                    </div>
                    {h.note && <p className="mt-0.5 text-sm text-fg-muted">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {mode === 'forward' && next && (
            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submitForward}
              className="rounded-xl border border-line bg-ink-950/60 p-4 space-y-3"
            >
              <p className="text-sm">
                Forward to {TIER_LABEL[next]}? It leaves your queue and their 72-hour clock starts now. This can&apos;t be undone from your tier.
              </p>
              <label htmlFor="forward-note" className="cs-field-label">
                Note for {TIER_LABEL[next]} <span className="text-fg-subtle font-normal">(optional)</span>
              </label>
              <textarea
                id="forward-note"
                autoFocus
                rows={2}
                maxLength={500}
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                placeholder="Why it needs their authority"
                className="cs-input"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy !== null} className="btn-primary">
                  {busy === 'forward' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
                  Forward to {TIER_LABEL[next]}
                </button>
                <button type="button" onClick={() => setMode('none')} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </motion.form>
          )}

          {mode === 'resolve' && (
            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submitResolve}
              className="rounded-xl border border-ok/30 bg-ok/[0.05] p-4 space-y-3"
            >
              <label htmlFor="resolve-note" className="cs-field-label">
                Resolution note
              </label>
              <textarea
                id="resolve-note"
                autoFocus
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-invalid={noteError ? true : undefined}
                aria-describedby={noteError ? 'resolve-note-error' : 'resolve-note-hint'}
                placeholder="e.g. Electrician replaced the fan capacitor and secured the mount."
                className="cs-input"
              />
              {noteError ? (
                <p id="resolve-note-error" role="alert" className="text-xs text-bad-soft">
                  {noteError}
                </p>
              ) : (
                <p id="resolve-note-hint" className="cs-hint mt-0">
                  Students see this note on their tracker.
                </p>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={busy !== null} className="btn-resolve">
                  {busy === 'resolve' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  Mark resolved
                </button>
                <button type="button" onClick={() => setMode('none')} className="btn-ghost">
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </div>

        {/* Actions */}
        <footer className="shrink-0 border-t border-line px-5 sm:px-6 py-4">
          {!actionable ? (
            <p className="text-sm text-fg-muted">
              {resolved ? 'This complaint is resolved.' : `This complaint is with ${TIER_LABEL[ticket.current_handler_role] ?? 'another tier'}. Only that tier can update it.`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {canAck && (
                <button type="button" onClick={() => onAction(ticket, 'ack')} disabled={busy !== null} className="btn-secondary">
                  {busy === 'ack' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  Acknowledge
                </button>
              )}
              {canProgress && (
                <button type="button" onClick={() => onAction(ticket, 'progress')} disabled={busy !== null} className="btn-secondary">
                  {busy === 'progress' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="w-4 h-4" aria-hidden="true" />}
                  Start work
                </button>
              )}
              {next && (
                <button
                  type="button"
                  onClick={() => setMode(mode === 'forward' ? 'none' : 'forward')}
                  disabled={busy !== null}
                  aria-expanded={mode === 'forward'}
                  className="btn-secondary"
                >
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  Forward
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode(mode === 'resolve' ? 'none' : 'resolve')}
                disabled={busy !== null}
                aria-expanded={mode === 'resolve'}
                className="btn-resolve sm:ml-auto"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                Resolve
              </button>
            </div>
          )}
        </footer>
      </motion.aside>
    </div>
  );
}
