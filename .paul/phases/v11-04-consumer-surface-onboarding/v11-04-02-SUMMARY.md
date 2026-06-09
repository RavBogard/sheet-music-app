# v11-04-02 SUMMARY — Org-aware consumer branding/metadata

**Status:** LOOP COMPLETE (APPLY ✓ · verified) — shipped pending push.
**Date:** 2026-06-09

## Goal (recap)
Make the consumer surface branding org-aware so brotherslazaroff.live no longer
shows "CRC Music" / "Central Reform Congregation": the /perform wordmark, the
browser-tab title + social/PWA metadata, and the public-listing title all read
from the tenant's branding. CRC output stays byte-identical. v11-04-01 fixed the
DATA leak; this closes the remaining pure-branding "this is CRC's site" signals.

## What shipped

### Task 1 — `src/lib/org/branding.ts` (data-driven branding, single source of truth)
Extended `OrgBranding` + `BRANDING` with consumer-surface metadata fields:
`appName`, `metaTitleDefault`, `metaTitleTemplate`, `metaDescription`, `ogTitle`,
`themeColor`, `manifestPath`, `baseUrl`. CRC values are **byte-identical** to the
strings previously hardcoded in `layout.tsx` (asserted in `branding.test.ts`).
BL gets its own band strings. A new tenant is now ONE entry here — no org `if`
checks scattered through layout/components.
- CRC `baseUrl` preserves the prior `process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live"`
  env override (a single global env can't be per-tenant; other tenants pin their host).

### Task 2 — `src/app/layout.tsx` + `public/manifest-brotherslazaroff.json`
- Converted the static `export const metadata` → `export async function generateMetadata()`
  that reads `coerceOrgId((await headers()).get("x-org-id"))` (the same org seam the
  layout body already uses for `<html data-org>`/`forceDark`) and builds title
  (template+default), description, openGraph (siteName/title/description), twitter,
  appleWebApp.title, `metadataBase`, and `manifest` from `getOrgBranding(org)`.
  `robots: {index:false}` (root noindex) + `viewport` themeColor are UNCHANGED.
- Created `public/manifest-brotherslazaroff.json` mirroring `manifest.json` with BL
  name/short_name/description + navy `#0a0e1a` background/theme.
  - NOTE (deferred polish): BL manifest reuses CRC `icon-192/512.png` — no BL icon
    asset exists yet. Install-time only; acceptable until BL art lands.

### Task 3 — `/perform` wordmark + de-synagogued listing title
- `PublicSetlistListing.tsx`: the hardcoded "CRC Music" `<h1>` and the
  "Sign in to CRC Music" aria-label now read `getOrgBranding(useOrg()).shortName`.
  The wordmark needs no truncation (fits at ≥320px even with the signed-in avatar
  pill); `text-foreground` gives high contrast on the BL navy canvas. No layout shift.
- `src/lib/org/vocab.ts`: added `publicListingTitle` VocabKey — BASE
  "Upcoming Services & Setlists" (CRC byte-identical), BL "Upcoming Shows & Sets".
- `src/app/perform/page.tsx`: static `export const metadata` → `generateMetadata()`
  using `label(org, "publicListingTitle")`; the `robots:{index:true,follow:true}`
  public-indexable override (C5D-007) is PRESERVED.

## /ui-ux-pro-max
Loaded before Task 1 (BLOCKING per SPECIAL-FLOWS). Applied to the wordmark change:
truncation-safe (fits all widths, no clip of the brand name), no layout shift,
high contrast on the navy dark chrome, consistent with existing header layout.

## Verification
- `tsc --noEmit`: **clean** (exit 0)
- Targeted vitest (branding/vocab/perform-page/public-view): **31/31 pass**
- Full suite: **3300 passed / 0 failed** / 78 skipped (+3 = the new branding tests).
  2 unhandled `onTaskUpdate` worker-RPC timeouts = known parallel-load flake on an
  oversubscribed box (610s env time), NOT test failures; the changes touch no
  async/timer code.
- eslint (changed files): **0 errors**
- DEPLOYED-SURFACE PROBE: pending Vercel prod deploy after push (BL /perform header
  = "Brothers Lazaroff" + tab title; CRC unchanged).

## Acceptance criteria
- AC-1 (org-aware /perform wordmark + sign-in aria-label) ✓
- AC-2 (org-aware tab + og/twitter/appleWebApp/manifest/metadataBase) ✓
- AC-3 (de-synagogued public-listing title via vocab) ✓
- AC-4 (no CRC regression — byte-identical, asserted in branding.test.ts; full suite green) ✓

## Files modified
- src/lib/org/branding.ts
- src/lib/org/__tests__/branding.test.ts
- src/app/layout.tsx
- public/manifest-brotherslazaroff.json (new)
- src/components/performance/PublicSetlistListing.tsx
- src/lib/org/vocab.ts
- src/app/perform/page.tsx

## Follow-on (NOT this plan)
- v11-04-03: David onboarding + empty-library verify + authed-dashboard read
  scoping (getUpcoming/getRecent/getSetlistsPage + non-/perform subscribeToAllSetlists
  callers) + e2e UAT.
- BL PWA icon asset (replace CRC icon reuse in manifest-brotherslazaroff.json).
