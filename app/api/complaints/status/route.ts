import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { STAFF_ROLES, StaffRole, errorResponse, updateComplaintStatus } from '@/lib/store';

/**
 * POST /api/complaints/status — staff only; the ticket must be at the caller's tier.
 * Body: { trackingId, status: 'ACKNOWLEDGED' | 'IN_PROGRESS', note? }.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, STAFF_ROLES);
  if ('response' in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trackingId = typeof body.trackingId === 'string' ? body.trackingId : '';
    const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';
    if (!trackingId.trim() || !status) {
      return NextResponse.json(
        { success: false, error: 'trackingId and status are required.' },
        { status: 400 }
      );
    }
    const note = typeof body.note === 'string' ? body.note : null;

    const result = await updateComplaintStatus(trackingId, auth.user.role as StaffRole, status, note);
    return NextResponse.json({
      success: true,
      message: `Ticket #${result.tracking_id} ${result.group.status === 'IN_PROGRESS' ? 'is now in progress' : 'acknowledged'}.`,
      tracking_id: result.tracking_id,
      group: result.group,
    });
  } catch (err) {
    return errorResponse(err, 'Status update');
  }
}
