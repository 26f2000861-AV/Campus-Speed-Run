# /impeccable audit — Campus Speedrun, re-audit after fixes (2026-10-31)

Previous score: **14/20**. All 12 findings from the first audit are fixed, plus the extra issues this pass found.

## How it was checked
- **Detector on the source** (`app/`, `components/`): **0 findings**, advisory included (the first audit had 66).
- **Detector on rendered pages:** a production build in an isolated `.next-audit` folder, scanned at 1280 px and 390 px. **0 findings** on `/`, `/login`, `/track`, `/admin`. Some scans timed out waiting for the network to go idle; every page has a clean scan at one width or both.
- **Manual probe in Chromium:** contrast against the real background behind each element, target sizes, labels, text under 12 px, heading order, overflow.
  - **Widths:** 1024 px and 375 px.
  - **Pages:** `/`, `/login`, `/track`, `/admin`, the teacher `/dashboard`, the student `/dashboard` (My Reports) and `/student/submit`.
  - **Result:** 0 contrast failures, 0 targets under 24 px, 0 unlabeled controls, 0 text under 12 px, no sideways overflow.
- **Text scaling:** root font size at 200% on a 375 px viewport. `/dashboard`, `/student/submit`, `/login` and `/track` reflow. The homepage keeps a small overflow, since it stays as the owner asked.
- **Regression:** the end-to-end API suite passes 75 of 75 against the production build.

## Audit Health Score

| # | Dimension | Before | Now | Evidence |
|---|---|---|---|---|
| 1 | Accessibility | 3 | **4** | Footer now 6.9:1; placeholders slate-400; disabled and busy buttons no longer faded to 50%. Reduced motion keeps spinners and stops only decorative pulses. Fake tabs replaced with `aria-pressed` buttons. No skipped heading levels. |
| 2 | Performance | 3 | **4** | `next/font` self-hosting (no render-blocking `@import`, only the weights in use). Verified-session cache: auth 750–950 ms → about 5 ms after the first request. Staff list 2.6 s → 0.65 s. My Reports 2.6–4 s → 1.1 s (one queue query instead of 2 per report). |
| 3 | Theming | 2 | **4** | 60 off-ramp 10/11px sizes → the `text-xs` ramp; new `.cs-label` role. All 12 inputs use `.cs-input`; primary, secondary and resolve buttons use shared classes; selection colour comes from a token. DESIGN.md is updated with the ramp. |
| 4 | Responsive | 3 | **4** | Hazard-radar rows show the ticket ID first and wrap. Filter chips are at least 30 px and text actions at least 36 px. The navbar wraps; pills and steppers reflow at 200% text. |
| 5 | Implementation Integrity | 3 | **4** | Removed: both side stripes, five eyebrow labels, two decorative top bars, monospace used as decoration (about 50 places), the dev-overlay hiding block, and the open image proxy (`hostname: "**"`). |
| **Total** | | **14** | **20/20** | **Excellent** |

## What changed, by command
- **harden:**
  - footer contrast;
  - removed the CSS that hid Next.js errors;
  - restricted the image optimizer to Supabase Storage;
  - disabled-state contrast;
  - logout evicts the cached session.
- **typeset:**
  - one ramp (smallest size 12 px), a sans `.cs-label` role, mono only for data;
  - tabular numerals;
  - `text-wrap: balance` on headings and `pretty` on paragraphs.
- **optimize:**
  - `next/font`;
  - session cache, with only tokens that verified themselves being cached;
  - the SLA-warning check and the notification read run in parallel;
  - the escalation function runs only when a deadline has expired;
  - batched queue positions.
- **animate:** reduced motion stops pulses, slows spinners, and keeps colour and opacity transitions.
- **adapt:** hazard radar, touch targets, navbar wrapping, reflow at 200% text.
- **clarify:** shorter placeholders, with examples moved into hint text (`aria-describedby`); the queue heading shows "loading" instead of "0 of 0".
- **polish:**
  - `.cs-input`, `.btn-primary`, `.btn-secondary` and the new `.btn-resolve` used everywhere;
  - a coloured dot instead of a side stripe for notifications;
  - a hairline-border AI callout;
  - a status sentence instead of stat tiles in My Reports;
  - unused imports removed.

## Deliberate exceptions
- **Homepage:** `app/page.tsx` keeps its original light design by the owner's decision. It passes contrast; at 200% text on a 375 px phone two small elements overflow, and they were left unchanged on purpose.
- **Remaining latency:** what's left is round trips to the hosted Supabase project (about 0.3–0.5 s each), not app code.
