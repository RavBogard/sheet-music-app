# Phase Context: v54-02 — Harness Fidelity Gate phase 1

**Milestone:** v5.4 (2nd phase; v54-01 ✅ LOOP COMPLETE 2026-05-08).
**Status:** Discussed 2026-05-08; ready for `/paul:plan`.
**Class:** Test infrastructure / dev infra. **BINDING** per v5h3-01-04 postmortem (`.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md`) + PROJECT.md §Constraints "Harness Fidelity Gate (binding from v5.3)". Counter currently 1 of 3.
**Authorization:** Daniel "Whatever you recommend. Continue. Autonomously. Through the entire milestone. Then push." (2026-05-08). All 6 open questions resolved with Claude defaults.

## Why this phase exists

Three save-loss-class incidents shipped the same way: the in-memory `MigrationFirestore` fake passed all tests, then real Firestore + Dexie + listener cascade timing surfaced a bug on iPad UAT.

- **v5h-01 (2026-04-27):** missing firestore.rules for `tracks/{id}` + `songs/{id}` after v50-05 cutover. Track-edit save-loss.
- **v5h3-01 (2026-05-02):** H-SL-7 phantom VersionMismatch — engine writeback didn't thread server `updatedAt` into pending outbox rows for same `(collection, docId)`. Rapid same-doc edits triggered cross-tab reconciliation modal.
- **v54-01 (2026-05-08):** picker empty in production despite passing harness — `songs/*` was empty in prod but tests seeded it; harness lied.

Postmortem-binding action: ship Firebase Local Emulator Suite + RTL editor↔perf-view propagation test pair as v5.4 phase 1. This phase IS that ship.

## Goals (in priority order)

1. **Reset Harness Fidelity Gate counter to 0** by shipping both deliverables. Counter currently 1 of 3 (clause-(b) waiver from v53-02 SetlistGridHydrator priming-adjacent additive getDocs).
2. **Catch v5h3-01-class regressions in CI** — if a future engine-cascade timing bug ships, it surfaces in CI not on Daniel's iPad. Acceptance: a regression canary against H-SL-7 (rapid same-doc edits → phantom VersionMismatch) lives in the test pair and would fail if v5h3-01-03's writeback fix were reverted.
3. **Don't regress the fast-path unit-test workflow** — main `vitest run` stays sub-minute. Emulator tests are explicit opt-in via `npm run test:emulator`.

## Approach (locked at discuss; recommendations from prior turn)

### Plan 01: Emulator infra
- Add `firebase-tools` devDep (production-grade; same tooling as `firebase deploy --project crcmusiccharts` already used per memory rule).
- Extend `firebase.json` with `emulators` block — Firestore + Auth only; ports 8080 / 9099 / UI 4000.
- New `npm run test:emulator` script: wraps `firebase emulators:exec --only firestore,auth "vitest run --config vitest.emulator.config.ts"`.
- New `vitest.emulator.config.ts` mirroring main config but `include: ['src/**/*.emulator.test.ts', 'src/**/*.emulator.test.tsx']`. Excluded from main `vitest run` to keep that path < 1 min.
- One canary test `src/lib/sync/__tests__/engine.emulator.test.ts` proving the wiring works — write to Firestore via emulator, listener fires, Dexie ingests.
- Extend `.github/workflows/ci.yml` with new `emulator-tests` job — uses `firebase emulators:exec` so CI is honest about the gate.
- Document local-machine setup in `.paul/PROJECT.md` §Constraints (Java JDK 11+ requirement for emulator; first-time `firebase setup:emulators:firestore` cache).

### Plan 02: RTL editor↔perf-view propagation test pair + H-SL-7 regression canary
- New `src/components/setlist/grid/__tests__/editor-perf-propagation.emulator.test.tsx`. Mounts SetlistGrid (editor flow) + SetlistView (perf-view flow) with shared Dexie + emulator-backed Firestore.
- Test 1: edit cell in SetlistGrid → assert Dexie row updates → assert SetlistView re-renders with new value within reasonable timeout. Catches the v5h3-01 case where editor wrote but perf-view didn't pick it up.
- Test 2: H-SL-7 regression canary. Two rapid edits to same `(collection, docId)` from SetlistGrid; assert no VersionMismatchError; assert second edit's `expectedUpdatedAt` matches first edit's writeback `updatedAt`. Would fail if `src/lib/sync/engine.ts` writeback (v5h3-01-03 fix at commit `36e9fa1`) were reverted.

### Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | One phase, two plans (v54-02-01 + v54-02-02) — counter resets only when both ship | Splitting into separate phases would let us close v54-02 with infra-only and silently leave the test pair undone |
| 2 | Firestore + Auth emulators only | Sync-engine harness needs writes (Firestore) + rules (Auth); Storage is chart files (not on cache-vs-fresh path); no Functions in repo |
| 3 | Separate `npm run test:emulator` script + tagged subset (`*.emulator.test.ts` glob) — NOT vitest globalSetup | Keep main `vitest run` sub-minute; emulator opt-in only |
| 4 | Both local + CI via `firebase emulators:exec` in GH Actions | Local-only = coverage gap on PR review (the v5h3-01 pattern); CI-only = devs can't reproduce locally |
| 5 | Keep FakeFirestore for admin-script tests (migrate-v50, bootstrap-songs); emulator only for sync-engine cutover tests | FakeFirestore correct for migration *logic*; emulator correct for engine *cascade timing*. Don't conflate. |
| 6 | Counter resets to 0 only when BOTH plans ship AND the H-SL-7 regression canary demonstrably catches a v5h3-01-class regression in CI | Postmortem-driven proof, not credentialism. Test pair without canary is unverified instrumentation. |
| 7 | v54-02 ships BEFORE v54-03 (library sync) | v54-03 adds a snapshot listener — exactly the seam v54-02 is designed to test. Inverted ordering loses the value. |

## Constraints

- **No /ui-ux-pro-max needed** — this is dev infra + tests, no user-facing UI.
- **No engine code changes** — this phase EXERCISES the engine, doesn't modify it. Boundaries: `src/lib/sync/**`, `src/lib/local/**` are read-only for this phase except for adding new test files.
- **Main suite stays green** — `npx vitest run` (default config) must continue to pass 1615/1615.
- **Emulator startup cost** — first run on a fresh machine downloads Firestore/Auth emulator JARs (~50MB total, one-time). Subsequent runs reuse cache. Acceptable trade-off for ship-gate honesty.
- **Java requirement** — Firebase emulators need Java JDK 11+. Document in CLAUDE.md / PROJECT.md so multi-machine setup (memory rule) doesn't surprise.
- **CI runtime budget** — emulator job adds ~30-45s to CI per workflow run. Acceptable.

## Open Questions for /paul:plan

None — all 6 discuss-phase questions resolved with locked recommendations + Daniel "whatever you recommend." Plan-time decisions limited to:
- Exact emulator port allocation (default 8080/9099/4000 unless conflicts).
- Exact filename glob for emulator tests (locked: `*.emulator.test.ts`/`*.emulator.test.tsx`).
- Minimal canary surface for Plan 01 (recommendation: smallest possible — one write + one listener observation).

## References

- v5h3-01-04 postmortem (BINDING source): `.paul/postmortems/v5h3-01-save-loss-recurrence-investigation.md`
- Memory rule: `feedback_harness_real_firestore.md` ("Sync-engine cutover phases need higher-fidelity adapter OR Firebase emulator OR HUMAN-VERIFY repro")
- v53-02-01-SUMMARY §212 (foreseen failure mode that v54-01 hit)
- Firebase Local Emulator Suite docs: https://firebase.google.com/docs/emulator-suite
- Existing CI: `.github/workflows/ci.yml`
- Existing vitest config: `vitest.config.ts`
- Existing FakeFirestore (preserved for admin tests): `scripts/__tests__/migrate-v50.test.ts`, `scripts/__tests__/bootstrap-songs.test.ts`

## Synthesis confirmation

- Goals: (1) reset counter to 0 (2) catch v5h3-01-class in CI (3) don't slow main suite — locked.
- Approach: 2 plans (infra + RTL test pair), Firestore + Auth, separate test:emulator script, both local + CI, FakeFirestore preserved for admin tests, counter resets only on both plans + canary — locked.
- v54-02 BLOCKS v54-03 ordering — locked per Q7.

Ready for `/paul:plan` (will invoke directly per autonomous directive).
