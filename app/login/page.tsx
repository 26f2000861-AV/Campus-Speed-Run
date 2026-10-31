'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { UserRole, DepartmentCode } from '@/lib/types';
import { useAuth, homePathForRole } from '@/lib/auth-context';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, User } from 'lucide-react';
import Logo from '@/components/Logo';
import { EASE_OUT } from '@/components/motion';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.25, ease: EASE_OUT },
};

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, login: setAuthUser } = useAuth();

  // Account type only matters when registering (sign-in is the same for everyone;
  // the role always comes from the server).
  const [portal, setPortal] = useState<'STUDENT' | 'STAFF'>(searchParams.get('portal') === 'staff' ? 'STAFF' : 'STUDENT');
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(searchParams.get('mode') === 'register' ? 'REGISTER' : 'LOGIN');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('TEACHER');
  const [departmentCode, setDepartmentCode] = useState<DepartmentCode>('BTECH');
  const [staffCode, setStaffCode] = useState('');
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [attempted, setAttempted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Already signed in (server-verified via /api/auth/me): go to the role's home (spec 01 §4).
  useEffect(() => {
    if (!authLoading && user) router.replace(homePathForRole(user.role));
  }, [user, authLoading, router]);

  // Blur-first validation; an untouched empty field only errors after a submit attempt.
  const emailError =
    (attempted || (touched.email && email !== '')) && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : null;
  const passwordError =
    (attempted || (touched.password && password !== '')) && password.length < 8 ? 'Use at least 8 characters.' : null;

  const switchMode = (m: 'LOGIN' | 'REGISTER') => {
    setMode(m);
    setErrorMsg(null);
    setSuccessMsg(null);
    setAttempted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setTouched({ email: true, password: true });
    setAttempted(true);

    if (!EMAIL_RE.test(email.trim())) return document.getElementById('email')?.focus();
    if (password.length < 8) return document.getElementById('password')?.focus();

    const staffRegister = portal === 'STAFF' && mode === 'REGISTER';
    if (staffRegister && !fullName.trim()) {
      setErrorMsg('Enter your full name.');
      return document.getElementById('fullName')?.focus();
    }
    if (staffRegister && !staffCode.trim()) {
      setErrorMsg('Enter the registration code from campus administration.');
      return document.getElementById('staffCode')?.focus();
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
          : { email: email.trim().toLowerCase(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.user) {
        throw new Error(data.error || 'Sign-in failed. Check your email and password and try again.');
      }

      // Account created but no session could be established: ask the user to sign in.
      if (mode === 'REGISTER' && data.session === false) {
        switchMode('LOGIN');
        setPassword('');
        setSuccessMsg(data.error || 'Account created. Sign in to continue.');
        return;
      }

      // The API set httpOnly session cookies; role/department come from the server only.
      const serverUser = data.user as { id: string; email: string; role: UserRole; department_code: DepartmentCode | null };
      setAuthUser({ id: serverUser.id, email: serverUser.email, role: serverUser.role, department_code: serverUser.department_code });
      setSuccessMsg(mode === 'REGISTER' ? 'Account created. Taking you in…' : 'Signed in. Taking you in…');
      router.push(typeof data.redirect === 'string' && data.redirect.startsWith('/') ? data.redirect : homePathForRole(serverUser.role));
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const register = mode === 'REGISTER';
  const title = register ? 'Create your account' : portal === 'STAFF' ? 'Staff sign in' : 'Welcome back';
  const subtitle = register
    ? portal === 'STAFF'
      ? 'Staff accounts need a code from administration.'
      : 'Your name is never shown to staff.'
    : 'Sign in to report and track campus issues.';

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center px-4 sm:px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="cs-glass w-full max-w-[400px] p-6 sm:p-8"
      >
        <div className="group flex justify-center">
          <Logo size="md" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-7 text-center"
          >
            <h1 className="text-2xl font-semibold text-fg">{title}</h1>
            <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
          </motion.div>
        </AnimatePresence>

        <div aria-live="polite">
          <AnimatePresence initial={false}>
            {errorMsg && (
              <motion.div key="err" role="alert" {...reveal} className="overflow-hidden">
                <div className="alert-error mt-5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              </motion.div>
            )}
            {successMsg && (
              <motion.div key="ok" role="status" {...reveal} className="overflow-hidden">
                <div className="alert-success mt-5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{successMsg}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          {/* Registration-only: account type, then name. */}
          <AnimatePresence initial={false}>
            {register && (
              <motion.div key="reg" {...reveal} className="overflow-hidden">
                <div className="space-y-4 pb-1">
                  <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 p-1 rounded-xl bg-ink-950/70 border border-line">
                    {(['STUDENT', 'STAFF'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={portal === p}
                        onClick={() => setPortal(p)}
                        className={`relative h-9 rounded-lg text-sm font-medium transition-colors ${portal === p ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
                      >
                        {portal === p && (
                          <motion.span
                            layoutId="seg-portal"
                            className="absolute inset-0 rounded-lg bg-white/[0.09] border border-white/[0.08]"
                            transition={{ type: 'spring', stiffness: 450, damping: 38 }}
                          />
                        )}
                        <span className="relative">{p === 'STUDENT' ? 'Student' : 'Staff'}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="fullName" className="cs-field-label">
                      Full name {portal === 'STUDENT' && <span className="text-fg-muted font-normal">(optional)</span>}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
                      <input
                        type="text"
                        suppressHydrationWarning
                        id="fullName"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="cs-input pl-10"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="email" className="cs-field-label">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
              <input
                type="email"
                required
                suppressHydrationWarning
                id="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="you@university.edu"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'email-error' : undefined}
                className="cs-input pl-10"
              />
            </div>
            {emailError && (
              <p id="email-error" className="mt-1.5 text-xs text-bad-soft">
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="cs-field-label">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                suppressHydrationWarning
                id="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? 'password-error' : register ? 'password-hint' : undefined}
                className="cs-input pl-10 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg inline-flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/[0.06]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            {passwordError ? (
              <p id="password-error" className="mt-1.5 text-xs text-bad-soft">
                {passwordError}
              </p>
            ) : (
              register && (
                <p id="password-hint" className="cs-hint">
                  At least 8 characters.
                </p>
              )
            )}
          </div>

          {/* Staff registration only */}
          <AnimatePresence initial={false}>
            {register && portal === 'STAFF' && (
              <motion.div key="staff" {...reveal} className="overflow-hidden">
                <div className="space-y-4 pt-4 border-t border-line">
                  <div>
                    <label htmlFor="staffCode" className="cs-field-label">
                      Registration code
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" aria-hidden="true" />
                      <input
                        type="text"
                        suppressHydrationWarning
                        id="staffCode"
                        autoComplete="off"
                        value={staffCode}
                        onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                        placeholder="STAFF-TC-9182"
                        className="cs-input pl-10 font-mono uppercase tracking-wide"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="role" className="cs-field-label">
                        Role
                      </label>
                      <select id="role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="cs-input">
                        <option value="TEACHER">Teacher</option>
                        <option value="FACULTY">Faculty</option>
                        <option value="ADMINISTRATIVE">Administration</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="departmentCode" className="cs-field-label">
                        Department
                      </label>
                      <select
                        id="departmentCode"
                        value={departmentCode}
                        onChange={(e) => setDepartmentCode(e.target.value as DepartmentCode)}
                        className="cs-input"
                      >
                        <option value="BTECH">B.Tech</option>
                        <option value="MCA">MCA</option>
                        <option value="SCI">Applied Sciences</option>
                        <option value="INFRA">Infrastructure</option>
                        <option value="IT">IT &amp; Network</option>
                        <option value="SAN">Sanitation</option>
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button type="submit" disabled={loading} suppressHydrationWarning className="btn-primary w-full h-11 !mt-6 group/cta">
            {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            <span>{loading ? (register ? 'Creating account…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}</span>
            {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover/cta:translate-x-0.5" aria-hidden="true" />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          {register ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(register ? 'LOGIN' : 'REGISTER')}
            className="font-medium text-fg underline-offset-4 hover:underline"
          >
            {register ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </motion.div>

      <motion.a
        href="/"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to home
      </motion.a>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100svh] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-fg-muted" aria-label="Loading" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
