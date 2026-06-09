---
phase: v11-03-domain-branding
plan: 03
subsystem: ui
tags: [multi-tenant, vocab, i18n-lite, setlist-edit, synagogue-field-trim]

requires:
  - phase: v11-03-01
    provides: useOrg() client org hook
provides:
  - org-aware label(org,key) + hidesLiturgicalFields(org) vocab resolver
  - SetlistMetaEditSheet hides Service-type + Rabbi for BL, band vocab
affects: [v11-04-consumer-surface]

tech-stack:
  added: []
  patterns:
    - "Per-tenant vocab via label(org,key) base+overrides map"
    - "Liturgical-field trim gated by a single hidesLiturgicalFields(org) predicate"

key-files:
  created:
    - src/lib/org/vocab.ts
    - src/lib/org/__tests__/vocab.test.ts
  modified:
    - src/components/setlist/grid/SetlistMetaEditSheet.tsx
    - src/components/setlist/grid/__tests__/SetlistMetaEditSheet.test.tsx
    - src/lib/org/org-context.tsx (useOrg fallback — cross-plan refinement, see Deviations)
    - src/lib/org/__tests__/org-context.test.tsx

key-decisions:
  - "Scope 03 to the live edit surface (SetlistMetaEditSheet) only; CreationWizard/perform/cards deferred to v11-04 (depend on org-scoping the global congregation collection + liturgical templates)"
  - "useOrg() now DEFAULTS to crc outside a provider instead of throwing — benign (chrome/vocab only; real isolation is server-side), and unblocks isolated component tests"

patterns-established:
  - "New tenant vocab = add overrides to OVERRIDES[org] in vocab.ts; new non-synagogue tenant opts into field-trim via hidesLiturgicalFields"

duration: ~22min
started: 2026-06-08T19:50:00Z
completed: 2026-06-08T20:01:00Z
---

# Phase v11-03 Plan 03: Vocab + UI trim Summary

**Brothers Lazaroff's setlist-edit surface now hides the Service-type selector and Rabbi field and reads "set" not "setlist", via a pure `label(org,key)` + `hidesLiturgicalFields(org)` resolver — CRC's edit sheet renders byte-identical.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~22 min |
| Tasks | 3 completed |
| Files | 2 created, 4 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Vocab resolver pure + correct | Pass | vocab.test.ts 4/4 (BL overrides / crc base; hidesLiturgicalFields BL true / crc false) |
| AC-2: BL hides synagogue fields; CRC shows them | Pass | SetlistMetaEditSheet.test.tsx 8/8 incl. new CRC-shows / BL-hides cases; title "Edit set details" vs "Edit setlist details" |
| AC-3: Save logic unaffected; no orphan writes | Pass | Hidden fields keep state seeded from `initial` → per-field diff never patches templateType/rabbi for BL; existing AC-2/3/4 save tests green |

## Accomplishments

- `label(org,key)` + `hidesLiturgicalFields(org)` resolver — the org-aware vocab seam the phase called for.
- BL setlist-edit sheet hides Service-type + Rabbi and uses band vocab; CRC unchanged (predicate false → both fields render).
- Hardened the org seam: `useOrg()` degrades to `crc` outside a provider (benign), fixing isolated-component test friction app-wide.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/org/vocab.ts` | Created | `hidesLiturgicalFields` + `label` (base + BL overrides) |
| `src/lib/org/__tests__/vocab.test.ts` | Created | Resolver tests |
| `src/components/setlist/grid/SetlistMetaEditSheet.tsx` | Modified | `useOrg()`-gated field hide + vocab title/placeholder |
| `src/components/setlist/grid/__tests__/SetlistMetaEditSheet.test.tsx` | Modified | Wrapped in OrgProvider + BL/CRC cases |
| `src/lib/org/org-context.tsx` | Modified | `useOrg()` → default crc (was throw) |
| `src/lib/org/__tests__/org-context.test.tsx` | Modified | "defaults to crc" replaces "throws" |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Cross-plan refinement, net-positive |
| Scope additions | 0 | — |
| Deferred | (documented) | Broader vocab → v11-04 |

### Auto-fixed

**1. [Integration] `useOrg()` throw broke isolated component tests**
- **Found during:** Task 3 (full-suite regression — 31 failures across 5 SetlistGrid suites that mount the grid → SetlistMetaEditSheet without an OrgProvider).
- **Root cause:** v11-03-01 made `useOrg()` throw outside a provider. Adding `useOrg` to the always-mounted SetlistMetaEditSheet surfaced it everywhere SetlistGrid is unit-tested.
- **Fix:** `useOrg()` now returns `DEFAULT_ORG_ID` ("crc") outside a provider. Benign — browser org only drives chrome/vocab; server-side tenant isolation (v11-02) is unaffected; the real app always wraps in OrgProvider. Updated v11-03-01's org-context test accordingly.
- **Verification:** full unit suite 3290 passed / 0 failed.

### Deferred to v11-04 (logged, not silent)

The broader synagogue→band vocab + UI trim is intentionally NOT in 03 because it depends on org-scoping the **global `congregation` collection** + liturgical templates — already a v11-04 item:
- **CreationWizard** — "Service date", "Clone last week's *service*", Hebrew template groups, rabbi list (from the global congregation config).
- **Perform view + display cards** (SetlistCards, MobileRowCard, etc.) — "service"/"sanctuary" copy.
- `EditDetails.tsx` — dead/legacy (no live import); not touched.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| 31 test failures from the useOrg throw | Root-caused + fixed via the crc fallback (above); re-verified 3290/0 |

## Next Phase Readiness

**Ready:** v11-03 is feature-complete (routing + branding + edit-surface vocab/trim). Phase transition (commit + push + roadmap/project) follows. v11-04 inherits the vocab resolver + the deferred-list above.

**Concerns/UAT:** Preview requires the live brotherslazaroff.live domain (DNS doc) + prod deploy. BL CreationWizard/perform still show synagogue vocab until v11-04.

**Blockers:** None.

**Build-gate:** local `next build` skipped (CRON_SECRET env); gate = tsc clean + full unit 3290/0 + eslint 0 errors. Vercel prod build is the full-build gate on the phase-close push.

---
*Phase: v11-03-domain-branding, Plan: 03*
*Completed: 2026-06-08*
