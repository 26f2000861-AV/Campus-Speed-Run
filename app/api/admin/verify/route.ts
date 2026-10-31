import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionUser,
  verifyAdminPasscode,
  isAuthConfigured,
  authNotConfiguredResponse,
} from '@/lib/server-auth';

// Confirms admin clearance: an ADMINISTRATIVE session, or an exact ADMIN_PASSCODE match.
export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();

  const user = await getSessionUser(req);
  if (user?.role === 'ADMINISTRATIVE') {
    return NextResponse.json({ success: true, via: 'session', role: 'ADMINISTRATIVE' });
  }

  let passcode = '';
  try {
    const body = await req.json();
    passcode = typeof body?.passcode === 'string' ? body.passcode : '';
  } catch {
    /* empty body */
  }

  if (!passcode) {
    return NextResponse.json({ error: 'Administrative passkey is required.' }, { status: 400 });
  }

  if (!process.env.ADMIN_PASSCODE) {
    return NextResponse.json(
      { error: 'Passkey access is disabled. Sign in with an ADMINISTRATIVE account.' },
      { status: 403 }
    );
  }

  if (!verifyAdminPasscode(passcode)) {
    return NextResponse.json(
      { error: 'Invalid administrative credentials. Access restricted.' },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true, via: 'passcode', role: 'ADMINISTRATIVE' });
}
