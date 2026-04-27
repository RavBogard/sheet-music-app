---
phase: v5h-01-track-edit-save-loss
plan: 01
subsystem: sync-engine
tags: [firestore, security-rules, snapshot-listener, lazy-hydration, dexie, outbox, permission-denied, vitest, fast-check]

requires:
  - phase: v50-07-migration-cutover
    provides: lazy-hydration cascade in SetlistGridHydrator + perf-view dual-read; sentry-capture observability; UAT plan that surfaced the bug
  - phase: v50-06-concurrent-edit-safety
    provides: ProductionFirestoreAdapter with expectedUpdatedAt threading; ReconciliationProvider; engine writeback contract; property-failures harness primitives (SharedRemote, OfflineToggleAdapter, etc.)
provides:
  - reproduction harness for engine-undefined-writeback ∩ listener-undefined-underflow conjunction (CachedThenFreshSubscriber + UndefinedWritebackAdapter + TimestampedWritebackAdapter)
  - production state postmortem confirming actual root cause (missing Firestore rules for tracks/{id} + songs/{id})
  - decision resolution (E + F + B) for v5h-01-02 to consume
affects: [v5h-01-02 (fix), v5h-01-03 (postmortem), v5.1 UX overhaul (copy improvement noted), all future cutover plans (rules-audit gate)]

tech-stack:
  added: []
  patterns:
    - "Cached-then-fresh snapshot subscriber harness pattern — frozen-state subscriber that fires sync delivery on subscribe + explicit pushFreshDelivery for fresh deliveries; models Firestore SDK initial-cache-then-fresh delivery semantics"
    - "Production state capture as HUMAN-ACTION checkpoint before harness work — diagnosis sequence inversion lesson"

key-files:
  created:
    - .paul/postmortems/v50-07-save-loss-investigation.md
    - .paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md
  modified:
    - src/lib/sync/__tests__/property-failures.test.ts

key-decisions:
  - "Decision: fix shape = E + F + B defense-in-depth (Firestore rules + Hydrator outbox-pending guard + listener LWW underflow fix)"
  - "Decision: keep AC-1 reproduction harness even though it models a secondary bug shape — it locks a real regression for option B"
  - "Decision: original A/B/C/D options REJECTED as proximate fix; demoted to defense-in-depth"

patterns-established:
  - "Pattern: production state capture (DevTools Dexie inspection) BEFORE reproduction harness in v5h-style diagnosis plans — sequencing in v5h-01-01 surfaced the actual root cause that would have been missed by code-reading alone"
  - "Pattern: in-memory test adapters cannot model security rules — cutover plans need an explicit rules-audit gate or Firebase emulator integration"

duration: ~120min
started: 2026-04-27T13:00:00Z
completed: 2026-04-27T15:00:00Z
---

# v5h-01-01: Reproduce + diagnose track-edit save-loss — SUMMARY

**Production state capture inverted the bug diagnosis: the proximate cause is missing Firestore rules for `tracks/{id}` + `songs/{id}` (v50-05 cutover never deployed accompanying rules), not the engine writeback / listener LWW conjunction the original handoff hypothesized. Reproduction harness shipped + decision resolved to E+F+B for v5h-01-02.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~120 minutes (1 session, 2026-04-27) |
| Started | 2026-04-27T13:00:00Z |
| Completed | 2026-04-27T15:00:00Z |
| Tasks | 3 of 3 (1 auto, 1 human-action, 1 decision) |
| Files modified | 1 source (test) + 2 docs |
| Suite delta | +2 tests (1474 → 1476); tsc + build clean |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Reproduction harness fails on master, passes the assertion shape we want post-fix | Pass | Implemented as `it.fails(...)` — passes when inner assertion throws. Suite green. AC-1 reproduces engine-undefined-writeback ∩ listener-undefined-underflow conjunction deterministically. |
| AC-2: Fidelity-gap counter-test passes on master | Pass | TimestampedWritebackAdapter returns real `updatedAt`; engine writeback lands; listener LWW guard skips correctly. Proves the bug is the conjunction, not a general listener regression. |
| AC-3: HUMAN-ACTION production state capture documents observed Dexie shape | Pass | `.paul/postmortems/v50-07-save-loss-investigation.md` committed with: 50+ failed outbox rows on setlist `kQNvssixRlHQRB6gtWqt`, 2 sample rows verified (localId 53 + 95) with `lastError: "Auth failure on tracks/...: permission-denied"`, firestore.rules audit confirming no `match /tracks/{trackId}` or `match /songs/{songId}` blocks. Hypothesis classification: A/B/C from original handoff REJECTED, new E (rules) + F (Hydrator clobber) confirmed. |
| AC-4: Decision-checkpoint resolves to fix shape | Pass | Resolved to **E + F + B** (defense-in-depth). Recorded below + in STATE.md decisions log. |

## What Was Built

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/sync/__tests__/property-failures.test.ts` | Modified (+~330 LOC) | New describe block `v5h-01-01: track-edit save-loss reproduction (cached-then-fresh listener delivery)` with `UndefinedWritebackAdapter` + `TimestampedWritebackAdapter` + `CachedThenFreshSubscriber` + `bootEngine` helper + AC-1 (it.fails) + AC-2 (it) tests |
| `.paul/postmortems/v50-07-save-loss-investigation.md` | Created | Production state postmortem: outbox shape, sample failed rows, firestore.rules audit, hypothesis classification, recovery options, lessons for v5h-01-03 |
| `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md` | Created | This document |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Fix shape = E + F + B | Production state capture revealed actual root cause is missing Firestore rules, not the engine race the original handoff hypothesized. E is the proximate hotfix. F closes the silent-loss path independently of rules (Hydrator re-priming clobbers stuck-pending edits). B is the original 2-line listener guard that locks the AC-1 regression. | v5h-01-02 ships all 3 as a single hotfix; rules deploy via Firebase CLI from session; Daniel's recovery is a one-shot outbox clear (50+ stuck rows). |
| Keep AC-1 reproduction harness despite modeling a secondary bug shape | The bug it reproduces (engine-undefined-writeback ∩ listener-undefined-underflow) is a real concern; the listener fix in option B is locked by flipping `it.fails` → `it` after v5h-01-02 ships. | Future races that leave local rows with undefined `updatedAt` are caught by regression. |
| Defer Sentry observation analysis | Daniel hard-refreshed mid-investigation, wiping in-memory Sentry buffer. Per v50-07-05 wiring, the engine should fire `feature:dead-letter` on `DRAIN_BUDGET_EXHAUSTED`, but AuthError-on-second-attempt skips the retry loop — so dead-letter capture probably DIDN'T fire for permission-denied cases. Alarm-coverage gap to confirm. | Routed to v5h-01-03 postmortem for Sentry coverage audit. |

## Verification Results

```
npx vitest run src/lib/sync/__tests__/property-failures.test.ts
  → 15 passed (was 13 → +2 from this plan's AC-1 + AC-2)
  → 27.6s

npx vitest run (full suite)
  → 1476 passed (was 1474 → +2)
  → ~34s (one pre-existing cross-tab-lock flake unrelated to this work)

npx tsc --noEmit
  → clean

npm run build
  → clean (Next.js prod build)
```

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | Plan was research-only; no production code touched. |
| Scope additions | 0 | All work confined to plan boundaries. |
| Diagnosis pivots | 1 | Captured evidence inverted the original A/B/C/D fix-shape hypothesis tree; Task 3 reframed with E/F/B options. Documented in postmortem; SUMMARY captures rationale. |

### Diagnosis pivot

**1. Original handoff's A/B/C/D hypothesis was wrong about proximate cause**

- **Found during:** Task 2 (HUMAN-ACTION production state capture)
- **Issue:** The original handoff was drafted from code-reading alone before any production state capture. It correctly identified two real code-level concerns (engine.ts:264 writeback-skip + snapshot-listener.ts:215 LWW underflow) but those are not the proximate cause in production.
- **Actual root cause:** Missing Firestore security rules for `tracks/{trackId}` + `songs/{songId}` collections. Confirmed by 2 sample failed outbox rows with identical `lastError: "Auth failure on tracks/...: permission-denied"` + `firestore.rules` audit showing no `match /tracks/{...}` or `match /songs/{...}` blocks.
- **Resolution:** Task 3 decision-checkpoint reframed with new options E (rules + recovery) + F (Hydrator outbox-pending guard) + B (original listener LWW fix). Selected E + F + B for v5h-01-02. Documented in postmortem investigation file.
- **Verification:** firestore.rules audit reproducible by `grep -n "match /tracks\|match /songs" firestore.rules` (returns nothing).

### Deferred Items

- **Sentry coverage audit:** Daniel hard-refreshed mid-investigation; could not check Sentry dashboard for `feature:dead-letter` events. Alarm-coverage gap suspected (AuthError-on-second-attempt path may not trigger `DRAIN_BUDGET_EXHAUSTED`). Routed to v5h-01-03 postmortem.
- **Recovery mechanism design:** Daniel + 0 band members are the only affected users; simplest recovery is a one-shot dev console snippet. Routed to v5h-01-02 implementation. Alternatives (boot-time auto-clear, "Reset & Retry" button in ReconciliationProvider) deferred unless real-world patterns demand.
- **Lazy-hydration retry semantics:** When the cascade fails, does `setlists.hydrated:true` still get written (because `applyEdit` succeeds locally even when drain fails)? If yes, the cascade becomes a one-shot that never retries — even worse failure mode. Need to read `SetlistGridHydrator.tsx` to confirm. Routed to v5h-01-02 fix planning.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| First test run reported "1 failed" in full suite (1475/1476) | Re-run confirmed 1476/1476; the failure was the documented pre-existing cross-tab-lock flake, unrelated to this plan. |
| Bash `cd sheet-music-app && ...` failed because cwd was already inside `sheet-music-app` after a prior command | Switched to absolute-path `cd` form; resolved. |
| Original checkpoint instructions referenced `crc-sync` IndexedDB name; production actually uses `crc-local` (`crc-sync` is the cross-tab-lock channel name) | Corrected mid-investigation; Daniel found the right database. |

## Skill Audit

`/ui-ux-pro-max` from `.paul/SPECIAL-FLOWS.md`: NOT required for this plan (engine + harness + investigation, no UI surface). Confirmed in plan's `<skills>` section. ✓ All required skills invoked (none required).

## Next Phase Readiness

**Ready:**
- v5h-01-02 fix plan has a concrete spec: file paths, line numbers, test markers to flip, deploy command, recovery approach all documented in this SUMMARY's "Hand-off to v5h-01-02" section below.
- AC-1 regression test is in place; flipping its `.fails` marker after v5h-01-02 ships locks the bug closed.
- Postmortem investigation file contains the production evidence v5h-01-03 will cite.
- Firebase CLI is available in this session for the rules deploy step.

**Concerns:**
- The 50+ failed outbox rows in Daniel's `crc-local` represent accumulated debt; v5h-01-02's recovery step needs to clear them or retry will pile on more.
- v5h-01-02 ships 3 fixes (rules + Hydrator + listener) in one plan; risk of scope creep. If 3 tasks feels heavy, split B into a follow-up — option E + F is the actual hotfix.
- Lazy-hydration retry semantics (deferred above) may surface a 4th fix surface in v5h-01-02 once the SetlistGridHydrator code is read.

**Blockers:** None.

---

## 1. Reproduction harness

Added a new describe block at the end of `src/lib/sync/__tests__/property-failures.test.ts`:

> `v5h-01-01: track-edit save-loss reproduction (cached-then-fresh listener delivery)`

New helpers (scoped to the describe block):

- `class UndefinedWritebackAdapter implements FirestoreAdapter` — writes to `SharedRemote` like `OfflineToggleAdapter` but always returns `{}` from `commitOutboxRow` for set/update, modeling the engine.ts:264 writeback-skip path when the production adapter's getDoc readback races serverTimestamp resolution.
- `class TimestampedWritebackAdapter implements FirestoreAdapter` — same shape but returns a real ms `updatedAt` for the AC-2 counter-test.
- `class CachedThenFreshSubscriber` — a `SnapshotSubscriber` that captures a frozen snapshot of `SharedRemote` at construction time, fires it synchronously on `subscribeTracks` (deferred one microtask to mirror Firestore SDK behavior), and exposes `pushFreshDelivery(setlistId)` for explicit fresh deliveries. This is the fidelity gap the v50-07-04 kitchen-sink missed (in-memory `SharedRemoteSubscriber` re-emits LIVE state on every call — fresh-only delivery).
- `bootEngine(adapter)` helper — boots a `SyncEngine` against the singleton `getDb()` (so applyEdit-driven tests work), wired to the supplied adapter; returns `{ engine, cleanup }`.

Two new tests:

- **AC-1** (marked `it.fails` — passes when inner assertion throws): models Daniel's flow against `UndefinedWritebackAdapter`. Set track t1 (no key), drain (writeback skipped), capture pre-edit cached SharedRemote, update key='E', drain (writeback skipped again), mount snapshot listener with cached state. Local `db.tracks.t1.key` should be 'E' but is clobbered to undefined by the cached delivery — `it.fails` confirms the bug reproduces.
- **AC-2** (regular `it` — passes on master): same flow against `TimestampedWritebackAdapter` (returns real ts). Engine writeback lands; listener LWW guard skips correctly because local has a newer updatedAt than cached delivery. Proves the bug is the **conjunction** of "adapter returned undefined" AND "listener underflows undefined", not a general listener regression.

### Suite delta + verification

- Property-failures suite: 13 → 15 tests (`+2`), all passing.
- Full project suite: 1474 → 1476 tests passing (one pre-existing cross-tab-lock flake unrelated to this work).
- `npx tsc --noEmit` clean.
- `npm run build` clean.

### Note on the harness vs production reality

The harness reproduces a real but **secondary** bug shape (engine-undefined-writeback ∩ listener-undefined-underflow). The PRIMARY production bug — missing Firestore rules — cannot be modeled by any in-memory adapter harness. AC-1 should remain in the suite (with `.fails` flipped to passing once the option-B listener guard ships) as defense against future races; v5h-01-02 will add a separate harness or smoke test for the rules-deploy path.

## 2. Production state capture

Captured into `.paul/postmortems/v50-07-save-loss-investigation.md` from Daniel's Chrome DevTools session against `/setlists/kQNvssixRlHQRB6gtWqt`.

Key findings:

- **`crc-local`/`outbox` has 50+ rows** for the affected setlist, almost all `failed` `op:'set'` for `tracks/{uuid}` with `lastError: "Auth failure on tracks/{uuid}: permission-denied"`. Two sample rows verified (localId 53 and 95); pattern is universal.
- The user's actual key edits are **`pending`, never drained** because per-doc drain ordering blocks them behind the failed `set` row at the same docId.
- **`firestore.rules` audit**: `match /setlists/{...}` exists with rich rules, but **no `match /tracks/{trackId}` and no `match /songs/{songId}`**. Firestore default-denies; v50-05's cutover never deployed accompanying rules.
- The reconciliation modal Daniel saw repeatedly opening is the engine correctly surfacing failed outbox rows as `conflict` state — the bug is loud, not silent (the original handoff was wrong about that too).
- The "key gone after navigate-away" symptom is driven by `SetlistGridHydrator` re-priming `db.tracks.put(initialServerData)` from the legacy embedded `setlists/{id}.tracks[]` array, overwriting the user's stuck-pending local edit. This is a SECONDARY clobber path independent of the listener.

Sentry observations deferred — Daniel hard-refreshed mid-investigation before we could check the dashboard.

## 3. Decision Resolution

**Selected: E + F + B (defense-in-depth).**

### E — Firestore rules + recovery (PRIMARY hotfix)

Files to touch in v5h-01-02:
- `firestore.rules` — add `match /tracks/{trackId}` block with band_leader/admin write permissions, mirroring `match /setlists/{setlistId}` patterns at lines 83+. Add `match /songs/{songId}` similarly. Authenticated-read for both.
- Deploy mechanism: `firebase deploy --only firestore:rules` (Firebase CLI is available in this session).
- Recovery for affected users: a one-shot dev console snippet (or a hidden admin button) that wipes all `failed` outbox rows from `crc-local`. Daniel + 0 band members = total blast radius, simplest recovery is acceptable.
- Verification: deploy rules, walk Daniel through clearing his outbox, re-run UAT scenario 1 against prod, confirm the cell edit lands.

Decision rationale: the proximate cause is the rules gap. Without E, nothing else works.

### F — Hydrator outbox-pending guard (SECONDARY silent-loss closure)

Files to touch in v5h-01-02:
- `src/components/setlist/grid/SetlistGridHydrator.tsx` — before each `db.tracks.put` of `initialServerData`, check `db.outbox.where(['collection', 'docId']).equals(['tracks', t.id]).count()`; skip the put if any outbox row exists for the docId. Mirror the snapshot-listener's outbox-pending guard at `snapshot-listener.ts:197`.
- Add tests in `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx` proving the priming skip-path on every state combination.

Decision rationale: the "key gone after navigate-away" silent-loss path is independent of the rules issue. Even AFTER rules are deployed, any future stuck-pending outbox row (network failure, conflict, etc.) would be silently clobbered by Hydrator re-priming on re-mount. Closing this path is required for the v5.0 "bulletproof" claim to hold.

### B — Listener LWW guard against undefined local.updatedAt (TERTIARY defense)

Files to touch in v5h-01-02:
- `src/lib/sync/snapshot-listener.ts:174` — change the setlists-branch guard:
  ```ts
  // Before:
  if ((local?.updatedAt ?? 0) >= delivery.updatedAt) return
  // After:
  if (local?.updatedAt !== undefined && local.updatedAt >= delivery.updatedAt) return
  ```
- `src/lib/sync/snapshot-listener.ts:215` — symmetric change in the tracks branch:
  ```ts
  // Before:
  if (local && (local.updatedAt ?? 0) >= change.updatedAt) continue
  // After:
  if (local && local.updatedAt !== undefined && local.updatedAt >= change.updatedAt) continue
  ```
- After ship: in `property-failures.test.ts`, flip the AC-1 marker from `it.fails(...)` → `it(...)`. The test (already written in this plan) becomes the regression lock.
- Update inline comments at both sites to document the underflow protection (refer to v5h-01 postmortem).

Decision rationale: the smoking-gun observation is real. Even though it's not the proximate cause of Daniel's reported bug, it IS a bug in the listener that could surface independently as soon as any code path leaves a local row with undefined `updatedAt` (which can happen during applyEdit on a newly-set row before any successful drain). 2-line surgical change locking a regression test is cheap.

## 4. Lessons for v5h-01-03 postmortem

Three findings worth capturing in the v5h-01-03 postmortem (final plan in v5.0-hotfix milestone):

1. **Kitchen-sink (v50-07-04) cannot model security rules.** In-memory adapters always permit writes; Firestore security rules are a backend deployment concern. To catch this class of bug we would need (a) Firebase emulator integration in the kitchen-sink harness (the deferred "real-Firestore lite" mode), OR (b) an explicit security-rules audit gate in cutover plans, OR (c) a manual smoke test against staging/production after every cutover that introduces new collections. This is the fidelity gap that allowed v50-05 to ship completely broken in production.

2. **Cutover plans must include a rules audit.** v50-05-01 introduced top-level `tracks/{id}` writes; v50-05-02 cut the production editor over to those writes; v50-07-03 added lazy-hydration that fan-out-multiplies the failure surface. None of those plans included "audit firestore.rules for new collection paths". The original v50-05 ARCHITECTURE.md should have flagged this, but didn't. SPECIAL-FLOWS.md or a project convention should make this an explicit gate going forward.

3. **The handoff was drafted from code-reading alone, before any production state capture.** This produced a hypothesis tree (A/B/C) that pointed at real code-level concerns but not the actual bug. v5h-01-01 spent effort building a harness for the wrong bug shape. Lesson: production state capture (the HUMAN-ACTION checkpoint) should come BEFORE the reproduction harness in future v5h-style diagnosis plans, so the harness targets the actual bug. The harness work isn't wasted — AC-1 still locks a real regression — but the sequencing was suboptimal.

4. **The bug is loud, not silent.** The original handoff said the indicator showed "Saved" — but on inspection of the same setlist later, it showed red `failed-retry` and the reconciliation modal was firing repeatedly. The engine's observability layer (v50-06 + v50-07-05) is doing its job. The user-visible message ("detected changes from somewhere else") doesn't communicate the actual problem; copy improvement for v5.1.

## 5. Boundary log

- ✅ No production source files modified by this plan.
- ✅ All changes confined to `src/lib/sync/__tests__/property-failures.test.ts` (additive describe block) and `.paul/postmortems/v50-07-save-loss-investigation.md` (new file).
- ✅ All v50-07-05 substrate (engine.ts, snapshot-listener.ts, init.ts, firestore-adapter.ts, sentry-capture.ts) untouched.
- ✅ Dexie schema, Firestore rules, lazy-hydration logic all unchanged.
- ✅ tsc + next build clean post-changes.

## Hand-off to v5h-01-02

The next plan (v5h-01-02) ships **E + F + B** as a single hotfix. Tasks:

1. **firestore.rules**: add `tracks/{trackId}` and `songs/{songId}` match blocks, deploy via Firebase CLI, smoke-verify with a test write from prod.
2. **SetlistGridHydrator**: add outbox-pending guard around `db.tracks.put` priming + tests.
3. **snapshot-listener**: 2-line LWW guard fix (lines 174 + 215) + flip AC-1 marker from `it.fails` → `it` + comment-document the underflow protection.
4. **Recovery**: provide Daniel a one-shot dev-console snippet to clear his stuck outbox, OR ship a small one-time migration that runs at engine boot if a "v5.0-hotfix" marker isn't yet set.
5. **Verification**: Daniel re-runs UAT scenario 1 against prod after rules deploy + outbox clear; confirm cell edit lands; sync indicator goes Saved (real this time); re-open setlist; key persists.

Specific assertion to flip in `property-failures.test.ts`: the `it.fails(...)` at the v5h-01-01 describe block's AC-1 test → `it(...)`. Test name + body remain identical; just the marker changes.

After v5h-01-02 closes: v5h-01-03 (postmortem) → v5.0-hotfix complete → v5.1 UX overhaul → `/paul:audit-milestone` closes v5.0.
