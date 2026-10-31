'use client';

import { motion } from 'framer-motion';

// Route change: a short opacity crossfade. No transform, so fixed panels and
// sticky bars inside the page are never displaced, and nobody waits on it.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}
