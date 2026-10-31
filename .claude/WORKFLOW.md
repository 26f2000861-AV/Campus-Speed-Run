# Campus Speedrun — Agent Fix Workflow

Source of truth: `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs` (PROJECT_CONTEXT.md + docs/01–10).
Agent definitions: `.claude/agents/*.md`. Each agent owns a fixed set of files and must not edit files outside it.
This folder is not a git repo; a pre-change backup lives in the session scratchpad (`backup-pre-agents`).

## Global rules (every agent)
- Read the spec docs relevant to your scope before editing.
- Never connect to, migrate, or write the live Supabase project. Never print or copy values from `.env.local`.
- Typecheck with `npx tsc --noEmit` before finishing; report remaining errors that belong to other agents' files.
- Match the surrounding code style (TypeScript, Next.js 15 App Router, Tailwind, lucide-react).
- No hostels (`HST`, `#Hostel`, …) anywhere.
- No in-memory / fake fallbacks for data or auth. If Supabase is not configured, fail with a clear 503 error.
- Finish with a short report: files changed, contract deviations (if any), open issues.

## Phases and file ownership

| Phase | Agent | Owns | Fixes |
|---|---|---|---|
| 1 | `db-agent` | `supabase_migration.sql`, `supabase_seed.sql` (new) | P0 #2 schema, #3 RLS/storage, SQL escalation fn |
| 1 | `auth-agent` | `lib/server-auth.ts` (new), `middleware.ts` (new), `app/api/auth/**`, `app/api/admin/**`, `lib/staff-codes.ts`, `lib/auth-context.tsx`, `app/login/page.tsx`, `app/admin/page.tsx`, `components/Navbar.tsx` | P0 #5 auth spoofing, spec 01 redirects |
| 2 | `store-agent` | `lib/store.ts`, `lib/types.ts`, `app/api/complaints/{submit,list,forward,resolve,track,escalate-check,my-reports}/route.ts`, new status routes under `app/api/complaints/` | P0 #1 persistence, #6 PII leak, P1 escalation/forward/notifications/clustering |
| 2 | `triage-agent` | `lib/gemini.ts` | P1 model, taxonomy validation, damage floor |
| 2 | `uploads-agent` | `app/api/complaints/upload/route.ts` (new), `app/student/submit/page.tsx` | P0 #4 uploads, spec 01 §5 no guest submit |
| 3 | `ui-agent` | every `app/**/page.tsx`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/**`, `DESIGN.md` | P2 briefing card, anonymous label, queue position, ack/in-progress buttons, dark slate theme (user chose spec theme) |
| 4 | `review-agent` | read-only | Verifies every P0/P1 item against specs, runs tsc + `next build` |

Phase 2 starts only after Phase 1 reports are in; Phase 3 after Phase 2.

## Status (2026-10-31)
- Phases 1, 2, 4 done. Review: all P0/P1 items PASS; `tsc` + `next build` clean.
- Review defects fixed: student reports no longer merge into `can_track=false` clusters; time jump is ADMINISTRATIVE-only unless `DEMO_TIME_JUMP=true`; time jump skips Tier 3; seed scores match spec 04.
- Open (low): logout doesn't revoke an expired-token session's refresh token; clustered reports don't refresh `ai_summary`; failed report insert after a cluster match leaves `report_count` +1; orphaned uploads aren't cleaned up; concurrent `/list` can duplicate SLA_WARNING.
- User decision: `app/page.tsx` is the ORIGINAL light homepage (restored from backup), wrapped in a light `bg-[#F8FAFC]` container inside the dark shell. Don't re-theme it. Note it still links signed-in students to `/dashboard` (original behaviour).
- Phase 3 (ui-agent) DONE with dark slate theme; tsc + build clean; landing/track/login render, middleware redirect verified in browser (signed out only). Shared UI primitives in `components/ui.tsx`. Signed-in flows not yet exercised (need DB migrated).
- Phase 3 original to-do (for reference): Known UI items: dashboard `key={ticket.id}` → `tracking_id`; role switcher should follow the session role; add Acknowledge / In-Progress buttons (`/api/complaints/status`); track page must stop sending `userId`/`userRole` in the URL; `app/page.tsx:38` student link → `/student/submit`; Daily AI Briefing card; "Reported by Anonymous Student" label; queue position on /track.
- 2026-10-31: migration + seed RUN on Supabase project hivtungnhbxcngebfokm (verified: 6 depts, 5 seed tickets, RLS on 7 tables, 2 functions, bucket).
- E2E: 75/75 API checks pass (scratchpad script e2e.mjs; accounts in `.claude/test-accounts.local.json`). Dashboard verified signed in as teacher.
- Gemini: `gemini-2.5-flash` returns 404 for new keys → default is now `gemini-3.5-flash-lite` (override `GEMINI_MODEL`), one retry on 503/429. Spec deviation, user informed.
- Clustering now falls back to the heuristic match when the model returns null; heuristic titles name the fault; fallback summary no longer quotes raw text.
- Test data cleanup: `supabase_cleanup_e2e.sql` (user to run).

## Contract A — database (produced by db-agent, consumed by store-agent)
- All primary keys are DB-generated UUIDs. App code never supplies `id`; it reads the returned row (`.select().single()`).
- `complaint_groups` adds: `student_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL`, `can_track BOOLEAN NOT NULL DEFAULT TRUE`.
- `public.departments(code TEXT PK CHECK code IN ('BTECH','MCA','SCI','INFRA','IT','SAN'), name TEXT, hashtags TEXT[])` seeded with the 6 departments from spec 08.
- RLS ENABLED on every public table. Server routes use the service-role client. Only policy for normal users: `users` — authenticated user may `SELECT` their own row. No anon policies.
- Storage bucket `complaint-evidence`: public read; NO anon/authenticated INSERT policy (uploads go through the service-role API route).
- `auto_escalate_stale_complaints()` returns `INTEGER` (total escalated across both tiers), writes `status_history` rows and `notifications` rows of type `CRITICAL_ESCALATION` with the spec 09 message format.
- `simulate_time_jump(p_tracking_id TEXT DEFAULT NULL)` returns `INTEGER`: sets `stage_deadline = NOW() - INTERVAL '1 hour'` on non-resolved groups (all, or the one tracking id), then calls `auto_escalate_stale_complaints()` and returns its count.
- `notifications.notification_type` CHECK IN ('NEW_ASSIGNMENT','SLA_WARNING','CRITICAL_ESCALATION','RESOLVED').
- `supabase_seed.sql`: the demo tickets currently hard-coded in `lib/store.ts` (CSR-48291, CSR-83920, CSR-19402, CSR-74109, CSR-55201) with `student_id NULL`.

## Contract B — server auth (produced by auth-agent, consumed by store/uploads agents)
`lib/server-auth.ts` exports:
```ts
export interface SessionUser { id: string; email: string; role: UserRole; department_code: DepartmentCode | null }
export async function getSessionUser(req: NextRequest): Promise<SessionUser | null>
export async function requireRole(req: NextRequest, roles: UserRole[]):
  Promise<{ user: SessionUser } | { response: NextResponse }> // 401 if no session, 403 if wrong role
```
- Session = httpOnly, Secure-in-prod, SameSite=Lax cookies `csr_access` / `csr_refresh` holding Supabase tokens, set by `/api/auth/login` and `/api/auth/register`, cleared by `/api/auth/logout`.
- `getSessionUser` verifies the access token with `supabaseAdmin.auth.getUser`, refreshes when expired, and reads `role`/`department_code` from `public.users` (never from client input or user_metadata).
- `GET /api/auth/me` returns the SessionUser (or 401). The client `AuthContext` gets user state only from `/api/auth/me`; no role in localStorage/cookies readable by JS.
- `middleware.ts`: no `csr_access` cookie → redirect `/student/submit` and `/dashboard` to `/login`.
- Post-login redirect: STUDENT → `/student/submit`; staff → `/dashboard?role=<ROLE>` (spec 01 §4).
- Admin: `/admin` and `/api/admin/**` require an ADMINISTRATIVE session OR the `ADMIN_PASSCODE` env var (exact match, no defaults, no substring checks).
- Staff code is consumed only after the Supabase user is created successfully.

## Contract C — staff projection (store-agent)
Staff-facing responses (`list`, notifications) return only: `tracking_id, title, normalized_title, ai_summary, category, subcategory, location_zone, priority, priority_score, is_damage_prone, is_safety_critical, primary_department_code, collaborating_department_codes, hashtags, routing_reasoning, current_handler_role, stage_entered_at, stage_deadline, status, report_count, created_at`. Never `student_id`, `id`, raw complaint text, or anything from `users`.
`/api/complaints/track` (public per spec 06 §4) returns the same projection plus `history` (actor_role, action, note, created_at) and `queue_position` (rank among open groups for the current tier).

## Status update (2026-10-31, evening): impeccable audit + critique pass
- Audit 14 → 20/20 (`.claude/reports/impeccable-audit-final.md`). Critique 22 → 27/40 measured, plus a round-2 fix pass (`.claude/reports/impeccable-critique-final.md`; snapshots in `.impeccable/critique/`).
- Gemini: default `gemini-3.5-flash-lite`, 30 s timeout, one retry on 503/429. Photo-aware triage (lib/evidence.ts) verified in-app (CSR-75975 → CRITICAL, citing the photo).
- Perf: 60 s verified-session cache (`lib/server-auth.ts`, logout evicts it); staff list 2.6 s → 0.65 s; my-reports about 3 s → 1.1 s.
- `.env.local`: `ADMIN_PASSCODE` (test value) and `DEMO_TIME_JUMP=true` (spec 07 demo). A target-less time jump moves EVERY open ticket; reset demo tickets with `npm run demo:reset -- --apply`.
- `next.config.mjs` `distDir` honours `NEXT_DIST_DIR` (used for isolated audit builds in `.next-audit/`, gitignored).
- Test data cleanup: `supabase_cleanup_e2e.sql` (dry-run verified: 13 test tickets, 0 seed tickets; also removes the stray 05:14 auto-escalation rows). Owner runs it.
