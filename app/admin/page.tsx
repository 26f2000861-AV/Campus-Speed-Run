'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Check, Copy, KeyRound, Loader2, Lock, Plus, RefreshCw, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import { StaffRegistrationCode, UserRole, DepartmentCode } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import ConsoleShell from '@/components/console/ConsoleShell';
import { MetricCard } from '@/components/charts';
import { EmptyState, TIER_LABEL, formatDate } from '@/components/ui';
import { EASE_OUT, staggerChild, staggerParent } from '@/components/motion';

const DEPT_LABEL: Record<string, string> = {
  BTECH: 'B.Tech',
  MCA: 'MCA',
  SCI: 'Applied Sciences',
  INFRA: 'Infrastructure',
  IT: 'IT & Network',
  SAN: 'Sanitation',
};

function initials(email?: string) {
  const name = (email || '?').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const parts = name.split(' ').filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AdminPage() {
  const { user } = useAuth();
  const isAdminSession = user?.role === 'ADMINISTRATIVE';

  // Authentication State for /admin
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Codes State
  const [codes, setCodes] = useState<StaffRegistrationCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  // Generator State
  const [genRole, setGenRole] = useState<UserRole>('TEACHER');
  const [genDept, setGenDept] = useState<DepartmentCode>('BTECH');
  const [genNote, setGenNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Auto-authenticate if the server-verified session (/api/auth/me) is ADMINISTRATIVE
  useEffect(() => {
    if (isAdminSession) {
      setIsAdminAuthenticated(true);
    }
  }, [isAdminSession]);

  // Session cookies authenticate ADMINISTRATIVE users; otherwise send the verified passkey.
  // The passkey is held only in component state (never persisted).
  const adminHeaders = (extra?: Record<string, string>): Record<string, string> => {
    const headers: Record<string, string> = { ...(extra || {}) };
    if (!isAdminSession && passcode.trim()) headers['x-admin-key'] = passcode.trim();
    return headers;
  };

  const handleAdminFailure = (status: number) => {
    if (status === 401 || status === 403) {
      setIsAdminAuthenticated(false);
      setAuthError('Your admin access expired or was rejected. Enter the passcode again.');
    }
  };

  // Load codes once authenticated
  useEffect(() => {
    if (isAdminAuthenticated) {
      loadCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminAuthenticated]);

  const flash = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthenticating(true);

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'That passcode wasn’t accepted.');
      }

      setIsAdminAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Verification failed. Please try again.');
    } finally {
      setAuthenticating(false);
    }
  };

  const loadCodes = async () => {
    setLoadingCodes(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/codes', {
        headers: adminHeaders(),
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCodes(data.codes || []);
      } else {
        handleAdminFailure(res.status);
        if (res.status !== 401 && res.status !== 403) setLoadError(data.error || 'We couldn’t load staff codes.');
      }
    } catch {
      setLoadError('We couldn’t reach the server. Check your connection and retry.');
    } finally {
      setLoadingCodes(false);
    }
  };

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'same-origin',
        body: JSON.stringify({
          role: genRole,
          department_code: genDept,
          note: genNote.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.code) {
        setCodes((prev) => [data.code, ...prev]);
        setGenNote('');
        flash(`Code ${data.code.code} created.`);
      } else {
        handleAdminFailure(res.status);
        if (res.status !== 401 && res.status !== 403) flash(data.error || 'The code couldn’t be created.');
      }
    } catch {
      flash('Network error. The code wasn’t created.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (code: string) => {
    setConfirmRevoke(null);
    try {
      const res = await fetch(`/api/admin/codes?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCodes((prev) => prev.filter((c) => c.code !== code));
        flash(`Code ${code} revoked.`);
      } else {
        handleAdminFailure(res.status);
        if (res.status !== 401 && res.status !== 403) flash(data.error || 'The code couldn’t be revoked.');
      }
    } catch {
      flash('Network error. The code wasn’t revoked.');
    }
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      /* clipboard unavailable — the code is visible on screen */
    }
  };

  // 1. Gate: shown until an ADMINISTRATIVE session or a valid passcode unlocks it.
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-[calc(100svh-10rem)] flex items-center justify-center py-12 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="cs-glass w-full max-w-md p-6 sm:p-8"
        >
          <span className="w-11 h-11 rounded-xl border border-line bg-white/[0.04] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">Staff access</h1>
          <p className="mt-1 text-sm text-fg-muted">Issue registration codes for teachers, faculty and administration.</p>

          {authError && (
            <div role="alert" className="alert-error mt-5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="passcode" className="cs-field-label">
                Admin passcode
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" aria-hidden="true" />
                <input
                  type="password"
                  required
                  suppressHydrationWarning
                  id="passcode"
                  autoComplete="off"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  aria-describedby="passcode-hint"
                  className="cs-input pl-10 font-mono"
                />
              </div>
              <p id="passcode-hint" className="cs-hint">
                Signed in as administration? This step is skipped.
              </p>
            </div>
            <button type="submit" disabled={authenticating} suppressHydrationWarning className="btn-primary w-full h-11">
              {authenticating && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{authenticating ? 'Checking…' : 'Unlock'}</span>
              {!authenticating && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // 2. Unlocked: staff directory, code issuance and active codes.
  const activeCodes = codes.filter((c) => !c.is_used);
  const usedCodes = codes.filter((c) => c.is_used);
  const firstLoad = loadingCodes && codes.length === 0;

  const content = (
    <>
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,26rem)] flex items-center gap-2.5 px-4 py-3 rounded-xl bg-fg text-ink-950 text-sm shadow-2xl"
          >
            <Check className="w-4 h-4 text-green-700 shrink-0" aria-hidden="true" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs text-fg-subtle">Administration</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold">Staff management</h1>
          <p className="mt-1 text-sm text-fg-muted">Registered staff, and single-use codes for new staff accounts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadCodes} disabled={loadingCodes} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${loadingCodes ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
          {!isAdminSession && (
            <button
              onClick={() => {
                setIsAdminAuthenticated(false);
                setPasscode('');
                setCodes([]);
              }}
              className="btn-ghost"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              Lock
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div role="alert" className="alert-error items-center mt-6">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={loadCodes} className="underline font-medium">
            Retry
          </button>
        </div>
      )}

      <motion.div variants={staggerParent} initial="hidden" animate="show" className="mt-6 grid grid-cols-2 lg:grid-cols-3 gap-3">
        <motion.div variants={staggerChild}>
          <MetricCard label="Registered staff" value={usedCodes.length} icon={Users} loading={firstLoad} hint="Joined with a code" />
        </motion.div>
        <motion.div variants={staggerChild}>
          <MetricCard label="Unused codes" value={activeCodes.length} icon={KeyRound} tone="ok" loading={firstLoad} hint="Ready to share" />
        </motion.div>
        <motion.div variants={staggerChild} className="col-span-2 lg:col-span-1">
          <MetricCard
            label="Codes issued"
            value={codes.length}
            icon={UserCheck}
            loading={firstLoad}
            hint={`Staff: ${usedCodes.filter((c) => c.role === 'TEACHER').length} teachers · ${
              usedCodes.filter((c) => c.role === 'FACULTY').length
            } faculty · ${usedCodes.filter((c) => c.role === 'ADMINISTRATIVE').length} admin`}
          />
        </motion.div>
      </motion.div>

      {/* Staff directory */}
      <section className="mt-8" aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="text-lg font-semibold">
          Staff
        </h2>
        {firstLoad ? (
          <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
        ) : usedCodes.length === 0 ? (
          <div className="mt-4 cs-card">
            <EmptyState icon={Users} title="No staff registered yet" body="Create a code below and share it with a staff member." />
          </div>
        ) : (
          <motion.ul variants={staggerParent} initial="hidden" animate="show" className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {usedCodes.map((c) => (
              <motion.li
                key={c.code}
                variants={staggerChild}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="cs-card p-4 flex items-center gap-3.5 hover:border-line-strong"
              >
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                  className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-white/[0.14] to-white/[0.03] border border-white/[0.08] flex items-center justify-center text-sm font-semibold"
                  aria-hidden="true"
                >
                  {initials(c.used_by_email)}
                </motion.span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{c.used_by_email || 'Staff member'}</span>
                  <span className="block text-xs text-fg-muted truncate">
                    {TIER_LABEL[c.role] ?? c.role} · {DEPT_LABEL[c.department_code] ?? c.department_code}
                  </span>
                  {c.used_at && <span className="block text-xs text-fg-subtle">Joined {formatDate(c.used_at, false)}</span>}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      <div className="mt-8 grid lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start">
        {/* Generator */}
        <section className="cs-card p-5 sm:p-6" aria-labelledby="gen-heading">
          <h2 id="gen-heading" className="text-[15px] font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" /> New registration code
          </h2>
          <form onSubmit={handleGenerateCode} className="mt-5 space-y-4">
            <div>
              <label htmlFor="genRole" className="cs-field-label">
                Role
              </label>
              <select id="genRole" value={genRole} onChange={(e) => setGenRole(e.target.value as UserRole)} className="cs-input">
                <option value="TEACHER">Teacher · Tier 1</option>
                <option value="FACULTY">Faculty · Tier 2</option>
                <option value="ADMINISTRATIVE">Administration · Tier 3</option>
              </select>
            </div>
            <div>
              <label htmlFor="genDept" className="cs-field-label">
                Department
              </label>
              <select id="genDept" value={genDept} onChange={(e) => setGenDept(e.target.value as DepartmentCode)} className="cs-input">
                {Object.entries(DEPT_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="genNote" className="cs-field-label">
                Note <span className="text-fg-subtle font-normal">(optional)</span>
              </label>
              <input
                type="text"
                suppressHydrationWarning
                id="genNote"
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                placeholder="e.g. Lab 3 coordinator"
                className="cs-input"
              />
            </div>
            <button type="submit" disabled={generating} suppressHydrationWarning className="btn-primary w-full h-11">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4" aria-hidden="true" />}
              <span>{generating ? 'Creating…' : 'Create code'}</span>
            </button>
          </form>
          <p className="mt-4 text-xs text-fg-subtle leading-relaxed">
            The staff member enters this code when creating a staff account. Their role and department are set from it.
          </p>
        </section>

        {/* Active codes */}
        <section className="cs-card overflow-hidden" aria-labelledby="codes-heading">
          <div className="px-5 sm:px-6 py-4 border-b border-line flex items-center justify-between">
            <h2 id="codes-heading" className="text-[15px] font-semibold">
              Unused codes
            </h2>
            <span className="text-xs text-fg-subtle">{activeCodes.length}</span>
          </div>
          {firstLoad ? (
            <div className="p-5 space-y-2" aria-hidden="true">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          ) : activeCodes.length === 0 ? (
            <EmptyState icon={KeyRound} title="No unused codes" body="Codes you create appear here until someone uses them." />
          ) : (
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {activeCodes.map((c) => (
                  <motion.li
                    key={c.code}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-medium tracking-wide">{c.code}</span>
                      <span className="block text-xs text-fg-muted truncate">
                        {TIER_LABEL[c.role] ?? c.role} · {DEPT_LABEL[c.department_code] ?? c.department_code}
                        {c.note ? ` · ${c.note}` : ''}
                      </span>
                    </div>
                    {confirmRevoke === c.code ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-fg-muted">Revoke {c.code}?</span>
                        <button type="button" onClick={() => handleRevoke(c.code)} className="btn-secondary h-8 px-3 text-xs border-bad/40 text-bad-soft">
                          Revoke
                        </button>
                        <button type="button" onClick={() => setConfirmRevoke(null)} className="btn-ghost h-8 px-2 text-xs">
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => copyToClipboard(c.code)} className="btn-secondary h-8 px-3 text-xs">
                          {copiedCode === c.code ? <Check className="w-3.5 h-3.5 text-ok" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                          {copiedCode === c.code ? 'Copied' : 'Copy'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevoke(c.code)}
                          className="btn-icon w-8 h-8 hover:text-bad-soft hover:border-bad/40"
                          aria-label={`Revoke code ${c.code}`}
                          title="Revoke"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>
    </>
  );

  // Signed-in administration gets the console sidebar; passcode-only access gets a plain page.
  return isAdminSession ? (
    <ConsoleShell active="staff" role="ADMINISTRATIVE">
      {content}
    </ConsoleShell>
  ) : (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">{content}</div>
  );
}
