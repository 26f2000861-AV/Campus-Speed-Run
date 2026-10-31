'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/Logo';
import { EASE_OUT } from '@/components/motion';

const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  FACULTY: 'Faculty',
  ADMINISTRATIVE: 'Admin',
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const handleSignOut = async () => {
    await logout();
    router.push('/');
    router.refresh();
  };

  const isStudent = user?.role === 'STUDENT';
  const isStaff = !!user && !isStudent;

  // /admin is never linked from public navigation (direct URL, or the
  // console sidebar for signed-in administration).
  const links: Array<{ href: string; label: string }> = [];
  if (!user || isStudent) links.push({ href: '/student/submit', label: 'Report' });
  if (isStudent) links.push({ href: '/dashboard', label: 'My reports' });
  if (isStaff) links.push({ href: '/dashboard', label: 'Console' });
  links.push({ href: '/track', label: 'Track' });

  const isActive = (href: string) => pathname === href;

  // Sign-in is a focused screen: the card carries the logo and a way back home.
  if (pathname === '/login') return null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
        <Link href="/" className="group flex items-center rounded-lg" aria-label="Campus Pulse+ home">
          <Logo size="md" />
        </Link>

        {/* Desktop navigation with a sliding active indicator */}
        <nav aria-label="Main" className="hidden md:flex items-center gap-1 p-1 rounded-xl">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`relative h-9 px-3.5 inline-flex items-center text-sm rounded-lg transition-colors ${
                isActive(l.href) ? 'text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {isActive(l.href) && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute inset-0 rounded-lg bg-white/[0.07] border border-white/[0.06]"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative">{l.label}</span>
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {loading ? (
            <div className="skeleton h-9 w-24" aria-hidden="true" />
          ) : user ? (
            <>
              <span className="inline-flex items-center gap-2 h-9 pl-2 pr-3 rounded-lg border border-line text-xs text-fg-muted">
                <span className="w-5 h-5 rounded-md bg-white/[0.08] text-fg text-[11px] font-semibold inline-flex items-center justify-center">
                  {(user.full_name || user.email).charAt(0).toUpperCase()}
                </span>
                {ROLE_LABEL[user.role] ?? user.role}
              </span>
              <button type="button" onClick={handleSignOut} className="btn-icon w-9 h-9" aria-label="Sign out" title="Sign out">
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost h-9">
                Sign in
              </Link>
              <Link href="/login?mode=register" className="btn-primary h-9">
                Get started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="md:hidden btn-icon"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="mobile-menu"
            aria-label="Main"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="md:hidden overflow-hidden border-t border-white/[0.06] bg-ink-950/95"
          >
            <div className="px-4 py-3 space-y-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`flex items-center h-12 px-3 rounded-xl text-[15px] ${
                    isActive(l.href) ? 'bg-white/[0.06] text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <div className="pt-3 mt-2 border-t border-line">
                {user ? (
                  <div className="flex items-center justify-between gap-3 px-3">
                    <span className="text-sm text-fg-muted truncate">
                      {user.email} · {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                    <button type="button" onClick={handleSignOut} className="btn-secondary h-10 shrink-0">
                      <LogOut className="w-4 h-4" aria-hidden="true" /> Sign out
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link href="/login" className="btn-secondary h-11">
                      Sign in
                    </Link>
                    <Link href="/login?mode=register" className="btn-primary h-11">
                      Get started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
