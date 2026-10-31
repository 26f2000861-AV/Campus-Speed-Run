import { StaffRegistrationCode, UserRole, DepartmentCode } from './types';
import { supabaseAdmin } from './supabase';

// Staff registration codes live ONLY in public.staff_registration_codes.
// No in-memory store, no hard-coded codes, no fallbacks. Callers must check
// isAuthConfigured() (lib/server-auth) and return 503 when Supabase is missing.

const STAFF_ROLES: UserRole[] = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'];
const DEPARTMENTS: DepartmentCode[] = ['BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN'];

export function isStaffRole(role: unknown): role is UserRole {
  return typeof role === 'string' && STAFF_ROLES.includes(role as UserRole);
}

export function isDepartmentCode(code: unknown): code is DepartmentCode {
  return typeof code === 'string' && DEPARTMENTS.includes(code as DepartmentCode);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function randomSuffix(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export async function getStaffCodes(): Promise<StaffRegistrationCode[]> {
  const { data, error } = await supabaseAdmin
    .from('staff_registration_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load staff codes: ${error.message}`);
  return (data || []) as StaffRegistrationCode[];
}

export async function generateStaffCode(
  role: UserRole,
  department_code: DepartmentCode,
  note?: string
): Promise<StaffRegistrationCode> {
  if (!isStaffRole(role)) throw new Error('Staff codes can only be issued for TEACHER, FACULTY or ADMINISTRATIVE.');
  if (!isDepartmentCode(department_code)) throw new Error('Invalid department code.');

  const rolePrefix = role === 'TEACHER' ? 'TC' : role === 'FACULTY' ? 'FC' : 'CMD';

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `STAFF-${rolePrefix}-${department_code}-${randomSuffix()}`;
    const { data, error } = await supabaseAdmin
      .from('staff_registration_codes')
      .insert({
        code,
        role,
        department_code,
        is_used: false,
        note: note || `Institutional authorization key for ${role} (${department_code})`,
      })
      .select()
      .single();

    if (!error && data) return data as StaffRegistrationCode;
    if (error && error.code !== '23505') {
      throw new Error(`Failed to create staff code: ${error.message}`);
    }
    // 23505 = unique violation → retry with a new suffix
  }
  throw new Error('Failed to generate a unique staff code. Please retry.');
}

export async function validateStaffCode(
  code: string | undefined | null,
  expectedRole?: UserRole
): Promise<{ valid: boolean; codeObj?: StaffRegistrationCode; error?: string }> {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Unique Staff Registration Code is required for staff accounts.' };
  }

  const { data, error } = await supabaseAdmin
    .from('staff_registration_codes')
    .select('*')
    .eq('code', normalizeCode(code))
    .maybeSingle();

  if (error) throw new Error(`Failed to validate staff code: ${error.message}`);

  if (!data) {
    return {
      valid: false,
      error: 'Invalid staff registration code. Keys must be issued by Administration at /admin.',
    };
  }

  const found = data as StaffRegistrationCode;
  if (found.is_used) {
    return { valid: false, error: 'This staff registration code has already been redeemed.' };
  }

  if (expectedRole && expectedRole !== 'STUDENT' && found.role !== expectedRole) {
    return {
      valid: false,
      error: `This code is authorized for the ${found.role} tier, but you selected ${expectedRole}.`,
    };
  }

  return { valid: true, codeObj: found };
}

/**
 * Atomically marks an unused code as used. Returns false if the code was already
 * consumed (e.g. a concurrent registration won the race). Call ONLY after the
 * Supabase user + profile were created successfully.
 */
export async function consumeStaffCode(code: string, userEmail: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('staff_registration_codes')
    .update({
      is_used: true,
      used_by_email: userEmail.trim().toLowerCase(),
      used_at: new Date().toISOString(),
    })
    .eq('code', normalizeCode(code))
    .eq('is_used', false)
    .select('code');

  if (error) throw new Error(`Failed to consume staff code: ${error.message}`);
  return Array.isArray(data) && data.length === 1;
}

/** Revokes (deletes) an unused code. Redeemed codes are kept as an audit trail. */
export async function revokeStaffCode(code: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('staff_registration_codes')
    .delete()
    .eq('code', normalizeCode(code))
    .eq('is_used', false)
    .select('code');

  if (error) throw new Error(`Failed to revoke staff code: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
