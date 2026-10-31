'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/components/motion';
import { TONE_DOT, TONE_TEXT, type Tone } from '@/components/ui';

// ---------------------------------------------------------------------------
// Activity rings: three concentric progress rings for resolved (green), being
// worked on (yellow) and unresolved (red), each drawn as a share of the total.
// ---------------------------------------------------------------------------
export interface RingDatum {
  label: string;
  count: number;
  tone: Tone;
}

const RING_COLORS: Record<Tone, { from: string; to: string }> = {
  ok: { from: '#16A34A', to: '#4ADE80' },
  warn: { from: '#CA8A04', to: '#FACC15' },
  bad: { from: '#DC2626', to: '#F87171' },
};

export function ActivityRings({
  data,
  total,
  centerLabel = 'complaints',
  size = 220,
  loading = false,
}: {
  data: [RingDatum, RingDatum, RingDatum];
  total: number;
  centerLabel?: string;
  size?: number;
  loading?: boolean;
}) {
  const stroke = 15;
  const gap = 5;
  const radii = [100 - stroke / 2 - 2, 100 - stroke * 1.5 - gap - 2, 100 - stroke * 2.5 - gap * 2 - 2];
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full" style={{ maxWidth: size, aspectRatio: '1 / 1' }}>
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full -rotate-90"
          role="img"
          aria-label={loading ? 'Loading' : data.map((d) => `${d.label}: ${d.count} (${pct(d.count)}%)`).join(', ')}
        >
          <defs>
            {data.map((d) => (
              <linearGradient key={d.tone} id={`ring-${d.tone}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={RING_COLORS[d.tone].from} />
                <stop offset="100%" stopColor={RING_COLORS[d.tone].to} />
              </linearGradient>
            ))}
          </defs>
          {data.map((d, i) => {
            const r = radii[i];
            const c = 2 * Math.PI * r;
            const p = loading || total <= 0 ? 0 : d.count / total;
            return (
              <g key={d.tone}>
                <circle cx="100" cy="100" r={r} fill="none" stroke={RING_COLORS[d.tone].from} strokeOpacity={0.14} strokeWidth={stroke} />
                {p > 0 && (
                  <motion.circle
                    cx="100"
                    cy="100"
                    r={r}
                    fill="none"
                    stroke={`url(#ring-${d.tone})`}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    initial={{ strokeDashoffset: c }}
                    animate={{ strokeDashoffset: c * (1 - Math.min(p, 0.9999)) }}
                    transition={{ duration: 1.3, delay: 0.15 + i * 0.12, ease: EASE_OUT }}
                  />
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl sm:text-4xl font-semibold tracking-tight tabular-nums">
            {loading ? '–' : <CountUp value={total} />}
          </span>
          <span className="text-xs text-fg-muted mt-0.5">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full grid grid-cols-3 gap-2">
        {data.map((d) => (
          <li key={d.tone} className="rounded-xl border border-line bg-ink-950/50 px-2.5 sm:px-3 py-2.5 min-w-0">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span className={`w-2 h-2 shrink-0 rounded-full ${TONE_DOT[d.tone]}`} aria-hidden="true" />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-lg font-semibold tabular-nums">{loading ? '–' : d.count}</span>
              {!loading && <span className={`text-xs font-mono tabular-nums ${TONE_TEXT[d.tone]}`}>{pct(d.count)}%</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Metric number. Counts up once when data first arrives, then tweens from the
 * previous value, so a refresh after an action shows what changed (18 → 19)
 * instead of dropping every figure back to zero. Instant under reduced motion.
 */
export function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  // Tweens from what is on screen, not from the last target: a cancelled run
  // (Strict Mode's double effect, or a refresh mid-tween) resumes instead of
  // leaving the number stuck at 0.
  const current = useRef(shown);
  useEffect(() => {
    if (reduce) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    if (start === value) return;
    const controls = animate(start, value, {
      duration: start === 0 ? 0.7 : 0.45,
      ease: EASE_OUT,
      onUpdate: (v) => {
        current.current = v;
        setShown(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{shown}</>;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  loading = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="cs-card p-4 sm:p-5 h-full transition-[border-color,transform] duration-200 hover:border-line-strong hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-fg-muted">{label}</span>
        <span
          className={`w-8 h-8 shrink-0 rounded-lg inline-flex items-center justify-center border border-line bg-white/[0.02] ${
            tone ? TONE_TEXT[tone] : 'text-fg-muted'
          }`}
        >
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">
        {loading ? <span className="skeleton inline-block h-8 w-12 align-middle" /> : <CountUp value={value} />}
      </div>
      {hint && <p className="mt-1 text-xs text-fg-subtle truncate">{hint}</p>}
    </div>
  );
}

/** Horizontal share bars (analytics breakdowns). */
export function ShareBars({ rows, loading = false }: { rows: Array<{ label: string; count: number }>; loading?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-fg-muted truncate">{r.label}</span>
            <span className="font-mono tabular-nums text-fg">{loading ? '–' : r.count}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            {/* Grows by transform, not width, so the row never reflows while it fills. */}
            <motion.div
              className="h-full rounded-full bg-steel origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: loading ? 0 : r.count / max }}
              transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.25), ease: EASE_OUT }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
