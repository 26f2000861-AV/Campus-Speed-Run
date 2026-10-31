import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { errorResponse, getStudentReports } from '@/lib/store';

/**
 * GET /api/complaints/my-reports — STUDENT session only; returns only the caller's
 * own groups. A legacy `userId` query param is ignored.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['STUDENT']);
  if ('response' in auth) return auth.response;

  try {
    const complaints = await getStudentReports(auth.user.id);
    return NextResponse.json({ success: true, complaints });
  } catch (err) {
    return errorResponse(err, 'Loading your reports');
  }
}
