'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import StudentDashboard from '@/components/StudentDashboard';
import type { CampusStats, ComplaintGroupView, DamageHotspot, DepartmentCode, NotificationItem, UserRole } from '@/lib/types';
import { EmptyState, StatusBadge, TIER_LABEL, UrgencyPill, formatDate, readApiError, slaInfo, statusTone, useNow } from '@/components/ui';
import { ActivityRings, MetricCard, ShareBars } from '@/components/charts';
import { staggerChild, staggerParent } from '@/components/motion';
import ConsoleShell, { CONSOLE_VIEWS, TIER_VIEWS, type ConsoleView, viewHref } from '@/components/console/ConsoleShell';
import { EscalationChain, TIER_INFO, TierHeader } from '@/components/console/Hierarchy';
import ComplaintTable from '@/components/console/ComplaintTable';
import DetailPanel, { type TicketAction } from '@/components/console/DetailPanel';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Flame,
  Inbox,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
  Timer,
  X,
  Zap,
} from 'lucide-react';

type StaffRole = Exclude<UserRole, 'STUDENT'>;

const DEPARTMENTS: { code: DepartmentCode; label: string }[] = [
  { code: 'BTECH', label: 'B.Tech' },
  { code: 'MCA', label: 'MCA' },
  { code: 'SCI', label: 'Applied Sciences' },
  { code: 'INFRA', label: 'Infrastructure' },
  { code: 'IT', label: 'IT & Network' },
  { code: 'SAN', label: 'Sanitation' },
];

const TIER_NUMBER: Record<StaffRole, number> = { TEACHER: 1, FACULTY: 2, ADMINISTRATIVE: 3 };

const NOTIFICATION_TONE: Record<string, string> = {
  NEW_ASSIGNMENT: 'bg-steel',
  SLA_WARNING: 'bg-warn',
  CRITICAL_ESCALATION: 'bg-bad',
  RESOLVED: 'bg-ok',
};
const NOTIFICATION_LABEL: Record<string, string> = {
  NEW_ASSIGNMENT: 'New assignment',
  SLA_WARNING: 'Deadline warning',
  CRITICAL_ESCALATION: 'Auto-escalated',
  RESOLVED: 'Resolved',
};

const VIEW_TITLE: Record<ConsoleView, { title: string; sub: string }> = {
  overview: { title: 'Overview', sub: '' },
  chain: { title: 'Escalation chain', sub: 'Open complaints at every tier, and how they move up.' },
  'tier-teacher': { title: 'Teachers', sub: 'Tier 1 queue.' },
  'tier-faculty': { title: 'Faculty', sub: 'Tier 2 queue.' },
  'tier-admin': { title: 'Administration', sub: 'Tier 3 queue.' },
  all: { title: 'All complaints', sub: 'Open complaints at your tier, ranked by priority.' },
  pending: { title: 'Pending', sub: 'New or escalated complaints nobody has picked up yet.' },
  progress: { title: 'In progress', sub: 'Acknowledged complaints being worked on.' },
  resolved: { title: 'Resolved', sub: 'The 50 most recently resolved complaints, campus-wide.' },
  urgent: { title: 'Urgent issues', sub: 'Critical, high-priority and safety complaints at your tier.' },
  analytics: { title: 'Analytics', sub: 'Where complaints come from and how fast they move.' },
  staff: { title: 'Staff management', sub: '' },
  settings: { title: 'Settings', sub: 'Your account and console tools.' },
};

const isUrgent = (c: ComplaintGroupView) => c.priority === 'CRITICAL' || c.priority === 'HIGH' || c.is_safety_critical;

// ---------------------------------------------------------------------------
// Gate screens
// ---------------------------------------------------------------------------
function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100svh-10rem)] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="cs-glass w-full max-w-md p-8 text-center space-y-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification drawer (spec 09 §3)
// ---------------------------------------------------------------------------
function NotificationDrawer({ items, onClose }: { items: NotificationItem[]; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.button
        type="button"
        aria-label="Close notifications"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-heading"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md h-full bg-ink-900 border-l border-line shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-line">
          <h2 id="notif-heading" className="text-[15px] font-semibold">
            Notifications <span className="text-fg-subtle font-normal">{items.length}</span>
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-icon w-9 h-9" aria-label="Close notifications">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-line">
          {items.length === 0 && (
            <li>
              <EmptyState icon={Bell} title="All caught up" body="No notifications for your tier yet." />
            </li>
          )}
          {items.map((n) => (
            <li key={n.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-fg-muted">
                  <span className={`w-1.5 h-1.5 rounded-full ${NOTIFICATION_TONE[n.notification_type] ?? 'bg-fg-subtle'}`} aria-hidden="true" />
                  {NOTIFICATION_LABEL[n.notification_type] || n.notification_type}
                </span>
                <span className="text-xs text-fg-subtle">{formatDate(n.created_at)}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">{n.message}</p>
              <Link href={`/track?id=${encodeURIComponent(n.tracking_id)}`} className="mt-1 inline-flex items-center min-h-[32px] text-xs font-mono text-fg-muted hover:text-fg">
                {n.tracking_id} →
              </Link>
            </li>
          ))}
        </ul>
      </motion.aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotspots (spec 05): damage-prone zones. Selecting one filters the queue.
// ---------------------------------------------------------------------------
function Hotspots({ hotspots, onZone, loading }: { hotspots: DamageHotspot[]; onZone: (z: string) => void; loading: boolean }) {
  return (
    <section className="cs-card p-5 sm:p-6" aria-labelledby="hotspot-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hotspot-heading" className="text-sm font-medium text-fg-muted flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-300" aria-hidden="true" /> Damage-prone areas
        </h2>
        <span className="text-xs text-fg-subtle">Campus-wide</span>
      </div>
      {loading ? (
        <div className="mt-4 grid sm:grid-cols-2 gap-2" aria-hidden="true">
          <div className="skeleton h-20" />
          <div className="skeleton h-20" />
        </div>
      ) : hotspots.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">No damage-prone zones among open complaints.</p>
      ) : (
        <ul className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {hotspots.slice(0, 6).map((h) => (
            <li key={h.location_zone}>
              <button
                type="button"
                onClick={() => onZone(h.location_zone)}
                className="w-full text-left rounded-xl border border-line bg-ink-950/50 p-3.5 transition-colors hover:border-line-strong"
                aria-label={`Show complaints in ${h.location_zone}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">{h.location_zone}</span>
                  <span className="shrink-0 font-mono text-xs text-bad-soft">{h.peak_severity}</span>
                </span>
                <span className="mt-1.5 block text-xs text-fg-muted">
                  {h.damage_incident_count} hazard{h.damage_incident_count === 1 ? '' : 's'} · {h.total_student_reports} report
                  {h.total_student_reports === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------
function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, logout } = useAuth();
  const now = useNow(30_000);

  const role = user && user.role !== 'STUDENT' ? (user.role as StaffRole) : null;
  const viewParam = searchParams.get('view') as ConsoleView | null;
  const view: ConsoleView = viewParam && CONSOLE_VIEWS.includes(viewParam) ? viewParam : 'overview';

  const [complaints, setComplaints] = useState<ComplaintGroupView[]>([]);
  const [chain, setChain] = useState<ComplaintGroupView[]>([]);
  const [resolvedList, setResolvedList] = useState<ComplaintGroupView[]>([]);
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [hotspots, setHotspots] = useState<DamageHotspot[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [zone, setZone] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<{ id: string; action: TicketAction } | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [jumping, setJumping] = useState(false);
  const [canTimeJump, setCanTimeJump] = useState(false);

  // Visible toast + screen-reader announcement for every queue action.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setAnnouncement(''), 6000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const bellRef = useRef<HTMLButtonElement>(null);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    bellRef.current?.focus();
  }, []);

  // Tier = session role; keep the URL's ?role= in step with it (the API ignores it).
  useEffect(() => {
    if (role && searchParams.get('role') !== role) {
      router.replace(viewHref(view, role), { scroll: false });
    }
  }, [role, searchParams, router, view]);

  const fetchData = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/complaints/list', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/login');
        return;
      }
      if (!res.ok) {
        setLoadError(await readApiError(res, 'We couldn’t load complaints.'));
        return;
      }
      const data = await res.json();
      setComplaints(Array.isArray(data.complaints) ? data.complaints : []);
      setChain(Array.isArray(data.chain) ? data.chain : []);
      setResolvedList(Array.isArray(data.recentResolved) ? data.recentResolved : []);
      setStats(data.stats && typeof data.stats === 'object' ? data.stats : null);
      setHotspots(Array.isArray(data.hotspots) ? data.hotspots : []);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setCanTimeJump(data.canTimeJump === true);
      if (typeof data.escalated === 'number' && data.escalated > 0) {
        announce(`${data.escalated} overdue complaint(s) were escalated automatically.`);
      }
    } catch {
      setLoadError('We couldn’t reach the server. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, [role, router, announce]);

  useEffect(() => {
    if (role) fetchData();
  }, [role, fetchData]);

  const openTicket = useCallback((t: ComplaintGroupView, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setSelectedId(t.tracking_id);
  }, []);
  const closeTicket = useCallback(() => {
    setSelectedId(null);
    requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  // Keyboard: r refresh, n notifications, / search. Ignored while typing.
  useEffect(() => {
    if (!role) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || drawerOpen || selectedId) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.key === 'r') {
        e.preventDefault();
        fetchData();
      } else if (e.key === 'n') {
        e.preventDefault();
        setDrawerOpen(true);
      } else if (e.key === '/' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role, drawerOpen, selectedId, fetchData]);

  const handleAction = useCallback(
    async (ticket: ComplaintGroupView, action: TicketAction, note?: string): Promise<boolean> => {
      if (!role) return false;
      const id = ticket.tracking_id;
      setBusy({ id, action });
      setCardErrors((prev) => {
        const { [id]: _drop, ...rest } = prev;
        return rest;
      });

      const request =
        action === 'forward'
          ? { url: '/api/complaints/forward', body: { trackingId: id, note } }
          : action === 'resolve'
          ? { url: '/api/complaints/resolve', body: { trackingId: id, resolutionNote: note } }
          : { url: '/api/complaints/status', body: { trackingId: id, status: action === 'ack' ? 'ACKNOWLEDGED' : 'IN_PROGRESS' } };

      try {
        const res = await fetch(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(request.body),
        });
        if (res.status === 401) {
          router.replace('/login');
          return false;
        }
        if (!res.ok) {
          const msg = await readApiError(res, 'That didn’t go through. Please try again.');
          setCardErrors((prev) => ({ ...prev, [id]: msg }));
          announce(msg);
          if (res.status === 409 || res.status === 403) await fetchData();
          return false;
        }
        const data = await res.json().catch(() => ({}));
        announce(typeof data.message === 'string' ? data.message : `${id} updated.`);
        await fetchData();
        // Forwarded or resolved complaints leave this queue: close the panel.
        if (action === 'forward' || action === 'resolve') closeTicket();
        return true;
      } catch {
        const msg = 'Network error. The change may not have been saved — refresh to check.';
        setCardErrors((prev) => ({ ...prev, [id]: msg }));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [role, router, fetchData, announce, closeTicket]
  );

  const handleTimeJump = async () => {
    setJumping(true);
    try {
      const res = await fetch('/api/complaints/escalate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ simulateJump: true }),
      });
      if (res.status === 403) {
        setCanTimeJump(false);
        announce(await readApiError(res, 'The time jump is limited to administration.'));
        return;
      }
      if (!res.ok) {
        announce(await readApiError(res, 'The time jump failed.'));
        return;
      }
      const data = await res.json().catch(() => ({}));
      announce(typeof data.message === 'string' ? data.message : 'Simulated +72 hours.');
      await fetchData();
    } catch {
      announce('Network error during the time jump.');
    } finally {
      setJumping(false);
    }
  };

  // ----- derived data -----
  const rankOf = useMemo(() => new Map(complaints.map((c, i) => [c.tracking_id, i + 1])), [complaints]);
  const lists = useMemo(
    () => ({
      all: complaints,
      pending: complaints.filter((c) => statusTone(c.status) === 'bad'),
      progress: complaints.filter((c) => statusTone(c.status) === 'warn'),
      urgent: complaints.filter(isUrgent),
      resolved: resolvedList,
    }),
    [complaints, resolvedList]
  );
  const selected = selectedId
    ? complaints.find((c) => c.tracking_id === selectedId) ??
      chain.find((c) => c.tracking_id === selectedId) ??
      resolvedList.find((c) => c.tracking_id === selectedId) ??
      null
    : null;
  const unread = notifications.filter((n) => !n.is_read).length;
  const alerts = notifications.filter((n) => n.notification_type === 'SLA_WARNING' || n.notification_type === 'CRITICAL_ESCALATION').slice(0, 3);
  const firstLoad = loading && complaints.length === 0 && !stats;

  const pickZone = (z: string) => {
    setZone(z);
    router.push(viewHref('all', role ?? undefined), { scroll: false });
  };

  // ----- gates -----
  if (authLoading) {
    return (
      <div className="min-h-[calc(100svh-10rem)] flex items-center justify-center gap-2 text-sm text-fg-muted" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        Checking your session…
      </div>
    );
  }

  if (!user) {
    return (
      <GateCard>
        <KeyRound className="w-6 h-6 text-fg-muted mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Sign in to continue</h1>
        <p className="text-sm text-fg-muted">The console is for teachers, faculty and administration.</p>
        <Link href="/login?portal=staff" className="btn-primary w-full h-11">
          Staff sign in
        </Link>
      </GateCard>
    );
  }

  // Students get their own view of the reports they filed.
  if (!role) return <StudentDashboard />;

  const head = { ...VIEW_TITLE[view], sub: view === 'overview' ? TIER_INFO[role].duty : VIEW_TITLE[view].sub };
  const tierRole = view in TIER_VIEWS ? TIER_VIEWS[view as keyof typeof TIER_VIEWS] : null;
  const chainFor = (r: StaffRole) => chain.filter((c) => c.current_handler_role === r);
  const tableView = view === 'all' || view === 'pending' || view === 'progress' || view === 'urgent' || view === 'resolved';

  const deptRows = DEPARTMENTS.map((d) => ({
    label: d.label,
    count: complaints.filter((c) => c.primary_department_code === d.code || (c.collaborating_department_codes || []).includes(d.code)).length,
  })).sort((a, b) => b.count - a.count);
  const priorityRows = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => ({
    label: p.charAt(0) + p.slice(1).toLowerCase(),
    count: complaints.filter((c) => c.priority === p).length,
  }));
  const slaRows = [
    { label: 'On track (24h+ left)', count: complaints.filter((c) => slaInfo(c.stage_deadline, now).level === 'ok').length },
    { label: 'Under 24 hours', count: complaints.filter((c) => slaInfo(c.stage_deadline, now).level === 'warn').length },
    { label: 'Overdue', count: complaints.filter((c) => slaInfo(c.stage_deadline, now).level === 'breached').length },
  ];
  const rings = stats ?? { total: 0, resolved: 0, inProgress: 0, unresolved: 0, urgent: 0, newToday: 0 };

  return (
    <ConsoleShell
      active={view}
      role={role}
      counts={
        firstLoad
          ? {}
          : {
              all: lists.all.length,
              pending: lists.pending.length,
              progress: lists.progress.length,
              urgent: lists.urgent.length,
              'tier-teacher': chainFor('TEACHER').length,
              'tier-faculty': chainFor('FACULTY').length,
              'tier-admin': chainFor('ADMINISTRATIVE').length,
            }
      }
    >
      {/* Toast */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,30rem)] pointer-events-none"
      >
        <AnimatePresence>
          {announcement && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl bg-fg text-ink-950 text-sm shadow-2xl"
            >
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-700" aria-hidden="true" />
              <span className="flex-1">{announcement}</span>
              <button type="button" onClick={() => setAnnouncement('')} aria-label="Dismiss" className="p-1 -m-1 rounded-md hover:bg-black/5">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-fg-subtle">
            Tier {TIER_NUMBER[role]} · {TIER_LABEL[role]}
            {user.department_code ? ` · ${user.department_code}` : ''}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold">{head.title}</h1>
          {head.sub && <p className="mt-1 text-sm text-fg-muted">{head.sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchData} disabled={loading} className="btn-secondary" title="Refresh (r)">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          <button
            ref={bellRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="btn-icon relative"
            aria-label={`Notifications, ${unread} unread`}
            aria-haspopup="dialog"
            title="Notifications (n)"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-bad text-white rounded-full text-[11px] font-semibold flex items-center justify-center font-mono">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="mt-6 space-y-5">
        {loadError && (
          <div role="alert" className="alert-error items-center">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{loadError}</span>
            <button type="button" onClick={fetchData} className="underline font-medium">
              Retry
            </button>
          </div>
        )}

        {view === 'overview' && (
          <>
            {alerts.length > 0 && (
              <div className="alert-warn items-center">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <ul className="flex-1 min-w-0 space-y-0.5">
                  {alerts.map((n) => (
                    <li key={n.id} className="truncate" title={n.message}>
                      {n.message}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setDrawerOpen(true)} className="shrink-0 underline underline-offset-4 font-medium">
                  View all
                </button>
              </div>
            )}

            <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {[
                { label: 'Total complaints', value: rings.total, icon: Inbox, hint: 'Campus-wide' },
                { label: 'New today', value: rings.newToday, icon: Sparkles, hint: 'Last 24 hours' },
                { label: 'In progress', value: rings.inProgress, icon: Timer, tone: 'warn' as const, hint: 'Acknowledged or started' },
                { label: 'Resolved', value: rings.resolved, icon: CheckCircle2, tone: 'ok' as const, hint: 'All time' },
                { label: 'Urgent', value: rings.urgent, icon: AlertOctagon, tone: 'bad' as const, hint: 'Open critical or safety' },
              ].map((m, i) => (
                <motion.div key={m.label} variants={staggerChild} className={i === 4 ? 'col-span-2 md:col-span-1' : ''}>
                  <MetricCard {...m} loading={firstLoad} />
                </motion.div>
              ))}
            </motion.div>

            <div className="grid xl:grid-cols-[minmax(0,400px)_1fr] gap-4">
              <section className="cs-card p-5 sm:p-6" aria-labelledby="rings-heading">
                <div className="flex items-center justify-between">
                  <h2 id="rings-heading" className="text-sm font-medium text-fg-muted">
                    Complaint status
                  </h2>
                  <span className="text-xs text-fg-subtle">Campus-wide</span>
                </div>
                <div className="mt-5">
                  <ActivityRings
                    loading={firstLoad}
                    total={rings.total}
                    data={[
                      { label: 'Resolved', count: rings.resolved, tone: 'ok' },
                      { label: 'In progress', count: rings.inProgress, tone: 'warn' },
                      { label: 'Unresolved', count: rings.unresolved, tone: 'bad' },
                    ]}
                  />
                </div>
              </section>

              <section className="cs-card flex flex-col" aria-labelledby="urgent-heading">
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 sm:pt-6">
                  <h2 id="urgent-heading" className="text-sm font-medium text-fg-muted">
                    Needs attention at your tier
                  </h2>
                  <Link href={viewHref('all', role)} className="text-sm text-fg-muted hover:text-fg inline-flex items-center gap-1">
                    View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
                {firstLoad ? (
                  <div className="p-5 sm:p-6 space-y-2" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-14" />
                    ))}
                  </div>
                ) : complaints.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <EmptyState icon={CheckCircle2} title="Queue clear" body="No open complaints at your tier right now." />
                  </div>
                ) : (
                  <motion.ul variants={staggerParent} initial="hidden" animate="show" className="mt-3 px-3 sm:px-4 pb-3 sm:pb-4">
                    {complaints.slice(0, 6).map((c) => (
                      <motion.li key={c.tracking_id} variants={staggerChild}>
                        <button
                          type="button"
                          onClick={(e) => openTicket(c, e.currentTarget)}
                          className="w-full flex items-center gap-3 px-2 sm:px-3 py-3 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
                        >
                          <span className="hidden sm:inline font-mono text-xs text-fg-subtle w-8 shrink-0">#{rankOf.get(c.tracking_id)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium truncate">{c.normalized_title || c.title}</span>
                            <span className="block text-xs text-fg-subtle truncate">
                              {c.tracking_id} · {c.location_zone}
                            </span>
                          </span>
                          <UrgencyPill priority={c.priority} score={c.priority_score} className="hidden sm:inline-flex" />
                          <StatusBadge status={c.status} />
                        </button>
                      </motion.li>
                    ))}
                  </motion.ul>
                )}
              </section>
            </div>

            <div className="grid xl:grid-cols-2 gap-4">
              <section className="cs-card p-5 sm:p-6" aria-labelledby="updates-heading">
                <div className="flex items-center justify-between">
                  <h2 id="updates-heading" className="text-sm font-medium text-fg-muted">
                    Status updates
                  </h2>
                  <button type="button" onClick={() => setDrawerOpen(true)} className="text-sm text-fg-muted hover:text-fg">
                    All notifications
                  </button>
                </div>
                {firstLoad ? (
                  <div className="mt-4 space-y-2" aria-hidden="true">
                    <div className="skeleton h-12" />
                    <div className="skeleton h-12" />
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="mt-4 text-sm text-fg-muted">No updates for your tier yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {notifications.slice(0, 5).map((n) => (
                      <li key={n.id} className="py-3 flex items-start gap-3">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${NOTIFICATION_TONE[n.notification_type] ?? 'bg-fg-subtle'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug line-clamp-2">{n.message}</span>
                          <span className="block mt-0.5 text-xs text-fg-subtle">
                            {NOTIFICATION_LABEL[n.notification_type] ?? n.notification_type} · {formatDate(n.created_at)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <Hotspots hotspots={hotspots} onZone={pickZone} loading={firstLoad} />
            </div>
          </>
        )}

        {tableView &&
          (firstLoad ? (
            <div className="cs-card p-4 space-y-2" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          ) : (
            <ComplaintTable
              key={view}
              rows={lists[view as 'all' | 'pending' | 'progress' | 'urgent' | 'resolved']}
              now={now}
              onOpen={openTicket}
              zone={view === 'all' ? zone : null}
              onClearZone={() => setZone(null)}
              showSla={view !== 'resolved'}
              searchRef={searchRef}
              emptyTitle={view === 'resolved' ? 'Nothing resolved yet' : 'Nothing here'}
              emptyBody={view === 'resolved' ? 'Resolved complaints will appear here.' : 'No complaints at your tier match this view.'}
            />
          ))}

        {view === 'chain' && <EscalationChain chain={chain} role={role} now={now} onOpen={openTicket} loading={firstLoad} />}

        {tierRole && (
          <div className="space-y-4">
            <TierHeader tier={tierRole} role={role} rows={chainFor(tierRole)} now={now} loading={firstLoad} />
            {firstLoad ? (
              <div className="cs-card p-4 space-y-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12" />
                ))}
              </div>
            ) : (
              <ComplaintTable
                key={view}
                rows={chainFor(tierRole)}
                now={now}
                onOpen={openTicket}
                searchRef={searchRef}
                emptyTitle={`Nothing with ${TIER_INFO[tierRole].plural}`}
                emptyBody="No open complaints at this tier right now."
              />
            )}
          </div>
        )}

        {view === 'analytics' && (
          <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid lg:grid-cols-2 gap-4">
            <motion.section variants={staggerChild} className="cs-card p-5 sm:p-6" aria-labelledby="a-status">
              <h2 id="a-status" className="text-sm font-medium text-fg-muted">
                Status, campus-wide
              </h2>
              <div className="mt-5">
                <ActivityRings
                  loading={firstLoad}
                  total={rings.total}
                  data={[
                    { label: 'Resolved', count: rings.resolved, tone: 'ok' },
                    { label: 'In progress', count: rings.inProgress, tone: 'warn' },
                    { label: 'Unresolved', count: rings.unresolved, tone: 'bad' },
                  ]}
                />
              </div>
            </motion.section>
            <motion.section variants={staggerChild} className="cs-card p-5 sm:p-6 space-y-8" aria-labelledby="a-sla">
              <div>
                <h2 id="a-sla" className="text-sm font-medium text-fg-muted">
                  Deadline health · your queue
                </h2>
                <div className="mt-4">
                  <ShareBars rows={slaRows} loading={firstLoad} />
                </div>
              </div>
              <div>
                <h2 className="text-sm font-medium text-fg-muted">Priority · your queue</h2>
                <div className="mt-4">
                  <ShareBars rows={priorityRows} loading={firstLoad} />
                </div>
              </div>
            </motion.section>
            <motion.section variants={staggerChild} className="cs-card p-5 sm:p-6" aria-labelledby="a-dept">
              <h2 id="a-dept" className="text-sm font-medium text-fg-muted">
                Department · your queue
              </h2>
              <div className="mt-4">
                <ShareBars rows={deptRows} loading={firstLoad} />
              </div>
            </motion.section>
            <motion.div variants={staggerChild}>
              <Hotspots hotspots={hotspots} onZone={pickZone} loading={firstLoad} />
            </motion.div>
          </motion.div>
        )}

        {view === 'settings' && (
          <div className="grid lg:grid-cols-2 gap-4 max-w-5xl">
            <section className="cs-card p-5 sm:p-6" aria-labelledby="s-account">
              <h2 id="s-account" className="text-[15px] font-semibold">
                Account
              </h2>
              <dl className="mt-4 divide-y divide-line text-sm">
                {[
                  { k: 'Email', v: user.email },
                  { k: 'Role', v: `Tier ${TIER_NUMBER[role]} · ${TIER_LABEL[role]}` },
                  { k: 'Department', v: user.department_code ?? '—' },
                ].map((r) => (
                  <div key={r.k} className="py-3 flex justify-between gap-4">
                    <dt className="text-fg-muted">{r.k}</dt>
                    <dd className="text-right [overflow-wrap:anywhere]">{r.v}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push('/');
                  router.refresh();
                }}
                className="btn-secondary mt-4"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" /> Sign out
              </button>
            </section>

            <section className="cs-card p-5 sm:p-6" aria-labelledby="s-keys">
              <h2 id="s-keys" className="text-[15px] font-semibold">
                Keyboard shortcuts
              </h2>
              <dl className="mt-4 divide-y divide-line text-sm">
                {[
                  { k: 'r', v: 'Refresh' },
                  { k: 'n', v: 'Notifications' },
                  { k: '/', v: 'Search complaints' },
                  { k: 'Esc', v: 'Close panels' },
                ].map((r) => (
                  <div key={r.k} className="py-3 flex justify-between gap-4">
                    <dt className="text-fg-muted">{r.v}</dt>
                    <dd>
                      <kbd className="font-mono text-xs h-6 min-w-[24px] px-1.5 inline-flex items-center justify-center rounded-md border border-line bg-white/[0.04]">{r.k}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {canTimeJump && (
              <section className="cs-card p-5 sm:p-6 lg:col-span-2" aria-labelledby="s-demo">
                <h2 id="s-demo" className="text-[15px] font-semibold">
                  Escalation test
                </h2>
                <p className="mt-1 text-sm text-fg-muted max-w-xl">
                  Wind every open complaint&apos;s deadline back 72 hours and run auto-escalation now. Use for demos and testing.
                </p>
                <button type="button" onClick={handleTimeJump} disabled={jumping} className="btn-secondary mt-4 border-warn/30 text-warn-soft">
                  {jumping ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Zap className="w-4 h-4" aria-hidden="true" />}
                  {jumping ? 'Simulating…' : 'Simulate +72 hours'}
                </button>
              </section>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <DetailPanel
            key="detail"
            ticket={selected}
            actionable={selected.status !== 'RESOLVED' && selected.current_handler_role === role && rankOf.has(selected.tracking_id)}
            role={role}
            now={now}
            busy={busy?.id === selected.tracking_id ? busy.action : null}
            error={cardErrors[selected.tracking_id] || null}
            tieNote={(() => {
              const rank = rankOf.get(selected.tracking_id);
              return rank && rank > 1 && complaints[rank - 2]?.priority_score === selected.priority_score
                ? `Same score as #${rank - 1}, which is due sooner.`
                : null;
            })()}
            onAction={handleAction}
            onClose={closeTicket}
          />
        )}
        {drawerOpen && <NotificationDrawer key="drawer" items={notifications} onClose={closeDrawer} />}
      </AnimatePresence>
    </ConsoleShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-fg-muted" aria-label="Loading" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
