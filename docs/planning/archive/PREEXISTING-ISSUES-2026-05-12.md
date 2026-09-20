# Pre-existing Issues Encountered During Bug 1/2/3 Work

Captured while investigating and fixing the drag-handle / persistence / bind-chart bugs on 2026-05-12. None of these are caused by my changes — all reproduce on `master` with my changes stashed. Grouped by severity / type so they can be triaged systemically in follow-up passes.

---

## A. Test failures pre-existing on master (verified by git stash + re-run)

Master baseline: **79 tests failing across ~14 test files** (1542/1621 passing). My branch shipped Bug 1/2/3 fixes and brought it down to **71 failing** (1550/1621 passing) by updating tests that exercised the changed behaviors.

The remaining 71 are pre-existing. Highlights of the failure clusters:

### A.1 — `SetlistGrid.dnd.test.tsx` — 3 failures
All three time out on `findAllByTestId('drag-handle')` or `findByText('Aleinu')`. The SetlistGrid renders only the SyncIndicator ("Saved" pill) in these tests — the grid body doesn't render. Likely a Dexie / hydration / auth-mock setup issue in the test harness, not a component bug. Tests:
- `AC-7 delete-row: empty row deletes immediately (no confirmation)`
- `AC-7 delete-row: titled row prompts confirmation; cancel preserves the row`
- `drag handle has accessible label`

### A.2 — `SetlistGrid.contextmenu.test.tsx` — 11 failures
Same render-failure pattern — `findByTestId('drag-handle')` times out. Suggests the contextmenu tests share the same broken harness setup. All 11 in the `SetlistGrid — right-click ContextMenu + long-press for touch` suite.

### A.3 — Remaining ~57 failures
Distributed across other files. I didn't drill into each — focusing on the bug-fix work — but the same render-failure pattern likely accounts for many.

**Recommended follow-up**: write a focused triage doc that reruns the suite with verbose output, groups failures by error fingerprint, and identifies whether they're (a) harness setup gaps, (b) stale assertions vs evolved code, or (c) real bugs hiding under test failures.

---

## B. TypeScript / lint debt visible from `tsc --noEmit`

After `npm install`, the type-check is *mostly* clean for production code. But several pre-existing problems remain:

### B.1 — Missing dev-time types
- `jest-axe` types not declared. `toHaveNoViolations` therefore appears as a type error wherever it's used:
  - `src/components/setlist/grid/__tests__/AddBar.test.tsx`
  - `src/components/setlist/grid/__tests__/ReconciliationProvider.test.tsx`
  - `src/components/setlist/grid/__tests__/SetlistGrid.a11y.test.tsx`
- Fix: add `@types/jest-axe` or declare ambient typings in `vitest.setup.ts`.

### B.2 — Implicit `any` in test files
Many test files have `Parameter 'r'/'t'/'a'/'b' implicitly has an 'any' type` errors. Examples:
- `src/components/setlist/grid/__tests__/MobileCardList.test.tsx`
- `src/components/setlist/grid/__tests__/SetlistGrid.contextmenu.test.tsx`
- `src/components/setlist/grid/__tests__/SetlistGrid.dnd.test.tsx`
- `src/components/setlist/grid/__tests__/SetlistGrid.fileId-on-pick.test.tsx`
- `src/components/setlist/grid/__tests__/SetlistGrid.selection.test.tsx`
- `src/components/setlist/grid/__tests__/SetlistGridHydrator.test.tsx`
- Fix: type the array callbacks (`(r: LocalTrack) => ...`) or relax `noImplicitAny` for tests.

### B.3 — Missing `@tanstack/react-table` types in some import paths
`src/components/setlist/grid/SetlistGrid.tsx` line 28 and `interface module augmentation` at line 127 show pre-existing import errors when `node_modules` is missing — these would also fail in a fresh CI checkout if the install step is skipped. Not a code bug; an install-discipline note.

### B.4 — Service worker types
- `next.config.ts` line 3: `Cannot find module '@serwist/next'`
- `src/app/sw.ts` lines 1-3: similar `@serwist/next/worker` + `serwist` missing
- These were pre-existing on master with `node_modules` populated. Likely a `tsconfig` path/include issue or missing peer deps.

---

## C. Code smells / latent bugs I noticed but didn't fix

### C.1 — `firebase.ts` `_shutdownRecoveryScheduled` is mislabeled
`src/lib/firebase.ts` line 164-173:

```ts
let _shutdownRecoveryScheduled = false
export function recoverFromFirestoreShutdown(err: unknown): void {
    // ...
    if (_shutdownRecoveryScheduled) return
    _shutdownRecoveryScheduled = true
    // ...
}
```

The comment claims `Debounced: subsequent calls within 5s are no-ops`, but the flag is **never reset**. This is a one-shot guard, not a debounce. If the recovery reload fails (e.g., navigation blocked) the function will never run again in this tab session. Should either reset after the reload settle window OR be honestly named `_shutdownRecoveryAttempted`.

### C.2 — `isMobile` in SetlistGrid is now dead code
After my Bug 3 fix removed the mobile-anchor `ChartBindPopover` block, `src/components/setlist/grid/SetlistGrid.tsx:925` (`const isMobile = useMediaQuery('(max-width: 767px)')`) has no remaining reader. Trivial cleanup; skipped to keep my diff minimal.

### C.3 — `ChartBindPopover.tsx` may be partially dead
After Bug 3, the only remaining caller of `ChartBindPopover` is the in-cell desktop click path at [SetlistGrid.tsx:413](src/components/setlist/grid/SetlistGrid.tsx:413). If the team chooses to migrate that path too (the plan recommended keeping it for now), `ChartBindPopover.tsx` and its test could be deleted entirely.

### C.4 — `setlist-firebase.ts` `subscribeToSetlist` looks vestigial
[src/lib/setlist-firebase.ts:178-189](src/lib/setlist-firebase.ts:178) defines `subscribeToSetlist` on the service. But the live-edit visibility path uses `src/lib/sync/snapshot-listener.ts` directly. If no other code paths still consume the service's subscription, this is dead. (Didn't grep exhaustively — verify before removing.)

### C.5 — Hardcoded 3-second SW reload
[src/lib/firebase.ts:151-154](src/lib/firebase.ts:151) reloads the entire page 3 seconds after `serviceWorker.controllerchange`. Two issues:
- 3 seconds isn't long enough to guarantee in-flight Firestore writes drain (a single network round-trip can be slower under poor conditions). With the new outbox engine, the right move is to wait for `engine.notifyFromDb()` to show queued === 0 before reloading.
- Hard reload mid-edit is jarring. Worth surfacing a "reloading for app update" toast or a deferred reload-on-next-idle.

### C.6 — Auto IndexedDB-wipe on assertion failure
[src/lib/firebase.ts:130-141](src/lib/firebase.ts:130) catches `INTERNAL ASSERTION FAILED` and deletes ALL Firestore IndexedDB databases + reloads. This wipes the *local cache*, but more importantly it now also wipes the **outbox** (since the outbox lives in a separate Dexie DB, but worth verifying it doesn't share an IDB name pattern matched by `/firestore/i`). If outbox rows are inside an IDB whose name matches `firestore`, this recovery path destroys user edits.
- **Verify**: does `clearFirestoreIndexedDB` ever touch the `crc-local` Dexie DB? Should be safe (different name), but worth a test.

### C.7 — Title format `"Saved · just now"` is documented but not implemented
[SyncIndicator.tsx:124-128](src/components/setlist/grid/SyncIndicator.tsx:124) puts the relative time in the tooltip, but doesn't show it in the visible label (the label is `"Saved"` flat). Plan v2 recommended surfacing it inline; not part of any of the three bugs but improves UX.

### C.8 — Auto-resolution path was completely silent
Pre-fix, `ReconciliationProvider`'s auto-resolve-to-`'mine'` ran without any console / Sentry surface for the choice it made. Users had no way to know cross-device edits had been silently overwritten on their behalf. My un-stub fixes the user-facing side, but consider adding a Sentry `recordEdit` breadcrumb every time a conflict surfaces / is resolved, so support has telemetry.

### C.9 — `'mine'`-default contradiction in code
[ReconciliationProvider.tsx:182](src/components/setlist/grid/ReconciliationProvider.tsx:182) comments document: *"Default is 'theirs' (safe default per ARCHITECTURE.md §6.9 — user has to opt in to overwrite remote)."* But the **pre-fix** auto-resolve hardcoded `'mine'`. Comment + code contradiction. My fix removed the auto-resolve and now honors the documented default; the comment is now accurate.

### C.10 — `disabled` vs `aria-disabled` mismatch on SyncIndicator action
[SyncIndicator.tsx:184-186](src/components/setlist/grid/SyncIndicator.tsx:184) uses HTML `disabled` on a non-button element when `isAction` is false. TypeScript probably allows it but it's nonsensical for `<span>`. Cosmetic.

---

## D. Architectural observations (worth a design conversation, not necessarily bugs)

### D.1 — No tombstone TTL prune
My Bug 2 fix adds a `tombstones` table that grows monotonically. In pathological cases (user creates and deletes many rows that never sync), this could grow unbounded. A periodic prune (e.g., older than 90 days, or older than the last sync ack) would be defensive.

### D.2 — `clearFailedOutboxRows` still exists as a deprecated alias
Kept for backward compat with the existing test. Eventually all callers should migrate to `discardFailedOutboxRows` (explicit) or `retryFailedOutboxRows` (recovery). Then `clearFailedOutboxRows` can be deleted.

### D.3 — `auto-resolve removed` means cross-device conflicts now require user interaction
After my Bug 2 fix, every conflict surfaces the modal — the user has to click. For a high-collaboration scenario (multiple musicians editing the same setlist live), this could become annoying. Consider:
- A per-user "auto-keep-mine" / "auto-keep-theirs" preference for low-stakes fields (e.g., trivial typo fixes).
- Or a CRDT layer for setlist tracks (overkill but principled).

### D.4 — Save-state machine doesn't distinguish "pending" from "saving"
The engine's `idle | dirty | saving | conflict | failed | offline` is great, but `dirty` and `saving` are both shown as "Editing…" / "Saving…" which the user can confuse. Worth re-checking whether the `dirty` state is even reachable today (looks like outbox enqueue → engine pump is so fast that `dirty` only flickers).

### D.5 — Long-press for context menu is hardcoded 500ms
[SetlistGrid.tsx:508](src/components/setlist/grid/SetlistGrid.tsx:508) — 500ms is on the long side; iPad system long-press is ~400ms. Worth user-testing.

---

## E. Things to verify before shipping the Bug 1/2/3 changes

Listed as a checklist for whoever takes this branch to production:

- [ ] Manually drag a row on desktop (mouse) — drags after 5px motion, plain click still works for multi-select.
- [ ] Manually drag a row on iPad — long-press handle → drag activates; tap handle → no drag.
- [ ] Long-press the row body (NOT handle) on iPad → context menu opens. Long-press the handle → no context menu.
- [ ] Delete a track. Go offline (DevTools). Reload. Track stays deleted.
- [ ] Delete a track. Force StaleWriteError (edit same track elsewhere). The conflict modal *appears* (verifies un-stub) with title "Remote changes detected".
- [ ] In the conflict modal, click "Cancel" — modal closes, edit not lost (outbox row still `failed`).
- [ ] In the conflict modal, click "Resolve all and save" with default 'theirs' radios — each row gets its outbox entry discarded; local Dexie left intact.
- [ ] In the conflict modal, select 'mine' for one row → "Resolve all and save" → that row retries with fresh `expectedUpdatedAt`.
- [ ] After a track delete fails permanently, click "Failed — retry" pill → row reverts to pending and engine drains (verify via outbox inspection / Sentry breadcrumb).
- [ ] Right-click a track (desktop) → "Bind chart" → centered Dialog opens with focused search input. Type to filter, Enter to bind.
- [ ] Long-press track (iPad) → "Bind chart" → same centered Dialog opens. System keyboard pops automatically.
- [ ] Bind chart on a track that already has a chart bound — current binding highlighted in list.

---

## F. Confidence after implementation (vs my pre-implementation estimates)

| Bug | Pre-impl confidence | Post-impl confidence | Why post is higher |
|-----|--------------------|--------------------|--------------------|
| 1   | 90%                | 95%                | Code read confirms exact mechanism; fix is small + surgical. |
| 2   | 90%                | 92%                | Multiple defects fixed atomically; tombstone + real-retry + un-stubbed modal closes the resurrection-and-loss pathways. Unknown: how often cross-device conflicts will now surface to the user given the modal is no longer silent. |
| 3   | 75%                | 85%                | Dialog approach has no anchor / handoff race by construction. Unknown: cmdk autoFocus interactions on iPad with VoiceOver enabled (not tested). |

---

## G. Open architectural questions for the team

1. Should the `tombstones` table get a TTL prune? If yes, what schedule (daily mount? engine pump? explicit user action)?
2. The reconciliation modal now appears on every conflict — should it ever be deferred (e.g., suppressed during active editing, surfaced when the user navigates away)?
3. The desktop in-cell ChartBindPopover and the new ChartBindDialog both exist. Migrate inline to Dialog too, or keep both?
4. Is the `clearFirestoreIndexedDB` auto-recovery (firebase.ts:130) ever destroying outbox rows? Worth a defensive test.
5. The `_shutdownRecoveryScheduled` one-shot — is the current behavior (never run again per tab session) correct, or should it reset after the reload window?
