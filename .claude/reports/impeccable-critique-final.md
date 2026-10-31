# /impeccable critique — Campus Speedrun dashboards (2026-10-31)

Method: dual-agent each round (A: design review sub-agent · B: detector + browser overlay sub-agent).
Target: `app/dashboard/page.tsx` (staff priority queue + student My Reports), with `/track` and `/student/submit` as the supporting student journey. Mode: Operate.

**Score trend (Nielsen, /40):** 22 → 27 measured. A third round of fixes followed; it was verified in the browser but not re-scored.

## Round 1 (22/40): what the critique found and what changed
| Priority issue | Fix |
|---|---|
| **[P1]** Queue buried (first ticket 1404 px down on desktop, 2905 px on mobile) | Briefing became a one-line strip; the radar became a collapsible section; hashtag filters became one swipeable row on phones. First ticket now about 590 px down (desktop) and 1072 px (mobile). |
| **[P1]** Student email shown in bold on the submit page | Replaced with "Staff never see your name or email", placed under the H1. Added a safety instruction ("leave the area and tell staff first"). |
| **[P1]** One-click irreversible Forward; time jump offered to roles the server rejects | Forward now has an inline confirm step with an optional note that reaches the next tier. The time-jump button shows only when the API says `canTimeJump`. |
| **[P2]** Heavy cards: nested callout, quadruple CRITICAL signal, "Problem Narration:" labels, 130+ characters per line | `SummaryLines` (Problem / Impact / Action); lighter justification callout; red frame removed; 34rem measure. |
| **[P2]** Student view used staff language and alarm signals | Plain next step ("Teacher has until Tue 8:55 AM…"); calm urgency pill; no routing tags on the student view; a "How it works" line. |
| Heuristic gaps | Visible toast for every action; field-level validation that marks the field and moves focus to it; readable track history ("Teacher acknowledged it"); department names instead of codes; `j`/`k`/`r`/`n` keyboard shortcuts; plain-language fallback reasoning. |

## Round 2 (27/40): what the critique found and what changed
| Priority issue | Fix |
|---|---|
| **[P1]** Score saturation (six tickets at 100/100, all pulsing) | The pulse now shows only on unacknowledged safety-critical tickets, and "In Progress" no longer pulses. Each card shows its score parts ("Critical 80 · +6 for 3 reports · +10 damage-prone · +15 safety risk = 111, capped at 100"). Tied tickets explain their order ("Same score as #2, which is due sooner"). |
| **[P1]** Cards too tall | Summary and justification sit side by side on wide screens; the summary and tags fold away on phones. Cards went from 951 to about 700 px on phones and from about 520 to 440–500 px on desktop. |
| **[P1]** Calm student voice missing on `/track` and the receipt | `nextStepText()` shared by My Reports and `/track`. Receipt: calm pill, "Tier 1 · Teacher", minute-level countdown, labelled summary. `/track` no longer marks steps as done after an escalation. |
| **[P2]** Focus lost after actions | Focus returns to the same card (or the next one). Forward and resolve notes take focus when opened; the resolve error is `role="alert"` and focuses its field. |
| **[P2]** Loading looked like data | Dashes and "loading" instead of zeros in the briefing and the tab counts. |
| Minor | Plural bug fixed; Refresh and the bell grouped so the bell can't wrap alone; Resolve is an outline button (the filled green is kept for "Confirm resolution"); the radar heading is no longer nested inside `<summary>`; the stepper states are spoken; action buttons are about 34 px tall. |

## Spec-fixed items kept on purpose
"Reported by Anonymous Student (Cluster Count: N)" (spec 06), the "Submit & Speedrun Triage" button (spec 02), the AI Priority Justification callout on every card (spec 04), hashtags on `/track` and the receipt (specs 02 and 08), and the "Simulate +3 Days Time Jump" button (spec 07).

## Detector (B)
- **Source scan:** 0 findings in both rounds.
- **In-page overlay, round 2:** found only pulsing "In Progress" (now fixed), line length (now fixed with the 34rem measure) and one test-data straggler.
- **False positives (per DESIGN.md):**
  - `.cs-inset` "nested-cards";
  - "overused-font" for the specified body font;
  - `.alert-warn` flagged as a card.

## Verification
- **End-to-end:** 75 of 75 checks pass against a production build.
- **In-browser probe** (contrast, targets, labels, tiny text, overflow): clean at 1024 px and 375 px on the teacher dashboard, the student dashboard, `/track` and `/student/submit`.
- **Focus:** after Acknowledge, focus returns to the ticket card.
