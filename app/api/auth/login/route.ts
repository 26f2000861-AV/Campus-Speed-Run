import { NextRequest, NextResponse } from 'next/server';
import {
  isAuthConfigured,
  authNotConfiguredResponse,
  createAuthClient,
  loadProfile,
  setSessionCookies,
  homePathForRole,
} from '@/lib/server-auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email) || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  try {
    const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Role + department come only from public.users.
    const profile = await loadProfile(data.user.id);
    if (!profile) {
      return NextResponse.json(
        { error: 'No campus profile exists for this account. Please contact administration.' },
        { status: 403 }
      );
    }

    const res = NextResponse.json({
      success: true,
      user: profile,
      redirect: homePathForRole(profile.role),
    });
    setSessionCookies(res, data.session);
    return res;
  } catch (err: any) {
    console.error('Login failed:', err?.message);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
