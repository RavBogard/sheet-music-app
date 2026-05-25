# AC-1 lazy-hydration idempotency flake — Phase 0 characterization

**Lane:** `ac1-lazy-hydration-characterization`
**Author:** coder-1
**Date:** 2026-05-25T23:55Z
**Base SHA:** `35177f0c8`
**Verdict:** **Hypothesis (A) — test-only. Re-classify lane to P2.** Production
`SetlistGridHydrator` is unaffected.

---

## Repro

```bash
# Solo, seed-deterministic — reproduces the HEADS-UP shape exactly:
npx vitest run src/lib/sync/__tests__/property-failures.test.ts \
  -t "AC-1: invariants hold under randomized chaos"
#   ← with `{ numRuns: 100, seed: -823001267, endOnFailure: false }` patched in
#   ← LF=1 and LF=2 both reproduce. Load-factor framing was a red herring.
```

Shrunk counterexample (HEADS-UP seed `-823001267`):

```jsonc
[
  {kind:"lazy-hydrate",  setlistId:"ks-s2", trackIds:["ks-t1"]},
  {kind:"edit-set",      collection:"setlists", docId:"ks-s2", payload:{v:0}},
  {kind:"edit-set",      collection:"tracks",   docId:"ks-t1", payload:{v:0}},
  {kind:"tick", ms:0},
  {kind:"lazy-hydrate",  setlistId:"ks-s2", trackIds:["ks-t1"]}
]
```

A second random seed (2000-run sweep, LF=1) shrunk to a structurally identical
shape — only the order of intervening `edit-update tracks` vs `tick` differed:

```jsonc
[
  {kind:"lazy-hydrate",  setlistId:"ks-s2", trackIds:["ks-t1"]},
  {kind:"edit-set",      collection:"setlists", docId:"ks-s2", payload:{v:0}},
  {kind:"edit-update",   collection:"tracks",   docId:"ks-t1", patch:{v:0}},
  {kind:"lazy-hydrate",  setlistId:"ks-s2", trackIds:["ks-t1"]},
  {kind:"tick", ms:0}
]
```

Both share the invariant structure:

> `[lazy-hydrate S, …, edit-set setlists/S {…}, …, lazy-hydrate S]`

The `edit-set setlists/S` between the two `lazy-hydrate S` calls is the
load-bearing action.

---

## Mechanism

1. `simulateLazyHydration` (`property-failures.test.ts:1631`) gates idempotency
   on a Dexie row read:
   ```ts
   const setlist = await db.setlists.get(setlistId)
   if (setlist?.hydrated === true) return []  // idempotent skip
   ```
2. `applyEdit({op:'set', collection:'setlists', doc:{id:'ks-s2', v:0}})`
   (`src/lib/local/write.ts:106`) does:
   ```ts
   await db[collection].put(edit.doc as never)   // full-document replace
   ```
   This **obliterates `hydrated:true`** from the local Dexie row — the new row
   is literally `{id:'ks-s2', v:0}`.
3. The second `lazy-hydrate` call re-reads Dexie, finds `hydrated !== true`,
   does NOT idempotent-skip, and re-runs the full fan-out + final
   `applyEdit('update','setlists',{hydrated:true})`.
4. The invariant counter at `property-failures.test.ts:1911-1929` sees two
   `setlists/S` rows in `committed[]` with `op:'update'` + `payload.hydrated:true`
   → fails: `"ks-s2 got 2 hydrate updates (expected ≤1)"`.

The Dexie-flag-as-dedup gate is the weak link.

---

## Why production (`SetlistGridHydrator`) is unaffected

`SetlistGridHydrator.tsx:85`:

```ts
const fanoutStartedRef = useRef(false)
// …
if (initialSetlist.hydrated === true) return   // data-layer guard
if (initialTracks.length === 0) return
if (fanoutStartedRef.current) return            // in-memory guard ← KEY
fanoutStartedRef.current = true
```

Production has **two layered guards**:

1. **Data-layer:** `initialSetlist.hydrated === true` — checks the prop,
   sourced from the parent's server fetch.
2. **In-memory:** `fanoutStartedRef` — a `useRef` scoped to the component
   instance. Survives all Dexie row mutations.

The test helper only mirrors guard #1. Guard #2 (the in-memory ref) is
the one that would have caught this counterexample in production.

Even if a remount were to drop `fanoutStartedRef` (new component instance,
fresh ref), production's `applyEdit('update','setlists', …, expectedUpdatedAt:
initialSetlist.updatedAt)` would surface as `VersionMismatchError` once the
server's `updatedAt` has advanced past the stale-prop's `updatedAt`. The failed
outbox row is observable; **no duplicate `hydrated:true` write reaches the
server.** The test invariant counts test-side `committed[]` rows, which are
pushed unconditionally regardless of whether the underlying `applyEdit('update')`
succeeded or got tagged `failed` in the outbox — a test-side bookkeeping
artifact, not a production bug surface.

---

## Why the HEADS-UP "load-factor sensitive" framing is misleading

The HEADS-UP message reported:

- 2/10 at LF=2 full-suite ✗
- 1/5 at LF=2 diag re-run ✗
- 0/10 file-solo at LF=2 ✓ (initial Phase-0 solo run confirms this match)
- 0/10 at LF=1.5 full-suite + file-solo ✓
- 0/10 at LF=1 ✓

What's actually going on: the per-iteration `ITER_TIMEOUT_MS = loadAdjusted(8_000)`
is 8s at LF=1, 16s at LF=2. Some iterations under suite-wide CPU pressure miss
the 8s timeout and surface as `iteration > 8000ms — runaway`, NOT as the AC-1
idempotency invariant. Under LF=2 the 16s budget is generous enough that the
same iterations complete to their actual verdict — including the idempotency
violation. So LF=2 doesn't *cause* the bug; it just lets the test reach the
verdict instead of hitting the runaway timer.

**The bug is fully reproducible at LF=1 solo with explicit seed `-823001267`** —
no load-factor knob required.

(Phase-0 also incidentally surfaced a *separate* pump-runaway bug under
solo LF=2 + numRuns=500 + no-seed: a `cross-tab setlists/S → lazy-hydrate S →
edit-update setlists/S → force-quit → edit-set tracks/T → tick(0) → edit-set
tracks/T` shape triggers a pump retry loop that exceeds 16s. **Out of scope
for this lane** per the dispatch's "no architectural refactor of SyncEngine
or runKitchenSink — surgical only" boundary. Logged here for future-lane
attention; raw logs in `.ac1-diag/phase0-ac1-solo-lf2-numRuns500.log`.)

---

## Phase-1 fix proposal (surgical, ~6 LOC)

Mirror production's two-layer guard at `runKitchenSink`. The existing
`lazyHydrateCalls: Map<string, number>` counter (already present for
observability) is exactly the in-memory `fanoutStartedRef` equivalent — we
just need to honor it:

```diff
 } else if (action.kind === 'lazy-hydrate') {
     const calls = (lazyHydrateCalls.get(action.setlistId) ?? 0) + 1
     lazyHydrateCalls.set(action.setlistId, calls)
+    // Mirror production SetlistGridHydrator.fanoutStartedRef
+    // (component-instance in-memory dedup, independent of Dexie row
+    // state). Without this guard, an intervening edit-set on
+    // setlists/S between two lazy-hydrate calls wipes the local
+    // hydrated:true flag (full-doc replace in applyEdit), letting the
+    // second lazy-hydrate re-fan-out — which doesn't happen in
+    // production because fanoutStartedRef survives Dexie row mutations.
+    if (calls > 1) continue
     const cs = await simulateLazyHydration(action.setlistId, action.trackIds)
     …
 }
```

Plus a deterministic regression test mirroring the new
"lazy-hydration cascade is idempotent across re-mounts" pattern at
`property-failures.test.ts:1992` but with the `edit-set setlists/S` clobber
in between:

```ts
it('lazy-hydration idempotency survives an intervening edit-set on the setlist row', async () => {
    await runKitchenSink([
        { kind: 'lazy-hydrate', setlistId: 'ks-s2', trackIds: ['ks-t1'] },
        { kind: 'edit-set', collection: 'setlists', docId: 'ks-s2', payload: { v: 0 } },
        { kind: 'edit-set', collection: 'tracks', docId: 'ks-t1', payload: { v: 0 } },
        { kind: 'tick', ms: 0 },
        { kind: 'lazy-hydrate', setlistId: 'ks-s2', trackIds: ['ks-t1'] },
    ])
}, 30_000)
```

This deterministic regression locks the fix in independently of fast-check
seed luck.

---

## Memory proposal

Optional addendum to `[[feedback_parallel_load_flake_baseline]]`:

> **AC-1 lazy-hydration idempotency flake — RESOLVED 2026-05-26 @ <SHA>**
> by `ac1-lazy-hydration-characterization` lane (coder-1). Test-only fix:
> `runKitchenSink` now honors its existing `lazyHydrateCalls` counter as
> an in-memory `fanoutStartedRef` mirror, matching production
> `SetlistGridHydrator` semantics. Bug was seed-deterministic, not
> load-sensitive; LF=2 framing in original HEADS-UP was a side-effect of
> the per-iteration `loadAdjusted(8_000)` timeout masking the verdict at
> LF=1 under suite-wide CPU pressure. Phase-0 FINDINGS.md retained at
> `.paul/research/ac1-lazy-hydration-characterization/FINDINGS.md`
> (worktree-local; not committed unless follow-up needs it).

---

## Out-of-scope artifacts (logged here)

- **Pump-runaway bug** under cross-tab + lazy-hydrate + force-quit +
  edit-set + tick + edit-set sequences. Surfaces as `iteration > 16000ms`
  at LF=2. Raw counterexamples in
  `.ac1-diag/phase0-ac1-solo-lf2-numRuns500.log`. Future-lane material
  (`SyncEngine` pump-coalescing under VersionMismatch retry storms).
- **DatabaseClosedError teardown leaks** trailing every runaway iteration.
  AC-5's coder-7 fix at `398d5946a` handles the deterministic teardown
  race for AC-5; the runaway-induced version is upstream of AC-5's
  shutdown. Out-of-scope per dispatch hard boundary.
