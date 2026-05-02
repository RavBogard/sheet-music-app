---
phase: v5h3-01-save-loss-recurrence
plan: 03
subsystem: sync-engine
tags: [version-mismatch, expectedUpdatedAt-threading, single-user-phantom-conflict, h-sl-7, engine-writeback, daniel-loop-uat]

# Dependency graph
requires:
  - phase: v5h3-01-save-loss-recurrence
    provides: H-SL-7 hypothesis (HIGH confidence post-Daniel-UAT-2026-05-02 reconciliation evidence) from investigation doc
  - phase: v50-06-concurrent-edit-safety
    provides: VersionMismatchError + DRAIN_VERSION_MISMATCH FSM dispatch + reconciliation modal contract (must be preserved)
  - phase: v50-03-local-first-sync-engine
    provides: writeback tx atomicity contract (engine.ts:259-282) — fix added one operation INSIDE this tx
provides:
  - Engine writeback now threads server updatedAt into pending outbox rows for same (collection, docId) — atomic with existing writeback
  - Single-user rapid same-doc edits no longer trigger phantom VersionMismatch
  - 3 new regression tests proving the fix + preserving v50-06-02 reconciliation contract for genuine multi-writer
affects: [v5h3-01-04 (postmortem — close v5h-01 §5 harness fidelity gap; document H-SL-7 mechanism), v53-02 chart-binding-and-verification (unblocked once v5h3-01 phase closes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pending-outbox expectedUpdatedAt threading: when engine writeback updates a server-stamped timestamp, also bump pending outbox rows for the same doc to thread the new baseline. Atomic with existing writeback. Reusable pattern for any offline-first sync engine with rapid-same-doc-edit support."
    - "Test discipline: prove the fix AND prove the prior contract still works. AC-3 explicitly tests v50-06-02 reconciliation still fires for genuine multi-writer (FailNthCallAdapter). Without AC-3 we'd be at risk of weakening cross-writer safety."

key-files:
  created: []
  modified:
    - sheet-music-app/src/lib/sync/engine.ts (writeback tx +28 LOC; one shared if-block now handles both entity writeback AND pending-thread)
    - sheet-music-app/src/lib/sync/__tests__/property-failures.test.ts (+387 LOC; new describe block "v5h3-01-03: pending-outbox expectedUpdatedAt threading" with 3 cases)

key-decisions:
  - "Folded existing entity-writeback if-check + new pending-thread if-check into one shared `if (result.updatedAt !== undefined && row.op !== 'delete')` block — equivalent + tighter; plan permitted this"
  - "Filter pending-thread on `status === 'pending'` only — never touch sending/failed rows (mid-flight or terminal; thread on next pump)"
  - "Filter on BOTH collection AND docId — cross-doc rows untouched (AC-1 boundary explicitly tested)"
  - "Test reuses module-scope helpers (SharedRemote, FakeChannelHub, FakeClock); two scope-local adapter wrappers added (CapturingTwoWriterAdapter for evidence + FailNthCallAdapter for genuine-multi-writer simulation)"

patterns-established:
  - "Engine writeback atomicity now covers 3 operations in one tx: outbox.delete + entity.put (existing) + pending-outbox-row.update for same doc (new). All three roll back together or all commit together."
  - "Two adapter wrapper patterns for reconciliation testing: CapturingAdapter (records expectedUpdatedAt seen per call → proves threading evidence) and FailNthCallAdapter (throws on Nth call → models genuine concurrent server-side write)"
  - "AC-3 'pre-existing-contract-preserved' pattern: any fix that narrows the trigger condition for an error class MUST include a test case proving the error class STILL fires under genuine conditions. Reusable for future engine fixes."

# Metrics
duration: ~30min (dispatched to dan-executor agent in parallel with v5h3-01-02 deploy)
started: 2026-05-02T10:00:00Z
completed: 2026-05-02T10:30:00Z
---

# v5h3-01-03: H-SL-7 Phantom-VersionMismatch Fix Summary

**Engine writeback now threads server `updatedAt` into pending outbox rows for the same `(collection, docId)`, atomically with existing writeback. Daniel's "Keep mine / Take theirs" modal will stop firing for single-user rapid same-doc edits. v50-06-02 reconciliation contract preserved for genuine multi-writer conflicts (AC-3 test). Suite 1557 → 1560. Pushed `36e9fa1` to origin/master; Vercel auto-deploying.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~30 minutes (executor agent, ~5min wall) |
| Started | 2026-05-02T10:00:00Z |
| Completed | 2026-05-02T10:30:00Z |
| Tasks | 2 of 2 PASS |
| Source files modified | 2 (engine.ts + property-failures.test.ts) |
| LOC delta | +415 (+28 source / +387 tests) |
| Tests added | +3 (1557 → 1560) |
| tsc | clean (0 errors) |
| next build | clean |
| Commit | `36e9fa1` (pushed origin/master) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Engine writeback threads server updatedAt into pending outbox rows for same doc | ✅ Pass | Inside existing writeback tx; same-collection same-docId filter; status==='pending' only; gated by `result.updatedAt !== undefined && row.op !== 'delete'` (folded into existing if-block) |
| AC-2: Regression test reproduces single-user phantom-VersionMismatch + confirms fix | ✅ Pass | Case 1: 3 sequential applyEdit on same docId with stale baseline → all drain → outbox empty → state='idle' (no VersionMismatchError) |
| AC-3: Pre-existing concurrent-edit reconciliation behavior preserved | ✅ Pass | Case 2: FailNthCallAdapter throws VersionMismatchError on 2nd commit → outbox has 1 failed row → state='conflict' → v50-06-02 contract intact |
| AC-4: Full suite + tsc + next build clean | ✅ Pass | 1560/1560 passing; tsc clean; next build clean; boundary diff matches files_modified (engine.ts + property-failures.test.ts only; build-info.json auto-stamped) |

## Accomplishments

- **The fix Daniel needs is in production.** Push `36e9fa1` to origin/master; Vercel auto-deploys (~2 min). After Daniel refreshes his iPad, rapid same-doc edits stop triggering the phantom reconciliation modal.
- **v50-06-02 reconciliation contract preserved.** AC-3 test (FailNthCallAdapter) explicitly proves genuine multi-writer scenarios still trigger conflict state + reconciliation modal. The fix narrows the trigger condition to genuine conflicts only; does not weaken cross-writer safety.
- **Surgical fix scope.** 28 LOC source + 387 LOC tests; only 2 files modified; engine FSM + state-machine + per-doc ordering + snapshot-listener LWW guards + applyEdit + v50-06-02 reconciliation modal + v5h-01 firestore.rules + v5h3-01-02 instrumentation ALL untouched.
- **Atomicity guaranteed.** New pending-thread operation lives inside the SAME `this.db.transaction('rw', this.db.outbox, this.db[row.collection], ...)` block as the existing outbox-delete + entity-writeback. All three roll back together or commit together.
- **Diagnosed mid-execution from Daniel's UAT report.** v5h3-01-02 instrumentation was still mid-execution when Daniel reported the reconciliation modal symptom. That single sentence pivoted the diagnosis from "6 open hypotheses, need round-2" to "H-SL-7 HIGH confidence, ship the fix today." Daniel-loop UAT discipline (codified v51-04) working as designed for the second time today.

## Files Created/Modified

| File | Change | LOC delta | Purpose |
|------|--------|-----------|---------|
| `src/lib/sync/engine.ts` | Modified | +28 | Pending-outbox expectedUpdatedAt threading inside writeback tx; same-collection same-docId filter; status==='pending' only; gated by existing entity-writeback condition (folded into one if-block) |
| `src/lib/sync/__tests__/property-failures.test.ts` | Modified | +387 | New describe block "v5h3-01-03: pending-outbox expectedUpdatedAt threading" with 3 cases (rapid-same-doc-no-mismatch / genuine-multi-writer-still-conflicts / cross-doc-untouched) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Fold entity-writeback if-block + pending-thread if-block into one shared `if (result.updatedAt !== undefined && row.op !== 'delete')` block | Plan permitted ("equivalent"); tighter writeback body; avoids re-evaluating same gate twice | Cleaner diff; identical semantics |
| Filter on `status === 'pending'` only | Never touch sending (mid-flight; engine will resolve on response) or failed (terminal; user must resolve via reconciliation modal) | Surgical; doesn't interfere with engine FSM transitions or user-initiated recovery |
| Filter on BOTH collection AND docId match | Cross-doc threading would be incorrect (different docs have independent updatedAt timelines); AC-1 boundary explicitly tested | Cross-doc isolation preserved |
| Two scope-local adapter wrappers in test | CapturingTwoWriterAdapter records expectedUpdatedAt-seen per call (proves threading evidence); FailNthCallAdapter throws VersionMismatchError on Nth call (models genuine multi-writer); cleaner than mocking the engine writeback tx | Reusable for future engine threading tests |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Auto-stamped | 1 | build-info.json (npm run build regenerates; not a code change) |
| Deferred | 0 | — |

**Total impact:** Plan executed exactly as designed. Zero deviations.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| None | Fix landed cleanly first try; all 3 AC tests passed on first run; full suite remained green |

## Skill Audit

`/ui-ux-pro-max` is NOT required (engine fix + regression test only; no UI surface change). Skill audit: ✓ correctly N/A.

## Next Phase Readiness

**Ready:**
- Push `36e9fa1` already deployed via `git push origin master` → Vercel auto-deploy in ~2 min
- Daniel can refresh iPad after deploy + continue editing; phantom reconciliation modal should stop firing for single-user rapid same-doc edits
- v5h3-01-02 auto-capture instrumentation still running — if a DIFFERENT save-loss class surfaces (H-SL-1, H-SL-8, or unidentified), Sentry breadcrumbs will catch it
- v5h3-01-04 final plan (postmortem + harness fidelity gap closure) can be planned now or after Daniel weekly worship cycle UAT confirms the fix holds

**Concerns:**
- AC-3 verifies v50-06-02 reconciliation contract preserved IN THE TEST HARNESS. Real production test = next time Daniel sees a genuine cross-tab or cross-device conflict (unlikely until band onboards).
- This fix addresses H-SL-7 specifically. H-SL-1 (TextCell race), H-SL-8 (snapshot-listener-bumps-local race), and any uncategorized H-SL-6 are NOT addressed — if Daniel hits a different save-loss pattern after this deploy, the v5h3-01-02 instrumentation will capture it and v5h3-01-04 (or sibling phase) can ship a follow-up.
- Harness fidelity gap (v5h-01 §5 action item #2) STILL open — v5h3-01-04 final postmortem must commit to closing it (Firebase emulator + RTL editor↔perf-view test pair). The kitchen-sink harness DID NOT catch H-SL-7 because in-memory zero-latency adapters never produced rapid-same-doc-edits with stale expectedUpdatedAt; this gap is now twice-implicated (v5h-01 + v5h3).

**Blockers:**
- None for v5h3-01-04 planning. v53-02 / v53-03 / v53-04 stay blocked behind v5h3-01 phase close (likely after Daniel weekly worship cycle UAT confirms the fix holds).

---

*Phase: v5h3-01-save-loss-recurrence, Plan: 03*
*Completed: 2026-05-02*
