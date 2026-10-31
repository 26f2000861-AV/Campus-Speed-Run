import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, trackComplaint } from '@/lib/store';

/**
 * GET /api/complaints/track?id=CSR-XXXXX | REP-XXXXX — public (spec 06 §4).
 * Returns the Contract C projection + history + queue_position. Never student_id,
 * the group UUID, or raw complaint text. Legacy userId / userRole params are ignored.
 */
export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id.trim()) {
      return NextResponse.json(
        { success: false, error: 'Tracking ID (CSR-XXXXX or REP-XXXXX) is required.', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    const result = await trackComplaint(id);
    return NextResponse.json({
      success: true,
      group: result.group,
      history: result.history,
      queue_position: result.queue_position,
      // Kept for the current /track page; individual reports are never exposed.
      complaint: null,
    });
  } catch (err) {
    return errorResponse(err, 'Tracking');
  }
}
