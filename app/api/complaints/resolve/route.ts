import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { STAFF_ROLES, StaffRole, errorResponse, resolveComplaint } from '@/lib/store';

/**
 * POST /api/complaints/resolve — staff only; the ticket must be at the caller's tier.
 * Body: { trackingId, resolutionNote? }. A legacy `role` is accepted but ignored.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, STAFF_ROLES);
  if ('response' in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trackingId = typeof body.trackingId === 'string' ? body.trackingId : '';
    if (!trackingId.trim()) {
      return NextResponse.json({ success: false, error: 'trackingId is required.' }, { status: 400 });
    }
    const note = typeof body.resolutionNote === 'string' ? body.resolutionNote : null;

    const result = await resolveComplaint(trackingId, auth.user.role as StaffRole, note);
    return NextResponse.json({
      success: true,
      message: `Ticket #${result.tracking_id} resolved. The student can see your note on the tracker.`,
      tracking_id: result.tracking_id,
      group: result.group,
    });
  } catch (err) {
    return errorResponse(err, 'Resolution');
  }
}
