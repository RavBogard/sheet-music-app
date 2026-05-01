---
phase: v52-05-default-template-management
plan: 01
subsystem: data
tags: [firestore, rules, pointer-doc, admin-curation, ServiceType, sticky-memory, wizard, clone]

requires:
  - phase: v52-01-recursive-research
    provides: Track D Option C selection + 6 OQ defaults locked + Phase 1 scope (shabbat_morning + friday_night)
  - phase: v51-03-create-setlist-wizard
    provides: findLastMatchingService + cloneSetlist generic + sticky-memory (v50-04) preservation rule
  - phase: v52-04-touch-affordance-setlist-lifecycle
    provides: SetlistCards kebab always-visible on iPad (the surface Phase 1 menu item lives in)
  - phase: v52-03-sync-indicator-ux-overhaul
    provides: editor topbar kebab REMOVED — established that the editor is NOT the entry point for v52-05
provides:
  - config/defaults Firestore pointer doc (admin-curated, signed-in read, admin write)
  - getDefaultForServiceType / setDefaultForServiceType service helpers
  - findLastMatchingService consults pointer first with silent fallback (Track D OQ Q5)
  - SetlistCards "Save as Default for {Shabbat Morning | Friday Night}" menu item gated isAdmin && Phase1
affects: [milestone-v5.0-audit, milestone-v5.2-close]

tech-stack:
  added: []
  patterns:
    - "Admin-curated pointer doc at config/{name} for cross-cutting curation (mirrors config/featured / config/congregation precedent)"
    - "Service-helper pointer-first lookup with silent fallback to legacy query — graceful degradation, no telemetry on absence"
    - "Test mocks: vi.resetAllMocks() (not vi.clearAllMocks) when tests sequence mockResolvedValueOnce queues across tests"

key-files:
  created: []
  modified:
    - firestore.rules
    - src/lib/setlist-firebase.ts
    - src/lib/setlist-audit.ts
    - src/components/setlist/SetlistCards.tsx
    - src/components/setlist/SetlistDashboard.tsx
    - src/components/setlist/SetlistHistoryPanel.tsx
    - src/hooks/use-setlist-dashboard.ts
    - src/lib/__tests__/setlist-firebase.test.ts
    - src/hooks/__tests__/use-setlist-dashboard.test.ts

key-decisions:
  - "Path: config/defaults (NOT system/templates from Track D draft) — codebase convention is config/* matching neighbors config/featured, config/congregation, config/admins"
  - "UI entry point: SetlistCards kebab (NOT editor kebab from Track D OQ Q4) — v52-03 explicitly removed editor kebab; SetlistCards kebab is the natural surface (always-visible on iPad post-v52-04)"
  - "Cleanup helper does NOT call engine.pump() — config/defaults is a regular Firestore doc, not on outbox path"
  - "Silent fallback on missing/dangling/repurposed pointer; no Sentry capture — alerting on absence is alert fatigue per OQ Q5"
  - "AuditAction union extension (+ 'set_as_default') triggered exhaustive-map error in SetlistHistoryPanel — auto-fixed with matching label"
  - "vi.resetAllMocks() in v52-05 describe to drop bleeding mockResolvedValueOnce queue from prior describe (vi.clearAllMocks doesn't reset implementation queues)"
  - "Daniel approved at HUMAN-VERIFY checkpoint with 'Approved' (explicit pass-through; not sight-unseen this time)"

patterns-established:
  - "Two-method service-layer pattern for admin-curated pointers: getXForY(key) + setXForY(key, value); the consultation site picks up the pointer with try-it-then-fall-back error handling"
  - "Phase-1 scope-gating in UI via const PHASE_X_SET = ReadonlyArray<EnumType> + .includes() check — additive expansion to other enum values requires only set extension, no schema migration"
  - "Cross-test mock isolation: when describes sequence mockResolvedValueOnce, use resetAllMocks rather than clearAllMocks"

duration: ~30min
started: 2026-04-30T20:55:00Z
completed: 2026-04-30T21:25:00Z
---

# Phase v52-05 Plan 01: Default-template pointer for Shabbat morning + Friday night

**Admin-curated `config/defaults` Firestore doc lets Daniel promote any Shabbat morning or Erev Shabbat setlist to canonical with one tap; `findLastMatchingService` consults the pointer first with silent fallback to the legacy 20-most-recent query on missing / dangling / repurposed pointers, so the wizard's Clone CTA picks up the canonical version automatically without breaking the existing flow.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30min |
| Started | 2026-04-30T20:55:00Z |
| Completed | 2026-04-30T21:25:00Z |
| Tasks | 5 of 5 |
| Files modified | 9 (7 source + 2 test; 0 new files) |
| Commits | 1 implementation (cf30d62) + Firebase rules deploy + plan metadata commits |
| LOC delta | +351 / −7 net (354 insertions per git diff --stat including tests; ~180 source LOC excl. tests, matching Track D's ~125 LOC estimate when accounting for bigger-than-expected service-helper bodies + the auto-fixed AuditAction expansion) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Firestore rules — config/defaults doc | Pass | `match /config/defaults` block adjacent to `config/featured`. Read: signed-in. Write: admin. Deployed to crcmusiccharts via `firebase deploy --only firestore:rules` (compile + release confirmed in CLI output). |
| AC-2: getDefaultForServiceType / setDefaultForServiceType round-trip | Pass | setDoc(merge: true) preserves other keys; getDoc returns null on missing doc; round-trip verified in unit test "setDefaultForServiceType writes config/defaults with merge: true" + "getDefaultForServiceType returns the pointer when doc exists". |
| AC-3: findLastMatchingService consults pointer first; silent fallback on miss | Pass | Pointer-preferred when matches verified ("findLastMatchingService prefers pointer over 20-most-recent when pointer exists and matches" — asserts `mockGetDocs.not.toHaveBeenCalled()`); dangling fallback verified ("falls back silently when pointer is dangling"); repurposed pointer covered by `setlistMatchesServiceType(candidate, type)` guard inside the pointer branch (not a separate test — the existing setlistMatchesServiceType test suite covers the predicate). |
| AC-4: SetlistCards kebab menu item — admin-gated, Phase-1-gated | Pass | `canSaveAsDefault = isAdmin && !!onSaveAsDefault && PHASE_1_DEFAULT_TYPES.includes(inferred)`; verified by HUMAN-VERIFY surfaces 3 + 4 (non-admin invisibility + out-of-Phase-1 invisibility). UI integration test deferred per plan boundary (no pre-existing SetlistCards.test.tsx). |
| AC-5: Save handler toast feedback | Pass | "v52-05: handleSaveAsDefaultClick" describe — 3 cases all pass (calls setDefaultForServiceType with correct args; success toast with friendly label; error toast on reject). |
| AC-6: Suite + build clean; no regression | Pass | 1528 → 1536 (+8 cases; exceeds plan estimate of +7). tsc clean (no output, exit 0). next build clean (route table prints, exit 0). Boundary diff confirms 9 source files modified — 2 beyond plan's files_modified are auto-fixes (setlist-audit.ts + SetlistHistoryPanel.tsx; see Deviations). Pre-existing parallel-suite test flake DID NOT surface this run; full suite reported clean 1536/1536. |
| AC-7: Firestore rules deployed before code is exercised in production | Pass | `firebase deploy --only firestore:rules --project crcmusiccharts` ran in Task 4 BEFORE git push. CLI output confirmed "rules file firestore.rules compiled successfully" + "released rules firestore.rules to cloud.firestore" + "Deploy complete!". Then commit cf30d62 pushed to origin master. v50-05 cutover-lesson ordering honored. |
| AC-7: Firebase CLI is auto, not human-action | Pass (process) | Plan revised same-day per Daniel's feedback: "you have firebase cli so you don't need me." Original Task 4 was a `checkpoint:human-action`; revised to an auto task that runs `firebase deploy` → `git commit` → `git push` in sequence. Saved feedback memory `feedback_firebase_cli.md` so future plans don't repeat the misclassification. |
| AC-8: Daniel-loop UAT — admin saves default and wizard picks it up | Pass (Daniel "Approved" at HUMAN-VERIFY checkpoint) | Daniel approved with explicit "Approved" — NOT sight-unseen this time (contrast with v52-03 / v52-04 which used "do it" / "Go"). Surfaces 1-4 verified; surface 5 (dangling fallback) optional and not tested explicitly. UAT failures (if any surface during weekly worship cycle) route to v52-05-02 follow-up plan in same phase per v51-04 rule. |

## Accomplishments

- **Daniel can now curate canonical setlists per service type with one tap.** `config/defaults.shabbat_morning` and `config/defaults.friday_night` get set via the new SetlistCards kebab item; the wizard's Clone CTA on a Shabbat morning or Erev Shabbat date automatically picks up the canonical setlist instead of the most-recent one. The 90% week-to-week clone workflow now starts from the curated version, not the implicit "most-recent matches."
- **Sticky-memory contract (v50-04) preserved.** Cloned tracks still pull fresh seeds via `seedTrackFromSong` at READ time — the pointer doc just changes WHICH setlist is the clone source, never ossifies tracks. Track D OQ Q5 silent-fallback semantics mean the existing 20-most-recent flow stays intact for: (a) users who haven't saved a default, (b) deleted defaults, (c) repurposed defaults (templateType drift).
- **Backwards-compatible by construction.** Zero migration. `config/defaults` doc starts empty and is populated lazily as Daniel uses the affordance. Pre-Phase-1 behavior is identical to today; post-first-save, Phase-1 service types switch to curated; non-Phase-1 service types continue with legacy query.
- **Rules-then-code deploy ordering shipped cleanly.** No drift between deployed rules and code expecting them — v50-05 cutover failure pattern avoided by the in-task ordering (firebase deploy → git commit → git push).
- **v5.2 milestone reaches 5 of 5 phases complete.** Band-onboarding gate cleared.

## Task Commits

Single vertical-slice implementation commit (precedent from v52-02 / v52-03 / v52-04). Rules deploy is a Firebase action, not a git artifact — but logged here for traceability.

| Task | Commit / Action | Type | Description |
|------|----------------|------|-------------|
| Task 1: Firestore rules + service-layer pointer helpers | `cf30d62` | feat | match /config/defaults block; getDefault + setDefault helpers; findLastMatchingService pointer integration |
| Task 2: SetlistCards menu item + dashboard handler | `cf30d62` | feat | inferServiceType + PHASE_1 set + SERVICE_TYPE_LABELS export; menu items in both UpcomingSetlistCard + SetlistCard; handleSaveAsDefaultClick toast wrapper; SetlistDashboard wiring |
| Task 3: Tests + tsc + next build | `cf30d62` (tests bundled) | feat (tests) | +5 setlist-firebase.test.ts cases under "v52-05 default-template pointer" describe; +3 use-setlist-dashboard.test.ts cases under "v52-05: handleSaveAsDefaultClick"; SetlistCards module mocked in handler tests |
| Task 4 (4a): firebase deploy --only firestore:rules | Firebase action | (deploy) | Compiled + released rules to cloud.firestore on crcmusiccharts BEFORE source push |
| Task 4 (4b): git commit + push | `cf30d62` | feat | Pushed to origin master after rules deploy |
| Task 5: HUMAN-VERIFY (deploy + UAT) | `cf30d62` (push) | n/a | Daniel approved with explicit "Approved" |

Plan metadata commits: `f7b4777` (initial plan), `15a1a6a` (revision: rules-deploy is auto not human-action per feedback)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `firestore.rules` | Modified (+15 lines) | New `match /config/defaults` block (read: signed-in; write: admin) adjacent to `config/featured` |
| `src/lib/setlist-firebase.ts` | Modified (+64 lines) | Added `getDoc`, `setDoc` to firebase/firestore imports; `getDefaultForServiceType`, `setDefaultForServiceType` helpers in createSetlistService; `findLastMatchingService` now consults pointer first with silent fallback |
| `src/lib/setlist-audit.ts` | Modified (+1 line; auto-fix) | Extended `AuditAction` union with `'set_as_default'` (logSetlistChange call site uses this) |
| `src/components/setlist/SetlistCards.tsx` | Modified (+73 lines) | Added Star icon import + ServiceType + getServiceContext imports; PHASE_1_DEFAULT_TYPES const; SERVICE_TYPE_LABELS exported map; inferServiceType helper; `isAdmin: boolean` + `onSaveAsDefault?` props on UpcomingCardProps + PastCardProps; menu item rendering blocks in both card kebabs |
| `src/components/setlist/SetlistDashboard.tsx` | Modified (+6 lines) | Destructure `handleSaveAsDefaultClick` from useSetlistDashboard; pass `isAdmin` + `onSaveAsDefault` through to both card sites (lines 204 + 236) |
| `src/components/setlist/SetlistHistoryPanel.tsx` | Modified (+1 line; auto-fix) | Added `set_as_default: 'Set as default for service'` to actionLabels exhaustive map (Record<AuditAction, string>) |
| `src/hooks/use-setlist-dashboard.ts` | Modified (+24 lines) | Imported SERVICE_TYPE_LABELS from SetlistCards; new `handleSaveAsDefaultClick` async toast wrapper; added to return object |
| `src/lib/__tests__/setlist-firebase.test.ts` | Modified (+120 lines) | Added `mockGetDoc`, `mockSetDoc`, `mockDoc` mocks; serverTimestamp returns `{ __serverTimestamp: true }`; existing findLastMatchingService describe gets `mockGetDoc.mockResolvedValue({ exists: () => false })` default in beforeEach so legacy tests still pass through the new pointer-first branch; new "v52-05 default-template pointer" describe with 5 cases (set/get round-trip; merge: true options; doc missing returns null; pointer-preferred over 20-recent; dangling fallback) using `vi.resetAllMocks()` in beforeEach to drop bleeding queues |
| `src/hooks/__tests__/use-setlist-dashboard.test.ts` | Modified (+54 lines) | Added `mockSetDefaultForServiceType` to setlist-firebase mock; new `vi.mock('@/components/setlist/SetlistCards', ...)` exporting SERVICE_TYPE_LABELS to avoid pulling component graph; new "v52-05: handleSaveAsDefaultClick" describe with 3 cases (handler calls service; success toast; error toast) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| `config/defaults` path (not Track D's `system/templates`) | Codebase convention is `config/{name}` matching `config/featured`, `config/congregation`, `config/admins`. New top-level `system/` path would add a precedent with no neighbors and force separate rules-block thinking. | Cohesive with existing rules; no new top-level path. |
| SetlistCards kebab entry point (not editor kebab from Track D OQ Q4) | v52-03 explicitly removed the always-disabled SetlistGridTopBar kebab as visual debt. Re-adding it would invalidate that decision. SetlistCards kebab is now always-visible on iPad post-v52-04, making it a natural and accessible surface. | Track D OQ Q4 superseded; v52-03 design coherence preserved; documented in plan + summary. |
| Service helpers do NOT call engine.pump() | `config/defaults` is a regular Firestore doc, not on the sync-engine outbox path. Engine doesn't manage admin-curated config docs. | Preserves engine boundary; mirrors v50-06-03 "write to Dexie, let pump observe" coupling discipline. |
| Silent fallback on missing/dangling/repurposed pointer; no Sentry capture | Track D OQ Q5 lock. Pointer absence is normal (lazy population); dangling pointer is normal lifecycle (admin deletes default). Capturing these as errors is alert fatigue. | Wizard UX unchanged on miss; admin can't tell anything went wrong (correct — nothing did). |
| AuditAction union extension auto-fix (added 'set_as_default') | TypeScript surfaces an exhaustive-map error in SetlistHistoryPanel.tsx the moment the union grows. Adding the matching label is the minimal, type-system-required fix. | Essential auto-fix, not scope creep. Admin history view now shows "Set as default for service" entries with the same affordance as "Saved as template." |
| `vi.resetAllMocks()` in v52-05 test describe (not vi.clearAllMocks) | clearAllMocks clears `.mock.calls` but does NOT reset implementation queues set via `mockResolvedValueOnce` — queued snapshots from prior tests bled into v52-05 cases (caught when "fallback" expectation got "most-recent"). resetAllMocks drops everything. | Clean test isolation; pattern documented for future tests that sequence ResolvedValueOnce queues across describes. |
| Mock `@/components/setlist/SetlistCards` in hook tests | The test imports useSetlistDashboard which imports SERVICE_TYPE_LABELS from SetlistCards.tsx — pulling in lucide-react icons + dropdown-menu primitives + the full component graph for a hook-only test. Mock returns just the label map. | Hook tests stay narrow; no DOM rendering needed for the handler verification. |
| Single vertical-slice commit (Tasks 1+2+3 bundled) | v51-04 / v52-02-01 / v52-03-01 / v52-04-01 precedent: cohesive feature change ships as one atomic commit when source + tests are inseparable. | Atomic git history; easy revert if UAT surfaces a regression. |
| Daniel approved with explicit "Approved" (not "do it" / "Go") | Daniel chose to read the surfaces summary carefully this time (last v5.2 phase; bigger surface area than the prior tiny v52-04 + v52-03 fixes). | Higher confidence on milestone-close; AC-8 has a real Daniel approval rather than a sight-unseen one. |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Both type-system-required, both contained in 1 LOC each. No scope creep. |
| Scope additions | 0 | Plan executed within stated boundaries. |
| Plan revisions (mid-flight) | 1 | Task 4 changed from `checkpoint:human-action` → `auto` after Daniel's feedback "you have firebase cli so you don't need me." Saved as feedback memory; plan re-committed (`15a1a6a`). |
| Deferred | 1 | Optional surface 5 (dangling fallback UAT) not explicitly tested by Daniel — not blocking. |

### Auto-fixed Issues

**1. [TypeScript] AuditAction exhaustive-map gap surfaced after union extension**
- **Found during:** Task 1 (after adding `'set_as_default'` to AuditAction in setlist-audit.ts)
- **Issue:** `tsc --noEmit` reported `TS2741` in SetlistHistoryPanel.tsx — `actionLabels: Record<AuditAction, string>` was missing the new key.
- **Fix:** Added `set_as_default: 'Set as default for service'` to the actionLabels object at SetlistHistoryPanel.tsx:60.
- **Files:** `src/components/setlist/SetlistHistoryPanel.tsx`
- **Verification:** tsc re-run clean (no output, exit 0).
- **Commit:** `cf30d62` (bundled with Task 1).

**2. [Test infra] mockResolvedValueOnce queue bleed across describes**
- **Found during:** Task 3 (running setlist-firebase.test.ts; "dangling fallback" test received "most-recent" snapshot from prior test's queue)
- **Issue:** `vi.clearAllMocks()` in beforeEach clears `.mock.calls` but NOT implementation queues set via `mockResolvedValueOnce`. Prior test's queued snapshot bled into the next test even though `not.toHaveBeenCalled()` had been asserted.
- **Fix:** Switched the v52-05 describe's beforeEach to `vi.resetAllMocks()` which drops queued implementations.
- **Files:** `src/lib/__tests__/setlist-firebase.test.ts`
- **Verification:** All 18 tests in the file pass; full suite 1536/1536 clean.
- **Commit:** `cf30d62` (bundled with Task 3).

### Plan Revisions Mid-Flight

**1. [Workflow] Task 4 reclassified from `checkpoint:human-action` → `auto`**
- **Found during:** Plan creation (after initial plan committed at `f7b4777`)
- **Trigger:** Daniel feedback: "Also: you have firebase cli so you don't need me"
- **Resolution:** Per superpowers checkpoint rules, deployments belong in auto tasks ("If Claude CAN automate it, Claude MUST automate it"); human-action is reserved for things with no CLI/API. Plan revised same-day at `15a1a6a` to fold `firebase deploy --only firestore:rules` into the source-push auto task. Order preserved: deploy → commit → push.
- **Memory:** Saved `feedback_firebase_cli.md` so future plans don't repeat the misclassification.
- **Impact:** Task count dropped from 6 → 5; autonomous=false now means just 1 HUMAN-VERIFY at end.

### Deferred Items

- **AC-8 surface 5 (dangling pointer fallback) UAT:** Optional in plan; Daniel approved without testing this path explicitly. Production behavior is verified by unit test "findLastMatchingService falls back silently when pointer is dangling" — if a dangling pointer surfaces in real-world use, behavior is correct (silent fallback to 20-most-recent).
- **Editor kebab entry point:** Not deferred per se — explicitly superseded by SetlistCards kebab decision. If admin curation in the editor surface ever becomes desirable (e.g., during the v5.x polish cycle), it would be a new plan, NOT a v52-05 follow-up.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Track D research said `EditorKebab.tsx` (file that doesn't exist) | Caught at plan-time. Track D's UX-entry-point recommendation predated v52-03's removal of the editor kebab. Used SetlistCards kebab instead; documented as a deviation in plan + this summary. |
| Track D path `system/templates` doesn't match codebase convention | Caught at plan-time. Used `config/defaults` matching `config/featured` / `config/congregation` precedent. Documented in plan. |
| `AuditAction` exhaustive-map error in SetlistHistoryPanel | Auto-fixed (see Auto-fixed Issues #1). |
| Test queue bleed across describes via `mockResolvedValueOnce` | Auto-fixed (see Auto-fixed Issues #2). |
| Initial plan misclassified rules-deploy as human-action | Daniel surfaced; plan revised same-day; feedback memory saved. |

## Skill Audit

| Skill | Required | Invoked | Notes |
|-------|----------|---------|-------|
| /ui-ux-pro-max | ✓ | ✓ (carryover from v52-04) | Auto-honored at v52-05 APPLY entry per plan note. No new query at APPLY entry — UI is a single menu item with admin/Phase-1 gating; no novel design ground vs the existing kebab dropdown items. |

## Next Phase Readiness

**Ready:**
- v5.2 milestone is now 5 of 5 phases complete (last phase shipped). Phase-close commit + state alignment land at transition.
- Daniel's curated default-template flow is live: tap kebab → save → next clone of that service type starts from the canonical version.
- All 7 v52-01 issues closed across 4 implementation phases (v52-02 through v52-05).
- Standing infrastructure for future ServiceType expansion: PHASE_1_DEFAULT_TYPES set + SERVICE_TYPE_LABELS map are additive; adding rosh_hashanah / sukkot / etc. would be a 4-line change (set + label + UAT) with no schema migration.
- v5.0 milestone audit unblocks pending Daniel weekly worship cycle UAT.

**Concerns:**
- Daniel's Phase-1 UAT verified surfaces 1-4; surface 5 (dangling pointer fallback) not explicitly exercised. Risk is low — covered by unit test, and the failure mode is "behaves like today."
- Pre-existing parallel-suite test flake remains across the codebase (route-auth.test.ts ↔ SetlistGridHydrator.test.tsx); not blocking, didn't surface this run, but worth tracking if frequency increases. Could be addressed via Vitest pool config tightening in a future test-infra plan.
- The SetlistCards mock in use-setlist-dashboard.test.ts is a small bit of test-infra debt — if SERVICE_TYPE_LABELS ever needs to expand to other types, the mock needs an explicit update. Trivial; flagged for traceability.

**Blockers:**
- None.

---
*Phase: v52-05-default-template-management, Plan: 01*
*Completed: 2026-04-30*
