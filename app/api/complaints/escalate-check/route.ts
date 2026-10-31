import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { STAFF_ROLES, errorResponse, runAutoEscalation, simulateTimeJump } from '@/lib/store';

/**
 * POST /api/complaints/escalate-check — any staff session.
 * Body: { simulateJump?: boolean, trackingId?: string }.
 * simulateJump → SQL simulate_time_jump (demo "+3 days", spec 07 §4); otherwise
 * auto_escalate_stale_complaints(). Both write their own history + notifications.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, STAFF_ROLES);
  if ('response' in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const trackingId =
      typeof body.trackingId === 'string' && body.trackingId.trim() ? body.trackingId.trim().toUpperCase() : null;

    if (body.simulateJump) {
      // Demo time jump expires every open ticket: ADMINISTRATIVE only, unless
      // DEMO_TIME_JUMP=true opens it to all staff for a live presentation.
      if (auth.user.role !== 'ADMINISTRATIVE' && process.env.DEMO_TIME_JUMP !== 'true') {
        return NextResponse.json(
          { success: false, error: 'Time jump is restricted to ADMINISTRATIVE (set DEMO_TIME_JUMP=true for demos).', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      const escalatedCount = await simulateTimeJump(trackingId);
      return NextResponse.json({
        success: true,
        action: 'TIME_JUMP_SIMULATED',
        message: `Simulated +72h${trackingId ? ` on ${trackingId}` : ''}: ${escalatedCount} ticket(s) auto-escalated.`,
        escalatedCount,
        affected: escalatedCount,
      });
    }

    const escalatedCount = await runAutoEscalation();
    return NextResponse.json({
      success: true,
      action: 'CHECK_COMPLETED',
      escalatedCount,
      affected: escalatedCount,
    });
  } catch (err) {
    return errorResponse(err, 'Escalation check');
  }
}
