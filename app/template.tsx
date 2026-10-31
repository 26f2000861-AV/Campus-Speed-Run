'use client';

import { motion } from 'framer-motion';
import { EASE_OUT } from '@/components/motion';

// Route transition: a short fade with a slight rise. Opacity/transform only, so
// layout never jumps and clicks are never blocked.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
