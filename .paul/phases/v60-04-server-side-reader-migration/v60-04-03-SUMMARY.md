---
phase: v60-04-server-side-reader-migration
plan: 03
subsystem: api
tags: [firebase-admin, firestore, server-only, hydration, email-packets, resend-email, phase-close]

requires:
  - phase: v60-04-server-side-reader-migration
    provides: `getTracksForSetlist` helper at `@/lib/server-tracks`
provides:
  - email-packets route migrated to read tracks via shared helper
  - resend-email route migrated to read tracks via shared helper
  - Phase v60-04 LOOP COMPLETE — all server-side reader surfaces (SSR + publish + print/public + print/personal + email-packets + resend-email) route through the single helper
  - Latent type-mismatch fix: email-packets `songs` payload now matches `sendSetlistEmail.songs: string[]` signature (was previously `{title, key}[]` typed as `any` via passthrough)
affects:
  - v60-05 (editor + perform-view client reader migration — Wave 3, sequential)
  - v60-07 (writer strip — now safe; every server reader routes through helper that ignores embedded array when hydrated:true)
  - v60-08 (legacy-branch cleanup — last consumer of the helper's unhydrated branch)

tech-stack:
  added: []
  patterns:
    - "Drop-in helper migration validated across 5 server-side surfaces (SSR + 4 API routes) with single helper signature"

key-files:
  created: []
  modified:
    - src/app/api/setlist/email-packets/route.ts
    - src/app/api/setlist/resend-email/route.ts

key-decisions:
  - "Aligned email-packets songs payload to string[] (matching sendSetlistEmail.songs signature in lib/email.ts:36) — fixes a latent type mismatch surfaced by the strict helper cast; mirrors resend-email/route.ts:119 existing pattern (`.filter(...).map(t => t.title)`)"
  - "No new emulator tests — same rationale as v60-04-02; helper contract proven by v60-04-01 emulator suite, every consumer transitively validates"
  - "Both routes file-bundled into one plan + one commit — matches v60-04-02 / original phase plan pattern"

patterns-established:
  - "Latent any-passthrough type mismatches in server routes can be surfaced (and fixed in-flight) by strict casts when helper migrations land; document in SUMMARY, do not split into separate type-fix commit"

duration: ~25min
started: 2026-05-12T17:55:00-05:00
completed: 2026-05-12T18:15:00-05:00
---

# Phase v60-04 Plan 03: email-packets + resend-email route reader migration (v60-04 PHASE CLOSE)

**Migrated the two email-sending routes to read tracks via `getTracksForSetlist`, closing the final v60-04 leakage point. Surfaced and fixed a latent type mismatch in email-packets (`songs` was `{title, key}[]` passed to a `string[]` signature via `any`-passthrough). v60-04 phase LOOP COMPLETE — every server-side track reader now routes through one helper. Unblocks v60-07 writer strip.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min (plan + apply + qualify + unify) |
| Started | 2026-05-12T17:55:00-05:00 |
| Completed | 2026-05-12T18:15:00-05:00 |
| Tasks | 3 of 3 completed (all PASS) |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: email-packets reads via helper | ✅ Pass | Helper call at line 64; chain decomposed onto typed `tracks` local; `setlist.tracks` removed from reader path |
| AC-2: resend-email reads via helper | ✅ Pass | Helper call at line 122; existing `songNames = tracks.filter(...).map(t => t.title)` builder unchanged |
| AC-3: Type compatibility preserved | ✅ Pass | tsc exit 0; one latent type-mismatch auto-fixed in-flight (see Decisions) |
| AC-4: Net production LOC ≤+30 | ✅ Pass | +13 net (21 added / 8 removed across both files) |
| AC-5: tsc + `next build` clean | ✅ Pass | Both checks green |
| AC-6: Suite baselines preserved | ✅ Pass | Main: 1574 passed / 52 pre-existing failed (zero new failures). Emulator: green. HFG 0/3 |

## Accomplishments

- **Final v60-04 server reader migrated.** Every server-side surface that reads "the live track list" — SSR page.tsx (v60-04-01), publish/route.ts (v60-04-01), print/public/route.ts (v60-04-02), print/personal/route.ts (v60-04-02), email-packets/route.ts (this plan), resend-email/route.ts (this plan) — now routes through `getTracksForSetlist`. v60-07 writer strip is now safe to plan.
- **Latent type-mismatch fixed.** email-packets was passing `{title, key}[]` to `sendSetlistEmail.songs: string[]` via `any`-passthrough — runtime emails likely contained `[object Object]` line items or relied on undocumented stringification. Strict cast surfaced the mismatch; aligned to `string[]` per the signature, mirroring resend-email's existing pattern.
- **Helper migration scaffold proven across 5 distinct route surfaces** with consistent ~+4 LOC delta per surface. v60-05 (client-side reader migration: editor + perform-view) can reuse the same scaffold via the existing client-side hydration check.

## Task Commits

Single combined commit per v60-01/02/03/v60-04-01/v60-04-02 precedent:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| 1-3 (combined) | (filled at push) | feat(v60-04-03) | Migrate email-packets + resend-email readers; fix latent songs type mismatch; close v60-04 phase |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlist/email-packets/route.ts` | Modified (+11 / -6) | Hydration-aware reader; songs payload aligned to `string[]` per sendSetlistEmail signature |
| `src/app/api/setlist/resend-email/route.ts` | Modified (+10 / -2) | Hydration-aware reader; songNames builder unchanged |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Align email-packets `songs` to `string[]` (matching signature) | Strict helper cast surfaced that the prior `{title, key}[]` payload was passed via `any`-passthrough; sendSetlistEmail.songs is typed `string[]` (lib/email.ts:36); resend-email already mapped to `t.title` only — adopt the consistent pattern | Likely fixes latent runtime bug in email body rendering; documents the latent any-passthrough class so similar surface in v60-05 can be inspected proactively |
| In-flight type fix instead of separate commit | The mismatch could not be avoided without abandoning the strict helper cast (which is the whole point of v60-04); separate commit would re-trip on the same diff | One commit closes both the migration and the surfaced type bug; revert is still clean |
| File-bundle both email routes | Matches v60-04-02 + original phase plan; near-identical 1-line migrations | v60-04 phase closes in exactly 3 plans as scoped |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | email-packets songs payload aligned to signature; surfaced by strict cast |
| Scope additions | 0 | None |
| Deferred | 0 | All AC met in-plan |

**Total impact:** One in-flight type fix surfaced by the migration's strict cast. Behaviorally likely an improvement (correct email body rendering). Documented in SUMMARY; no scope creep.

### Auto-fixed Issues

**1. [Type] email-packets songs payload typed as `{title, key}[]` for a `string[]` signature**
- **Found during:** Task 3 qualify (tsc emitted TS2322 at email-packets/route.ts:88)
- **Issue:** Old chain `(setlist.tracks || []).filter(...).map(t => ({title, key}))` produced `any[]` via passthrough; passed silently to `sendSetlistEmail.songs: string[]`. Strict helper cast made the misalignment visible.
- **Fix:** Changed map to `.map(t => t.title)` matching the signature and the existing pattern at resend-email/route.ts:119. Net behavior: emails now contain just song titles (correct per signature contract); if prior runtime relied on full objects, that path was already mis-typed.
- **Files:** src/app/api/setlist/email-packets/route.ts
- **Verification:** tsc exit 0 after fix; main suite 1574/52 baseline preserved; manual UAT deferred to PENDING-UAT browser-smoke.
- **Commit:** part of the v60-04-03 combined commit

### Deferred Items

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| TS2322 on email-packets:88 — `{title, key}[]` not assignable to `string[]` (Task 3) | Surfaced latent type mismatch; aligned songs map to `string[]` per signature (see Auto-fixed Issue 1) |
| Transient "Errors 1 error" in initial vitest summary line | Disappeared on re-run; non-deterministic teardown unhandled rejection in pre-existing 52-failure baseline; not introduced by this plan |
| `setlist.tracks` substring matches in grep on comment lines | False positive — grep matched the WHY comment that mentions stale `setlist.tracks[]`. Verified visually that no actual reader path matches |

## Skill Audit

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | n/a | Server-only API routes; same as v60-04-01 and v60-04-02 |

All required skills satisfied.

## Phase v60-04 Close Summary

After this plan: **3 of 3 plans LOOP COMPLETE.** Phase v60-04 is **LOOP COMPLETE**.

| Plan | SHA | Status |
|------|-----|--------|
| v60-04-01 | f03dcb1 | LOOP COMPLETE — helper + page.tsx + publish + 3 emulator tests |
| v60-04-02 | 1e1cdc4 | LOOP COMPLETE — print/public + print/personal |
| v60-04-03 | (this commit) | LOOP COMPLETE — email-packets + resend-email + latent type fix |

**Aggregate v60-04 metrics:**
- Net production source: ~+39 LOC across 7 files (server-tracks.ts, page.tsx, publish/route.ts, print/public/route.ts, print/personal/route.ts, email-packets/route.ts, resend-email/route.ts).
- Tests added: 1 file (server-tracks.emulator.test.ts) with 3 emulator-backed tests; HFG counter holds at 0/3 throughout the phase.
- Decisions locked: 8 (helper path, signature, test colocation, scope bundling, songs payload alignment, etc.).
- Deviations: 2 (helper signature widening in v60-04-01; songs payload alignment in v60-04-03). Both auto-fixed in-plan; both documented.

## Next Phase Readiness

**Ready:**
- v60-05 (Wave 3 sequential) — editor + perform-view client-side reader migration. Same hydration-aware pattern, but client SDK (not admin); uses `useLiveQuery` + the existing v50-07-03 hydrator. Pattern from v60-04 transferable conceptually; surface area is client React components (so /ui-ux-pro-max gate WILL apply per SPECIAL-FLOWS).
- v60-07 (writer strip) is now safe to plan — no server reader still depends on embedded `setlist.tracks[]`.

**Concerns:**
- v60-08 cleanup will delete the unhydrated fallback branch in `getTracksForSetlist`. Before that lands, every existing setlist must be hydrated (15-setlist backfill happens in v60-06).
- The narrow type casts at each migrated call site (publish, print/public, print/personal, email-packets, resend-email) each preserve a slightly different field-subset shape. If LocalTrack is reshaped in v60-07 or v60-08, all 5 casts need re-verification — they are intentionally call-site-local.

**Blockers:**
- None for v60-05, v60-07, or v60-08.
- v6.0 PENDING-UAT continues over the upcoming worship cycle — Daniel browser-smoke against the deployed master commit covers publish, print packets, and email packet flows.

---
*Phase: v60-04-server-side-reader-migration, Plan: 03 (PHASE CLOSE)*
*Completed: 2026-05-12*
