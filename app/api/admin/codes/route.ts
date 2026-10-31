import { NextRequest, NextResponse } from 'next/server';
import {
  getStaffCodes,
  generateStaffCode,
  revokeStaffCode,
  isStaffRole,
  isDepartmentCode,
} from '@/lib/staff-codes';
import { requireAdmin, isAuthConfigured, authNotConfiguredResponse } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

// GET all staff registration codes
export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();
  const gate = await requireAdmin(req);
  if ('response' in gate) return gate.response;

  try {
    const codes = await getStaffCodes();
    return NextResponse.json({ success: true, codes });
  } catch (error: any) {
    console.error(error?.message);
    return NextResponse.json({ error: 'Failed to retrieve staff codes.' }, { status: 500 });
  }
}

// POST: Generate a new unique staff registration code
export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();
  const gate = await requireAdmin(req);
  if ('response' in gate) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { role, department_code, note } = body || {};
  if (!isStaffRole(role) || !isDepartmentCode(department_code)) {
    return NextResponse.json(
      { error: 'A staff role (TEACHER, FACULTY, ADMINISTRATIVE) and a valid department code are required.' },
      { status: 400 }
    );
  }

  try {
    const code = await generateStaffCode(
      role,
      department_code,
      typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : undefined
    );
    return NextResponse.json({ success: true, code });
  } catch (error: any) {
    console.error(error?.message);
    return NextResponse.json({ error: 'Failed to generate code.' }, { status: 500 });
  }
}

// DELETE: Revoke an unused code
export async function DELETE(req: NextRequest) {
  if (!isAuthConfigured()) return authNotConfiguredResponse();
  const gate = await requireAdmin(req);
  if ('response' in gate) return gate.response;

  const code = new URL(req.url).searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Code is required for revocation.' }, { status: 400 });
  }

  try {
    const revoked = await revokeStaffCode(code);
    if (!revoked) {
      return NextResponse.json(
        { error: 'Code not found or already redeemed.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: `Code ${code} has been revoked.` });
  } catch (error: any) {
    console.error(error?.message);
    return NextResponse.json({ error: 'Failed to revoke code.' }, { status: 500 });
  }
}
