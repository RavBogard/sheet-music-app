---
phase: v5h-01-track-edit-save-loss
plan: 03
subsystem: perf-view
tags: [dexie, useLiveQuery, snapshot-listener, firestore-cache, data-path-unification]

requires:
  - phase: v5h-01-track-edit-save-loss
    provides: v5h-01-02 (rules + Hydrator outbox guard + listener LWW); v5h-01-01 (root-cause research)
  - phase: v50-06-concurrent-edit-safety
    provides: snapshot-listener.ts factory with outbox-pending + LWW guards
  - phase: v50-07-migration-cutover
    provides: lazy-cascade marking setlists.hydrated=true (the gate for top-level-as-truth)
  - phase: v50-05
    provides: useLiveQuery pattern in SetlistGrid (template mirrored here)

provides:
  - Unified Dexie data path for editor + perf-view (cell edits propagate instantly between both)
  - perf-view snapshot-listener mount (cross-device delivery from Firestore → Dexie)
  - Embedded fallback retained ONLY for unhydrated legacy setlists
  - Public-view rule-denied behavior preserved (no behavioral regression)

affects: [v5.1-ux-overhaul, future-perf-view-features, future-readers]

tech-stack:
  added: []
  patterns: [data-path-unification (read same store regardless of view); snapshot-listener-mount-per-route]

key-files:
  created: []
  modified:
    - src/hooks/use-setlist-performance.ts
    - src/hooks/__tests__/use-setlist-performance.test.ts

key-decisions:
  - "Read perf-view tracks from Dexie via useLiveQuery (not Firestore directly) — eliminates cache-vs-server-fresh class of bugs by construction"
  - "Mount snapshot-listener inside perf-view (not just editor) — covers perf-view-only sessions e.g., iPad on stage"
  - "Do NOT run lazy-cascade in perf-view — would race with editor cascade and make perf-view a write surface"
  - "Keep embedded fallback only for unhydrated legacy setlists (cascade hasn't run yet)"

patterns-established:
  - "When a sub-view of an entity needs the same data the editor sees, read from the local-first store via useLiveQuery, not from the server. Cross-device updates flow through the snapshot-listener."

duration: ~6h (including 3 failed iterations + research + final architectural fix)
started: 2026-04-27T11:00:00Z
completed: 2026-04-27T13:10:00Z
---

# v5h-01-03 SUMMARY — Perf-view Architectural Fix (Dexie via useLiveQuery)

**Refactored useSetlistPerformance to read tracks from Dexie via useLiveQuery (matching the editor's data path) and mount the existing snapshot-listener for cross-device delivery — eliminating the perf-view's stale-cache problem by construction rather than patching Firestore subscription semantics.**

## Story (why this plan ran four iterations)

The original v5h-01-03 PLAN was an `execute` plan with hypothesis "perf-view's onSnapshot dies on permission-denied + dual-read falls back to stale embedded for hydrated setlists; fix = resubscribe-once + hydrated-trust gate". That fix shipped at commit `f83d75d` and immediately broke live setlists in production (returned `[]` during the initial mount window before any snapshot delivered). Reverted at `2897c30`.

Two more execute iterations attempted to gate the dual-read swap on Firestore SDK metadata:
- `8971223` — `{ includeMetadataChanges: true }` + flip on first `metadata.fromCache === false` delivery. Failed: that flag indicates SOURCE not freshness; after `getDocsFromServer` warms the cache, listener deliveries from that fresh cache STILL report `fromCache: true`.
- `4aa6840` — flip the gate on `getDocsFromServer.then()` resolution (which actually delivers server-fresh data). Failed: Daniel UAT showed 60s+ + multiple hard refreshes to see fresh keys, indicating the listener wasn't delivering the cache-warming as expected.

After three failed patches on the same hook, the diagnosis converged on the root architectural issue: **editor and perf-view were reading from two different stores with different freshness semantics**. The fix had to be architectural, not another patch.

Final architectural refactor at commit `92b1902` unifies the data path:
- Perf-view reads tracks from Dexie via `useLiveQuery(() => db.tracks.where('setlistId').equals(setlistId).sortBy('order'))` — same shape `SetlistGrid` uses (lines 870-877).
- Snapshot-listener mounted inside perf-view for cross-device delivery (writes Firestore deliveries directly into Dexie via `db.put`).
- Embedded fallback retained ONLY for unhydrated legacy setlists.
- Public-view short-circuit preserves existing rule-denied behavior.

Daniel UAT 2026-04-27 confirmed: edit a track key in editor → in-app back button → perf-view → fresh key visible immediately.

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~6h (with 3 failed iterations) |
| Started | 2026-04-27T11:00:00Z |
| Completed | 2026-04-27T13:10:00Z |
| Iterations | 4 (`f83d75d` reverted; `8971223`, `4aa6840` superseded; `92b1902` final) |
| Files modified | 2 (`use-setlist-performance.ts`, `use-setlist-performance.test.ts`) |
| Suite | 1481/1481 |

## Acceptance Criteria Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Editor edit → perf-view shows fresh key instantly | ✅ Pass | Daniel UAT 2026-04-27 ("worked!") |
| Tracks rendered for hydrated setlists from Dexie | ✅ Pass | Test: `reads tracks from Dexie via useLiveQuery for hydrated setlists` |
| Dexie writes propagate without Firestore RTT | ✅ Pass | Test: `reflects Dexie writes instantly via useLiveQuery` |
| Embedded fallback for unhydrated legacy setlists | ✅ Pass | Test: `falls back to embedded setlists.tracks[] for unhydrated setlists when Dexie is empty` |
| Hydrated setlist with empty Dexie returns [] (no stale-embedded fallback) | ✅ Pass | Test: `returns [] for hydrated setlists with empty Dexie` |
| Snapshot-listener mounts for authenticated sessions | ✅ Pass | Test: `mounts the snapshot listener after hydration; unsubscribes on unmount` |
| Snapshot-listener does NOT mount for public sessions | ✅ Pass | Test: `does NOT mount the snapshot listener for unauthenticated public sessions` |
| Listener factory failure does not crash perf-view | ✅ Pass | Test: `does not crash when snapshot listener factory throws on mount` |
| Suite + tsc + build green | ✅ Pass | 1481/1481, tsc clean, next build clean |

## Accomplishments

- **Eliminated the cache-vs-server-fresh class of bugs by construction.** Perf-view no longer touches Firestore SDK's persistent IDB cache directly; reads come from Dexie which the engine + snapshot-listener already keep fresh.
- **Cross-device delivery working** — laptop edits → engine drains to Firestore → iPad's snapshot-listener writes to iPad's Dexie → iPad's useLiveQuery delivers to perf-view.
- **Test suite simplified.** Replaced 18 brittle `onSnapshot` mock-driven tests with 15 focused tests using `fake-indexeddb` + a snapshot-listener test seam — same shape the editor's tests use.
- **Established a pattern for v5.x:** when a sub-view of an entity needs the same data the editor sees, read from the local-first store via useLiveQuery, not from the server.

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/hooks/use-setlist-performance.ts` | Refactored | Dexie via useLiveQuery + snapshot-listener mount; dropped onSnapshot/getDocsFromServer/dual-read-gating complexity |
| `src/hooks/__tests__/use-setlist-performance.test.ts` | Rewritten | fake-indexeddb + listener test seam (15 tests) replacing onSnapshot mock-driven tests |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Read tracks from Dexie via useLiveQuery (not Firestore onSnapshot) | Editor already reads from Dexie. Unifying the data path eliminates cache-vs-server reconciliation entirely. Same-tab/cross-tab updates instant via Dexie's BroadcastChannel-aware live query. | Cross-device delivery now flows through snapshot-listener → Dexie (not direct Firestore reads). Slight 2× listener cost when editor + perf-view open simultaneously, but LWW makes redundant writes no-ops. |
| Mount snapshot-listener inside perf-view (not just editor) | iPad-only perf-view sessions (band on stage) need cross-device updates without an editor mount. | Adds a Firestore subscription per perf-view mount. Idempotent + cheap. |
| Do NOT run lazy-cascade in perf-view | Would race with editor cascade if both views open; would make perf-view a write surface (semantically wrong for read-only view). Editor's cascade fires on first edit-open and marks `hydrated:true`. | Unhydrated legacy setlists fall back to embedded `setlists/{id}.tracks[]` until the editor runs cascade once. |
| Embedded fallback ONLY when `setlistData?.hydrated !== true` | Hydrated setlists post-migration have stale embedded by design. Falling back would show pre-migration keys forever. | Hydrated + empty Dexie = `[]` (correct "no tracks" state). |
| Public-view short-circuit listener mount | `firestore.rules` already denies tracks reads for non-members; mounting would just produce permission-denied warnings. | No behavior change for public; cleaner console logs. |

## Deviations from Plan

The original v5h-01-03 PLAN proposed an execute fix (resubscribe-on-error + hydrated-trust gate). That hypothesis was wrong; the fix returned `[]` during initial mount and broke live setlists. Reverted at `2897c30`. Three more execute iterations on Firestore subscription semantics (`8971223`, `4aa6840`) failed UAT.

The final shipped fix is **architecturally different** from the original plan:
- Original: patch perf-view's Firestore subscription to handle stale-cache + permission-denied races.
- Shipped: refactor perf-view to not use Firestore directly at all; read from Dexie like the editor does.

This deviation was correct but cost 4 iterations. The lesson is in the `Next Phase` section + will be carried into v5h-01-04 postmortem.

| Type | Count | Notes |
|------|-------|-------|
| Reverted attempts | 1 (`f83d75d`) | Returned [] in initial mount window |
| Superseded patches | 2 (`8971223`, `4aa6840`) | Wrong gate signal (fromCache != freshness), then correct signal but didn't address architectural divergence |
| Architectural change | 1 (`92b1902`) | The actual fix |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Returned [] during initial mount window broke live setlists | Reverted commit `f83d75d` immediately on user report |
| `metadata.fromCache === false` gate never flipped in production | Switched to `getDocsFromServer.then()` gate signal (`4aa6840`) — but that didn't fix UAT either |
| 60s+ staleness despite getDocsFromServer kick | Recognized this as architectural divergence; refactored to Dexie data path |
| Test suite tightly coupled to onSnapshot mock | Rewrote 18 tests → 15 using fake-indexeddb + listener test seam |

## Next Phase Readiness

**Ready:**
- v5.0-hotfix milestone close BLOCKER fully cleared. Editor save + perf-view freshness both working end-to-end.
- v5h-01-04 postmortem can be written.

**Concerns:**
- Snapshot-listener now mounts in TWO places (editor + perf-view). When both views are open simultaneously for the same setlist, there are 2× Firestore subscriptions delivering the same data into Dexie. LWW guards make redundant writes no-ops but the network traffic is doubled. Acceptable for the rare both-views-open case; could be optimized later by lifting the listener to a layout-level singleton.
- The `hydrated?: boolean` field on `Setlist` (model.ts) and `LocalSetlist` (local/types.ts) must stay in sync with the lazy-cascade contract from v50-07-03. Future work that touches the cascade should preserve this.

**Blockers:** None.

## Hand-off to v5h-01-04 (Postmortem)

The postmortem should cover:

1. **Cutover-plan rules-audit gap.** v50-05-02 introduced top-level `tracks/{trackId}` and `songs/{songId}` collections without corresponding `firestore.rules` entries. Default-deny silently rejected every v5.0 track save in production for the period between deploy and v5h-01-02's rules ship. Propose a CARL/PAUL gate: "Did you add new top-level Firestore collections? If yes, did `firestore.rules` grow corresponding match blocks?"

2. **Kitchen-sink harness fidelity gaps.** v50-07-04's fast-check property harness shipped multiple blind spots: (a) no security-rules layer, missed the missing tracks/songs rules; (b) no perf-view path coverage, missed the data-path divergence + dual-read freshness bug; (c) zero-latency in-memory adapters missed cache-vs-server-fresh races and Firestore SDK persistent-cache semantics. Recommend integration-shaped test surfaces (a thin Playwright spec or RTL test running both editor cell-commit AND perf-view subscription against a shared in-memory Firestore).

3. **Lessons from the perf-view fix iteration cycle:**
   - `metadata.fromCache` indicates source not freshness — was a false signal for the stale-cache gate.
   - Research-before-execute when subscription state semantics + caching are at play. The first execute attempt was based on a hypothesis that hadn't been validated against the actual Firestore SDK behavior.
   - When a hook has been patched 2-3 times without success, step back and consider whether the architecture is right rather than continuing to patch.
   - Architectural fixes (Dexie via useLiveQuery here) can be cleaner AND simpler than patches when the underlying divergence is architectural.

4. **Issue 2 (iPad key-picker UI bad).** Surfaced in v5h-01-02 UAT, deferred. Daniel needs to describe the specific symptom (small? hard to scroll? wrong widget?) to route to v5.1 UX overhaul OR a v50-05-04 regression follow-up.

5. **The Daniel-loop UAT cadence.** v5h-01-02 + v5h-01-03 each added a UAT cycle with Daniel between fix and milestone close. Establish this as the v5.x norm.

---

*Phase: v5h-01-track-edit-save-loss, Plan: 03 (architectural refactor)*
*Completed: 2026-04-27*
*Final commit: `92b1902`*
