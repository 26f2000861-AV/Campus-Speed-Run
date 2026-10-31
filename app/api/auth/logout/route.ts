import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ACCESS_COOKIE, clearSessionCookies, forgetSession, isAuthConfigured } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  forgetSession(accessToken);

  if (accessToken && isAuthConfigured()) {
    try {
      // Revoke the refresh token(s) server-side; ignore failures (token may already be expired).
      await supabaseAdmin.auth.admin.signOut(accessToken);
    } catch {
      /* best effort */
    }
  }

  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
}
