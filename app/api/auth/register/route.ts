import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { UserRole, DepartmentCode } from '@/lib/types';
import { validateStaffCode, consumeStaffCode } from '@/lib/staff-codes';
import {
  isAuthConfigured,
  authNotConfiguredResponse,
  createAuthClient,
  setSessionCookies,
  homePathForRole,
  SessionUser,
} from '@/lib/server-auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateIdentifier(role: UserRole): string {
  const prefix = role === 'STUDENT' ? 'STU' : 'EMP';
  const n = new Uint16Array(1);
  globalThis.crypto.getRandomValues(n);
  return `${prefix}-${String(1000 + (n[0] % 9000))}`;
}

async function rollbackAuthUser(userId: string) {
  // public.users.id → auth.users(id) ON DELETE CASCADE, so this also removes the profile.
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) console.error('Rollback of auth user failed:', error.message);
}

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
  const requestedRole: UserRole = body?.role || 'STUDENT';
  const staffCode: string | undefined =
    typeof body?.staffCode === 'string' ? body.staffCode.trim() : undefined;
  const fullName =
    typeof body?.full_name === 'string' && body.full_name.trim()
      ? body.full_name.trim().slice(0, 120)
      : email.split('@')[0];

  if (!EMAIL_RE.test(email) || password.length < 8) {
    return NextResponse.json(
      { error: 'Valid email and password (minimum 8 characters) are required.' },
      { status: 400 }
    );
  }

  // Role/department are never taken from the client: students are STUDENT/NULL,
  // staff adopt exactly what their authority-issued code grants.
  let role: UserRole = 'STUDENT';
  let department: DepartmentCode | null = null;

  try {
    if (requestedRole !== 'STUDENT' || staffCode) {
      const validation = await validateStaffCode(
        staffCode,
        requestedRole !== 'STUDENT' ? requestedRole : undefined
      );
      if (!validation.valid || !validation.codeObj) {
        return NextResponse.json(
          { error: validation.error || 'Invalid or missing Staff Registration Code.' },
          { status: 403 }
        );
      }
      if (
        typeof body?.department_code === 'string' &&
        body.department_code !== validation.codeObj.department_code
      ) {
        return NextResponse.json(
          {
            error: `This code is issued for the ${validation.codeObj.department_code} department, but you selected ${body.department_code}.`,
          },
          { status: 403 }
        );
      }
      role = validation.codeObj.role;
      department = validation.codeObj.department_code;
    }

    // Step 1 — Supabase Auth user (auto-confirmed, spec 01 §3)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      const msg = authError?.message || '';
      const exists = /already|registered|exists/i.test(msg);
      return NextResponse.json(
        { error: exists ? 'An account with this email already exists.' : 'Could not create account.' },
        { status: exists ? 409 : 400 }
      );
    }

    const userId = authData.user.id;

    // Step 2 — public.users profile (roll back the auth user on failure)
    let profileError: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabaseAdmin.from('users').insert({
        id: userId,
        email,
        full_name: fullName,
        identifier_no: generateIdentifier(role),
        role,
        department_code: department,
      });
      profileError = error;
      if (!error || error.code !== '23505' || !/identifier/i.test(error.message)) break;
    }

    if (profileError) {
      console.error('Profile insert failed:', profileError.message);
      await rollbackAuthUser(userId);
      return NextResponse.json({ error: 'Could not create user profile.' }, { status: 500 });
    }

    // Step 3 — consume the staff code only after the account exists
    if (role !== 'STUDENT' && staffCode) {
      const consumed = await consumeStaffCode(staffCode, email).catch((e) => {
        console.error(e?.message);
        return false;
      });
      if (!consumed) {
        await rollbackAuthUser(userId);
        return NextResponse.json(
          { error: 'This staff registration code has already been redeemed.' },
          { status: 409 }
        );
      }
    }

    const user: SessionUser = { id: userId, email, role, department_code: department };
    const redirect = homePathForRole(role);

    // Step 4 — establish the session cookies
    const { data: signIn, error: signInError } = await createAuthClient().auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signIn.session) {
      return NextResponse.json(
        { success: true, user, session: false, error: 'Account created. Please sign in.' },
        { status: 201 }
      );
    }

    const res = NextResponse.json({ success: true, user, session: true, redirect }, { status: 201 });
    setSessionCookies(res, signIn.session);
    return res;
  } catch (err: any) {
    console.error('Registration failed:', err?.message);
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
