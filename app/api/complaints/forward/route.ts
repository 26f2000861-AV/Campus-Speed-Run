import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { STAFF_ROLES, StaffRole, errorResponse, forwardComplaint } from '@/lib/store';

/**
 * POST /api/complaints/forward — staff only.
 * Body: { trackingId, toRole?, note? }. A legacy `fromRole` is accepted but ignored:
 * fromRole is the session role. Only TEACHER→FACULTY and FACULTY→ADMINISTRATIVE,
 * and only when the ticket is currently at the caller's tier.
 */

const TIER_NAME: Record<string, string> = { TEACHER: 'Teacher', FACULTY: 'Faculty', ADMINISTRATIVE: 'Administration' };
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, STAFF_ROLES);
  if ('response' in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trackingId = typeof body.trackingId === 'string' ? body.trackingId : '';
    if (!trackingId.trim()) {
      return NextResponse.json({ success: false, error: 'trackingId is required.' }, { status: 400 });
    }
    const toRole = typeof body.toRole === 'string' ? body.toRole : null;
    const note = typeof body.note === 'string' ? body.note : null;

    const result = await forwardComplaint(trackingId, auth.user.role as StaffRole, toRole, note);
    return NextResponse.json({
      success: true,
      message: `Ticket #${result.tracking_id} forwarded to ${TIER_NAME[result.to_role] ?? result.to_role}. Their 72-hour clock has started.`,
      tracking_id: result.tracking_id,
      from_role: result.from_role,
      to_role: result.to_role,
      group: result.group,
    });
  } catch (err) {
    return errorResponse(err, 'Forwarding');
  }
}
