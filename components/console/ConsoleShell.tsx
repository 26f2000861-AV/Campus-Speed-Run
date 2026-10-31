'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertOctagon,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronsLeft,
  CircleDot,
  GraduationCap,
  Inbox,
  Landmark,
  LayoutGrid,
  Network,
  Settings,
  Timer,
  Users,
} from 'lucide-react';
import { EASE_OUT } from '@/components/motion';

export type ConsoleView =
  | 'overview'
  | 'all'
  | 'pending'
  | 'progress'
  | 'resolved'
  | 'urgent'
  | 'chain'
  | 'tier-teacher'
  | 'tier-faculty'
  | 'tier-admin'
  | 'analytics'
  | 'staff'
  | 'settings';

export const CONSOLE_VIEWS: ConsoleView[] = [
  'overview',
  'all',
  'pending',
  'progress',
  'resolved',
  'urgent',
  'chain',
  'tier-teacher',
  'tier-faculty',
  'tier-admin',
  'analytics',
  'settings',
];

/** Tier sections of the hierarchy, keyed by the staff role they show. */
export const TIER_VIEWS: Record<'tier-teacher' | 'tier-faculty' | 'tier-admin', 'TEACHER' | 'FACULTY' | 'ADMINISTRATIVE'> = {
  'tier-teacher': 'TEACHER',
  'tier-faculty': 'FACULTY',
  'tier-admin': 'ADMINISTRATIVE',
};

const NAV: Array<{ group: string; items: Array<{ key: ConsoleView; label: string; icon: typeof Inbox }> }> = [
  {
    group: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutGrid },
      { key: 'all', label: 'All complaints', icon: Inbox },
      { key: 'pending', label: 'Pending', icon: CircleDot },
      { key: 'progress', label: 'In progress', icon: Timer },
      { key: 'resolved', label: 'Resolved', icon: CheckCircle2 },
      { key: 'urgent', label: 'Urgent issues', icon: AlertOctagon },
    ],
  },
  {
    group: 'Hierarchy',
    items: [
      { key: 'chain', label: 'Escalation chain', icon: Network },
      { key: 'tier-teacher', label: 'Teachers', icon: BookOpen },
      { key: 'tier-faculty', label: 'Faculty', icon: GraduationCap },
      { key: 'tier-admin', label: 'Administration', icon: Landmark },
    ],
  },
  {
    group: 'Manage',
    items: [
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = 'cp_sidebar_collapsed';

export function viewHref(view: ConsoleView, role?: string): string {
  if (view === 'staff') return '/admin';
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (view !== 'overview') params.set('view', view);
  const q = params.toString();
  return `/dashboard${q ? `?${q}` : ''}`;
}

export default function ConsoleShell({
  active,
  role,
  counts = {},
  children,
}: {
  active: ConsoleView;
  role?: string;
  counts?: Partial<Record<ConsoleView, number>>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  // Staff management (code issuance) is an administration tool.
  const showItem = (key: ConsoleView) => key !== 'staff' || role === 'ADMINISTRATIVE';
  const flat = NAV.flatMap((g) => g.items).filter((i) => showItem(i.key));

  return (
    <div className="max-w-[1440px] mx-auto lg:flex">
      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 244 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="hidden lg:flex shrink-0 sticky top-16 h-[calc(100vh-4rem)] flex-col border-r border-line bg-ink-950/60 backdrop-blur-sm"
        aria-label="Console"
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 space-y-6">
          {NAV.map((g) => (
            <div key={g.group}>
              <p
                className={`px-3 mb-2 text-xs text-fg-subtle transition-opacity ${collapsed ? 'opacity-0' : 'opacity-100'}`}
                aria-hidden={collapsed}
              >
                {g.group}
              </p>
              <ul className="space-y-0.5">
                {g.items.filter((i) => showItem(i.key)).map((item) => {
                  const isActive = active === item.key;
                  const count = counts[item.key];
                  const mine = item.key in TIER_VIEWS && TIER_VIEWS[item.key as keyof typeof TIER_VIEWS] === role;
                  return (
                    <li key={item.key}>
                      <Link
                        href={viewHref(item.key, role)}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm transition-colors ${
                          isActive ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/[0.03]'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="console-nav"
                            className="absolute inset-0 rounded-xl bg-white/[0.07] border border-white/[0.06]"
                            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                          />
                        )}
                        <item.icon className="relative w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                        <span className={`relative flex-1 truncate transition-opacity ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
                          {item.label}
                        </span>
                        {mine && !collapsed && (
                          <span className="relative h-5 px-1.5 rounded-md bg-white/[0.08] text-[11px] text-fg inline-flex items-center">You</span>
                        )}
                        {typeof count === 'number' && !collapsed && (
                          <span className="relative font-mono text-xs text-fg-subtle tabular-nums">{count}</span>
                        )}
                        {collapsed && <span className="sr-only">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="flex items-center gap-3 w-full h-10 px-3 rounded-xl text-sm text-fg-muted hover:text-fg hover:bg-white/[0.03]"
          >
            <ChevronsLeft className={`w-[18px] h-[18px] shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true" />
            <span className={`truncate transition-opacity ${collapsed ? 'opacity-0' : 'opacity-100'}`}>Collapse</span>
          </button>
        </div>
      </motion.aside>

      {/* Mobile / tablet: scrollable section strip */}
      <nav
        aria-label="Console"
        className="lg:hidden sticky top-16 z-30 border-b border-line bg-ink-950/85 backdrop-blur-xl"
      >
        <ul className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {flat.map((item) => {
            const isActive = active === item.key;
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={viewHref(item.key, role)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2 h-9 px-3 rounded-lg text-sm whitespace-nowrap ${
                    isActive ? 'bg-white/[0.08] text-fg' : 'text-fg-muted'
                  }`}
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
    </div>
  );
}
