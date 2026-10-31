---
name: Campluse
description: AI-Powered Academic & Infrastructure Triage Engine — dark slate institutional UI
colors:
  ground: "#020617"        # slate-950 — page / body background
  surface: "#0F172A"       # slate-900 — cards (.cs-card)
  raised: "#1E293B"        # slate-800 — chips, hover fills, borders
  border-strong: "#334155" # slate-700 — secondary button borders, scrollbar thumb
  input-border: "#475569"  # slate-600 — form control borders
  text-primary: "#F1F5F9"  # slate-100
  text-secondary: "#CBD5E1" # slate-300 — body copy
  text-muted: "#94A3B8"    # slate-400 — metadata and placeholders (never slate-500 or darker for text)
  focus: "#818CF8"         # indigo-400 — focus ring, caret, text selection (35% alpha)
  urgency-critical: "#EF4444" # red-500 dot (pulsing) on red-950 fill, red-200 text, red-700 border
  urgency-high: "#FBBF24"     # amber-400 dot on amber-950 fill, amber-200 text, amber-700 border
  urgency-medium: "#818CF8"   # indigo-400 dot on indigo-950 fill, indigo-200 text, indigo-700 border
  urgency-low: "#94A3B8"      # slate-400 dot on slate-800 fill, slate-300 text, slate-600 border
  resolved: "#34D399"         # emerald-400
  escalated: "#FB923C"        # orange-400
typography:
  display:
    fontFamily: '"Playfair Display", Didot, Georgia, serif'
    fontWeight: 400
    usage: page titles, ticket titles, report titles
  body:
    fontFamily: '"Plus Jakarta Sans", Inter, -apple-system, sans-serif'
    fontSize: "0.875rem"
    usage: dense operate UI (cards, summaries, forms); 14px is deliberate for queue density
  label:
    fontFamily: '"Plus Jakarta Sans", Inter, -apple-system, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.05em"
    usage: .cs-label — uppercase section labels and field captions; the smallest size in the UI
  mono:
    fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace'
    fontSize: "0.75rem"
    usage: data only — CSR-/REP- ids, hashtags, scores, timestamps, codes, passwords. Never for labels.
  scale:
    - "0.75rem"   # text-xs  — labels, metadata, data
    - "0.875rem"  # text-sm  — body
    - "1rem"      # text-base
    - "1.25rem"   # text-xl  — card titles (serif)
    - "1.5rem"    # text-2xl — empty-state titles (serif)
    - "1.875rem"  # text-3xl — page titles (serif), mobile
    - "2.25rem"   # text-4xl — page titles (serif), desktop
rounded:
  full: "9999px"   # buttons, pills
  xl: "12px"       # inputs, alerts
  2xl: "16px"      # inset panels
  3xl: "24px"      # cards
---

# Design System: Campluse (Dark Slate)

## Overview
Professional, institutional and urgent. A flat `slate-950` ground with `slate-900` cards; colour is
reserved for meaning (urgency, status, SLA). No gradients, glows, coloured side stripes or eyebrow
labels above headings. Fonts are self-hosted through `next/font` in `app/layout.tsx` (subset,
`display: swap`, only the weights in use) and exposed as `--font-serif / --font-sans / --font-mono`.

The homepage (`app/page.tsx`) is the one exception: it keeps its original light design inside the
dark shell, by the owner's decision.

## Type
- **Ramp:** Tailwind steps only (see `typography.scale`). The smallest size is `text-xs` (12px);
  no literal `text-[Npx]` sizes.
- **Roles:** serif display for titles; sans body; `.cs-label` (12px, semibold, uppercase, tracked)
  for section labels; mono only for data, with tabular numerals everywhere mono is used.
- Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`.

## Surfaces (classes in `app/globals.css`)
- `.cs-card` — `bg-slate-900 border-slate-800 rounded-3xl`, the default container.
- `.cs-inset` — `bg-slate-950/60 border-slate-800 rounded-2xl`, nested panels and stat tiles.
- `.cs-input` — `bg-slate-950 border-slate-600`, placeholder slate-400, indigo focus border + ring.
  Every input, select and textarea uses it (add `font-mono` only for codes and passwords).
- `.btn-primary` — `bg-slate-100 text-slate-950` (highest contrast; one per view).
- `.btn-secondary` — outline `border-slate-700 text-slate-200`, hover `bg-slate-800`.
- `.alert-error` / `.alert-success` / `.alert-warn` — `*-950/50` fill, `*-800` border, `*-200` text.

## Urgency (spec 04 §4)
`<UrgencyPill>` in `components/ui.tsx`. CRITICAL crimson, HIGH amber, MEDIUM indigo, LOW slate. Every
pill shows an icon, the text label and `Score: N/100`, so the meaning does not depend on colour.
**Motion is rationed:** the dot pulses only via `pulse` — on staff cards for safety-critical tickets
nobody has acknowledged yet. Nothing pulses on student or public views. Staff cards replace the score
bar with `scoreParts()` ("Critical 80 · +6 for 3 reports · +10 damage-prone · +15 safety risk = 111,
capped at 100") and a tie-break note when two tickets share a score.

## Status (spec 09 §2)
`<StatusBadge>`: UNACKNOWLEDGED red dot, ACKNOWLEDGED amber, IN_PROGRESS indigo (static),
ESCALATED orange, RESOLVED emerald — always with the text label.

## SLA
`<SlaChip>`: neutral above 24h, amber "Under 24h" with warning icon below 24h, red once expired,
emerald "SLA clock stopped" when resolved.

## Hashtags (spec 08 §4)
`.hashtag-pill` — `bg-indigo-950 text-indigo-300 border-indigo-800`, mono. On the dashboard they
are buttons (`aria-pressed`, at least 30px tall) that filter the queue.

## AI summary
`<SummaryLines>` (`components/ui.tsx`) splits Gemini's "Problem Narration / Impact Assessment /
Recommended Execution" text into three labelled lines (Problem, Impact, Action) held to `max-w-[34rem]`
(about 75 characters at 14px);
summaries without those labels render as one paragraph.

## Staff dashboard layout
Queue first: header, live-alert ticker, a one-line Daily AI Executive Briefing strip, the hazard radar
as a collapsible `<details>` (opens by itself while a zone filter is active), the hashtag filters (a
single swipeable row on phones), then the ranked tickets. Tickets are **compact rows**: rank, urgency, status, SLA, title (a button that expands the row),
the spec 06 anonymous-reporter line with location, and a one-line preview of the AI justification,
plus a quick Acknowledge. Expanding shows the score breakdown, flags, AI summary, full justification
callout, hashtags and all actions. The #1 ticket starts expanded; "Expand all / Collapse all" sits by
the queue heading; `o` (or Enter) toggles the focused row. On phones the rank badge joins the pill row.
Ticket actions confirm visibly in a toast
at the bottom of the screen (also announced to screen readers). Forward opens an inline confirm step
with an optional note before anything changes. Keys: `j`/`k` move between tickets, `o` opens/closes one, `r` refreshes,
`n` opens notifications (ignored while typing).

## Student views
Same components, calmer voice: `<UrgencyPill calm>` (no pulsing dot), no staff routing hashtags, and a
plain-language next step ("Teacher has until Tue 8:55 AM to act. If not, it moves up to Faculty
automatically.") instead of an SLA countdown. The submit page leads with "Staff never see your name or
email" and a safety instruction; validation errors mark the field (`aria-invalid`, red border) and move
focus to it.

## AI justification
Highlighted callout (spec 04): `bg-indigo-950/50`, `rounded-xl`, no border, Sparkles-icon label,
held to `max-w-[34rem]`. No side stripe and no card-in-card border. On wide screens the summary and
the callout sit side by side; on phones the summary and tags fold behind "Show AI summary".

## Notifications
Drawer items are neutral `slate-950/60` panels; the type (new assignment, SLA warning, escalation,
resolved) is a coloured dot plus its text label.

## Browser surfaces
Tab icon `app/icon.svg` repeats the navbar mark (serif italic C on slate-100). Selection is indigo-400 at 35% with slate-100 text; caret indigo-400; scrollbars slate-700 on
slate-950 (`scrollbar-color` + WebKit rules); tabular numerals for data.

## Accessibility
- Body text slate-300 or lighter on slate-900/950 (AA 4.5:1); slate-400 for metadata and
  placeholders; nothing darker for text.
- Global `:focus-visible` outline in indigo-400; inputs add a focus ring.
- Interactive targets are at least 30px tall; text actions get padding to reach it.
- `aria-live` regions announce queue actions, lookups and submissions; errors use `role="alert"`.
- `prefers-reduced-motion`: decorative pulses stop, spinners slow down but stay visible, and only
  colour/opacity transitions remain.
