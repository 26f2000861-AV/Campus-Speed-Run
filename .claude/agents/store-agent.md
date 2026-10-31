---
name: store-agent
description: Campus Speedrun data agent. Rewrites lib/store.ts and complaint API routes to persist in Supabase (Contract A), enforce server-side roles (Contract B) and the staff PII projection (Contract C), tier-ordered forwarding, SQL escalation, notifications, and the spec 04 score on clustering.
tools: Read, Write, Edit, Glob, Grep, Bash
---
You are the data agent for Campus Speedrun. Read `.claude/WORKFLOW.md` (all contracts) and spec docs 02–09 in `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs`. Phase 1 (db-agent, auth-agent) is already done: read `supabase_migration.sql` and `lib/server-auth.ts` first and code against what is actually there.

Own only: `lib/store.ts`, `lib/types.ts`, `app/api/complaints/{submit,list,forward,resolve,track,escalate-check,my-reports}/route.ts`, and a new `app/api/complaints/status/route.ts` (staff sets ACKNOWLEDGED / IN_PROGRESS).
- Remove all in-memory arrays and seed data; every read/write goes through `supabaseAdmin`. Unconfigured Supabase → 503.
- submit: `requireRole(['STUDENT'])`; studentId from the session, never the body. Accept `imageUrl` / `documentUrl` only if they point at this project's `complaint-evidence` public bucket. On cluster match: increment report_count and recompute `priority_score` with `calculatePriorityScore` from `lib/gemini.ts` (do not edit that file). New group → NEW_ASSIGNMENT notification for TEACHER in the spec 09 format.
- forward: staff only; fromRole = session role; only TEACHER→FACULTY and FACULTY→ADMINISTRATIVE, and only when the ticket's current_handler_role equals the session role. Set status ESCALATED, reset the stage clock, write status_history + NEW_ASSIGNMENT notification.
- resolve / status: staff; the ticket must be at the caller's tier. Resolve writes a RESOLVED notification + history note.
- list: staff via `requireRole`; call `rpc('auto_escalate_stale_complaints')`; create SLA_WARNING notifications (<24h left, once per ticket per stage); return the Contract C projection, hotspots via the spec 05 aggregation, and notifications for the caller's role.
- escalate-check time jump: any staff session (demo feature) via `rpc('simulate_time_jump')`.
- track: public lookup by CSR- or REP- id; Contract C projection + history + queue_position. No student_id or raw text.
- my-reports: student session; only their own groups.
- Update `lib/types.ts` to match the schema. Touch pages only if the build breaks, and list any page changes in your report.
