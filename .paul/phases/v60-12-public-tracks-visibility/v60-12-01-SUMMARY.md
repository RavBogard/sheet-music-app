---
phase: v60-12-public-tracks-visibility
plan: 01
subsystem: auth-rules
tags: [firestore-rules, public-access, perform-view, snapshot-listener, emulator, rules-unit-testing]

requires:
  - phase: v60-08-migration-cleanup
    provides: removed embedded-tracks fallback; tracks/{trackId} is sole source
  - phase: v60-11-shortcut-aware-songs-mirror
    provides: single-plan emergent-phase template + pre-APPLY audit discipline
  - phase: v60-03-h-sl-7-emulator-canary
    provides: Firebase emulator infra (Java JDK 21 + firebase emulators:exec)
provides:
  - Public read on `tracks/{trackId}` Firestore rule (writes still locked)
  - `useSetlistPerformance` mounts snapshot listener for unauthenticated users
  - `@firebase/rules-unit-testing` dev dep + 8-scenario rules emulator test suite
  - Production rules deployed to crcmusiccharts
affects: [v6.0 milestone close, future public-surface features (v7.x)]

tech-stack:
  added: ["@firebase/rules-unit-testing@^5.0.1"]
  patterns:
    - "Firestore rules emulator testing via @firebase/rules-unit-testing (initializeTestEnvironment + assertSucceeds/assertFails)"
    - "Public-read-by-default for entities that are derived projections of already-public parents (setlists are public → tracks/* extension)"

key-files:
  created:
    - src/lib/songs/__tests__/firestore-rules-tracks.emulator.test.ts
  modified:
    - firestore.rules
    - src/hooks/use-setlist-performance.ts
    - src/hooks/__tests__/use-setlist-performance.test.ts        # contract-reversal test update
    - package.json + package-lock.json                            # @firebase/rules-unit-testing dev dep
    - .paul/STATE.md
    - .paul/ROADMAP.md

key-decisions:
  - "Option A (simple `allow read: if true`) over Option B (parent-doc visibility check) — setlists already public; +1 Firestore read per track read on Option B; no `public: true` flag exists to gate against"
  - "Songs/{id} rule STAYS member-only — public perform view doesn't subscribe to songs/* (snapshot-listener only covers setlists + tracks); subscribeSongsLibrary lives in editor-side SetlistGridHydrator which public users don't hit"
  - "Add @firebase/rules-unit-testing dev dep rather than skip rules testing — rules edits are high-blast-radius (typo = production lockout); emulator safety net is non-negotiable"
  - "Effect deps trimmed from [setlistId, user, startSnapshotListener] to [setlistId, startSnapshotListener] — listener doesn't care about auth identity once mounted; avoids re-mount churn during mid-session sign-in"
  - "Reverse the existing 'does NOT mount listener for public users' test rather than delete it — preserves intent + documents the contract change in test history"

patterns-established:
  - "Firestore rules tests use the production rules file (readFileSync of firestore.rules) — single source of truth; no test-specific rule fork"
  - "8-scenario rules-test matrix: 2 read scenarios (single-doc + query) × 3 write scenarios (create/update/delete) × auth contexts (unauth + member-only + band-leader/admin) — covers the read-write × role product"
  - "Contract-reversal test rewrites cite the prior contract + the reason for change in a comment block — preserves audit trail for future-me"

duration: 25min
started: 2026-05-13T21:30:00Z
completed: 2026-05-13T21:55:00Z
---

# Phase v60-12 Plan 01: Public Tracks Visibility Summary

**Closes Daniel's 2026-05-13 UAT bug: incognito-browser visitors to centralreform.live can now see the upcoming setlist's tracks via the public perform view. Two-layer fix — Firestore rules opened on `tracks/{trackId}` + `useSetlistPerformance` hook now mounts the snapshot listener for unauthenticated users — plus rules-emulator test infrastructure (`@firebase/rules-unit-testing`) so this class of regression is caught in CI going forward.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min (PLAN + audit + APPLY + UNIFY) |
| Started | 2026-05-13T21:30:00Z |
| Completed | 2026-05-13T21:55:00Z |
| Tasks | 3 of 3 |
| Files modified | 6 (1 rules + 1 hook + 1 contract-reversal test + 1 NEW test + 2 deps/lock) |
| Production source delta | ~10 LOC (rules +6 comment lines + 1-line rule flip; hook +6 LOC comment + 2-LOC guard simplification) |
| Test delta | +163 LOC (NEW emulator test) + 6-LOC contract-reversal in existing test |
| Dev dep added | `@firebase/rules-unit-testing@^5.0.1` |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Firestore rules allow public read; writes locked | ✅ PASS | 8/8 emulator-test scenarios GREEN: A (single-doc read) ✓ / B (query) ✓ / C (unauth create) FAIL-as-expected / D (unauth update) FAIL-as-expected / E (unauth delete) FAIL-as-expected / F (member-only write) FAIL-as-expected / G (band-leader write) ✓ / H (admin write) ✓. Rules compile clean on production deploy. |
| AC-2: Hook mounts listener for public users + stale comment corrected | ✅ PASS | Existing test reversed from "does NOT mount" → "DOES mount"; comment block rewritten to cite v60-12-01 contract + Daniel UAT 2026-05-13 + the prior stale-comment confession. |
| AC-3: Emulator-verified end-to-end | ✅ PASS | Scenario B (unauth query where setlistId == X) returns all 3 seeded docs — proves the listener's subscribeToTracks pattern works against the new rules. |
| AC-4: Production smoke (Daniel-loop) | ⏳ PENDING-UAT | Carry-forward per v51-04 codified pattern. Daniel opens fresh-incognito centralreform.live + clicks "Perform" + verifies tracks render + PDF renders. |
| AC-5: HFG counter held at 0/3 | ✅ PASS | New emulator-backed rules test ships alongside the rules change; counter unchanged. |
| AC-6: Build + suite baseline preserved | ✅ PASS | `npx tsc --noEmit` EXIT 0; `npx next build` ✓ Compiled in 11.5s; `npx vitest run` 1636/52 — baseline matches v60-11 exactly (the +1 test in this phase is in the emulator config, not the main suite — runs via `npm run test:emulator` separately). |

## Accomplishments

- **Public perform view works for incognito visitors.** Daniel can now share centralreform.live with anyone — friends, family, congregation visitors — and they see the upcoming setlist + can click "Perform" to view tracks. Closes the most basic public-surface bug in the app.
- **Three layers of inconsistent specs aligned.** Firestore rules said "member-only", hook said "skip for public users due to permission-denied", comment said "page renders error for public users", page said "render empty state". All four are now consistent: public reads succeed → listener mounts for everyone → page renders the actual tracks.
- **Rules-testing infrastructure shipped.** First emulator-backed rules test in the project; future Firestore rules changes can use the same 8-scenario template (read × write × auth-context matrix). Worth its weight against the next rules edit's blast radius.
- **Production deployed without lockout.** Rules compiled clean via `firebase deploy --only firestore:rules --project crcmusiccharts`; no auth-token refresh needed (deploy relaxes a read constraint, doesn't change any write constraints). Existing signed-in band-leader sessions unchanged.
- **Pre-APPLY architectural audit pattern reused successfully.** Audit caught 5 concerns before APPLY: (1) songs/{id} not actually needed for public perform → confirmed via snapshot-listener.ts inspection (only subscribes to setlists + tracks); (2) PDFOverlay path → confirmed uses `/api/drive/file/[fileId]` route with `hasBrowserFetchMetadata` browser-fetch fallback, so public users can also load PDFs; (3) v60-09 archive flow uses admin SDK so unaffected; (4) emulator infra from v60-03 works; (5) auth-claim staleness not a concern because only relaxing reads. All 5 cleared before code touched.

## Task Commits

Single combined commit at transition (per memory `feedback_paul_phase_commits` — entire `.paul/phases/v60-12-public-tracks-visibility/` dir staged together):

| Task | Status | Description |
|------|--------|-------------|
| Task 1: firestore.rules public read + @firebase/rules-unit-testing dev dep + 8-scenario emulator test | DONE PASS | 8/8 scenarios GREEN against emulator |
| Task 2: useSetlistPerformance listener mounts for public users + stale comment corrected | DONE PASS | 15/15 hook tests GREEN incl. contract-reversal test |
| Task 3: `firebase deploy --only firestore:rules --project crcmusiccharts` | DONE PASS | Rules compiled clean; deploy complete; production live |

Planned combined commit: `feat(v60-12-01): public read on tracks/* + perf-view hook + emulator rules test; close incognito-perform bug`

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `firestore.rules` | Modified (+6 LOC audit comment + 1-line rule flip) | `match /tracks/{trackId}` `allow read: if isMember()` → `allow read: if true`; writes unchanged |
| `src/lib/songs/__tests__/firestore-rules-tracks.emulator.test.ts` | Created (163 LOC) | 8-scenario emulator-backed rules test (read × write × auth-context matrix); first such test in the project; reusable template for future rules edits |
| `src/hooks/use-setlist-performance.ts` | Modified (+6 LOC comment + 2-LOC guard simplification) | Mount snapshot listener for public users; stale comment corrected to cite v60-12-01 + Daniel UAT 2026-05-13 |
| `src/hooks/__tests__/use-setlist-performance.test.ts` | Modified (contract-reversal) | "does NOT mount for public users" → "DOES mount for public users"; comment cites the contract reversal + reason |
| `package.json` + `package-lock.json` | Modified | Added `@firebase/rules-unit-testing@^5.0.1` as dev dep |
| `.paul/STATE.md` | Modified | v60-12 LOOP COMPLETE + production deploy state recorded |
| `.paul/ROADMAP.md` | Modified | v60-12 row added as Wave 6 close-gate; v6.0 milestone status updated to 12/12 phases |
| `.paul/phases/v60-12-public-tracks-visibility/CONTEXT.md` | Created | Discussion context from Daniel UAT report |
| `.paul/phases/v60-12-public-tracks-visibility/v60-12-01-PLAN.md` | Created | 3-task plan with audit-derived constraints baked in |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Option A (`allow read: if true`) over Option B (parent-doc visibility check) | Setlists already publicly readable (firestore.rules:86); tracks are derived projection of the same surface. Option B would add +1 Firestore read per track read AND require adding a `public: true` flag to setlists with a backfill, neither of which exists today. | Tracks data (title, key, bpm, lead, type) is now public for ALL setlists — consistent with setlists being public. Future "private/draft setlists" feature (if ever needed) would require a fuller visibility model. |
| Songs/{id} rule STAYS member-only | Public perform view doesn't subscribe to songs/*. snapshot-listener only covers setlists + tracks; subscribeSongsLibrary lives in editor-side SetlistGridHydrator. Confirmed by reading snapshot-listener.ts. | Keeps songs/* catalog data (defaults/recent — internal sticky-memory) member-only without breaking public perform. |
| Add `@firebase/rules-unit-testing` dev dep (vs. skipping rules tests) | Rules edits are high-blast-radius — a typo can lock out production. Emulator safety net was non-negotiable. 1 new dev dep (zero runtime impact). | First emulator-backed rules test in the project; future Firestore rules edits inherit the testing pattern. |
| Effect deps trimmed from `[setlistId, user, startSnapshotListener]` to `[setlistId, startSnapshotListener]` | Listener doesn't care about auth identity once mounted; Firestore rules now allow public read so signed-in users get the same tracks the same way. Removing `user` from deps avoids re-mount churn during mid-session sign-in. | Slightly cleaner mount semantics; no functional regression (Firestore listener is identity-agnostic). |
| Reverse the existing public-users test rather than delete it | Preserves intent + documents the contract change in test history. Future engineers see the reversal and the comment explaining it. | One test count unchanged in main suite (1636 pass); no spurious "we deleted a test" signal in regression history. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Existing hook test asserted the OLD "does NOT mount for public" contract; reversed during APPLY to match new contract. Documented as contract-reversal (not a regression). |
| Scope additions | 0 | Boundaries respected |
| Deferred | 0 | All in-scope ACs satisfied (AC-4 PENDING-UAT per v51-04 codified pattern, not a deferral) |

**Total impact:** Pre-APPLY audit caught 5 architectural concerns and cleared all of them; APPLY ran clean with one anticipated test-update (contract reversal).

### Auto-fixed Issues

**1. Hook test "does NOT mount listener for public" required contract reversal.**
- **Found during:** Task 2 verify (`npx vitest run src/hooks`)
- **Issue:** Existing test asserted `expect(startFn).not.toHaveBeenCalled()` — the OLD contract from v5h-01-04 era. New contract per AC-2 is exactly the opposite.
- **Fix:** Rewrote test from "does NOT mount" → "DOES mount" with `expect(startFn).toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith(expect.objectContaining({ setlistId }))`. Added comment block citing v60-12-01 + Daniel UAT 2026-05-13 + the prior stale contract.
- **Files:** `src/hooks/__tests__/use-setlist-performance.test.ts`
- **Verification:** 15/15 hook tests GREEN post-update.
- **Commit:** part of the v60-12-01 combined commit.

### Deferred Items

None. AC-4 production smoke is PENDING-UAT carry-forward per v51-04 codified pattern — not a deferral, just the standard Daniel-loop UAT against deployed commit.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `npm run test:emulator -- <path>` doesn't pass args through to inner `vitest` — `firebase emulators:exec` complains "Too many arguments" | Direct invocation: `npx firebase emulators:exec --only firestore,auth "npx vitest run --config vitest.emulator.config.ts <path>"`. Workaround documented for future emulator-test invocations. |
| 40 npm audit vulnerabilities reported on `@firebase/rules-unit-testing` install (10 low / 16 moderate / 13 high / 1 critical) | Out of scope for v60-12-01; deferred to a future security cleanup phase. Vulnerabilities are in transitive dev-only deps; do not affect production runtime bundle. |

## Next Phase Readiness

**Ready:**
- v60-12 LOOP COMPLETE + production deployed + emulator-test safety net in place. v6.0 milestone-close gate now includes this fix.
- `@firebase/rules-unit-testing` infrastructure available for future rules edits — same 8-scenario template applies.
- Pre-APPLY audit pattern proven again — 5 concerns cleared cleanly before code touched.

**Concerns:**
- **AC-4 PENDING-UAT** — Daniel verifies incognito perform view shows tracks + PDF renders on deployed commit (Fri PM / Sat AM worship cycle).
- **PDF rendering for public users** — pre-APPLY audit indicated `hasBrowserFetchMetadata` in `/api/drive/file/[fileId]` lets browser fetches through without auth; this is plausible but NOT directly tested by an emulator. If Daniel's incognito UAT shows tracks but PDFs don't render, that's v60-13 candidate (separate auth gate on chart Storage URLs).
- **npm audit vulnerabilities** — 40 reported on install (dev-only deps; not production runtime). Worth a security cleanup phase eventually.
- **Future "private/draft setlists" feature** — not currently needed; would require a fuller visibility model (setlist `public: true` flag + dashboard/perform branching). Park as v7.x candidate.

**Blockers:**
- None for v6.0 milestone close. Daniel-loop UAT clears AC-4 → milestone closes via `/paul:complete-milestone` → v7.0 opens.

**v6.0 milestone-close gate** — 12 of 12 phases LOOP COMPLETE. Final close gated on Daniel-loop UAT across upcoming Fri PM + Sat AM worship cycle:
- AC-4 (v60-11) picker UAT — "Lechu" → "Lechu Goldman.pdf" surfaces
- AC-4 (v60-12) incognito perform UAT — tracks + PDF render for public users
- Accumulated PENDING-UAT carry-forwards from v60-01/02/04/05/06/09/10
- Issue 2 (setlist-missing cascade after deploys) diagnostic — Daniel clears site data + reports

---
*Phase: v60-12-public-tracks-visibility, Plan: 01*
*Completed: 2026-05-13*
