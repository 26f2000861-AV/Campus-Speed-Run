'use client';

import { MotionConfig, motion, type HTMLMotionProps } from 'framer-motion';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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
