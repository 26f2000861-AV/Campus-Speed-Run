import { NextResponse } from 'next/server';
import {
  CampusStats,
  COMPLAINT_GROUP_VIEW_FIELDS,
  ComplaintGroupView,
  ComplaintPriority,
  ComplaintStatus,
  DamageHotspot,
  DepartmentCode,
  GeminiTriageOutput,
  NotificationItem,
  NotificationType,
  StatusHistoryView,
  StudentReportView,
  TrackedComplaintView,
  UserRole,
} from './types';
import { supabaseAdmin } from './supabase';
import { isAuthConfigured } from './server-auth';
import { calculatePriorityScore } from './gemini';

// ---------------------------------------------------------------------------
// Campus Speedrun data layer. Every read/write goes through the service-role
// client (RLS bypass, Contract A). There is NO in-memory store and NO fallback
// data: if Supabase is not configured, callers get a 503.
// Demo data lives in supabase_seed.sql.
// ---------------------------------------------------------------------------

export type StaffRole = Exclude<UserRole, 'STUDENT'>;
export const STAFF_ROLES: StaffRole[] = ['TEACHER', 'FACULTY', 'ADMINISTRATIVE'];

const STAGE_MS = 72 * 3600 * 1000;
const SLA_WARNING_WINDOW_MS = 24 * 3600 * 1000;

/** Only these manual forwards exist (spec 07 §3A). */
const NEXT_TIER: Partial<Record<UserRole, StaffRole>> = {
  TEACHER: 'FACULTY',
  FACULTY: 'ADMINISTRATIVE',
};

const TIER_LABEL: Record<UserRole, string> = {
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  FACULTY: 'Faculty',
  ADMINISTRATIVE: 'Administrative',
};

const PRIORITY_RANK: Record<ComplaintPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const GROUP_VIEW_COLUMNS = COMPLAINT_GROUP_VIEW_FIELDS.join(', ');
/** Internal select: the view plus the UUID needed for joins (never returned). */
const GROUP_INTERNAL_COLUMNS = `id, can_track, ${GROUP_VIEW_COLUMNS}`;
const NOTIFICATION_COLUMNS =
  'id, target_role, department_code, tracking_id, notification_type, message, is_read, created_at';

type GroupRow = ComplaintGroupView & { id: string; can_track: boolean };

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class StoreError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'StoreError';
  }
}

/** Maps a thrown error to a JSON response without leaking internals. */
export function errorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof StoreError) {
    return NextResponse.json(
      { success: false, error: err.message, ...(err.code ? { code: err.code } : {}) },
      { status: err.status }
    );
  }
  console.error(`[store] ${context}:`, err);
  return NextResponse.json({ success: false, error: `${context} failed.` }, { status: 500 });
}

function assertConfigured(): void {
  if (!isAuthConfigured()) {
    throw new StoreError(503, 'Complaint database is not configured (Supabase env vars missing).');
  }
}

function dbFail(context: string, error: { message?: string; code?: string } | null): never {
  console.error(`[store] ${context}:`, error?.code, error?.message);
  throw new StoreError(500, `Database error while ${context}.`);
}

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505';

// ---------------------------------------------------------------------------
// Projection helpers (Contract C) — explicit whitelist, never spread a row.
// ---------------------------------------------------------------------------
export function toGroupView(row: Record<string, unknown>): ComplaintGroupView {
  const view: Record<string, unknown> = {};
  for (const field of COMPLAINT_GROUP_VIEW_FIELDS) view[field] = row[field] ?? null;
  view.hashtags = Array.isArray(row.hashtags) ? row.hashtags : [];
  view.collaborating_department_codes = Array.isArray(row.collaborating_department_codes)
    ? row.collaborating_department_codes
    : [];
  return view as unknown as ComplaintGroupView;
}

function compareQueue(a: ComplaintGroupView, b: ComplaintGroupView): number {
  if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
  return new Date(a.stage_deadline).getTime() - new Date(b.stage_deadline).getTime();
}

/** 1-based rank among open groups at the group's current tier (spec 04 ordering). */
async function queuePositionFor(group: ComplaintGroupView): Promise<number | null> {
  if (group.status === 'RESOLVED') return null;
  const base = () =>
    supabaseAdmin
      .from('complaint_groups')
      .select('id', { count: 'exact', head: true })
      .eq('current_handler_role', group.current_handler_role)
      .neq('status', 'RESOLVED');

  const [higher, tied] = await Promise.all([
    base().gt('priority_score', group.priority_score),
    base().eq('priority_score', group.priority_score).lt('stage_deadline', group.stage_deadline),
  ]);
  if (higher.error) dbFail('computing queue position', higher.error);
  if (tied.error) dbFail('computing queue position', tied.error);
  return (higher.count ?? 0) + (tied.count ?? 0) + 1;
}

/** Spec 09 NEW_ASSIGNMENT message. */
function newAssignmentMessage(group: ComplaintGroupView, position: number | null): string {
  const tags = (group.hashtags || []).slice(0, 3).join(' ');
  return (
    `[#${group.tracking_id}] Priority #${position ?? 1} (${group.priority} - ${group.priority_score}/100): ` +
    `${group.normalized_title}${tags ? ` (${tags})` : ''}. Action required within 72h.`
  );
}

async function insertHistory(groupId: string, actorRole: string, action: string, note: string) {
  const { error } = await supabaseAdmin
    .from('status_history')
    .insert({ group_id: groupId, actor_role: actorRole, action, note });
  if (error) dbFail('writing status history', error);
}

async function insertNotifications(
  rows: Array<{
    target_role: UserRole;
    department_code: string | null;
    tracking_id: string;
    notification_type: NotificationType;
    message: string;
  }>
) {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from('notifications').insert(rows);
  if (error) dbFail('writing notifications', error);
}

async function getGroupByTrackingId(trackingId: string): Promise<GroupRow | null> {
  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .select(GROUP_INTERNAL_COLUMNS)
    .eq('tracking_id', normalizeId(trackingId))
    .maybeSingle();
  if (error) dbFail('loading complaint', error);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  return { ...toGroupView(row), id: row.id as string, can_track: row.can_track !== false };
}

export function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

/** Loads a ticket and asserts it is open and currently held by `role`. */
async function requireTicketAtTier(trackingId: string, role: UserRole): Promise<GroupRow> {
  if (!trackingId || typeof trackingId !== 'string') {
    throw new StoreError(400, 'trackingId is required.');
  }
  const group = await getGroupByTrackingId(trackingId);
  if (!group) throw new StoreError(404, `No ticket found for "${normalizeId(trackingId)}".`);
  if (group.status === 'RESOLVED') {
    throw new StoreError(409, `Ticket #${group.tracking_id} is already resolved.`);
  }
  if (group.current_handler_role !== role) {
    throw new StoreError(
      403,
      `Ticket #${group.tracking_id} is currently handled by ${group.current_handler_role}, not ${role}.`
    );
  }
  return group;
}

// ---------------------------------------------------------------------------
// Evidence URL validation (spec 02): only this project's public bucket.
// ---------------------------------------------------------------------------
const EVIDENCE_PREFIX = '/storage/v1/object/public/complaint-evidence/';

export function isEvidenceUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!base) return false;
  try {
    const url = new URL(value);
    const project = new URL(base);
    if (url.protocol !== 'https:' && !(project.protocol === 'http:' && url.protocol === 'http:')) return false;
    if (url.origin !== project.origin) return false;
    if (url.search || url.hash || url.username || url.password) return false;
    if (!url.pathname.startsWith(EVIDENCE_PREFIX)) return false;
    const objectPath = url.pathname.slice(EVIDENCE_PREFIX.length);
    return objectPath.length > 0 && !objectPath.includes('..') && !objectPath.includes('//');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Submit (student) — cluster or create, then store the individual report.
// ---------------------------------------------------------------------------
export async function getActiveClusters(): Promise<Array<{ id: string; title: string; location_zone: string }>> {
  assertConfigured();
  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .select('id, normalized_title, location_zone')
    .neq('status', 'RESOLVED')
    // Never merge a signed-in student's report into an untrackable guest cluster.
    .eq('can_track', true)
    .order('priority_score', { ascending: false })
    .limit(200);
  if (error) dbFail('loading active clusters', error);
  return (data || []).map((g: any) => ({
    id: g.id as string,
    title: g.normalized_title as string,
    location_zone: g.location_zone as string,
  }));
}

export async function insertComplaint(input: {
  rawText: string;
  locationZone: string;
  imageUrl: string | null;
  documentUrl: string | null;
  attachmentName: string | null;
  studentId: string | null;
  triage: GeminiTriageOutput;
  activeClusterIds: string[];
}): Promise<{
  tracking_id: string;
  receipt_id: string;
  group: ComplaintGroupView;
  can_track: boolean;
  clustered: boolean;
}> {
  assertConfigured();
  const { triage } = input;

  let group: GroupRow | null = null;
  let clustered = false;
  let createdGroupId: string | null = null;

  // --- A. Cluster match: increment report_count and recompute the spec 04 score.
  const matchId =
    triage.matched_cluster_id && input.activeClusterIds.includes(triage.matched_cluster_id)
      ? triage.matched_cluster_id
      : null;

  if (matchId) {
    for (let attempt = 0; attempt < 4 && !group; attempt++) {
      const { data: current, error } = await supabaseAdmin
        .from('complaint_groups')
        .select('id, report_count, priority, is_damage_prone, is_safety_critical, status')
        .eq('id', matchId)
        .maybeSingle();
      if (error) dbFail('loading matched cluster', error);
      if (!current || current.status === 'RESOLVED') break; // fall through to a new group

      const reportCount = (current.report_count as number) + 1;
      const currentPriority = current.priority as ComplaintPriority;
      const priority =
        PRIORITY_RANK[triage.priority] > PRIORITY_RANK[currentPriority] ? triage.priority : currentPriority;
      const isDamageProne = Boolean(current.is_damage_prone || triage.is_damage_prone);
      const isSafetyCritical = Boolean(current.is_safety_critical || triage.is_safety_critical);

      // Optimistic concurrency: only applies if no one else bumped the count meanwhile.
      const { data: updated, error: updError } = await supabaseAdmin
        .from('complaint_groups')
        .update({
          report_count: reportCount,
          priority,
          is_damage_prone: isDamageProne,
          is_safety_critical: isSafetyCritical,
          priority_score: calculatePriorityScore(priority, reportCount, isDamageProne, isSafetyCritical),
        })
        .eq('id', matchId)
        .eq('report_count', current.report_count)
        .neq('status', 'RESOLVED')
        .select(GROUP_INTERNAL_COLUMNS)
        .maybeSingle();
      if (updError) dbFail('updating matched cluster', updError);
      if (updated) {
        const row = updated as unknown as Record<string, unknown>;
        group = { ...toGroupView(row), id: row.id as string, can_track: row.can_track !== false };
        clustered = true;
      }
    }
  }

  // --- B. New master cluster (DB generates id + tracking_id; retry on collision).
  if (!group) {
    const now = Date.now();
    const newRow = {
      title: triage.normalized_title,
      normalized_title: triage.normalized_title,
      ai_summary: triage.ai_summary,
      category: triage.category || 'INFRASTRUCTURE',
      subcategory: triage.subcategory || null,
      location_zone: triage.location_zone || input.locationZone,
      priority: triage.priority,
      priority_score: calculatePriorityScore(triage.priority, 1, triage.is_damage_prone, triage.is_safety_critical),
      is_safety_critical: triage.is_safety_critical,
      is_damage_prone: triage.is_damage_prone,
      primary_department_code: triage.primary_department_code,
      collaborating_department_codes: triage.collaborating_department_codes || [],
      hashtags: triage.hashtags || [],
      routing_reasoning: triage.routing_reasoning,
      current_handler_role: 'TEACHER' as const,
      stage_entered_at: new Date(now).toISOString(),
      stage_deadline: new Date(now + STAGE_MS).toISOString(),
      status: 'UNACKNOWLEDGED' as const,
      report_count: 1,
      student_id: input.studentId,
      can_track: Boolean(input.studentId),
    };

    for (let attempt = 0; attempt < 5 && !group; attempt++) {
      const { data, error } = await supabaseAdmin
        .from('complaint_groups')
        .insert(newRow)
        .select(GROUP_INTERNAL_COLUMNS)
        .single();
      if (error) {
        if (isUniqueViolation(error)) continue; // tracking_id collision → DB picks a new one
        dbFail('creating complaint group', error);
      }
      const row = data as unknown as Record<string, unknown>;
      group = { ...toGroupView(row), id: row.id as string, can_track: row.can_track !== false };
      createdGroupId = group.id;
    }
    if (!group) throw new StoreError(500, 'Could not allocate a unique tracking id. Please retry.');
  }

  // --- C. Individual zero-PII report (DB generates id + receipt_id).
  let receiptId: string | null = null;
  for (let attempt = 0; attempt < 5 && !receiptId; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('complaints')
      .insert({
        group_id: group.id,
        student_id: input.studentId,
        is_anonymous: true,
        raw_text: input.rawText,
        location_zone: input.locationZone,
        image_url: input.imageUrl,
        document_url: input.documentUrl,
        attachment_name: input.attachmentName,
      })
      .select('receipt_id')
      .single();
    if (error) {
      if (isUniqueViolation(error)) continue;
      if (createdGroupId) await supabaseAdmin.from('complaint_groups').delete().eq('id', createdGroupId);
      dbFail('saving complaint', error);
    }
    receiptId = (data as { receipt_id: string }).receipt_id;
  }
  if (!receiptId) {
    if (createdGroupId) await supabaseAdmin.from('complaint_groups').delete().eq('id', createdGroupId);
    throw new StoreError(500, 'Could not allocate a unique receipt id. Please retry.');
  }

  // --- D. Audit + notifications.
  if (clustered) {
    await insertHistory(
      group.id,
      'STUDENT',
      'CLUSTERED',
      `Additional anonymous report merged into this cluster (report count: ${group.report_count}).`
    );
  } else {
    await insertHistory(group.id, 'STUDENT', 'SUBMITTED', 'Initial complaint filed anonymously via student portal');
    const position = await queuePositionFor(group);
    await insertNotifications([
      {
        target_role: 'TEACHER',
        department_code: group.primary_department_code,
        tracking_id: group.tracking_id,
        notification_type: 'NEW_ASSIGNMENT',
        message: newAssignmentMessage(group, position),
      },
    ]);
  }

  const { id: _id, can_track, ...view } = group;
  return { tracking_id: group.tracking_id, receipt_id: receiptId, group: view, can_track, clustered };
}

// ---------------------------------------------------------------------------
// 2. Staff dashboard list
// ---------------------------------------------------------------------------

/** Runs the SQL escalation engine (it writes its own history + CRITICAL_ESCALATION rows). */
export async function runAutoEscalation(): Promise<number> {
  assertConfigured();
  const { data, error } = await supabaseAdmin.rpc('auto_escalate_stale_complaints');
  if (error) dbFail('running auto-escalation', error);
  return typeof data === 'number' ? data : Number(data) || 0;
}

/** Demo "+3 days" jump (spec 07 §4). Returns the number of tickets escalated. */
export async function simulateTimeJump(trackingId?: string | null): Promise<number> {
  assertConfigured();
  const { data, error } = await supabaseAdmin.rpc('simulate_time_jump', {
    p_tracking_id: trackingId ? normalizeId(trackingId) : null,
  });
  if (error) dbFail('simulating time jump', error);
  return typeof data === 'number' ? data : Number(data) || 0;
}

async function getOpenGroups(): Promise<ComplaintGroupView[]> {
  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .select(GROUP_VIEW_COLUMNS)
    .neq('status', 'RESOLVED')
    .order('priority_score', { ascending: false })
    .order('stage_deadline', { ascending: true });
  if (error) dbFail('loading complaints', error);
  return ((data || []) as unknown as Record<string, unknown>[]).map(toGroupView);
}

function slaReason(g: ComplaintGroupView): string {
  if (g.is_safety_critical) return 'due to safety hazard';
  if (g.is_damage_prone) return 'due to damage-prone physical hazard';
  if (g.report_count > 1) return `due to ${g.report_count} independent student reports`;
  return `due to ${g.priority} urgency`;
}

/**
 * SLA_WARNING engine (spec 09 §3.2). For every open ticket with < 24h left on its
 * stage clock, insert ONE warning per ticket per stage. Dedupe key = (tracking_id,
 * target_role = current tier, created_at >= stage_entered_at): forwarding or
 * auto-escalation resets stage_entered_at, so the next tier gets its own warning.
 */
async function generateSlaWarnings(openGroups: ComplaintGroupView[]): Promise<NotificationItem[]> {
  const now = Date.now();
  const dueSoon = openGroups.filter((g) => {
    const left = new Date(g.stage_deadline).getTime() - now;
    return left > 0 && left <= SLA_WARNING_WINDOW_MS;
  });
  if (dueSoon.length === 0) return [];

  const { data: existing, error } = await supabaseAdmin
    .from('notifications')
    .select('tracking_id, target_role, created_at')
    .eq('notification_type', 'SLA_WARNING')
    .in(
      'tracking_id',
      dueSoon.map((g) => g.tracking_id)
    );
  if (error) dbFail('loading SLA warnings', error);

  const byTier = new Map<string, ComplaintGroupView[]>();
  for (const g of openGroups) {
    const list = byTier.get(g.current_handler_role) || [];
    list.push(g);
    byTier.set(g.current_handler_role, list);
  }
  byTier.forEach((list) => list.sort(compareQueue));

  const rows = dueSoon
    .filter((g) => {
      const stageStart = new Date(g.stage_entered_at).getTime();
      return !(existing || []).some(
        (n: any) =>
          n.tracking_id === g.tracking_id &&
          n.target_role === g.current_handler_role &&
          new Date(n.created_at).getTime() >= stageStart
      );
    })
    .map((g) => {
      const tierQueue = byTier.get(g.current_handler_role) || [g];
      const position = tierQueue.findIndex((x) => x.tracking_id === g.tracking_id) + 1;
      const lower = tierQueue.length - position;
      const hoursLeft = Math.floor((new Date(g.stage_deadline).getTime() - now) / 3600000);
      const timeText = hoursLeft >= 1 ? `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}` : 'less than 1 hour';
      const next = NEXT_TIER[g.current_handler_role];
      const clause = next
        ? `before automatic escalation to ${next}`
        : `on the ${g.current_handler_role} 72h SLA`;
      const rankText =
        lower > 0
          ? `Ranked above ${lower} lower-priority issue${lower === 1 ? '' : 's'} ${slaReason(g)}.`
          : `Ranked #${position} in the ${g.current_handler_role} queue ${slaReason(g)}.`;
      return {
        target_role: g.current_handler_role,
        department_code: g.primary_department_code,
        tracking_id: g.tracking_id,
        notification_type: 'SLA_WARNING' as const,
        message: `URGENT REMINDER: Ticket #${g.tracking_id} has ${timeText} left ${clause}. ${rankText}`,
      };
    });

  if (rows.length === 0) return [];
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('notifications')
    .insert(rows)
    .select(NOTIFICATION_COLUMNS);
  if (insertError) dbFail('writing notifications', insertError);
  return (inserted || []) as NotificationItem[];
}

/** Spec 05 aggregation over open clusters, grouped by location_zone. */
function aggregateHotspots(openGroups: ComplaintGroupView[]): DamageHotspot[] {
  const zones = new Map<string, DamageHotspot>();
  for (const g of openGroups) {
    const zone = zones.get(g.location_zone) || {
      location_zone: g.location_zone,
      total_clusters: 0,
      total_student_reports: 0,
      total_reports: 0,
      damage_incident_count: 0,
      peak_severity: 0,
      hazards: [],
    };
    zone.total_clusters += 1;
    zone.total_student_reports += g.report_count;
    zone.total_reports = zone.total_student_reports;
    zone.peak_severity = Math.max(zone.peak_severity, g.priority_score);
    if (g.is_damage_prone) {
      zone.damage_incident_count += 1;
      zone.hazards.push({
        tracking_id: g.tracking_id,
        title: g.normalized_title,
        priority: g.priority,
        priority_score: g.priority_score,
      });
    }
    zones.set(g.location_zone, zone);
  }
  return Array.from(zones.values())
    .filter((z) => z.damage_incident_count > 0)
    .sort((a, b) => b.damage_incident_count - a.damage_incident_count || b.peak_severity - a.peak_severity);
}

export async function getStaffDashboard(
  role: StaffRole,
  filter: { hashtag?: string; locationZone?: string; department?: DepartmentCode } = {}
): Promise<{
  complaints: ComplaintGroupView[];
  /** Open complaints at every tier (Contract C view), for the read-only hierarchy view. */
  allOpen: ComplaintGroupView[];
  hotspots: DamageHotspot[];
  notifications: NotificationItem[];
  escalated: number;
}> {
  assertConfigured();
  // Read the open queue first; only run the escalation engine (and re-read) when a
  // Tier 1/2 stage clock has actually expired. Saves a round trip on most loads.
  let openGroups = await getOpenGroups();
  const now = Date.now();
  const anyExpired = openGroups.some(
    (g) => g.current_handler_role !== 'ADMINISTRATIVE' && new Date(g.stage_deadline).getTime() <= now
  );
  let escalated = 0;
  if (anyExpired) {
    escalated = await runAutoEscalation();
    if (escalated > 0) openGroups = await getOpenGroups();
  }
  // The SLA check/insert and the notification read are independent round trips:
  // run them together, then fold in any warnings created by this request.
  const [newWarnings, notifResult] = await Promise.all([
    generateSlaWarnings(openGroups),
    supabaseAdmin
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('target_role', role)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (notifResult.error) dbFail('loading notifications', notifResult.error);
  const seenIds = new Set(((notifResult.data || []) as NotificationItem[]).map((n) => n.id));
  const notifications = [
    ...newWarnings.filter((n) => n.target_role === role && !seenIds.has(n.id)),
    ...((notifResult.data || []) as NotificationItem[]),
  ].slice(0, 50);

  const hashtag = filter.hashtag?.toLowerCase();
  const complaints = openGroups
    .filter((g) => g.current_handler_role === role)
    .filter((g) => !hashtag || g.hashtags.some((h) => h.toLowerCase() === hashtag))
    .filter((g) => !filter.locationZone || g.location_zone === filter.locationZone)
    .filter(
      (g) =>
        !filter.department ||
        g.primary_department_code === filter.department ||
        g.collaborating_department_codes.includes(filter.department)
    )
    .sort(compareQueue);

  return {
    complaints,
    allOpen: [...openGroups].sort(compareQueue),
    hotspots: aggregateHotspots(openGroups),
    notifications,
    escalated,
  };
}

/**
 * Campus-wide counts for the staff overview (activity rings + metric cards) and
 * the most recently resolved tickets. Aggregates and the Contract C view only.
 */
export async function getCampusStats(): Promise<{ stats: CampusStats; recentResolved: ComplaintGroupView[] }> {
  assertConfigured();
  const [countsResult, resolvedResult] = await Promise.all([
    supabaseAdmin.from('complaint_groups').select('status, priority, is_safety_critical, created_at'),
    supabaseAdmin
      .from('complaint_groups')
      .select(GROUP_VIEW_COLUMNS)
      .eq('status', 'RESOLVED')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (countsResult.error) dbFail('loading campus stats', countsResult.error);
  if (resolvedResult.error) dbFail('loading resolved complaints', resolvedResult.error);

  const rows = (countsResult.data || []) as Array<{
    status: ComplaintStatus;
    priority: ComplaintPriority;
    is_safety_critical: boolean;
    created_at: string;
  }>;
  const now = Date.now();
  const stats: CampusStats = { total: rows.length, resolved: 0, inProgress: 0, unresolved: 0, urgent: 0, newToday: 0 };
  for (const r of rows) {
    if (r.status === 'RESOLVED') stats.resolved++;
    else if (r.status === 'ACKNOWLEDGED' || r.status === 'IN_PROGRESS') stats.inProgress++;
    else stats.unresolved++;
    if (r.status !== 'RESOLVED' && (r.priority === 'CRITICAL' || r.is_safety_critical)) stats.urgent++;
    if (now - Date.parse(r.created_at) < 86_400_000) stats.newToday++;
  }
  return {
    stats,
    recentResolved: ((resolvedResult.data || []) as unknown as Record<string, unknown>[]).map(toGroupView),
  };
}

// ---------------------------------------------------------------------------
// 3. Staff actions: forward / resolve / status
// ---------------------------------------------------------------------------
export async function forwardComplaint(
  trackingId: string,
  fromRole: StaffRole,
  requestedToRole?: string | null,
  staffNote?: string | null
): Promise<{ tracking_id: string; from_role: StaffRole; to_role: StaffRole; group: ComplaintGroupView }> {
  assertConfigured();
  const toRole = NEXT_TIER[fromRole];
  if (!toRole) {
    throw new StoreError(400, `${fromRole} is the final tier; tickets cannot be forwarded further.`);
  }
  if (requestedToRole && requestedToRole !== toRole) {
    throw new StoreError(400, `${fromRole} can only forward to ${toRole}.`);
  }

  const current = await requireTicketAtTier(trackingId, fromRole);
  const now = Date.now();

  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .update({
      current_handler_role: toRole,
      stage_entered_at: new Date(now).toISOString(),
      stage_deadline: new Date(now + STAGE_MS).toISOString(),
      status: 'ESCALATED',
      ...(toRole === 'ADMINISTRATIVE' ? { escalated_to_super_admin: true } : {}),
    })
    .eq('id', current.id)
    .eq('current_handler_role', fromRole) // guards against a concurrent forward / auto-escalation
    .neq('status', 'RESOLVED')
    .select(GROUP_VIEW_COLUMNS)
    .maybeSingle();
  if (error) dbFail('forwarding complaint', error);
  if (!data) throw new StoreError(409, `Ticket #${current.tracking_id} changed while forwarding. Refresh and retry.`);
  const group = toGroupView(data as unknown as Record<string, unknown>);

  const extra = cleanNote(staffNote, 500);
  await insertHistory(
    current.id,
    fromRole,
    'FORWARDED',
    `Manually forwarded from ${TIER_LABEL[fromRole]} to ${TIER_LABEL[toRole]}${extra ? ` — ${extra}` : ''}`
  );
  const position = await queuePositionFor(group);
  await insertNotifications([
    {
      target_role: toRole,
      department_code: group.primary_department_code,
      tracking_id: group.tracking_id,
      notification_type: 'NEW_ASSIGNMENT',
      message: newAssignmentMessage(group, position),
    },
  ]);

  return { tracking_id: group.tracking_id, from_role: fromRole, to_role: toRole, group };
}

export async function resolveComplaint(
  trackingId: string,
  role: StaffRole,
  resolutionNote?: string | null
): Promise<{ tracking_id: string; group: ComplaintGroupView }> {
  assertConfigured();
  const current = await requireTicketAtTier(trackingId, role);
  const note = cleanNote(resolutionNote, 1000) || `Problem verified resolved by ${TIER_LABEL[role]}`;

  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .update({ status: 'RESOLVED' })
    .eq('id', current.id)
    .eq('current_handler_role', role)
    .neq('status', 'RESOLVED')
    .select(GROUP_VIEW_COLUMNS)
    .maybeSingle();
  if (error) dbFail('resolving complaint', error);
  if (!data) throw new StoreError(409, `Ticket #${current.tracking_id} changed while resolving. Refresh and retry.`);
  const group = toGroupView(data as unknown as Record<string, unknown>);

  await insertHistory(current.id, role, 'RESOLVED', note);
  await insertNotifications([
    {
      target_role: role,
      department_code: group.primary_department_code,
      tracking_id: group.tracking_id,
      notification_type: 'RESOLVED',
      message: `RESOLVED: Ticket #${group.tracking_id} (${group.normalized_title}) was resolved by ${role}. Note: ${note}`,
    },
  ]);

  return { tracking_id: group.tracking_id, group };
}

const SETTABLE_STATUSES: ComplaintStatus[] = ['ACKNOWLEDGED', 'IN_PROGRESS'];

export async function updateComplaintStatus(
  trackingId: string,
  role: StaffRole,
  status: string,
  staffNote?: string | null
): Promise<{ tracking_id: string; group: ComplaintGroupView }> {
  assertConfigured();
  if (!SETTABLE_STATUSES.includes(status as ComplaintStatus)) {
    throw new StoreError(400, 'status must be ACKNOWLEDGED or IN_PROGRESS.');
  }
  const current = await requireTicketAtTier(trackingId, role);

  const { data, error } = await supabaseAdmin
    .from('complaint_groups')
    .update({ status })
    .eq('id', current.id)
    .eq('current_handler_role', role)
    .neq('status', 'RESOLVED')
    .select(GROUP_VIEW_COLUMNS)
    .maybeSingle();
  if (error) dbFail('updating complaint status', error);
  if (!data) throw new StoreError(409, `Ticket #${current.tracking_id} changed while updating. Refresh and retry.`);
  const group = toGroupView(data as unknown as Record<string, unknown>);

  const extra = cleanNote(staffNote, 500);
  const defaultNote =
    status === 'ACKNOWLEDGED'
      ? `${TIER_LABEL[role]} acknowledged the ticket and verified its priority rank`
      : `${TIER_LABEL[role]} marked execution as in progress`;
  await insertHistory(current.id, role, status, extra || defaultNote);

  return { tracking_id: group.tracking_id, group };
}

function cleanNote(note: unknown, max: number): string {
  if (typeof note !== 'string') return '';
  return note.trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// 4. Public tracking (spec 06 §4) — by CSR- or REP- id.
// ---------------------------------------------------------------------------
const TRACK_ID_PATTERN = /^(CSR|REP)-\d{5}$/;

export async function trackComplaint(rawId: string): Promise<TrackedComplaintView> {
  assertConfigured();
  const id = normalizeId(rawId || '');
  if (!TRACK_ID_PATTERN.test(id)) {
    throw new StoreError(400, 'Enter a valid tracking id (CSR-XXXXX or REP-XXXXX).', 'INVALID_ID');
  }

  let group: GroupRow | null = null;
  if (id.startsWith('CSR-')) {
    group = await getGroupByTrackingId(id);
  } else {
    const { data, error } = await supabaseAdmin
      .from('complaints')
      .select('group_id')
      .eq('receipt_id', id)
      .maybeSingle();
    if (error) dbFail('loading receipt', error);
    if (data) {
      const { data: g, error: gError } = await supabaseAdmin
        .from('complaint_groups')
        .select(GROUP_INTERNAL_COLUMNS)
        .eq('id', (data as { group_id: string }).group_id)
        .maybeSingle();
      if (gError) dbFail('loading complaint', gError);
      if (g) {
        const row = g as unknown as Record<string, unknown>;
        group = { ...toGroupView(row), id: row.id as string, can_track: row.can_track !== false };
      }
    }
  }

  if (!group) {
    throw new StoreError(404, `No ticket found for "${id}". Please check the reference code.`, 'NOT_FOUND');
  }
  if (!group.can_track) {
    throw new StoreError(
      422,
      `Tracking unavailable: Ticket #${group.tracking_id} cannot be tracked because it was submitted as an untracked guest report. Only complaints submitted while signed in to an account can be tracked.`,
      'UNTRACKABLE_GUEST'
    );
  }

  const { data: hist, error: histError } = await supabaseAdmin
    .from('status_history')
    .select('actor_role, action, note, created_at')
    .eq('group_id', group.id)
    .order('created_at', { ascending: true });
  if (histError) dbFail('loading status history', histError);

  const { id: _id, can_track: _ct, ...view } = group;
  return {
    group: view,
    history: (hist || []) as StatusHistoryView[],
    queue_position: await queuePositionFor(view),
  };
}

// ---------------------------------------------------------------------------
// 5. Student's own reports
// ---------------------------------------------------------------------------
export async function getStudentReports(studentId: string): Promise<StudentReportView[]> {
  assertConfigured();
  const { data: reports, error } = await supabaseAdmin
    .from('complaints')
    .select('group_id, receipt_id, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) dbFail('loading student reports', error);

  const receiptsByGroup = new Map<string, string[]>();
  for (const r of (reports || []) as Array<{ group_id: string; receipt_id: string }>) {
    const list = receiptsByGroup.get(r.group_id) || [];
    list.push(r.receipt_id);
    receiptsByGroup.set(r.group_id, list);
  }

  // Groups the student opened (student_id) or reported into (complaints.student_id).
  const groupIds = Array.from(receiptsByGroup.keys());
  const filter = groupIds.length
    ? `student_id.eq.${studentId},id.in.(${groupIds.join(',')})`
    : `student_id.eq.${studentId}`;
  const { data: groups, error: gError } = await supabaseAdmin
    .from('complaint_groups')
    .select(GROUP_INTERNAL_COLUMNS)
    .or(filter)
    .eq('can_track', true)
    .order('created_at', { ascending: false });
  if (gError) dbFail('loading student reports', gError);

  const rows = (groups || []) as unknown as Record<string, unknown>[];
  const views = rows.map(toGroupView);

  // Queue positions for every open report from ONE query: rank the open queue of
  // each tier the student's tickets sit in (spec 04 order: score desc, deadline asc).
  const tiers = Array.from(new Set(views.filter((v) => v.status !== 'RESOLVED').map((v) => v.current_handler_role)));
  const rankByTracking = new Map<string, number>();
  if (tiers.length) {
    const { data: open, error: qError } = await supabaseAdmin
      .from('complaint_groups')
      .select('tracking_id, current_handler_role, priority_score, stage_deadline')
      .neq('status', 'RESOLVED')
      .in('current_handler_role', tiers);
    if (qError) dbFail('computing queue positions', qError);
    const byTier = new Map<string, ComplaintGroupView[]>();
    for (const g of (open || []) as unknown as ComplaintGroupView[]) {
      const list = byTier.get(g.current_handler_role) || [];
      list.push(g);
      byTier.set(g.current_handler_role, list);
    }
    byTier.forEach((list) => {
      list.sort(compareQueue).forEach((g, i) => rankByTracking.set(g.tracking_id, i + 1));
    });
  }

  return views.map((view, i) => ({
    ...view,
    receipt_ids: receiptsByGroup.get(rows[i].id as string) || [],
    // Where the ticket sits in its current tier's staff queue (null once resolved).
    queue_position: view.status === 'RESOLVED' ? null : rankByTracking.get(view.tracking_id) ?? null,
  }));
}
