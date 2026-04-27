---
phase: v5h-01-track-edit-save-loss
plan: 03
type: execute
wave: 1
depends_on: ["02"]
files_modified:
  - src/hooks/use-setlist-performance.ts
  - src/hooks/__tests__/use-setlist-performance.test.ts
autonomous: false
---

<objective>
## Goal

Close the perf-view side of the v5.0 save-loss bug surfaced by Daniel's v5h-01-02 UAT. Two coupled fixes to `useSetlistPerformance`:

- **Trust top-level when the setlist is hydrated.** When `setlistData?.hydrated === true`, `useSetlistPerformance` ALWAYS uses `topLevelTracks` (no fallback to legacy `setlistData.tracks` embedded array — embedded is intentionally stale post-migration). This closes the "edit lands in editor but not in perf-view" gap for hydrated setlists where the snapshot delivers an empty array briefly OR where embedded is just stale-by-design.
- **Resubscribe on snapshot error.** When `onSnapshot` errors (most commonly `permission-denied` from a perf-view tab opened BEFORE rules were deployed — Daniel's exact UAT scenario), the current handler sets `topLevelTracks=[]` and the subscription dies forever (only a page reload recovers). New behavior: log + retry once after a 1s delay with a fresh subscription. After the retry, give up and stay empty (avoid retry storms).

After this plan ships and is deployed, Daniel re-runs UAT scenario 1 with perf-view check.

## Purpose

v5.0-hotfix milestone close is BLOCKED on Daniel's UAT scenario 1 PASSING end-to-end (editor save + perf-view reflection). v5h-01-02 closed the editor side (rules + Hydrator outbox-pending guard + listener LWW). v5h-01-03 closes the perf-view side. Without this fix, every edit Daniel makes "saves" but doesn't show up where the band actually reads the chart from on stage — which makes the v5.0 "bulletproof" claim hollow at the user's actual point of contact.

## Output

- Updated `src/hooks/use-setlist-performance.ts` with hydrated-trust dual-read + onSnapshot resubscribe-once.
- Updated `src/hooks/__tests__/use-setlist-performance.test.ts` with 3 new deterministic tests (prefer-top-level-when-hydrated; fallback-when-not-hydrated; resubscribe-on-error).
- v5h-01-03-SUMMARY.md documenting what shipped + commit + verification + readiness for v5h-01-04 postmortem.

</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md

## Prior Work (v5h-01-02 UAT result drives this plan)
@.paul/phases/v5h-01-track-edit-save-loss/v5h-01-02-SUMMARY.md

## Source Files
@src/hooks/use-setlist-performance.ts
@src/hooks/__tests__/use-setlist-performance.test.ts

## Smoking-gun observations from Daniel's v5h-01-02 UAT

Daniel reported: "it saved in the setlist but didn't show in the perform view". The editor side worked — `tracks/{modeh-ani-id}.key === 'E'` lands at Firestore. The perf-view doesn't reflect it. Three failure modes are present in `src/hooks/use-setlist-performance.ts`:

1. **Dead subscription on permission-denied** (line 82-88). If the perf-view tab opened before the v5h-01-02 rules deploy, the initial `onSnapshot` errored with `permission-denied`. The error callback sets `topLevelTracks=[]` and the Firestore subscription terminates. The `useEffect` dep is just `[setlistId]` — same setlistId means no re-attach. Only a hard page refresh recovers.

2. **Fallback hides the truth for hydrated setlists** (line 94-95):
   ```ts
   const tracks: SetlistTrack[] =
       topLevelTracks.length > 0 ? topLevelTracks : setlistData?.tracks || []
   ```
   For a HYDRATED setlist, `setlistData?.tracks` (legacy embedded array) is intentionally stale — all edits flow to top-level only post-migration. If `topLevelTracks` is briefly empty (initial mount, before snapshot delivers; OR dead subscription per #1), the fallback shows stale embedded data.

3. **No backoff on retry**. Without a capped retry, a permanently-failing subscription would alert-fatigue or burn battery if we naively re-attached on every render.

## Reference: existing dual-read shape (use-setlist-performance.ts:51-95)

```ts
const [topLevelTracks, setTopLevelTracks] = useState<SetlistTrack[]>([])

useEffect(() => {
    if (!setlistId) return
    const q = query(
        collection(db, "tracks"),
        where("setlistId", "==", setlistId),
    )
    const unsub = onSnapshot(
        q,
        (snap) => { /* ... sort by order, setTopLevelTracks(next) ... */ },
        (err) => {
            logger.warn(`[useSetlistPerformance] top-level tracks subscription error for ${setlistId}`, err)
            setTopLevelTracks([])
        },
    )
    return unsub
}, [setlistId])

const tracks: SetlistTrack[] =
    topLevelTracks.length > 0 ? topLevelTracks : setlistData?.tracks || []
```

## Reference: Setlist + LocalSetlist type — `hydrated?` field (already exists from v50-07-03)

`Setlist` (Firestore-shaped, the type backing `useSafeFirestoreSync<Setlist>`) carries the `hydrated?: boolean` flag added in v50-07-03's lazy-hydration cascade. A setlist with `hydrated:true` has had its embedded `tracks[]` fanned out to top-level `tracks/{id}` already; embedded is post-migration stale-by-design and SHOULD NOT be read from for that setlist.

For a setlist with `hydrated !== true` (legacy not-yet-opened-in-editor, or v50-07-03 hydration cascade still in flight), the embedded array is the only data source — top-level is empty by definition. The existing fallback IS correct for that case.

</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| (none) | — | This plan touches the data-layer hook only — no new pixels, no UI surface modified. Same precedent as v50-06-01 + v50-07-04 + v5h-01-02. | N/A |

`/ui-ux-pro-max` is NOT required for this plan.

</skills>

<acceptance_criteria>

## AC-1: useSetlistPerformance prefers top-level when setlist is hydrated

```gherkin
Given a setlist with `hydrated: true` is loaded via useSafeFirestoreSync
And the setlist's embedded `tracks[]` array carries 3 stale rows (e.g., key='C' for "Modeh Ani")
And the top-level tracks subscription delivers 1 row for "Modeh Ani" with key='E' (the user's recent edit)
When the hook computes `tracks`
Then `tracks.length === 1`
And `tracks[0].key === 'E'` (top-level wins, embedded is ignored)
```

## AC-2: useSetlistPerformance falls back to embedded when setlist is NOT hydrated

```gherkin
Given a setlist with `hydrated` undefined or false is loaded
And the setlist's embedded `tracks[]` carries 3 rows (legacy data)
And the top-level tracks subscription delivers 0 rows (cascade hasn't fired or hasn't completed yet)
When the hook computes `tracks`
Then `tracks.length === 3`
And the rows match the embedded array (legacy fallback preserved)
```

## AC-3: useSetlistPerformance resubscribes once on onSnapshot error

```gherkin
Given the perf-view loads with setlistId=X
And the initial `onSnapshot` errors (e.g., permission-denied)
When the hook's error handler fires
Then `topLevelTracks` is set to []
And after a 1s delay, a SECOND `onSnapshot(query(tracks, where setlistId==X))` is attempted with a fresh subscription
And if the second attempt also errors: stays empty (no third retry; no storm)
And if the second attempt succeeds: `topLevelTracks` updates from the new delivery
And the unsub returned from useEffect cleanup cancels both the active subscription and any pending retry timer
```

## AC-4: Daniel UAT scenario 1 perf-view confirmation (HUMAN-VERIFY)

```gherkin
Given v5h-01-03 deployed to production (Vercel auto-deploys after push to origin master)
And v5h-01-02 rules are live (already deployed)
And Daniel's stuck outbox is cleared (already done in v5h-01-02 HUMAN-VERIFY)
When Daniel opens or creates a setlist + edits "Modeh Ani" key to E
And navigates to /perform/setlist/{id} (perf-view) — either via in-app link, fresh tab, or browser back/forward
Then the perf-view shows Modeh Ani with key='E' (NOT the stale legacy key)
And refreshing the perf-view tab still shows key='E'
And opening the perf-view in a tab that was loaded BEFORE the rules deploy now correctly shows key='E' after a brief retry window (within ~2s)
And no console errors visible in DevTools beyond the expected one-shot warn from the first failed subscription
```

## AC-5: Suite + tsc + build green

```gherkin
Given AC-1, AC-2, AC-3 implemented
When `npx vitest run` and `npx tsc --noEmit` and `npm run build` are run
Then vitest suite is fully green (1479 → 1482 with the 3 new use-setlist-performance tests)
And tsc --noEmit reports no errors
And `npm run build` completes successfully
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: Update useSetlistPerformance dual-read + resubscribe</name>
  <files>src/hooks/use-setlist-performance.ts</files>
  <action>
Two coupled changes inside `useSetlistPerformance`:

**Change A — Resubscribe-once on onSnapshot error** (lines 59-91 of current file):

Replace the single `onSnapshot` call inside the useEffect with a small inner factory that can be called twice (initial + one retry). Keep the same useEffect dep array `[setlistId]`. Track:
- An `attempt` counter (0 then 1).
- A `cancelled` flag (set true on cleanup).
- A `currentUnsub` ref-like local for the active subscription's unsubscribe.
- A `retryTimer` local for the pending setTimeout, if any.

Behavior:
- On `onNext`: `setTopLevelTracks(next)` (existing sort logic preserved).
- On `onError`: log via `logger.warn` (existing message format preserved). Call `setTopLevelTracks([])`. If `attempt < 1` and not `cancelled`, schedule `retryTimer = setTimeout(() => { if (!cancelled) { attempt = 1; currentUnsub = subscribe() } }, 1000)`. Otherwise, do nothing (give up).
- On useEffect cleanup: `cancelled = true`; `currentUnsub?.()`; `if (retryTimer) clearTimeout(retryTimer)`.

The retry budget is exactly ONE additional attempt. No exponential backoff, no third try — the goal is to recover from the v5h-01-02 deploy race (initial subscription racing the rules-deploy propagation) NOT to handle persistent permission failures.

**Change B — Hydrated-trust dual-read** (line 94-95 of current file):

Replace:
```ts
const tracks: SetlistTrack[] =
    topLevelTracks.length > 0 ? topLevelTracks : setlistData?.tracks || []
```

With:
```ts
const tracks: SetlistTrack[] = setlistData?.hydrated === true
    ? topLevelTracks
    : (topLevelTracks.length > 0 ? topLevelTracks : setlistData?.tracks || [])
```

For hydrated setlists, top-level is the source of truth even when briefly empty (snapshot has yet to deliver the first batch). For unhydrated setlists, the existing dual-read with embedded fallback preserves the v50-07-03 lazy-cascade-in-flight semantics.

**Comment block at the top of the useEffect** documenting v5h-01-03 (perf-view bridge fix). One short comment near each change documenting WHY (resubscribe = v5h-01-02 deploy race; hydrated-trust = embedded is stale-by-design post-migration).

Avoid:
- Touching the setlistData (`useSafeFirestoreSync`) subscription path — separate concern, stable.
- Touching the musician-profile subscription useEffect (lines 106-112) or wake-lock useEffect (lines 119-121) — out of scope.
- Adding exponential backoff — single retry budget per the AC.
- Catching errors inside `onNext` — error path is `onSnapshot`'s error callback only.
- Changing the sort-by-order logic in `onNext` — preserve as-is.
- Importing new dependencies — the change is self-contained.
  </action>
  <verify>
1. `grep -n "hydrated === true\|hydrated == true" src/hooks/use-setlist-performance.ts` returns one match in the dual-read line.
2. `grep -n "setTimeout\|retryTimer" src/hooks/use-setlist-performance.ts` returns matches for the retry-once timer.
3. `npx tsc --noEmit` clean.
4. (Tests added in Task 2.)
  </verify>
  <done>AC-1 + AC-2 + AC-3 satisfied (post-Task 2 verification).</done>
</task>

<task type="auto">
  <name>Task 2: Add 3 tests for hydrated-trust + resubscribe</name>
  <files>src/hooks/__tests__/use-setlist-performance.test.ts</files>
  <action>
Extend the existing `useSetlistPerformance` describe block with 3 new tests. The existing mock scaffolding (lines 13-27 of the test file) captures `onSnapshotEmit` for the success callback. EXTEND the mock to also capture an `onSnapshotError` callback so tests can drive error paths deterministically:

```ts
let onSnapshotEmit: ((snap: { docs: Array<{ id: string; data: () => unknown }> }) => void) | null = null
let onSnapshotError: ((err: Error) => void) | null = null
const mockUnsub = vi.fn()
const mockOnSnapshot = vi.fn(
    (
        _q: unknown,
        onNext: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void,
        onErr?: (err: Error) => void,
    ) => {
        onSnapshotEmit = onNext
        onSnapshotError = onErr ?? null
        return mockUnsub
    },
)

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    collection: vi.fn(() => ({})),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    onSnapshot: (
        q: unknown,
        onNext: (snap: { docs: Array<{ id: string; data: () => unknown }> }) => void,
        onErr?: (err: Error) => void,
    ) => mockOnSnapshot(q, onNext, onErr),
}))
```

In the `beforeEach`, also reset `onSnapshotError = null` alongside `onSnapshotEmit = null`.

Tests to add:

1. **`prefers top-level over embedded when setlist is hydrated`**
   - Setup: `mockUseSafeFirestoreSync` returns `{ data: { id: 'setlist-1', hydrated: true, tracks: [{ id: 't1', key: 'C', order: 0 }, { id: 't2', key: 'D', order: 1 }, { id: 't3', key: 'E', order: 2 }] }, loading: false, error: null }`.
   - Render hook with setlistId='setlist-1'.
   - Drive `onSnapshotEmit({ docs: [{ id: 't1', data: () => ({ id: 't1', key: 'E', order: 0 }) }] })`.
   - Assert: `result.current.tracks.length === 1`, `result.current.tracks[0].key === 'E'`.

2. **`falls back to embedded when setlist is NOT hydrated and top-level is empty`**
   - Setup: `mockUseSafeFirestoreSync` returns `{ data: { id: 'setlist-1', hydrated: false, tracks: [{ id: 't1', key: 'C', order: 0 }, { id: 't2', key: 'D', order: 1 }, { id: 't3', key: 'E', order: 2 }] }, loading: false, error: null }`.
   - Render hook with setlistId='setlist-1'.
   - Drive `onSnapshotEmit({ docs: [] })` (empty top-level).
   - Assert: `result.current.tracks.length === 3` (embedded fallback engaged).

3. **`resubscribes once with a 1s delay when onSnapshot errors, then succeeds`**
   - Setup: `mockUseSafeFirestoreSync` returns `{ data: { id: 'setlist-1', hydrated: true, tracks: [] }, loading: false, error: null }`.
   - `vi.useFakeTimers()` in this test (and `vi.useRealTimers()` in cleanup) — needed for `setTimeout` advance.
   - Render hook with setlistId='setlist-1'.
   - Drive `onSnapshotError(new Error('permission-denied'))` with the captured onErr.
   - Assert: `mockOnSnapshot.mock.calls.length === 1` initially.
   - `act(() => { vi.advanceTimersByTime(1000) })`.
   - Assert: `mockOnSnapshot.mock.calls.length === 2` (resubscribed).
   - Drive the new `onSnapshotEmit({ docs: [{ id: 't1', data: () => ({ id: 't1', key: 'E', order: 0 }) }] })`.
   - Assert: `result.current.tracks.length === 1`, `result.current.tracks[0].key === 'E'`.

Optional 4th test (only if the existing test scaffold supports it without effort): drive a SECOND error after the retry; assert no third subscription.

Avoid:
- Booting Firebase / Firestore for tests; use the existing module mock pattern.
- Adding new mock libraries — vitest fake timers + the existing mock pattern cover this.
- Testing `useSafeFirestoreSync` internals — that's stable from v50-07-03 + earlier; treat as a black box.
  </action>
  <verify>
`npx vitest run src/hooks/__tests__/use-setlist-performance.test.ts` shows the new 3 cases passing; total test count for this file goes from 13 → 16; tsc clean.
  </verify>
  <done>AC-1 + AC-2 + AC-3 verified by deterministic tests.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
- useSetlistPerformance hydrated-trust dual-read (Task 1).
- useSetlistPerformance one-shot resubscribe on onSnapshot error (Task 1).
- 3 new deterministic tests (Task 2).

After commit + push to origin master, Vercel auto-deploys. Daniel re-runs UAT scenario 1 with explicit perf-view check this time.
  </what-built>
  <how-to-verify>
**STEP 0 — Wait ~60s for Vercel to finish deploying.** No Firebase rules change in this plan, so only the JS bundle deploy matters.

**STEP 1 — Optional sanity refresh.** Open centralreform.live, hard-refresh the editor tab (Cmd-Shift-R / Ctrl-Shift-F5) so the new bundle is in play.

**STEP 2 — Run UAT scenario 1 end-to-end (editor + perf-view):**
1. Open or create a setlist (reuse `kQNvssixRlHQRB6gtWqt` or fresh).
2. Add "Modeh Ani" if not present.
3. Click Modeh Ani's Key cell → set to E.
4. Wait for sync indicator → "Saved" (still expected from v5h-01-02).
5. Navigate to /perform/setlist/{id} via the in-app link (Edit pencil icon goes to editor; back-arrow to setlists; Music note to perform — whatever the navigation pattern is).
6. **Confirm:** Modeh Ani row shows key=E in the perf-view (NOT the old key, NOT blank).
7. Hard-refresh the perf-view tab (Cmd-Shift-R) — confirm key=E persists.
8. Edit a SECOND track in the editor (e.g., set "Adon Olam" key to G). Switch back to the perf-view tab. Within ~2s the change should appear (live snapshot delivery).

**STEP 3 — Spot-check the deploy-race recovery (optional but good signal):**
1. Open a fresh perf-view tab in incognito BEFORE making any edit (this simulates the "tab opened before rules deployed" case from before — but rules ARE live now so the initial subscription should succeed; this is just a smoke check).
2. DevTools → Console → confirm no `permission-denied` warnings appear.
3. If you DO see a permission-denied warn followed by a successful subscription within ~2s, that's the resubscribe firing correctly — no action needed.

**Pass criteria:** STEPs 1-2 succeed; perf-view reflects the editor edit immediately and after refresh; navigation between editor + perf-view shows consistent data.

**If STEP 2.6 shows old key:**
- Open DevTools → Application → IndexedDB → `crc-local` → `tracks` → confirm the row is updated locally.
- Open DevTools → Network tab → filter "tracks" → confirm Firestore returned the updated doc.
- If both show key=E but UI shows old key, the dual-read fix isn't engaging — `setlistData?.hydrated` may be false on this setlist. Check Firestore Console → `setlists/{id}` → confirm `hydrated: true` field is present (lazy cascade in v50-07-03 marks this after fan-out succeeds; if it never fired or never marked, the fallback to embedded would still kick in). Report back with the setlist's `hydrated` value.

**If STEP 2.8 doesn't reflect live updates:**
- The onSnapshot delivery is silent. Check console for warnings; check Firestore Console → Rules → make sure `match /tracks/{trackId}` `read: isMember()` is live (deployed by v5h-01-02 Task 1).

**Issue 2 reminder (iPad UI bad — separate scope):** When you have a moment, describe what specifically reads as bad on the iPad key picker (small? hard to scroll? wrong widget?). I'll route to v5.1 UX overhaul OR surface as a v50-05-04 regression depending on the symptom.
  </how-to-verify>
  <resume-signal>Type "verified" once UAT scenario 1 (editor + perf-view) passes against production, or describe what failed (which step, screenshot if visual, console warnings, hydrated field state).</resume-signal>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE

- `src/lib/sync/engine.ts` — engine FSM stable from v50-06-01 + v5h-01-02.
- `src/lib/sync/snapshot-listener.ts` — listener LWW guard finalized in v5h-01-02 (B).
- `src/lib/sync/firestore-adapter.ts` — adapter contract stable from v50-06.
- `src/lib/sync/init.ts` — adapter singleton + getSyncAdapter() unchanged.
- `src/lib/local/schema.ts` — Dexie schema unchanged; no version bump.
- `src/components/setlist/grid/SetlistGridHydrator.tsx` — outbox-pending guard finalized in v5h-01-02 (F); lazy-hydration cascade still out of scope.
- `firestore.rules` — tracks/{id} + songs/{id} rules deployed in v5h-01-02 (E); no changes here.
- `src/hooks/use-safe-firestore-sync.ts` — setlist subscription path stable.
- `src/hooks/use-wake-lock.ts` + `src/lib/musician-profile.ts` — out of scope.
- `src/app/perform/setlist/[id]/page.tsx` — page wrapper consumes the hook; no changes needed here.
- `src/components/performance/SetlistView.tsx` + `src/components/performance/PDFOverlay.tsx` — perf-view rendering unchanged; this plan is data-layer only.

## SCOPE LIMITS

- This plan ships the perf-view bridge fix for the v5.0-hotfix UAT-blocker. It does NOT:
  - Address the iPad key-picker UI complaint from Daniel's UAT (Issue 2) — routed to v5.1 UX overhaul OR a v50-05-04 regression follow-up depending on symptom.
  - Add a backoff retry beyond the single 1s delay — persistent permission-denied is a real auth/rules problem and should surface in Sentry's `feature:snapshot-listener` tag (v50-07-05), not be papered over with infinite retries.
  - Re-architect `useSetlistPerformance` to read from Dexie via dexie-react-hooks (would unify editor + perf-view data paths but is a larger refactor; perf-view's direct Firestore subscription is still acceptable for the hotfix).
  - Add Firebase emulator integration to the kitchen-sink harness (routed to v5h-01-04 postmortem lessons).
- Out-of-scope from milestone v5.0-hotfix entirely: v5.1 UX overhaul (separate milestone after v5.0-hotfix ships).

</boundaries>

<verification>

Before declaring this plan complete:

- [ ] `src/hooks/use-setlist-performance.ts` has hydrated-trust dual-read (`setlistData?.hydrated === true ? topLevelTracks : ...`).
- [ ] `src/hooks/use-setlist-performance.ts` has resubscribe-once logic with `setTimeout` + cleanup-cancellable timer.
- [ ] `src/hooks/__tests__/use-setlist-performance.test.ts` has 3 new tests; total file count 13 → 16.
- [ ] `npx vitest run` clean (suite green; +3 from new tests).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` clean.
- [ ] HUMAN-VERIFY: Daniel's UAT scenario 1 (editor + perf-view end-to-end) passes against production.
- [ ] Single commit pushed to `origin master` per project convention (Vercel auto-deploys).
- [ ] v5h-01-03-SUMMARY.md created per `<output>` spec.

</verification>

<success_criteria>

- All 5 ACs satisfied.
- All verification checks pass.
- Daniel's UAT scenario 1 confirmed passing end-to-end (editor save AND perf-view reflection).
- v5.0-hotfix milestone close BLOCKER cleared (only v5h-01-04 postmortem remains before milestone audit).

</success_criteria>

<output>

After completion, create `.paul/phases/v5h-01-track-edit-save-loss/v5h-01-03-SUMMARY.md` with sections:

1. **What shipped** — files modified + commit hash + verification results.
2. **Acceptance Criteria Results** — table of AC-1 through AC-5 with pass/fail + evidence.
3. **Decisions Made** — including any in-task corrections or scope adjustments (e.g., if the resubscribe budget needs tuning based on Daniel's UAT).
4. **Verification Results** — vitest output (suite count delta), tsc + build outputs, Daniel's UAT confirmation.
5. **Deviations** — any auto-fixes, scope adjustments, deferred concerns.
6. **Boundary log** — confirmation that engine.ts, listener, Hydrator, init, etc. were untouched.
7. **Hand-off to v5h-01-04** — what the postmortem should cover (kitchen-sink security-rules + perf-view-coverage gap; cutover-plan rules-audit gate; perf-view should test at the integration level; UI/UX feedback loop with Daniel during v5.x UAT cycles).

</output>
</content>
