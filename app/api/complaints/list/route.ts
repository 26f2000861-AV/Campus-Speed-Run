import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/server-auth';
import { DepartmentCode } from '@/lib/types';
import { STAFF_ROLES, StaffRole, errorResponse, getCampusStats, getStaffDashboard } from '@/lib/store';

const DEPARTMENTS: DepartmentCode[] = ['BTECH', 'MCA', 'SCI', 'INFRA', 'IT', 'SAN'];

/**
 * GET /api/complaints/list — staff only. The tier is ALWAYS the session role;
 * a `role` query param (still sent by the dashboard) is ignored.
 * Optional filters: hashtag, locationZone, department.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, STAFF_ROLES);
  if ('response' in auth) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const hashtag = searchParams.get('hashtag')?.trim() || undefined;
    const locationZone = searchParams.get('locationZone')?.trim() || undefined;
    const deptParam = searchParams.get('department')?.trim().toUpperCase();
    const department = DEPARTMENTS.includes(deptParam as DepartmentCode)
      ? (deptParam as DepartmentCode)
      : undefined;

    const role = auth.user.role as StaffRole;
    const result = await getStaffDashboard(role, { hashtag, locationZone, department });
    // After the dashboard read so any auto-escalation it ran is reflected in the counts.
    const campus = await getCampusStats();

    return NextResponse.json({
      success: true,
      role,
      complaints: result.complaints,
      chain: result.allOpen,
      hotspots: result.hotspots,
      notifications: result.notifications,
      escalated: result.escalated,
      stats: campus.stats,
      recentResolved: campus.recentResolved,
      // Same rule as /api/complaints/escalate-check, so the UI never offers a button the server rejects.
      canTimeJump: role === 'ADMINISTRATIVE' || process.env.DEMO_TIME_JUMP === 'true',
    });
  } catch (err) {
    return errorResponse(err, 'Loading complaints');
  }
}
