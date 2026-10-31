---
target: dashboard (staff queue + student My Reports)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\adity\\OneDrive\\Desktop\\Speedrun\\app\\dashboard\\page.tsx"
target_fingerprint: "sha256:a0f744c6ecb6dcc1838a1604372601edc946b64300dac9ca4d99290e84195600"
target_path: "C:\\Users\\adity\\OneDrive\\Desktop\\Speedrun\\app\\dashboard\\page.tsx"
timestamp: 2026-10-31T05-01-55Z
slug: app-dashboard-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector + browser overlay sub-agent)

Target: `app/dashboard/page.tsx` (staff priority queue + student "My Reports"), with `/track` and `/student/submit` as the supporting student journey. Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Acknowledge / Forward / Resolve confirm only via an sr-only live region; sighted users see the card silently move or vanish |
| 2 | Match System / Real World | 2 | AI summaries print "Problem Narration: / Impact Assessment:" labels; fallback reasoning says "offline heuristic"; track history shows raw enums |
| 3 | User Control and Freedom | 2 | "Forward to Faculty" is one irreversible click with no confirm or note |
| 4 | Consistency and Standards | 3 | Shared primitives solid; submit page hand-rolls an inset panel; two different tier steppers |
| 5 | Error Prevention | 2 | Time-jump button shown to roles the server may reject (403) |
| 6 | Recognition Rather Than Recall | 3 | Department tiles show bare codes (SCI, SAN); names are sr-only |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts, no bulk acknowledge, single-select filters |
| 8 | Aesthetic and Minimalist Design | 2 | 483px cards; CRITICAL signalled four ways; nested indigo justification card; 130–138ch summary lines |
| 9 | Error Recovery | 3 | Clear messages + retry, but submit validation errors appear at the top, field not marked |
| 10 | Help and Documentation | 2 | Students get no explanation of SLA / tier / "Unacknowledged" |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict
**LLM assessment:** content and vocabulary are authored for this product (tiers, SLA, hazard radar, two-axis tracker, CSR/REP receipts); the visual shell (rounded-3xl slate cards, pills everywhere, serif titles) is category-generic.
**Deterministic scan:** CLI `detect app components` → 0 findings (regex-only, undercount). In-page overlay on 4 views → 34 items: nested-cards 18 (15 are `.cs-inset` tiles sanctioned by DESIGN.md → false positive; 9 AI-justification boxes real; submit "Signed in" box borderline), line-length 10 (real, 101–138ch), pulsing-dot 3 (advisory; alarming on the student view), overused-font 4 (false positive — DESIGN.md pins Plus Jakarta Sans). No contrast or tiny-text findings.
**Visual overlays:** injected via live-server on 4 views; live-server stopped afterwards.

## Overall Impression
Solid, accessible, spec-complete machinery whose first screen talks about statistics instead of the work. The single biggest opportunity: put the queue first and make each ticket scannable in one glance.

## What's Working
- Urgency encoding is never colour-only (icon + label + score in UrgencyPill / StatusBadge / SlaChip), reused everywhere.
- Real accessibility groundwork: live regions, aria-pressed filters, drawer focus return + Escape, considered reduced-motion.
- Helpful empty/filter states ("Tickets in this zone may be held at another tier…").

## Priority Issues
1. **[P1] The queue is buried** — briefing + radar push the first ticket to 1404px (desktop) / 2905px (mobile). Fix: queue first; compact one-line briefing strip; radar collapsible. Command: /impeccable layout
2. **[P1] Anonymity promise undercut on submit** — "Signed in as <email>" in bold is the first thing a fearful student reads; no "leave the room" safety line. Fix: replace with "Staff only ever see a ticket number"; add a safety instruction. Command: /impeccable clarify
3. **[P1] Escalation actions lack guardrails** — one-click Forward; time-jump shown to roles the server rejects. Fix: inline confirm + optional note for Forward; show time-jump only when the server allows it. Command: /impeccable harden
4. **[P2] Ticket cards too heavy to scan** — nested indigo card, quadruple CRITICAL signal, form-label prose, 130+ch lines. Fix: drop the extra signal, render the summary as three short labelled lines within a prose measure, flatten the justification box. Command: /impeccable distill
5. **[P2] Student view speaks staff language and alarms** — "71h 59m left", pulsing red CRITICAL, unexplained queue position and statuses. Fix: plain-language deadline and next step, calm (non-pulsing) urgency for students, a short "how it works" line. Command: /impeccable clarify

## Persona Red Flags
- **Alex (power-user teacher):** 1404px of scrolling before the first ticket; no keyboard path; no bulk acknowledge.
- **Sam (screen reader):** hazard-radar cards are `<button>`s containing a `<ul>`, so the accessible name is the whole card; action confirmations exist only in the live region.
- **Anxious student on mobile:** submit button below 8 chips + upload zone; validation errors at the top, off-screen; pulsing CRITICAL reads as alarm.

## Minor Observations
- "Clear zone filter" appears twice. `btn-primary` is uppercase while other buttons are sentence case. Department tiles show bare codes. Track history shows raw enums ("STUDENT · SUBMITTED").

## Questions to Consider
- Should a teacher's dashboard open on the briefing, or on the ticket closest to breaching its 72-hour window?
- What should a student feel ten minutes after reporting a hazard: informed about scores, or reassured that a named tier is handling it by a specific time?
- If each ticket were one dense row, which of the six chips would survive?
