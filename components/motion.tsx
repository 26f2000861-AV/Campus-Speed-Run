'use client';

import { useEffect, type RefObject } from 'react';
import { MotionConfig, motion, type HTMLMotionProps } from 'framer-motion';
import { PULSE_EVENT, type PulseDetail } from '@/components/ParticleField';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Send a ring of light through the backdrop's dot field from a point on screen. */
export function emitPulse(detail: PulseDetail) {
  window.dispatchEvent(new CustomEvent<PulseDetail>(PULSE_EVENT, { detail }));
}

/**
 * The brand pulse: the logo's plus beats and a wave spreads from it through the
 * dot field. Fires once after `delay`, then softly every `repeatMs` while the
 * logo is on screen and the tab is visible. Skipped entirely for reduced motion.
 */
export function useBrandPulse(ref: RefObject<HTMLElement | null>, { delay = 700, repeatMs = 0 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    io.observe(el);

    const beat = (strength: number) => {
      if (!onScreen || document.hidden) return;
      const plus = el.querySelector('.logo-plus') ?? el;
      const r = plus.getBoundingClientRect();
      el.classList.remove('beat');
      void el.offsetWidth; // restart the CSS beat
      el.classList.add('beat');
      emitPulse({ x: r.left + r.width / 2, y: r.top + r.height / 2, strength });
    };

    const first = window.setTimeout(() => beat(1), delay);
    const again = repeatMs ? window.setInterval(() => beat(0.5), repeatMs) : 0;
    return () => {
      window.clearTimeout(first);
      if (again) window.clearInterval(again);
      io.disconnect();
    };
  }, [ref, delay, repeatMs]);
}

/** Global motion settings: honour the OS reduced-motion preference everywhere. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}

/** Fades content up once as it scrolls into view. */
export function Reveal({
  delay = 0,
  y = 14,
  children,
  ...rest
}: { delay?: number; y?: number } & HTMLMotionProps<'div'>) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Parent/child pair for staggered entrances. */
export const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const staggerChild = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};
