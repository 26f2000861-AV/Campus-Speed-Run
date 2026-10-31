# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15/16 (App Router) + TypeScript + Tailwind CSS + Supabase (PostgreSQL, Supabase Auth, Storage) + Google Gemini API (`gemini-2.5-flash`).

## Users

- **Students (Primary Reporters):** Enrolled students experiencing academic, laboratory, technical, infrastructure, or sanitation issues. Require immediate, frictionless reporting with guaranteed 100% anonymity to eliminate fear of faculty bias or academic retribution.
- **Teachers (Tier 1 Handlers):** First line of departmental triage. Review assigned tickets, acknowledge, resolve, or forward to Faculty within a 72-hour SLA window.
- **Faculty Members (Tier 2 Handlers):** Departmental authority handling escalated issues requiring higher administrative oversight or cross-department coordination. Resolve or forward to Administrative Command within 72 hours.
- **Administrative Command (Tier 3 Handlers):** Institutional authorities receiving final escalations, high-cost maintenance items, and campus-wide infrastructure concerns.

## Product Purpose

Campus Speedrun is an AI-powered academic and infrastructure issue triage engine designed to eliminate bureaucratic stagnation, remove student reporting anxiety, and rapidly resolve campus hazards. Success means issues are autonomously classified and summarized by Gemini AI, scored and prioritized by objective risk rather than chronological filing time, and driven to resolution through a strict 3-tier, 72-hour auto-escalating accountability chain.

## Positioning

Unlike traditional campus portals that bury urgent physical hazards in chronological queues, require tedious departmental identification by students, and leak student identities to grading faculty, Campus Speedrun guarantees:
1. Zero-PII anonymity through dual unique identifiers (`CSR-XXXXX` and `REP-XXXXX`).
2. Instant multimodal AI triage via Gemini 2.5 Flash for summarization, duplicate clustering, priority scoring (0–100), and damage radar detection.
3. A strict 3-day (72-hour) auto-escalation mechanism across Teachers, Faculty, and Administrators that prevents tickets from lingering unresolved.

## Operating Context

- **Academic & Operational Facilities:** B.Tech engineering labs, MCA computer halls, Applied Sciences chemistry/physics labs, academic block classrooms, and campus infrastructure.
- **Intake Touchpoints:** High-friction moments when students discover hazards (broken ceiling fans, sparking electrical outlets, lab chemical leaks, Wi-Fi outages, washroom sanitation failures).
- **Staff Workspaces:** Triage queues on desktop and tablet browsers, featuring AI priority ranking, hashtag filters (`#BTech`, `#LabDamage`, `#Sanitation`), SLA countdown clocks, and demonstration time-jump tools.
- **Strict Scope Boundary:** Institutional, academic, and campus infrastructure only. Hostels (`HST`, `#Hostel`) are strictly excluded from scope, database taxonomy, and AI prompts.

## Capabilities and Constraints

- **Email-Only Authentication:** Single auth flow for email + password only across `STUDENT`, `TEACHER`, `FACULTY`, and `ADMINISTRATIVE` roles. No Google OAuth, social login, or magic links. Auto-confirm enabled for rapid evaluation.
- **Zero-PII Anonymity Pipeline:**
  - Student identity is never joined or exposed to staff dashboards, queries, or AI summaries.
  - Complaints are tracked via human-readable IDs (`CSR-XXXXX` cluster tracking ID, `REP-XXXXX` personal receipt ID).
- **Multimodal Intake:**
  - Multi-line problem description (15–2000 chars) and standardized academic location zone selection.
  - Image attachments (JPEG, PNG, WebP up to 8MB) and document attachments (PDF, DOCX, TXT up to 10MB) stored in Supabase Storage (`complaint-evidence`) with randomized UUID filenames to prevent metadata leakage.
- **Gemini AI Auto-Bot (`gemini-2.5-flash`):**
  - Synthesizes `normalized_title` and 2–3 sentence executive `ai_summary` (Problem Narration + Impact Assessment + Recommended Execution) while purging self-identifying markers.
  - Compares incoming reports against active tickets for duplicate cluster matching (`matched_cluster_id`) and increments `report_count`.
  - Routes to 6 approved departments: `BTECH`, `MCA`, `SCI`, `INFRA`, `IT`, `SAN` with structured hashtags (e.g. `#BTech`, `#LabDamage`, `#Infrastructure`, `#Sanitation`).
  - Computes `priority_score` (0–100): `min(100, BaseWeight(priority) + min(15, (report_count - 1)*3) + (is_damage_prone ? 10 : 0) + (is_safety_critical ? 15 : 0))`.
  - Flags `is_damage_prone` and `is_safety_critical` for physical hazard detection.
- **3-Tier, 72-Hour Auto-Escalation State Machine:**
  - `TEACHER` (Tier 1) -> 72h window -> `FACULTY` (Tier 2) -> 72h window -> `ADMINISTRATIVE` (Tier 3).
  - Manual forwarding actions immediately advance tickets; inactivity triggers backend auto-escalation.
  - Includes a "Simulate +3 Days Time Jump" feature for demonstration and testing.
- **Dual-Axis Process Tracker & Timed Notifications:**
  - Authority Stepper: Teacher -> Faculty -> Administrative.
  - Status Pipeline: `UNACKNOWLEDGED` -> `ACKNOWLEDGED` -> `IN_PROGRESS` -> `ESCALATED` -> `RESOLVED`.
  - Timed notifications for new assignments, SLA warnings (<24h), and auto-escalations.
- **Strict Anti-Scope Exclusion:** Hostels (`HST`, `#Hostel`, `#BoysHostel`, `#GirlsHostel`) must not appear in any UI, schema enum, or AI prompt.

## Brand Commitments

- **Product Name:** Campus Speedrun
- **Subtitle / Tagline:** "AI-Powered Academic & Infrastructure Triage Engine"
- **Visual Tone:** Professional, institutional, high-clarity, and urgent. Dark slate foundation (`bg-slate-950`) with high-contrast functional color-coding for priorities (CRITICAL crimson, HIGH amber, MEDIUM indigo, LOW slate).
- **Terminology:** Consistent terminology across ticket codes (`CSR-XXXXX`), urgency levels (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), and department tags (`#BTech`, `#Infrastructure`, etc.).

## Evidence on Hand

- Complete specifications and technical documentation in `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs`:
  - `PROJECT_CONTEXT.md`: System overview, user journeys, 3-tier rules, and department boundaries.
  - `docs/01_HOME_AND_EMAIL_AUTH.md`: Minimal landing and email-only auth routing.
  - `docs/02_STUDENT_SUBMISSION_AND_UPLOADS.md`: Multimodal intake and receipt card specs.
  - `docs/03_GEMINI_SORTING_AND_SUMMARIZATION.md`: Gemini 2.5 Flash schema and clustering.
  - `docs/04_URGENCY_AND_PRIORITY_QUEUE.md`: Urgency tiers, formula, and self-justifying priority queue.
  - `docs/05_DAMAGE_PRONE_AREAS_DETECTION.md`: Damage radar widget and location zone aggregation.
  - `docs/06_UNIQUE_COMPLAINT_ID_AND_ANONYMITY.md`: Zero-PII protocols and dual ID structure.
  - `docs/07_THREE_TIER_ESCALATION_PIPELINE.md`: 72-hour state machine and time jump simulator.
  - `docs/08_HASHTAG_ROUTING_NO_HOSTELS.md`: Taxonomy of 6 departments and non-hostel boundaries.
  - `docs/09_PROCESS_TRACKER_AND_NOTIFICATIONS.md`: 2D status tracking and notification types.
  - `docs/10_MULTI_AI_ORCHESTRATION_GUIDE.md`: App Router file structure and component roles.

## Product Principles

- **Guaranteed Anonymity Over Everything:** Students must never face exposure, retaliation, or hesitation when reporting campus hazards or broken equipment.
- **Objective Hazard Priority:** Immediate physical dangers (sparking fans, exposed wiring, chemical leaks) automatically jump to the top of the queue, overriding chronological order.
- **Strict Anti-Stagnation SLA:** No complaint sits abandoned in an inbox; the 72-hour escalation clock enforces accountability up to institutional administration.
- **Zero-Friction Utility:** Clean, focused interfaces without social login clutter, marketing fluff, or unnecessary bureaucratic steps.

## Accessibility & Inclusion

- Dark UI designed with WCAG AA compliance (4.5:1 minimum text contrast against dark backgrounds).
- Urgency and priority indicators must pair color with unambiguous text labels, numeric scores, and icons to support color-blind users.
- Form inputs, interactive hashtag chips, and file upload zones must feature full keyboard navigation, clear visible focus states, and ARIA live regions for status changes.
