'use client';

import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Key,
  Copy,
  Check,
  Trash2,
  Plus,
  RefreshCw,
  Lock,
  ArrowRight,
  Sparkles,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { StaffRegistrationCode, UserRole, DepartmentCode } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
      setAuthError('Administrative clearance expired or was rejected. Please authenticate again.');
    }
  };

  // Load codes once authenticated
  useEffect(() => {
    if (isAdminAuthenticated) {
      loadCodes();
    }
  }, [isAdminAuthenticated]);

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
        throw new Error(data.error || 'Invalid administrative clearance.');
      }

      setIsAdminAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Verification failed');
    } finally {
      setAuthenticating(false);
    }
  };

  const loadCodes = async () => {
    setLoadingCodes(true);
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
      }
    } catch (err) {
      console.error('Failed to load codes:', err);
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
        setToastMsg(`Generated new code: ${data.code.code}`);
        setTimeout(() => setToastMsg(null), 4000);
      } else {
        handleAdminFailure(res.status);
      }
    } catch (err) {
      console.error('Failed to generate code:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (code: string) => {
    if (!confirm(`Revoke registration code ${code}?`)) return;

    try {
      const res = await fetch(`/api/admin/codes?code=${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: adminHeaders(),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setCodes((prev) => prev.filter((c) => c.code !== code));
      } else {
        handleAdminFailure(res.status);
      }
    } catch (err) {
      console.error('Failed to revoke code:', err);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // 1. ADMIN GATE: Displayed if not authenticated as Admin
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-140px)] flex flex-col justify-center items-center py-12 px-4 sm:px-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 sm:p-10 rounded-3xl shadow-xl relative">

          <div className="text-center mb-8">
            <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto mb-3" aria-hidden="true" />
            <h1 className="font-serif text-3xl font-normal text-slate-100 tracking-tight">
              Administrative Gate
            </h1>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Restricted management console for issuing staff cockpit registration keys. Enter administrative passkey to proceed.
            </p>
          </div>

          {authError && (
            <div role="alert" className="mb-4 p-3 bg-red-950/50 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label htmlFor="passcode" className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>Administrative Passkey / Key *</span>
              </label>
              <input
                type="password"
                required
                suppressHydrationWarning
                id="passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Administrative passkey"
                className="cs-input font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                Or sign in with an ADMINISTRATIVE account to skip this step.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={authenticating}
                suppressHydrationWarning
                className="btn-primary w-full py-3 px-6"
              >
                <span>{authenticating ? 'Verifying Clearance...' : 'Authenticate Clearance'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <span className="text-xs text-slate-400">
              Direct URL Route Only &bull; Strict Zero-Leakage Policy
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 2. AUTHENTICATED ADMIN DASHBOARD: Display unique codes and generator
  const activeCodes = codes.filter((c) => !c.is_used);
  const usedCodes = codes.filter((c) => c.is_used);

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 space-y-10">
      {/* Toast Notification */}
      {toastMsg && (
        <div role="status" className="fixed top-20 right-6 z-50 p-4 bg-emerald-950 border border-emerald-800 text-emerald-200 text-xs rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-slate-100 tracking-tight">
            Staff Access & Code Authority
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Issue cryptographically unique registration keys for department teachers, faculty coordinators, and administrative officers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadCodes}
            disabled={loadingCodes}
            className="btn-secondary px-4 py-2 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingCodes ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => {
              setIsAdminAuthenticated(false);
              setPasscode('');
              setCodes([]);
            }}
            className="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium flex items-center gap-1.5 transition-all"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Admin</span>
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 shadow-sm p-6 rounded-3xl">
          <div className="text-xs text-slate-400 uppercase">Active Unique Keys</div>
          <div className="font-serif text-3xl font-medium text-emerald-300 mt-2">
            {activeCodes.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Available for staff registration</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 shadow-sm p-6 rounded-3xl">
          <div className="text-xs text-slate-400 uppercase">Redeemed Staff Keys</div>
          <div className="font-serif text-3xl font-medium text-slate-200 mt-2">
            {usedCodes.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Claimed by verified personnel</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 shadow-sm p-6 rounded-3xl">
          <div className="text-xs text-slate-400 uppercase">Access Security Mode</div>
          <div className="font-serif text-2xl font-medium text-slate-100 mt-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
            <span>Code-Gated</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Direct URL access only &bull; Zero public CTA</div>
        </div>
      </div>

      {/* Main Grid: Code Generator + Active Codes List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Code Generator */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 shadow-sm p-8 rounded-3xl space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Plus className="w-4 h-4 text-slate-400" />
            <h2 className="font-serif text-xl font-normal text-slate-100">Generate Unique Key</h2>
          </div>

          <form onSubmit={handleGenerateCode} className="space-y-5">
            <div>
              <label htmlFor="genRole" className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Role Tier *
              </label>
              <select
                id="genRole"
                value={genRole}
                onChange={(e) => setGenRole(e.target.value as UserRole)}
                className="cs-input"
              >
                <option value="TEACHER">TEACHER — Tier 1 Department Coordinator</option>
                <option value="FACULTY">FACULTY — Tier 2 Department Leadership</option>
                <option value="ADMINISTRATIVE">ADMINISTRATIVE — Tier 3 Command Authority</option>
              </select>
            </div>

            <div>
              <label htmlFor="genDept" className="block text-xs font-medium text-slate-300 mb-1.5">
                Assigned Department *
              </label>
              <select
                id="genDept"
                value={genDept}
                onChange={(e) => setGenDept(e.target.value as DepartmentCode)}
                className="cs-input"
              >
                <option value="BTECH">BTECH — B.Tech / Engineering</option>
                <option value="MCA">MCA — Computer Applications</option>
                <option value="SCI">SCI — Applied Sciences & Hazardous Labs</option>
                <option value="INFRA">INFRA — Campus Infrastructure</option>
                <option value="IT">IT — Central IT & Network Systems</option>
                <option value="SAN">SAN — Sanitation & Facilities</option>
              </select>
            </div>

            <div>
              <label htmlFor="genNote" className="block text-xs font-medium text-slate-300 mb-1.5">
                Memo / Recipient Note (Optional)
              </label>
              <input
                type="text"
                suppressHydrationWarning
                id="genNote"
                value={genNote}
                onChange={(e) => setGenNote(e.target.value)}
                placeholder="e.g. Issued for Lab 3 Teacher Coordinator"
                className="cs-input"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              suppressHydrationWarning
              className="btn-primary w-full py-3.5 px-6"
            >
              <Key className="w-4 h-4" />
              <span>{generating ? 'Minting Key...' : 'Issue Unique Registration Code'}</span>
            </button>
          </form>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-1.5">
            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-slate-400" />
              <span>How Staff Registration Works</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Give this unique code to the designated staff member. They navigate to the Staff Cockpit register page, paste this code, and their account is automatically provisioned with the exact role and department permissions.
            </p>
          </div>
        </div>

        {/* Right Column: Code Inventory */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 shadow-sm p-8 rounded-3xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-400" />
                <h2 className="font-serif text-xl font-normal text-slate-100">Active Registration Keys</h2>
              </div>
              <span className="text-xs text-slate-400">
                {activeCodes.length} Available
              </span>
            </div>

            {loadingCodes ? (
              <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
                Loading cryptographic keys...
              </div>
            ) : activeCodes.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No active codes available. Generate a new key using the panel on the left.
              </div>
            ) : (
              <div className="space-y-3">
                {activeCodes.map((c) => (
                  <div
                    key={c.code}
                    className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 hover:border-slate-600 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold tracking-wider text-slate-100">
                          {c.code}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs">
                          ACTIVE
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">
                          Role: {c.role}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800">
                          Dept: {c.department_code}
                        </span>
                        {c.note && <span className="text-slate-400">&bull; {c.note}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => copyToClipboard(c.code)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
                          copiedCode === c.code
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700'
                        }`}
                      >
                        {copiedCode === c.code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Key</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleRevoke(c.code)}
                        className="p-2 rounded-full border border-slate-800 hover:border-red-700 text-slate-400 hover:text-red-300 transition-colors"
                        title="Revoke Code"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Redeemed / Used Codes Section */}
          {usedCodes.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 shadow-sm p-6 rounded-3xl space-y-4 opacity-80">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-300">
                  <UserCheck className="w-4 h-4 text-slate-400" />
                  <h3 className="font-serif text-lg font-normal text-slate-100">Redeemed Keys Log</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {usedCodes.length} Used
                </span>
              </div>

              <div className="space-y-2">
                {usedCodes.map((c) => (
                  <div
                    key={c.code}
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <span className="line-through text-slate-400">{c.code}</span>
                      <span className="ml-2 text-slate-400">
                        ({c.role} &mdash; {c.department_code})
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Redeemed by {c.used_by_email || 'staff member'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
