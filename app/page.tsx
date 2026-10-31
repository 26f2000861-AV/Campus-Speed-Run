'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowDown, EyeOff, Gauge, Search, ShieldCheck, Timer } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/Logo';
import { EASE_OUT, Reveal } from '@/components/motion';

const HEADLINE = [
  ['Your', 'Campus.', 'Your', 'Voice.'],
  ['Real', 'Action.'],
];

const STEPS = [
  {
    icon: EyeOff,
    title: 'Report anonymously',
    body: 'Describe the issue, pick the room, add a photo. Staff only ever see a ticket number.',
  },
  {
    icon: Gauge,
    title: 'Ranked by risk',
    body: 'AI scores every report 0–100, so hazards rise above routine requests.',
  },
  {
    icon: Timer,
    title: 'Escalated on time',
    body: 'Every tier has 72 hours to act. Miss it, and the ticket moves up automatically.',
  },
];

const CHAIN = [
  { tier: 'Tier 1', role: 'Teacher', window: 'Hours 0–72' },
  { tier: 'Tier 2', role: 'Faculty', window: 'Hours 72–144' },
  { tier: 'Tier 3', role: 'Administration', window: 'Final authority' },
];

export default function HomePage() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const isStaff = !!user && user.role !== 'STUDENT';
  const primary = isStaff
    ? { href: '/dashboard', label: 'Open console' }
    : { href: '/student/submit', label: 'Report an issue' };

  return (
    <div>
      {/* Hero */}
      <section ref={heroRef} className="relative min-h-[calc(100svh-4rem)] flex items-center">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center"
        >
          {/* Soft scrim so type stays crisp over the brightest bands of the field. */}
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[80%] -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(8,9,11,0.75),transparent)]"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: EASE_OUT }}
            className="group inline-flex"
          >
            <Logo size="xl" />
          </motion.div>

          <h1 className="mt-10 text-[1.75rem] leading-[1.15] sm:text-4xl lg:text-5xl font-semibold tracking-[-0.035em]">
            {HEADLINE.map((line, li) => (
              <span key={li} className={`block ${li === 0 ? 'text-fg-muted' : 'text-fg'}`}>
                {line.map((word, wi) => {
                  const i = li * 4 + wi;
                  return (
                    <motion.span
                      key={word + i}
                      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.7, delay: 0.45 + i * 0.08, ease: EASE_OUT }}
                      className="inline-block mr-[0.25em] last:mr-0"
                    >
                      {word}
                    </motion.span>
                  );
                })}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1, ease: EASE_OUT }}
            className="mt-6 mx-auto max-w-xl text-base sm:text-lg text-fg-muted leading-relaxed"
          >
            Report campus issues, track their progress, and hold the system accountable. One platform for students,
            faculty and administration.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.15, ease: EASE_OUT }}
            className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
          >
            <Link href={primary.href} className="btn-primary h-12 px-6 text-[15px] group/cta">
              {primary.label}
              <ArrowRight className="w-4 h-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Link href="/track" className="btn-secondary h-12 px-6 text-[15px] bg-ink-900/60 backdrop-blur-md">
              <Search className="w-4 h-4" aria-hidden="true" />
              Track your complaint
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.4 }}
            className="mt-8 inline-flex items-center gap-2 text-sm text-fg-muted"
          >
            <ShieldCheck className="w-4 h-4 text-ok" aria-hidden="true" />
            Built for a safer, smarter and more responsive campus.
          </motion.p>
        </motion.div>

        <motion.a
          href="#how"
          aria-label="Scroll to how it works"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 6, 0] }}
          transition={{ opacity: { delay: 1.8 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
          className="hidden sm:flex absolute bottom-8 left-1/2 -translate-x-1/2 w-10 h-10 items-center justify-center rounded-full border border-white/10 text-fg-muted hover:text-fg"
        >
          <ArrowDown className="w-4 h-4" aria-hidden="true" />
        </motion.a>
      </section>

      {/* How it works */}
      <section id="how" className="relative scroll-mt-20 bg-gradient-to-b from-transparent via-ink-950/90 to-ink-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal className="max-w-xl">
            <p className="cs-label">How it works</p>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold">From report to resolved, in the open.</h2>
          </Reveal>
          <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.08}>
                <li className="cs-glass h-full p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-white/15">
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] inline-flex items-center justify-center">
                      <s.icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-fg-muted leading-relaxed">{s.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Escalation chain */}
      <section className="relative bg-ink-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
          <Reveal className="cs-card p-6 sm:p-10">
            <div className="grid lg:grid-cols-[1fr_1.4fr] gap-10 items-center">
              <div>
                <p className="cs-label">Accountability</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-semibold">Nothing sits in a queue forever.</h2>
                <p className="mt-3 text-fg-muted leading-relaxed max-w-md">
                  If a tier doesn&apos;t act within 72 hours, the complaint escalates on its own — all the way to
                  administration.
                </p>
              </div>
              <ol className="relative grid grid-cols-1 sm:grid-cols-3 gap-3">
                {CHAIN.map((c, i) => (
                  <li key={c.role} className="relative rounded-xl border border-line bg-ink-950/60 p-4">
                    <span className="text-xs font-mono text-fg-subtle">{c.tier}</span>
                    <p className="mt-1 font-semibold">{c.role}</p>
                    <p className="mt-3 text-xs text-fg-muted">{c.window}</p>
                    <motion.span
                      className={`absolute left-4 right-4 bottom-0 h-px origin-left ${
                        i === 0 ? 'bg-ok' : i === 1 ? 'bg-warn' : 'bg-bad'
                      }`}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: 0.2 + i * 0.25, ease: EASE_OUT }}
                      aria-hidden="true"
                    />
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>

          <Reveal className="mt-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-semibold">Seen something broken?</h2>
            <p className="mt-3 text-fg-muted">It takes about two minutes, and your name stays private.</p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link href={primary.href} className="btn-primary h-12 px-6 text-[15px]">
                {primary.label}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              {!user && (
                <Link href="/login" className="btn-secondary h-12 px-6 text-[15px]">
                  Sign in
                </Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
