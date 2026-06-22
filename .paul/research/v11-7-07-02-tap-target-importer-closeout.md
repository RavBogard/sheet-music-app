# v11.7-07-02 — Tap-target + ImporterModal close-out (verify-first)

**Date:** 2026-06-22
**Scope:** Close out the two folded deferred UI items from the v7.0 fold-forward re-triage
(40→44px in-app tap targets · ImporterModal P3 polish). CRC+BL shared a11y pass.
**Method:** /ui-ux-pro-max-informed audit against the touch-target-size CRITICAL rule (≥44px),
verified against deployed code.

---

## Part A — 40→44px in-app tap targets

### Already satisfied (verified — no change)
The component-level work is effectively complete from earlier phases:

| Surface | Evidence | Status |
|---------|----------|--------|
| `Button` primitive | `src/components/ui/button.tsx`: `default: h-11`, `icon: size-11`, `icon-lg: size-12` | ≥44px ✓ |
| Perform reading controls | bumped to `h-11`/`w-11` (v11.6-02 WS-20) | ≥44px ✓ |
| Library rows | `min-h-11` (v11.7-05-01) | ≥44px ✓ |
| Desktop nav anchors + logo link | `min-h-11` (C10I1-004) | ≥44px ✓ |
| Mobile tab bar items | `h-11` | ≥44px ✓ |
| MobileHeader hamburger | `Button size="icon"` = `size-11` | ≥44px ✓ |

So the "40→44px in-app targets" fold-forward item was largely already discharged — the
remaining `sm` (h-8) / `xs` (h-6) Button variants are not used on band-facing library/setlists/nav
surfaces.

### Fixed (the one genuine band-facing residual)
- **DesktopHeader search `<Input>`** `h-9` (36px) → **`h-11`** (44px). It's a text field shown on
  every authed page (the desktop header renders at ≥768px → present on iPad). All other classes
  unchanged (`pl-9`, `rounded-full`, `text-sm`, focus ring, icon stays centered via
  `top-1/2 -translate-y-1/2`). CRC+BL shared improvement (this plan is NOT byte-identical-constrained).

### Accepted exceptions (no change)
- Dense inline-table editors (ImporterModal review step `h-7`/`h-8` inputs) — legitimate
  data-table-editor exception; bumping would bloat the table. See Part B.

---

## Part B — ImporterModal P3 polish

**Verdict: ACCEPT-AS-IS (no churn).**

Rationale:
- ImporterModal is an in-app **authoring** surface. Daniel authors via Claude + MCP and bypasses
  the in-app authoring UI (the browser app is the band/consumer surface) — so this modal is
  low-traffic.
- It is already at a P3-acceptable bar: per-step loading states (`Loader2` spinners + "Analyzing…"),
  `aria-live="polite"` on the upload affordances, `focus-within:ring-2 focus-within:ring-brand` on
  the dropzones, `aria-label`s on the file inputs, abort-on-close for the in-flight import chain,
  and `toast` error surfacing on every route failure.
- Its only sub-44 controls are the dense inline-table editors in the review step (`h-7` key/lead,
  `h-8` title) — a legitimate data-table-editor exception; raising them to 44px would bloat the
  review grid for no real benefit.

No concrete, cheap P3 defect found that warrants touching a low-traffic surface. Per "keep changes
minimal / don't over-engineer," ImporterModal is closed as-is. (Re-open only if it becomes a
band-facing surface or a real defect is reported.)

---

## Outcome
One real band-facing fix (search input → 44px); everything else verified already-satisfied or
accepted with rationale. No low-value churn. Phase v11.7-07 ready to transition → milestone close.
