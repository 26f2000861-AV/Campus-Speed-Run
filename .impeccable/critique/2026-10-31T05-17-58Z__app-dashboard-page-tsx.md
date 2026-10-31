---
target: dashboard (staff queue + student My Reports)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\adity\\OneDrive\\Desktop\\Speedrun\\app\\dashboard\\page.tsx"
target_fingerprint: "sha256:96d0d36c13ecf47411395dacbb9fde4bb5d413f085ebb8625fe91a07486a4a95"
target_path: "C:\\Users\\adity\\OneDrive\\Desktop\\Speedrun\\app\\dashboard\\page.tsx"
timestamp: 2026-10-31T05-17-58Z
slug: app-dashboard-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector + browser overlay sub-agent)

Target: `app/dashboard/page.tsx` (staff queue + student My Reports), supporting `/track`, `/student/submit`. Mode: Operate. Re-run after the first critique's fixes.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Loading briefing / tab counts render "0" like real data |
| 2 | Match System / Real World | 3 | /track marks pipeline steps "done" after ESCALATED although they never happened |
| 3 | User Control and Freedom | 3 | Acknowledge / In Progress have no undo |
| 4 | Consistency and Standards | 2 | Calm student voice holds on My Reports only; /track and the receipt revert to staff tone |
| 5 | Error Prevention | 3 | Forward confirm + resolve note minimum work |
| 6 | Recognition Rather Than Recall | 3 | Labelled everywhere; key legend visible |
| 7 | Flexibility and Efficiency | 2 | Navigation keys only; no action keys, no compact view |
| 8 | Aesthetic and Minimalist Design | 2 | Score saturation (six tickets 100/100, all pulsing); 520px / 951px cards |
| 9 | Error Recovery | 3 | Resolve-note error not announced / focused |
| 10 | Help and Documentation | 3 | Nothing explains what drives the score |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
Content is authored for this product (justification callout, cluster count, radar, tier stepper, student next-step copy); the uniform single-column `cs-card` stack is generic. Detector: CLI 0 findings; overlay found pulsing "In Progress" dot on public /track, line length ~100–114ch on summaries/rationale, one straggler; `.cs-inset` nested-card and overused-font flags are false positives per DESIGN.md.

## Priority Issues
1. [P1] Score saturation and alarm fatigue — pulse only unacknowledged safety-critical; show the score's components and the tie-break. /impeccable quieter, /impeccable clarify
2. [P1] Queue too tall to scan — denser card layout; collapse detail on phones. /impeccable layout, /impeccable adapt
3. [P1] Student calm voice breaks on /track and the receipt — calm pill, tier names, next-step sentence, honest escalation pipeline. /impeccable clarify
4. [P2] Focus lost after queue actions; resolve-note error not announced. /impeccable harden
5. [P2] Loading states look like data. /impeccable harden

## Persona Red Flags
- Alex: no action keys; full refetch per action.
- Sam: focus drops to BODY after Acknowledge; heading inside the radar summary; stepper "done" state silent.
- Casey: ~1.3 screens of chrome before the first ticket; 28–30px action buttons.

## Minor Observations
Plural bug "1 of your 3 open reports are"; header bell wraps alone at 800–1024px; Resolve (filled) outweighs Acknowledge; submit-page notice sits above the H1; receipt summary is one paragraph.
