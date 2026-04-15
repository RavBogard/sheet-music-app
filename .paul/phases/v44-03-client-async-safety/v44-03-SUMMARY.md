---
phase: v44-03-client-async-safety
status: complete
date: 2026-04-15
---

# v44-03 SUMMARY — Client Async-Safety Sweep

Closed the R2B client-UX audit's 11 async-without-AbortController sites, 3 stale-closure sites, and the UX-007 unbounded-retry bug. Pure correctness work, no visual/UX changes.

## Commits

| Task | Commit   | Scope                                                              |
| ---- | -------- | ------------------------------------------------------------------ |
| 1    | 52a19c2  | AbortController + unmount cleanup on 6 fetch sites                 |
| 2    | 01fb601  | ChatPanel SSE abort + TempoFlash timer cleanup                     |
| 3    | 54aba81  | ref-stabilise onDismiss/onClose to prevent stale closures          |
| 4    | c0aed9a  | cap PDFViewer retries at 3 with terminal error state               |
| 5    | 76cd0d8  | regression suite for unmount/cleanup/retry-cap invariants          |

## Per-file changes

### `src/components/performance/PDFOverlay.tsx`
- Prefetch useEffect now owns an `AbortController`; the in-flight `/api/drive/file/:id` prefetch fetch is aborted on queueIndex change or unmount. Cleanup clears the 1s delay timer AND aborts.
- Escape keydown handler now reads `onCloseRef.current` so a parent prop-swap isn't lost to a stale closure; the listener no longer re-registers on every `onClose` identity change.
- The IDB URL-resolve effect already had a correct `cancelled` flag — left as-is (already safe).

### `src/components/music/PDFViewer.tsx`
- Added `MAX_RETRIES = 3` cap on `handleRetry()`. UI shows "Could not load chart — please try again later" and hides the retry button once exhausted.
- Retry counter resets when the `url` prop changes (fresh chart = fresh budget).
- Inner `Document` render-error slot also respects the cap.
- Pre-existing `AbortController` + 60s timeout on the fetch was already correct — left as-is.

### `src/components/library/UploadDialog.tsx`
- Added `abortControllerRef` and `closeTimerRef`.
- `handleUpload` now creates a fresh controller per attempt and passes `signal` to `apiFetch`.
- Post-await `setState`s guarded with `controller.signal.aborted`.
- `AbortError` catch-path is silent (no toast) — a cancelled upload is not a user-visible error.
- Unmount effect aborts the controller and clears the 1500ms "close after success" timer.

### `src/components/admin/library/LibrarySyncCard.tsx`
- Added `controllerRef` + unmount abort.
- `handleSync` passes `signal` to `apiFetch` and guards all post-await setState.
- `timeout: 0` on apiFetch so long library syncs aren't killed by the default 30s timeout.

### `src/components/admin/SoundSystemSection.tsx`
- Added three cleanup refs: `scanControllerRef`, `setupCodeControllerRef`, `savedTimerRef`.
- `handleScan` composes `AbortSignal.any([unmountController.signal, AbortSignal.timeout(8000)])` so either the 8s timeout OR unmount triggers abort.
- `handleGenerateSetupCode` uses a controller + post-await guards.
- The "Saved!" flash setTimeout is now tracked and cleared on unmount.

### `src/components/setlist/v2/TrackSheet.tsx`
- Native-key `loadLibraryMeta(...).then()` path now uses a `cancelled` flag gating the setState. Stops the stale setState on fileId change or unmount.

### `src/components/nav/MobileTabBar.tsx`
- Search popover focus `setTimeout` now returns a cleanup that clears the timer.
- `handleSetlistTap` getDocs path: no setState on the result (navigates only), so no stale-setState risk — left as-is.

### `src/components/setlist/ChatPanel.tsx`
- Added `streamControllerRef` and unmount effect that aborts it.
- `handleSend` creates a fresh controller per send, passes `signal` to `apiFetch`, and threads abort checks through the SSE read loop. Reader is `cancel()`'d on abort.
- `AbortError` silently returns from the catch — no user-visible error toast.

### `src/components/performance/TempoFlash.tsx`
- Inner `setTimeout(() => setIsBeat(false), 100)` inside `setInterval` now tracked via `beatOffTimeoutRef` and cleared on cleanup.
- 10s dismiss timeout now reads `onDismissRef.current` — parent prop-swap mid-flight hits the latest callback. Effect deps dropped from `[onDismiss]` to `[]` so the countdown doesn't reset on parent re-render.

### `src/components/monitor/VerticalFaderStrip.tsx`
- Already had `clearTimeout` on the pending-state 2s timer AND rAF cleanup. **Already safe — no change.**

### `src/components/performance/SwapPicker.tsx`
- Escape handler is an inline React `onKeyDown` on the input element (not a long-lived `addEventListener`), so no stale-closure risk. Focus `setTimeout` already has `clearTimeout` cleanup. **Already safe — no change.**

## UX findings closed

| Finding  | Closed? | File                             | Mechanism                                |
| -------- | ------- | -------------------------------- | ---------------------------------------- |
| UX-003   | yes     | TempoFlash.tsx                   | ref + inner clearTimeout                 |
| UX-005   | verified | PDFOverlay.tsx                  | pre-existing `cancelled` flag            |
| UX-006   | verified | PDFViewer.tsx                   | pre-existing AbortController + timeout   |
| UX-007   | yes     | PDFViewer.tsx                    | MAX_RETRIES = 3 + terminal error UI      |
| UX-008   | yes     | UploadDialog.tsx                 | closeTimerRef + clearTimeout in unmount  |
| UX-009   | yes     | UploadDialog.tsx                 | abortControllerRef + abort in unmount    |
| UX-010   | yes     | LibrarySyncCard.tsx              | controllerRef + abort in unmount         |
| UX-013   | yes     | TrackSheet.tsx                   | cancelled flag on loadLibraryMeta        |
| UX-014   | n/a     | SwapPicker.tsx                   | already safe (inline onKeyDown)          |
| UX-019   | verified | VerticalFaderStrip.tsx          | already safe (pre-existing clearTimeout) |
| UX-020   | yes     | ChatPanel.tsx                    | streamControllerRef + reader.cancel()    |
| UX-021   | yes     | MobileTabBar.tsx                 | clearTimeout on focus timer              |
| UX-022   | yes     | TempoFlash.tsx                   | inner beat-off timeout tracked           |
| UX-023   | yes     | PDFOverlay.tsx                   | onCloseRef for Escape handler            |
| UX-024   | yes     | SoundSystemSection.tsx           | AbortSignal.any + unmount refs           |

## Already-safe components (no changes)

- `VerticalFaderStrip.tsx` — clearTimeout on 2s pending timer + rAF cleanup already present.
- `SwapPicker.tsx` — Escape handler is a React synthetic onKeyDown, not a stale-closure risk; focus timer already cleared.

## Test count

- Before: **1292 tests / 113 files**
- After: **1297 tests / 114 files** (+5, +1 file)
- New file: `src/components/performance/__tests__/async-safety.test.tsx`
- Net: all 5 acceptance criteria covered. Full suite green.

## Verification results

| Gate                  | Result        |
| --------------------- | ------------- |
| `npx tsc --noEmit`    | clean         |
| `npx vitest run`      | 1297/1297 pass |
| `npm run lint`        | clean         |
| `npm run build`       | clean         |
| "setState on unmounted" warnings in test output | none |

## Notes / deviations

- `assignment-auth.test.ts` was flaky under full-suite parallel load (5s timeout) but passed on isolated runs — pre-existing flakiness, unrelated to these changes.
- Scope expansion from plan: the `setTimeout(() => setMonitorSaved(false), 2000)` in SoundSystemSection was also tracked via ref since we were already on that file — matches the "<5 lines and component already open for surgery" heuristic from the plan boundaries.
- No visual, layout, copy, or debounce-timing changes. Behavior identical except:
  - PDFViewer shows terminal error after 3 failed manual retries.
  - Aborted network requests silently no-op instead of firing error toasts.
