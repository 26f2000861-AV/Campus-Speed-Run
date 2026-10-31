export type UserRole = 'STUDENT' | 'TEACHER' | 'FACULTY' | 'ADMINISTRATIVE';

export type DepartmentCode = 'BTECH' | 'MCA' | 'SCI' | 'INFRA' | 'IT' | 'SAN';

export type ComplaintPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ComplaintStatus =
  | 'UNACKNOWLEDGED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ESCALATED'
  | 'RESOLVED';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  identifier_no?: string;
  role: UserRole;
  department_code?: DepartmentCode | null;
  created_at: string;
}

export interface ComplaintGroup {
  id: string;
  tracking_id: string; // CSR-XXXXX
  title: string;
  normalized_title: string;
  ai_summary: string;
  category: string;
  subcategory?: string | null;
  location_zone: string;
  priority: ComplaintPriority;
  priority_score: number; // 0 - 100
  is_safety_critical: boolean;
  is_damage_prone: boolean;
  primary_department_code: DepartmentCode;
  collaborating_department_codes: DepartmentCode[];
  hashtags: string[];
  routing_reasoning: string;
  current_handler_role: UserRole;
  stage_entered_at: string;
  stage_deadline: string; // stage_entered_at + 3 days
  status: ComplaintStatus;
  report_count: number;
  escalated_to_super_admin: boolean;
  student_id: string | null;
  can_track: boolean;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  id: string;
  receipt_id: string; // REP-XXXXX
  group_id: string;
  student_id: string | null;
  is_anonymous: boolean;
  raw_text: string;
  location_zone: string;
  image_url?: string | null;
  document_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
}

export interface StatusHistory {
  id: string;
  group_id: string;
  actor_role: string;
  action: string;
  note?: string | null;
  created_at: string;
}

export type NotificationType = 'NEW_ASSIGNMENT' | 'SLA_WARNING' | 'CRITICAL_ESCALATION' | 'RESOLVED';

export interface NotificationItem {
  id: string;
  target_role: UserRole;
  department_code?: string | null;
  tracking_id: string;
  notification_type: NotificationType;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Contract C — staff / public projection of a complaint group.
// Never contains id, student_id, raw complaint text, or anything from users.
// ---------------------------------------------------------------------------
export const COMPLAINT_GROUP_VIEW_FIELDS = [
  'tracking_id',
  'title',
  'normalized_title',
  'ai_summary',
  'category',
  'subcategory',
  'location_zone',
  'priority',
  'priority_score',
  'is_damage_prone',
  'is_safety_critical',
  'primary_department_code',
  'collaborating_department_codes',
  'hashtags',
  'routing_reasoning',
  'current_handler_role',
  'stage_entered_at',
  'stage_deadline',
  'status',
  'report_count',
  'created_at',
] as const;

export type ComplaintGroupView = Pick<ComplaintGroup, (typeof COMPLAINT_GROUP_VIEW_FIELDS)[number]>;

/** Public status-history entry (track page). */
export type StatusHistoryView = Pick<StatusHistory, 'actor_role' | 'action' | 'note' | 'created_at'>;

/** GET /api/complaints/track payload. */
export interface TrackedComplaintView {
  group: ComplaintGroupView;
  history: StatusHistoryView[];
  /** 1-based rank among open groups at the current tier; null once RESOLVED. */
  queue_position: number | null;
}

/** GET /api/complaints/my-reports item: the student's own groups plus their receipt ids. */
export interface StudentReportView extends ComplaintGroupView {
  receipt_ids: string[];
  /** 1-based rank in the current tier's staff queue; null when resolved. */
  queue_position: number | null;
}

/** Campus-wide complaint counts (staff overview). Unresolved = UNACKNOWLEDGED + ESCALATED. */
export interface CampusStats {
  total: number;
  resolved: number;
  /** ACKNOWLEDGED + IN_PROGRESS */
  inProgress: number;
  unresolved: number;
  /** Open and CRITICAL or safety-critical. */
  urgent: number;
  newToday: number;
}

/** Spec 05 damage-prone hotspot aggregation (+ the hazard list the radar widget renders). */
export interface DamageHotspot {
  location_zone: string;
  total_clusters: number;
  total_student_reports: number;
  /** Alias of total_student_reports kept for the existing dashboard widget. */
  total_reports: number;
  damage_incident_count: number;
  peak_severity: number;
  hazards: Array<{ tracking_id: string; title: string; priority: ComplaintPriority; priority_score: number }>;
}

export interface GeminiTriageOutput {
  matched_cluster_id: string | null;
  normalized_title: string;
  ai_summary: string;
  category: string;
  subcategory: string;
  location_zone: string;
  priority: ComplaintPriority;
  priority_score?: number;
  is_safety_critical: boolean;
  is_damage_prone: boolean;
  primary_department_code: DepartmentCode;
  collaborating_department_codes: DepartmentCode[];
  hashtags: string[];
  routing_reasoning: string;
  confidence: number;
}

export interface StaffRegistrationCode {
  code: string;
  role: UserRole;
  department_code: DepartmentCode;
  created_at: string;
  is_used: boolean;
  used_by_email?: string;
  used_at?: string;
  note?: string;
}
