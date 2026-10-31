import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase';
import { UserRole, DepartmentCode } from './types';

// ---------------------------------------------------------------------------
// Contract B — server-verified sessions.
// Session = httpOnly cookies holding the Supabase access / refresh tokens.
// Role and department are ALWAYS read from public.users, never from the
// client, the cookie payload, or auth user_metadata.
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  department_code: DepartmentCode | null;
}

export const ACCESS_COOKIE = 'csr_access';
export const REFRESH_COOKIE = 'csr_refresh';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days; token validity is checked server-side

const VALID_ROLES: UserRole[] = ['STUDENT', 'TEACHER', 'FACULTY', 'ADMINISTRATIVE'];
const VALID_DEPTS: DepartmentCode[] = ['BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN'];

/** True only when URL, anon key AND service-role key are all present. */
export function isAuthConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return (
    url.length > 0 &&
    !url.includes('your-project-id') &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').length > 0 &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length > 0
  );
}

export function authNotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Authentication service is not configured (Supabase env vars missing).' },
    { status: 503 }
  );
}

/**
 * Per-request anon client for password sign-in / token refresh.
 * Never reuse the module-level `supabase` client on the server: it would keep
 * one user's session in shared memory across requests.
 */
export function createAuthClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function setSessionCookies(
  res: NextResponse,
  session: Pick<Session, 'access_token' | 'refresh_token'>
): void {
  res.cookies.set(ACCESS_COOKIE, session.access_token, cookieOptions(SESSION_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(SESSION_MAX_AGE));
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
  res.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
}

/** Spec 01 §4 post-login destination. */
export function homePathForRole(role: UserRole): string {
  return role === 'STUDENT' ? '/student/submit' : `/dashboard?role=${role}`;
}

/** Load the authoritative profile from public.users (service role). */
export async function loadProfile(userId: string): Promise<SessionUser | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, role, department_code')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  if (!VALID_ROLES.includes(data.role as UserRole)) return null;

  const dept = data.department_code as DepartmentCode | null;
  return {
    id: data.id as string,
    email: data.email as string,
    role: data.role as UserRole,
    department_code: dept && VALID_DEPTS.includes(dept) ? dept : null,
  };
}

/** Best-effort write of rotated tokens (works inside Route Handlers / Server Actions). */
async function persistRefreshedSession(session: Session): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(ACCESS_COOKIE, session.access_token, cookieOptions(SESSION_MAX_AGE));
    jar.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(SESSION_MAX_AGE));
  } catch {
    // Not writable in this context (e.g. Server Component render) — the refreshed
    // token is still valid for this request; the next route call will refresh again.
  }
}

/**
 * Verifies the csr_access cookie with Supabase, refreshing via csr_refresh when
 * the access token is expired/invalid, then reads role/department from public.users.
 * Returns null when there is no valid session or Supabase is not configured.
 */
// Verified-session cache: a token checked with Supabase Auth (plus its profile row)
// is reused for a short window so every API call doesn't pay two network round
// trips. Logout evicts the entry immediately; role changes apply within the TTL.
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 500;
const sessionCache = new Map<string, { user: SessionUser; expires: number }>();

function cachedSession(token: string): SessionUser | null {
  const hit = sessionCache.get(token);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    sessionCache.delete(token);
    return null;
  }
  return hit.user;
}

function rememberSession(token: string, user: SessionUser): void {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }
  sessionCache.set(token, { user, expires: Date.now() + SESSION_CACHE_TTL_MS });
}

/** Drop a token from the verified-session cache (called on logout). */
export function forgetSession(accessToken: string | null | undefined): void {
  if (accessToken) sessionCache.delete(accessToken);
}

export async function getSessionUser(req: NextRequest): Promise<SessionUser | null> {
  if (!isAuthConfigured()) return null;

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const cached = cachedSession(accessToken);
    if (cached) return cached;
  }

  let authUserId: string | null = null;
  let accessTokenVerified = false;

  if (accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (!error && data.user) {
      authUserId = data.user.id;
      accessTokenVerified = true;
    }
  }

  if (!authUserId && refreshToken) {
    const { data, error } = await createAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (!error && data.session && data.user) {
      authUserId = data.user.id;
      await persistRefreshedSession(data.session);
    }
  }

  if (!authUserId) return null;
  const profile = await loadProfile(authUserId);
  // Only cache when the presented access token itself was valid (not after a refresh).
  if (profile && accessToken && accessTokenVerified) rememberSession(accessToken, profile);
  return profile;
}

/** 503 if auth not configured, 401 if no session, 403 if role not allowed. */
export async function requireRole(
  req: NextRequest,
  roles: UserRole[]
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  if (!isAuthConfigured()) return { response: authNotConfiguredResponse() };

  const user = await getSessionUser(req);
  if (!user) {
    return {
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }
  if (!roles.includes(user.role)) {
    return {
      response: NextResponse.json(
        { error: 'You do not have permission to perform this action.' },
        { status: 403 }
      ),
    };
  }
  return { user };
}

// ---------------------------------------------------------------------------
// Admin gate: ADMINISTRATIVE session OR exact ADMIN_PASSCODE (x-admin-key header).
// ---------------------------------------------------------------------------

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Exact match against ADMIN_PASSCODE. No defaults: unset env var disables passcode access. */
export function verifyAdminPasscode(candidate: string | null | undefined): boolean {
  const expected = process.env.ADMIN_PASSCODE || '';
  if (!expected || !candidate) return false;
  return constantTimeEqual(candidate, expected);
}

export async function requireAdmin(
  req: NextRequest
): Promise<{ via: 'session' | 'passcode'; user: SessionUser | null } | { response: NextResponse }> {
  const user = await getSessionUser(req);
  if (user && user.role === 'ADMINISTRATIVE') return { via: 'session', user };

  if (verifyAdminPasscode(req.headers.get('x-admin-key'))) return { via: 'passcode', user };

  return {
    response: NextResponse.json(
      { error: 'Unauthorized administrative access.' },
      { status: user ? 403 : 401 }
    ),
  };
}
