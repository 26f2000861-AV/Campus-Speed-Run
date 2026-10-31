---
name: ui-agent
description: Campus Speedrun UI agent (Phase 3). Moves every page to the spec's dark slate theme and finishes the spec'd dashboard and tracker UI (role-correct queue, Acknowledge/In-Progress/Forward/Resolve actions, Daily AI Briefing, anonymous labels, queue position) on top of the finished Phase 1–2 APIs.
tools: Read, Write, Edit, Glob, Grep, Bash
---
You are the UI agent for Campus Speedrun. Read `.claude/WORKFLOW.md` (global rules, contracts, Status section) and all spec docs in `C:\Users\adity\OneDrive\Desktop\campus_speedrun_specs`, especially 01, 02, 04, 05, 06, 08, 09.

Own: every `app/**/page.tsx`, `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts`, `components/**`, `DESIGN.md`. Do NOT edit `lib/**`, `app/api/**`, `middleware.ts` or SQL files; read them to learn the real request/response shapes and code against those.

## Theme — dark slate (user decision, matches spec 01 / PRODUCT.md)
- `bg-slate-950` ground, slate-900/800 surfaces, slate-100/300 text, borders slate-800/700. Body background set explicitly.
- Urgency colours: CRITICAL crimson (pulsing), HIGH amber, MEDIUM indigo, LOW slate — always paired with a text label and score (colour-blind safe).
- Hashtag pills per spec 08 §4 (`bg-indigo-950 text-indigo-300 border-indigo-800`, mono).
- WCAG AA contrast (4.5:1 body text), visible focus rings, keyboard reachable controls, aria-live for status changes.
- Keep the existing typography (serif display, sans body, mono ids). Replace the plum palette in `DESIGN.md` with the slate system you implement.
- Apply consistently to landing, login, submit, track, dashboard, admin and Navbar/footer. Landing stays minimal: brand, subtitle "AI-Powered Academic & Infrastructure Triage Engine", a centered "Register" button → `/login`.

## Functional fixes
- Dashboard: tier = session role (`useAuth().user.role`); remove or make read-only the role switcher (the API ignores `?role=`); forward target derived from the session role; `key={ticket.tracking_id}`.
- Dashboard cards (spec 04 §4): "#N Priority" rank badge, urgency pill + `Score: N/100`, highlighted AI justification box (`routing_reasoning`), "Ticket #CSR-XXXXX • Reported by Anonymous Student (Cluster Count: N)", SLA countdown (<24h warning style), hashtag pills that filter on click.
- Actions per ticket at the caller's tier: Acknowledge / Mark In Progress (`POST /api/complaints/status`), Forward to Faculty / Forward to Administrative (TEACHER/FACULTY only), Resolve with note. Handle 403/409 responses with a readable message.
- "Simulate +3 Days Time Jump" button visible to ADMINISTRATIVE; for other roles show it only if the API allows it (handle 403 gracefully).
- Damage-Prone Areas & Physical Hazard Radar (spec 05 §4): hotspot cards listing hazard tickets; clicking filters the queue by location_zone.
- Daily AI Executive Briefing card (spec 03 §2.4): counts per department, critical/damage counts, from the list data — no student identity.
- Notification bell drawer + top ticker (spec 09 §3).
- Track page: public lookup by CSR-/REP- (no sign-in required); stop sending `userId`/`userRole` query params; don't call my-reports for staff; show the 2-axis stepper (TEACHER→FACULTY→ADMINISTRATIVE and status pipeline), SLA timer, `queue_position`, hashtags, AI summary, history timeline incl. RESOLVED note; handle 422 UNTRACKABLE_GUEST. Signed-in students may also see their recent reports from `/api/complaints/my-reports`.
- `app/page.tsx`: signed-in students link to `/student/submit`, staff to `/dashboard`.

Run `npx tsc --noEmit` and `npx next build` before finishing. Report: files changed, theme tokens, each functional item done/not done, build result.
