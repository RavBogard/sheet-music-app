# v11.7-07-01 — Authed Brothers Lazaroff surface: /ui-ux-pro-max design audit

**Date:** 2026-06-22
**Scope:** Authed BL surface (nav header desktop+mobile, mobile tab bar, dashboard, library, manage) under the teal `forceDark` theme (`.dark[data-org="brotherslazaroff"]`).
**Method:** Code-level audit of the BL theme tokens (`globals.css` lines 208–258) + the shared nav chrome (`DesktopHeader`, `MobileHeader`, `MobileTabBar`, `OrgLogo`), evaluated against /ui-ux-pro-max CRITICAL rules (color-contrast, touch-target-size, consistency, no layout-shift hover) and the brand-consistency bar CRC already meets.
**Constraint:** every fix BL-scoped (`[data-org="brotherslazaroff"]` token override or BL-only branch); CRC output byte-identical.

---

## Findings (severity-ranked)

### P1-1 — CRC-indigo brand-glow bleeds into the BL teal theme (HEADLINE)
The active-state "glow" accent is hardcoded to CRC's indigo hue (`oklch(... 275 ...)`) on shared
nav chrome, so under the BL teal theme the most-used navigation surfaces glow **purple**, clashing
with the teal `--brand` (`oklch(0.72 0.115 210)`). This is the single clear brand-consistency defect.

Two bleed paths:
- **Mobile tab bar** (`src/components/nav/MobileTabBar.tsx:164,220,246,278`) — active tabs + center FAB
  use `shadow-[var(--shadow-brand-glow)]` / `-soft`. Those tokens are defined at `:root`
  (`globals.css:282–283`) as indigo-275 and are **never overridden for BL**. On iPads the tab bar is
  a primary surface → highly visible purple halo on a teal canvas.
- **Desktop active nav link** (`src/components/nav/DesktopHeader.tsx:134`) — inline literal
  `shadow-[0_0_10px_oklch(0.50_0.20_275/0.2)]` (not a token) → purple halo behind the active link.

**Fix (BL-scoped, CRC byte-identical):**
1. `globals.css` — add a `:root` token `--nav-active-glow: 0 0 10px oklch(0.5 0.2 275 / 0.2)`
   (the EXACT current desktop literal → CRC pixels unchanged), and switch `DesktopHeader:134` to
   `shadow-[var(--nav-active-glow)]`.
2. `globals.css` — under `[data-org="brotherslazaroff"]`, override the three glow tokens
   (`--shadow-brand-glow`, `--shadow-brand-glow-soft`, `--nav-active-glow`) to the teal brand hue
   (210). MobileTabBar + DesktopHeader then auto-pick teal via `var()` with **zero further component
   edits**; CRC `:root` tokens are untouched → CRC byte-identical.

### PASS — contrast (no change)
BL tokens were tuned in v11.1-05 and clear WCAG AA on the teal canvas: `--foreground`
`oklch(0.97 0.012 200)` on `--background` `oklch(0.16 0.028 198)` ≈ very high; `--muted-foreground`
`oklch(0.74 0.025 205)` (secondary text / inactive nav) is a large lightness delta over the dark
canvas and reads comfortably; teal `--brand` `oklch(0.72 0.115 210)` as text/icon on the dark canvas
is legible. No contrast fix warranted.

### PASS — nav tap targets (no change)
Desktop nav anchors + logo link carry `min-h-11` (≥44px, C10I1-004); the mobile tab-bar items are
`h-11`. The in-nav primary touch targets already meet the iPad HIG floor.

### DEFERRED → Plan 02 (CRC+BL shared, NOT BL-specific)
- Desktop header **search input** (`h-9` = 36px) and **avatar/profile button** (icon size) sit below
  the 44px floor and are tappable on iPad (≥768px → desktop header). These are shared CRC+BL chrome,
  so they belong to the **40→44px in-app tap-target sweep (Plan 02)**, not this BL-only pass.

### P3 / accepted (no change)
- Profile-menu role label `text-[10px] uppercase font-bold` — micro-label, not body text; acceptable.
- Desktop wordmark `h-7` (28px) white-and-blue slab on teal — legible, balanced against the 64px
  header; no change.

---

## Decision
Implement **P1-1** only. It is the one genuine, BL-specific, brand-consistency defect on the authed
surface, and the fix is clean + provably CRC-byte-identical. Contrast and nav tap targets already
pass; the sub-44px shared controls are correctly Plan 02's scope; remaining items are P3/accepted.
