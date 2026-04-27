# Postmortem — v5.0-hotfix Track-Edit Save-Loss

**Date:** 2026-04-27
**Author:** Rabbi Daniel + PAUL session
**Severity:** P0 (data loss in production; affected user count: 1 — Daniel; band not yet onboarded)
**Status:** RESOLVED
**Phase:** v5h-01 (4 plans: v5h-01-01 reproduce+diagnose, v5h-01-02 fix, v5h-01-03 perf-view architectural refactor, v5h-01-04 this postmortem)
**Final commit:** `92b1902` · **Suite:** 1481/1481 · **Production data loss:** 0 confirmed

Companion artifacts: [v5h-01-01-SUMMARY](../phases/v5h-01-track-edit-save-loss/v5h-01-01-SUMMARY.md) · [v5h-01-02-SUMMARY](../phases/v5h-01-track-edit-save-loss/v5h-01-02-SUMMARY.md) · [v5h-01-03-SUMMARY](../phases/v5h-01-track-edit-save-loss/v5h-01-03-SUMMARY.md) · [v50-07-save-loss-investigation.md](v50-07-save-loss-investigation.md)

---

## TL;DR

v50-05's cutover plans introduced two new top-level Firestore collections (`tracks/{trackId}` and `songs/{trackId}`) but never grew `firestore.rules` to match. Default-deny silently rejected every track write in production from the v50-05-02 cutover deploy through 2026-04-27. The kitchen-sink fast-check harness (1468/1468 green) couldn't see it: no security-rules layer, no perf-view path coverage, zero-latency in-memory adapters. Daniel's UAT 2026-04-27 surfaced it as "key disappears after navigate-away" (path "P"). The fix shipped across three plans: v5h-01-02 added `match /tracks/{id}` + `match /songs/{id}` rules + a SetlistGridHydrator outbox-pending guard + a snapshot-listener LWW strict-equality fix; v5h-01-03 took 4 iterations on the perf-view side before the team recognized that editor and perf-view were reading from two different stores with different freshness semantics — the cleanest fix was architectural (refactor perf-view to read from Dexie via `useLiveQuery` like the editor does), not another patch on Firestore subscription state. The lessons: cutover-shaped phases need a rules-audit gate at planning time; the kitchen-sink harness has named fidelity gaps that need remediation before the next major cutover; when a hook gets patched 2-3 times without fixing the user-visible symptom, stop patching and ask whether the architecture is right.

---

## Timeline

| Date | Event |
|------|-------|
| (v50-05-02 ship) | Cutover plan introduces top-level `tracks/{trackId}` + `songs/{trackId}` collections. `firestore.rules` is NOT updated. Default-deny silently rejects every write. v5.0 phases continue shipping (v50-05-03..05, v50-06-*, v50-07-01..05). All harness/property tests green throughout. |
| 2026-04-26 | v50-07 phase ✅ COMPLETE (5/5 plans). Suite 1474/1474. v5.0 milestone marked PENDING UAT. |
| 2026-04-27 morning | Daniel runs UAT scenario 1 against production `/setlists/kQNvssixRlHQRB6gtWqt`. Path "P" reproduced: cell-edits a key, navigates away, comes back — key reverts to old value. P0 declared. |
| 2026-04-27 | v5.0-hotfix milestone opened. v5h-01-01 plan: research + production state capture + root-cause confirmation. HUMAN-ACTION checkpoint captures Dexie state in production with DevTools. |
| 2026-04-27 | v5h-01-01 root cause confirmed (see [investigation file](v50-07-save-loss-investigation.md)): missing `firestore.rules` blocks for `tracks/{id}` + `songs/{id}` collections; 50+ failed outbox rows accumulated for setlist `kQNvssixRlHQRB6gtWqt`. Decision E+F+B (defense-in-depth). |
| 2026-04-27 | v5h-01-02 commit `0c2921d`: rules deployed via `firebase deploy --only firestore:rules`; SetlistGridHydrator outbox-pending guard around `db.{setlists,tracks}.put`; snapshot-listener strict-equality LWW guard at both setlists + tracks branches; `property-failures.test.ts` AC-1 flipped from `it.fails` → `it`. Suite 1479/1479. |
| 2026-04-27 | Diagnostic chain to close v5h-01-02 AC-4: 142 stuck outbox rows (46 failed `permission-denied` + 96 pending blocked behind them by per-doc drain ordering) → engine doesn't auto-recover failed rows; auth token from before rules deploy was stale (didn't carry the admin claim path) → sign-out/in restored `role: "admin"`; reset-and-drain snippet flipped 46 failed → pending → engine retried with fresh token → cell-commit edits started persisting. |
| 2026-04-27 | Editor save indicator green; cell-edits persisting cleanly. Perf-view continued showing stale data — separate architectural issue. |
| 2026-04-27 | v5h-01-03 ran 4 iterations: `f83d75d` (resubscribe-once + hydrated-trust gate) returned `[]` during initial mount window → reverted at `2897c30`. `8971223` (`{ includeMetadataChanges: true }` + flip on `metadata.fromCache === false`) — wrong gate signal (`fromCache` is source not freshness). `4aa6840` (flip on `getDocsFromServer.then()` resolution) — correct signal but didn't address architectural divergence. `92b1902` final architectural refactor: `useSetlistPerformance` reads from Dexie via `useLiveQuery` + mounts snapshot-listener; embedded fallback retained ONLY for unhydrated legacy setlists; public-view short-circuit preserved. |
| 2026-04-27 | Daniel UAT scenario 1 against production: edit a track key in editor → in-app back button → perf-view → fresh key visible immediately. "worked!" v5h-01-03 LOOP COMPLETE. v5.0-hotfix 75% done; only this postmortem remained. |
| 2026-04-27 (this plan) | v5h-01-04 postmortem written. Time-to-resolution: ~6h end-to-end on 2026-04-27 (research + 3 plans + 4 perf-view iterations). |

---

## Root Cause

**Missing `match /tracks/{trackId}` and `match /songs/{songId}` blocks in `firestore.rules`.** v50-05-02 shipped the new collection shape without growing the rules file; default-deny rejected every track write silently. Downstream effects compounded the user-visible symptom:

1. Engine drain attempts returned `permission-denied` → outbox rows marked `failed` with `lastError: "Auth failure on tracks/{id}: permission-denied"`.
2. **Per-doc drain ordering** (v50-03 invariant) blocked subsequent valid edits behind the failed `set` rows. Daniel's actual key edits (op:'update' rows at localIds 94, 141 against the same trackId) sat at status `pending` and never drained.
3. SetlistGridHydrator re-fired the lazy-hydration cascade on every page mount (because `setlists.hydrated:true` was never written — the cascade's "I'm done" marker depended on the cascade itself succeeding). Each re-fire produced more failed `set` rows on the same trackIds.
4. SetlistGridHydrator's hydration step also re-primed local Dexie from the legacy embedded `setlists/{id}.tracks[]` array on every re-mount, overwriting the user's stuck-pending local edit. This is why the user-visible symptom was "key disappears after navigate-away" rather than "save indicator stays orange forever" — the local-first store was actively reverted on every navigation.
5. Perf-view (`useSetlistPerformance`) read from Firestore SDK's persistent IDB cache via direct `onSnapshot` subscription, NOT from the engine's Dexie store. Even after the rules shipped and editor edits started persisting, perf-view took 60s+ + multiple hard refreshes to surface fresh data because Firestore SDK's cache-then-fresh delivery semantics deliver a stale snapshot before the server-fresh snapshot, and there was no architectural reason for perf-view to read from a different store than the editor.

**The original handoff's three ranked hypotheses were all WRONG.** The pre-research handoff (`HANDOFF-2026-04-27-post-uat-v5h-and-v51.md`) ranked: (1) snapshot-listener LWW underflow with undefined local.updatedAt, (2) engine writeback never fires, (3) `serverTimestamp()` resolves after getDoc re-read. Production capture (DevTools → Application → IndexedDB → `crc-local`) ruled all three out: cell-commit path was wired correctly, applyEdit ran synchronously inside Dexie txn, useLiveQuery query was correct, no production code was clearing Dexie tracks, hydrator priming SKIPS for `initialTracks.length === 0`, production adapter used `runTransaction + expectedUpdatedAt + tx.update + serverTimestamp` correctly. Each hypothesis assumed engine-side bugs in code paths the production capture proved were wired correctly.

The lesson buried in this is in §Lessons.3: research-before-execute when subscription state semantics + caching are at play. The handoff hypotheses came from code-reading the engine; the actual root cause came from reading the production outbox rows.

---

## What Got Shipped

| Commit | Plan | Change |
|--------|------|--------|
| (rules deploy) | v5h-01-02 | `firestore.rules`: add `match /tracks/{trackId}` + `match /songs/{songId}` blocks mirroring existing setlists patterns (band-leader/admin write, member read; no ownerId check). Deployed via `firebase deploy --only firestore:rules` to crcmusiccharts. |
| `0c2921d` | v5h-01-02 | `SetlistGridHydrator.tsx`: outbox-pending guard around `db.{setlists,tracks}.put` priming so re-mounts can no longer overwrite stuck-pending local edits. `snapshot-listener.ts`: strict-equality LWW guard at both setlists + tracks branches (preserves local row when `updatedAt` is undefined instead of falling through to `(local ?? 0) >= remote` which evaluated false and overwrote local). `property-failures.test.ts`: flipped AC-1 from `it.fails` → `it` to lock the regression. |
| `92b1902` | v5h-01-03 | `use-setlist-performance.ts` refactored: reads tracks from Dexie via `useLiveQuery(() => db.tracks.where('setlistId').equals(setlistId).sortBy('order'))` matching the SetlistGrid editor's data path; mounts snapshot-listener inside perf-view for cross-device delivery; embedded fallback retained ONLY for unhydrated legacy setlists; public-view short-circuits the listener mount to preserve rule-denied behavior. Test suite rewritten (18 brittle onSnapshot mock tests → 15 focused tests using `fake-indexeddb` + listener test seam). |

Three prior iterations on `use-setlist-performance.ts` (`f83d75d` reverted, `8971223` superseded, `4aa6840` superseded) all attempted to patch Firestore subscription semantics. None worked. Lesson covered in §Lessons.3.

---

## Lessons

### 1. Cutover-plan rules-audit gap → propose a planning gate

v50-05-02's plan introduced the `tracks/{trackId}` and `songs/{songId}` top-level collections without including a task to update `firestore.rules`. The cutover focus was the application-layer reshape (lazy-hydration cascade, dual-read, perf-view bridge); the rules side was an invisible dependency. Production deploy → silent default-deny → 50+ failed outbox rows accumulated before the next UAT cycle caught it.

The kitchen-sink harness can't catch this because it doesn't run real security rules (see §Lessons.2). The remedy has to live at planning time.

**Proposed gate** (concrete wording for PAUL plan-phase workflow OR a CARL global rule):

> **Cutover Rules-Audit Gate.** If a plan's `files_modified` introduces a new top-level Firestore collection — OR a `<task>` action narrative mentions writing to a Firestore path not currently covered by `firestore.rules` — the plan MUST include either (a) a task touching `firestore.rules` with the corresponding `match` block, OR (b) an explicit boundary entry under SCOPE LIMITS documenting "rules unchanged because [reason]" (e.g., "subcollection of an already-protected parent inherits parent's rules").
>
> The same check applies to `storage.rules` for any new Firebase Storage paths.
>
> Detection at plan-write time: the planner reads `firestore.rules`, extracts the set of `match` paths, and compares against any new collection names introduced in the plan's narrative or files_modified.

Phase 1.3 of an earlier era already flagged a parallel invisibility for Firebase Storage rules (committed `storage.rules` mirroring the Firestore `isMember()` gate; CI dry-run check). This postmortem extends that pattern to Firestore.

**Action item:** Pick a home for this gate (PAUL plan-phase workflow vs. CARL global rule) and ship it before the next cutover-shaped phase. Owner: Rabbi Daniel.

---

### 2. Kitchen-sink harness fidelity gaps

v50-07-04's fast-check property harness shipped 1468/1468 green and proved AC-9 no-data-loss + per-doc drain ordering + lazy-hydration idempotency under random edits + airplane toggles + force-quits + cross-tab. Yet it was blind to the production save-loss. Three named gaps:

**Gap A — No security-rules layer.** `KitchenSinkAdapter` extends `SharedRemote` with online-toggle + expectedUpdatedAt precondition; there's no rules-evaluation step. Real Firestore default-deny was invisible.

Remediation options, ranked by fidelity:
- **(a) Firebase Local Emulator Suite** — runs rules + auth in-process during the harness run. Highest fidelity. ~5-10s startup cost. Run a subset of property iterations against the emulator (e.g., 5 of 50 CI iterations) so the rules layer is exercised without blowing the per-suite time budget. Caveat: emulator has its own quirks (no persistent-cache simulation by default; some Firestore SDK behaviors differ).
- **(b) `@firebase/rules-unit-testing` patterns inside `KitchenSinkAdapter`** — extend the adapter to optionally apply a parsed-rules layer in-memory. Middle fidelity. No emulator process dependency. Fragile to rules-syntax evolution.
- **(c) Accept the gap + add the rules-audit planning gate from §Lessons.1** — explicit assumption documented in `property-failures.test.ts` describing what the harness can't prove. Cheapest. Relies on the planning gate as the actual catch.

**Gap B — No perf-view path coverage.** The harness asserts invariants on the engine + outbox + Dexie + SetlistGridHydrator's lazy-hydration. It never exercised the perf-view subscription, so the data-path divergence (editor reads Dexie; perf-view reads Firestore SDK cache directly) and the dual-read freshness bug were both invisible.

Remediation:
- **A thin RTL test running BOTH the editor cell-commit path AND `useSetlistPerformance` against the same in-memory Firestore + Dexie**, asserting the cross-view propagation invariant: edit in editor → tick → assert the same value visible from `useSetlistPerformance` selector. Cheaper than Playwright. Reuses existing test seams (`SetlistGridHydrator`'s `applyEdit` test-seam prop; `use-setlist-performance.ts`'s `subscribe` test-seam prop). One test fixture; one invariant.

**Gap C — Zero-latency in-memory adapters miss cache-vs-fresh races.** Firestore SDK has persistent-cache semantics: `onSnapshot` fires twice on connect — once from cache, once from server-fresh — and `metadata.fromCache` indicates source not freshness. An in-memory adapter delivers a single snapshot synchronously and doesn't model the cache-then-fresh sequence. The cache-vs-fresh class of bugs (which is what v5h-01-03's first three iterations chased) is invisible.

Remediation options:
- **(a) `AdapterDelayProfile` shaping option** on `KitchenSinkAdapter` that simulates cache-then-fresh delivery — `onSnapshot` fires twice with configurable delay, first from a stale-cache simulation, second from fresh. Add invariants asserting the gate the production code uses (whatever signal indicates "fresh data has been delivered"). Property iterations exercise the timing space.
- **(b) Firebase emulator covers this for free** (see Gap A option a).
- **(c) Accept the gap with an explicit assumption documented in `property-failures.test.ts`** — listing what the harness CAN'T prove (e.g., "cache-vs-fresh delivery semantics on cold-start subscription"). Forces future maintainers to use a different test surface for those properties.

This gap was already flagged after v50-07-04 → v50-07-05 UAT save-loss; the user's auto-memory entry `feedback_harness_real_firestore.md` records the lesson. This postmortem is the codification. The recommended path is **(a) Firebase emulator + (b) thin RTL editor↔perf-view test** as a pair: emulator covers Gaps A + C; RTL test covers Gap B.

**Action item:** Pick one remediation (recommend emulator + RTL test pair) and ticket it for the v5.x harness work. Owner: Rabbi Daniel. Target: opportunistic during v5.1 or before next major cutover.

---

### 3. Perf-view fix iteration cycle — three lessons

v5h-01-03 ran 4 iterations on `use-setlist-performance.ts` before a Daniel UAT pass. The pattern is general enough to codify.

**Lesson 3a — `metadata.fromCache` indicates SOURCE not FRESHNESS.** After `getDocsFromServer` warms the persistent cache, listener deliveries from that fresh cache STILL report `fromCache: true`. The flag answers "did this snapshot come from the local cache or the wire?" not "is this snapshot fresh?". Anyone reaching for `fromCache` as a freshness signal should stop — it's the wrong primitive. The correct primitive is "did the listener deliver an event AFTER my known-fresh trigger?" (e.g., after `getDocsFromServer.then()` resolves, or after a custom server-fresh marker). Even that has caveats (commit `4aa6840`'s gate was correct but the architectural divergence between editor-data-path and perf-view-data-path made the gate insufficient).

**Lesson 3b — Research-before-execute when subscription state semantics + caching are at play.** The first execute attempt (`f83d75d`) was based on a hypothesis (resubscribe-on-error + hydrated-trust gate) that hadn't been validated against the actual Firestore SDK behavior; it returned `[]` during initial mount and broke live setlists in production. The research that would have prevented this was: read the Firestore SDK source for `onSnapshot` connection lifecycle + cache delivery sequence + how `getDocsFromServer` interacts with subscription cache state. None of that was done before writing the patch. The PAUL `/paul:research-phase` workflow exists for exactly this; it wasn't invoked because the hypothesis felt small.

**Lesson 3c — The 2-3-strikes architectural-rethink rule.** When a hook has been patched 2-3 times without fixing the user-visible symptom, **stop patching** and ask: "Is the architecture right?" In this case, three commits patched perf-view's Firestore subscription before the realization that editor and perf-view were reading from two different stores with different freshness semantics. The architectural fix (read from Dexie like the editor does — unify the data path) was simpler AND cleaner than any of the patches: it eliminated the cache-vs-server-fresh class of bugs by construction rather than gating against them.

The general form: when a sub-view of an entity needs the same data the editor sees, read from the local-first store (Dexie) via `useLiveQuery`, not from the server. Cross-device updates flow through the snapshot-listener, which writes server deliveries into Dexie. This is now the established pattern for v5.x (recorded as a `patterns-established` entry in the v5h-01-03 SUMMARY frontmatter).

**Action item:** Codify the 2-3-strikes rule somewhere a future debugging session will see it (CARL global rule? PAUL `/paul:debug` workflow?). Owner: Rabbi Daniel. Low priority; the lesson is now in this postmortem and that may be enough.

---

### 4. Auth-claim staleness incident

When v5h-01-02's rules deploy completed, Daniel's existing browser session token was minted before the rules deploy and didn't carry the admin claim path the new rules required. Engine retries continued returning `permission-denied` until Daniel signed out + signed back in, which minted a fresh token with `role: "admin"`. The reset-and-drain snippet then flipped 46 failed → pending and the engine drained cleanly.

**Open question (out of scope for v5.0-hotfix):** Should client tokens auto-refresh on rules-version change?

Probably out of scope. Firebase doesn't expose rules-version changes to the client (rules deploys don't propagate as a queryable signal); auto-refresh would require server-side coordination via custom claims revision bumps or an app-level "rules-version" doc the client subscribes to and force-refreshes on bump. Adding that machinery for the rare rules-deploy-during-active-session case isn't worth the complexity.

**What to do instead:** Document the incident here so future on-call sessions recognize "401-ish behavior immediately after a rules deploy" → first action is sign-out/in, not engine debugging. The reset-and-drain snippet from v5h-01-02 should be archived (search the v5h-01-02 SUMMARY's "Diagnostic chain" appendix) for re-use the next time it's needed. No action item beyond this note.

---

### 5. The Daniel-loop UAT cadence as v5.x norm

v5h-01-02 and v5h-01-03 each ran a Daniel UAT cycle between fix-ship and plan-close. v5h-01-02's UAT specifically caught the residual perf-view problem that the harness couldn't see (Gap B from §Lessons.2); without it, v5h-01-03 wouldn't have been opened until Daniel hit the same problem in regular use, possibly after band onboarding. The UAT cycle is the safety net that catches what the harness misses.

**Codify for v5.x:** every fix that touches data flow (sync engine, Dexie, snapshot-listener, lazy-hydration, perf-view, editor cell-commit) gets a Daniel UAT against real production before milestone close. UAT failures route to a new plan in the same phase; only after UAT passes does `/paul:audit-milestone` run.

This connects to the user's stated requirement that the app be "bulletproof and easy and intuitive" before band onboarding (auto-memory: `MEMORY.md` user preferences). The harness proves bulletproof under the property-test grammar; Daniel-loop UAT proves bulletproof under the actual weekly worship workflow.

**Action item:** Codify the Daniel-loop UAT cadence in PROJECT.md or a PAUL milestone-close workflow gate ("milestone close requires evidence of Daniel UAT pass on every data-flow fix in the milestone"). Owner: Rabbi Daniel. Target: before v5.1 ships.

---

## Deferred Items

| Item | Reason | Routing |
|------|--------|---------|
| **Issue 2 — iPad key-picker UI is bad** | Surfaced in v5h-01-02 UAT; symptom is vague (Daniel hasn't described what specifically reads as bad). | Routing rule: tap-target / sheet-vs-popover issue → v50-05-04 regression follow-up (likely a v5h-01-05 if blocking onboarding, or a v5.1 plan). "Feels janky / discoverability" → v5.1 UX overhaul. Resume action: ask Daniel for the symptom on next session, then route per above. |
| **Auth-claim auto-refresh on rules-version change** | See §Lessons.4. Out of scope; complexity not worth the rare scenario. | Documented for future awareness; no plan opened. |
| **Snapshot-listener mounts in TWO places (editor + perf-view) when both views open simultaneously** | From v5h-01-03 SUMMARY's Concerns section. LWW guards make redundant writes no-ops; network traffic doubled in the rare both-views-open case. | Accepted. Could be optimized later by lifting the listener to a layout-level singleton (one subscription per route). Low priority. |

---

## Action Items

| # | Action | Owner | Target |
|---|--------|-------|--------|
| 1 | Add the cutover rules-audit gate from §Lessons.1 to PAUL plan-phase workflow OR a CARL global rule. | Rabbi Daniel | Before next cutover-shaped phase |
| 2 | Pick a kitchen-sink remediation option from §Lessons.2 (recommend Firebase emulator + thin RTL editor↔perf-view test pair) and ticket it for v5.x harness work. | Rabbi Daniel | Opportunistic during v5.1 OR before next major cutover |
| 3 | Resolve Issue 2 routing once Daniel describes the iPad key-picker symptom. | Next `/paul:resume` session | When Daniel surfaces it |
| 4 | Codify the Daniel-loop UAT cadence in PROJECT.md or a PAUL milestone-close workflow gate. | Rabbi Daniel | Before v5.1 ships |
| 5 | (Optional, low priority) Codify the 2-3-strikes architectural-rethink rule from §Lessons.3c somewhere a future debugging session will see it. | Rabbi Daniel | When a similar iteration cycle starts to repeat |

---

## Appendix

| Metric | Value |
|--------|-------|
| Affected user count | 1 (Daniel; band not yet in production) |
| Production data loss (confirmed) | 0 (cell edits all recovered via reset-and-drain) |
| Time-to-resolution | ~6h end-to-end on 2026-04-27 |
| Plans shipped | 3 fix plans (v5h-01-01 research, v5h-01-02 fix, v5h-01-03 perf-view refactor) + 1 postmortem (this) |
| Perf-view iterations | 4 (`f83d75d` reverted, `8971223` + `4aa6840` superseded, `92b1902` final) |
| Outbox stuck-row count at peak | 142 (46 failed + 96 pending blocked behind them) |
| Final commit | `92b1902` |
| Suite at close | 1481/1481 |
| Files modified across the hotfix | `firestore.rules`, `src/components/setlist/grid/SetlistGridHydrator.tsx`, `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx`, `src/lib/sync/snapshot-listener.ts`, `src/lib/sync/__tests__/property-failures.test.ts`, `src/hooks/use-setlist-performance.ts`, `src/hooks/__tests__/use-setlist-performance.test.ts`, `src/types/models.ts` |

---

*Postmortem closes v5h-01 phase. Next: `/paul:audit-milestone v5.0-hotfix` → close milestone → `/paul:new-milestone` for v5.1 UX overhaul.*
