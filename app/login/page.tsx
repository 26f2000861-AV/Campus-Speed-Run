'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserRole, DepartmentCode } from '@/lib/types';
import { useAuth, homePathForRole } from '@/lib/auth-context';
import {
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  User,
  Key,
} from 'lucide-react';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, login: setAuthUser } = useAuth();

  // Portal selection: STUDENT vs STAFF
  const initialPortal = searchParams.get('portal') === 'staff' ? 'STAFF' : 'STUDENT';
  const [portal, setPortal] = useState<'STUDENT' | 'STAFF'>(initialPortal);

  // Auth mode: LOGIN vs REGISTER
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('TEACHER');
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('BTECH');
  const [staffCode, setStaffCode] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // If already logged in (server-verified via /api/auth/me), redirect per spec 01 §4
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(homePathForRole(user.role));
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation for Staff Registration
    if (portal === 'STAFF' && mode === 'REGISTER') {
      if (!staffCode.trim()) {
        setErrorMsg('Unique Staff Registration Code is required. Codes must be issued via the /admin authority.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === 'REGISTER' ? '/api/auth/register' : '/api/auth/login';
      const assignedRole = portal === 'STAFF' ? role : 'STUDENT';

      const payload =
        mode === 'REGISTER'
          ? {
              email: email.trim().toLowerCase(),
              password,
              full_name: fullName.trim() || undefined,
              role: assignedRole,
              department_code: assignedRole !== 'STUDENT' ? departmentCode : null,
              staffCode: portal === 'STAFF' ? staffCode.trim() : undefined,
            }
          : {
              email: email.trim().toLowerCase(),
              password,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.user) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      // Account created but no session could be established: ask the user to sign in.
      if (mode === 'REGISTER' && data.session === false) {
        setMode('LOGIN');
        setPassword('');
        setSuccessMsg(data.error || 'Account created. Please sign in.');
        return;
      }

      // The API set httpOnly session cookies; role/department come from the server only.
      const serverUser = data.user as {
        id: string;
        email: string;
        role: UserRole;
        department_code: DepartmentCode | null;
      };
      setAuthUser({
        id: serverUser.id,
        email: serverUser.email,
        role: serverUser.role,
        department_code: serverUser.department_code,
      });

      setSuccessMsg(
        mode === 'REGISTER'
          ? 'Account verified and created. Redirecting...'
          : 'Signed in successfully. Redirecting...'
      );

      router.push(
        typeof data.redirect === 'string' && data.redirect.startsWith('/')
          ? data.redirect
          : homePathForRole(serverUser.role)
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 sm:p-10 rounded-3xl shadow-xl relative">

        {/* Portal Switcher (STUDENT vs STAFF COCKPIT) */}
        <div className="flex items-center justify-center p-1 rounded-full bg-slate-800 border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setPortal('STUDENT');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all ${
              portal === 'STUDENT'
                ? 'bg-slate-700 text-white shadow-sm border border-slate-600 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Student Portal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPortal('STAFF');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-full flex items-center justify-center gap-1.5 transition-all ${
              portal === 'STAFF'
                ? 'bg-slate-700 text-white shadow-sm border border-slate-600 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-300" />
            <span>Staff Cockpit</span>
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-serif text-3xl font-normal text-slate-100 tracking-tight">
            {portal === 'STAFF' ? 'Staff Portal' : 'Welcome Back'}
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            {portal === 'STAFF'
              ? 'Authorized access for department teachers, faculty, and administrators.'
              : 'Sign in to file anonymous reports or track resolution status.'}
          </p>
        </div>

        {/* Pill Toggle (LOGIN vs REGISTER) */}
        <div className="flex p-1 rounded-full bg-slate-800 border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('LOGIN');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
              mode === 'LOGIN'
                ? 'bg-slate-100 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('REGISTER');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
              mode === 'REGISTER'
                ? 'bg-slate-100 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {portal === 'STAFF' ? 'Staff Register' : 'Register'}
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div role="alert" className="mb-4 p-3 bg-red-950/50 border border-red-800 text-red-200 text-xs rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div role="status" className="mb-4 p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs rounded-xl flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'REGISTER' && (
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required={portal === 'STAFF'}
                suppressHydrationWarning
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={portal === 'STAFF' ? 'Dr. Sarah Connor' : 'Alex Johnson (Optional)'}
                className="cs-input"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Institutional Email *
            </label>
            <input
              type="email"
              required
              suppressHydrationWarning
              id="email"
                value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={portal === 'STAFF' ? 'coordinator@university.edu' : 'student@university.edu'}
              className="cs-input"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-300 mb-1.5">
              Password (8+ Characters) *
            </label>
            <input
              type="password"
              required
              minLength={8}
              suppressHydrationWarning
              id="password"
                value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="cs-input font-mono"
            />
          </div>

          {/* STAFF COCKPIT REGISTRATION FIELDS */}
          {portal === 'STAFF' && mode === 'REGISTER' && (
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <div>
                <label htmlFor="staffCode" className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-slate-300" />
                  <span>Unique Staff Registration Code *</span>
                </label>
                <input
                  type="text"
                  required
                  suppressHydrationWarning
                  id="staffCode"
                value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                  placeholder="e.g. STAFF-TC-9182"
                  className="cs-input font-mono uppercase tracking-wider"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Required: Issued exclusively by Campus Administration via <span className="font-mono text-slate-200 font-semibold">/admin</span>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="role" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Role Tier *
                  </label>
                  <select
                    id="role"
                value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="cs-input"
                  >
                    <option value="TEACHER">Tier 1: Teacher</option>
                    <option value="FACULTY">Tier 2: Faculty</option>
                    <option value="ADMINISTRATIVE">Tier 3: Admin</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="departmentCode" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Department *
                  </label>
                  <select
                    id="departmentCode"
                value={departmentCode}
                    onChange={(e) => setDepartmentCode(e.target.value as DepartmentCode)}
                    className="cs-input"
                  >
                    <option value="BTECH">BTECH</option>
                    <option value="MCA">MCA</option>
                    <option value="SCI">SCI</option>
                    <option value="INFRA">INFRA</option>
                    <option value="IT">IT</option>
                    <option value="SAN">SAN</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="pt-3">
            <button
              type="submit"
              disabled={loading}
              suppressHydrationWarning
              className="btn-primary w-full py-3.5 px-6"
            >
              <span>
                {loading
                  ? 'Processing...'
                  : mode === 'LOGIN'
                  ? portal === 'STAFF'
                    ? 'Access Staff Cockpit'
                    : 'Sign In'
                  : portal === 'STAFF'
                  ? 'Verify Key & Register'
                  : 'Create Account'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <span className="text-xs text-slate-400">
            Encrypted credentials &bull; Zero tracking
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-140px)] flex items-center justify-center text-xs text-slate-400">
          Loading authentication portal...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
