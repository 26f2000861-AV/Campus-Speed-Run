import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionUser,
  isAuthConfigured,
  authNotConfiguredResponse,
  clearSessionCookies,
} from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();

  const user = await getSessionUser(req);
  if (!user) {
    const res = NextResponse.json(
      { success: false, user: null, error: 'Not authenticated.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
    // Drop stale/invalid tokens so middleware stops treating the browser as signed in.
    if (req.cookies.has('csr_access') || req.cookies.has('csr_refresh')) clearSessionCookies(res);
    return res;
  }

  return NextResponse.json(
    { success: true, user },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
