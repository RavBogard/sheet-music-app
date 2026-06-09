---
phase: v11-03-domain-branding
plan: 02
subsystem: ui
tags: [multi-tenant, theming, css-variables, oklch, next-themes, branding, login]

requires:
  - phase: v11-03-01
    provides: <html data-org> hook + OrgProvider/useOrg + Edge x-org-id
provides:
  - Brothers Lazaroff navy dark theme (scoped [data-org="brotherslazaroff"] CSS-var overrides)
  - forcedTheme=dark for the BL org (dark+photographic identity)
  - getOrgBranding(orgId) pure brand-metadata resolver
  - org-aware /login (BL band hero + wordmark; CRC byte-identical)
affects: [v11-03-03-vocab, v11-04-consumer-surface]

tech-stack:
  added: []
  patterns:
    - "Per-tenant theme = scoped [data-org] CSS-variable override block (mirrors [data-theme=v2])"
    - "forcedTheme driven by org branding flag; CRC stays system-theme"

key-files:
  created:
    - src/lib/org/branding.ts
    - src/lib/org/__tests__/branding.test.ts
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
    - src/app/login/page.tsx

key-decisions:
  - "BL re-skins via scoped CSS-var overrides only — zero per-component edits, CRC provably untouched"
  - "BL forced dark (navy is a dark-canvas identity); CRC keeps system light/dark"
  - "Login branches early for BL; CRC/default path left byte-identical (congregation-config chrome)"
  - "Hero ships as a CSS stage-light gradient with an optional --bl-hero-image slot — no scraped photo binary, no broken <img>"

patterns-established:
  - "New tenant theme = add a [data-org=X] + .dark[data-org=X] block after .dark in globals.css; never edit :root/.dark"

duration: ~18min
started: 2026-06-08T19:30:00Z
completed: 2026-06-08T19:48:00Z
---

# Phase v11-03 Plan 02: Brothers Lazaroff branding Summary

**brotherslazaroff.live now wears its own dark, navy-accented band chrome app-wide — scoped CSS-variable overdrives keyed off `data-org`, forced dark, and a photographic login hero with a "Brothers Lazaroff" wordmark — with CRC's indigo+amber theme and login provably untouched.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~18 min |
| Tasks | 3 completed |
| Files | 2 created, 3 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: BL re-skins to navy dark; CRC unchanged | Pass | `[data-org="brotherslazaroff"]` + `.dark[data-org=...]` navy block (hue ~252 vs CRC 275); forced dark; `:root`/`.dark`/`[data-theme=v2]` untouched |
| AC-2: BL login band chrome; CRC byte-identical | Pass | Early-return BL hero+wordmark; CRC branch + LoginClient + legal nav + noscript unchanged |
| AC-3: Branding resolver pure + correct | Pass | branding.test.ts 2/2 (BL forceDark true / crc false) |

## Accomplishments

- **Whole-app re-skin with one scoped block:** because Tailwind theme colors read the `--brand/--background/--ring/...` CSS vars, overriding them under `[data-org="brotherslazaroff"]` re-skins every authed page to navy automatically — no per-component branding edits, and CRC is mathematically safe (different selector).
- **Forced-dark identity** wired through `getOrgBranding().forceDark` → next-themes `forcedTheme` (CRC stays system theme).
- **Branded login:** dark `bl-hero` stage-light gradient + bold uppercase "Brothers Lazaroff" display wordmark + band tagline, reusing the exact auth/compliance shell (LoginClient, legal nav, noscript).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/org/branding.ts` | Created | Pure `getOrgBranding(orgId)` → { shortName, tagline, forceDark } |
| `src/lib/org/__tests__/branding.test.ts` | Created | Resolver tests (BL forced-dark / CRC system) |
| `src/app/globals.css` | Modified | `[data-org="brotherslazaroff"]` + `.dark[data-org=...]` navy token block; `@utility bl-hero` |
| `src/app/layout.tsx` | Modified | `forcedTheme={forceDark ? "dark" : undefined}` |
| `src/app/login/page.tsx` | Modified | Early-return BL hero+wordmark; CRC branch untouched |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Scoped CSS-var override (not per-component) | Lowest-risk, CRC-safe, whole-app coverage | New tenants = one CSS block |
| Force dark for BL only | Navy/photographic is a dark identity; CRC unaffected | forcedTheme gated by org |
| Gradient hero + optional photo slot | Avoid shipping a scraped binary; no broken img | Daniel drops a real photo into `--bl-hero-image` later |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Deferred | 0 | — |

Plan executed as written. (Reused Righteous `--font-display` for the wordmark per scope limit — a distinct BL display font remains a possible future polish.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| eslint warning: "unused eslint-disable directive" at login/page.tsx (CRC `<img>` line) | **Pre-existing**, in the CRC branch this plan must keep byte-identical; 0 errors. Not introduced here; left untouched to honor the boundary. |

## Next Phase Readiness

**Ready:**
- v11-03-03 (vocab + UI trim) can layer `label(org,key)` on top of this; the BL wordmark already reads from `getOrgBranding` so vocab can extend it.

**Concerns / UAT (human, non-blocking):**
- **Preview requires the live domain.** Org is host-derived (Edge-authoritative by design), so BL chrome shows on `brotherslazaroff.live` — which needs the DNS from `docs/brotherslazaroff-domain-setup.md` (Vercel domain-add + Squarespace A/CNAME) + the prod deploy. It is intentionally NOT visible on centralreform.live or *.vercel.app.
- Optional: Daniel drops a real live-performance photo for the hero `--bl-hero-image` slot (currently a navy stage-light gradient).

**Blockers:** None.

**Build-gate note:** local `next build` not used (pre-existing CRON_SECRET env gap); gate = `tsc` clean + full unit suite 3284 pass/0 fail + eslint 0 errors. Vercel prod build runs the full build at phase-close commit.

---
*Phase: v11-03-domain-branding, Plan: 02*
*Completed: 2026-06-08*
