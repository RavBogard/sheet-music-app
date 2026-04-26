---
phase: v44-03-client-async-safety
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/performance/PDFOverlay.tsx
  - src/components/music/PDFViewer.tsx
  - src/components/library/UploadDialog.tsx
  - src/components/admin/library/LibrarySyncCard.tsx
  - src/components/admin/SoundSystemSection.tsx
  - src/components/setlist/v2/TrackSheet.tsx
  - src/components/setlist/ChatPanel.tsx
  - src/components/monitor/VerticalFaderStrip.tsx
  - src/components/performance/TempoFlash.tsx
  - src/components/nav/MobileTabBar.tsx
  - src/components/performance/SwapPicker.tsx
  - src/components/admin/SongChartsLibrary.tsx
  - src/components/performance/__tests__/async-safety.test.tsx
autonomous: true
---

<objective>
## Goal
Close every async-without-AbortController, stale-closure, and unbounded-retry site from the v4.4 R2B client-UX audit. When a component unmounts mid-fetch, mid-setTimeout, or mid-SSE-stream, the in-flight operation must cancel cleanly — no setState after unmount, no phantom UI updates, no orphan event listeners.

## Purpose
Closes R2B findings marked as "async without AbortController: 11 instances (most critical)", "stale closures: 3 instances", and the `UX-007` retry-without-max finding. These bugs don't surface as red errors — they surface as:
- "setState on unmounted component" warnings in dev
- Stale cached data briefly flashing on a freshly mounted view (tab-switch races)
- Network requests that keep running after the user closed the dialog (wasted bandwidth, wrong state commit if they re-open before response)
- Space/Escape handlers that reference old values because the closure was captured at mount
- Occasional infinite retry loops on flaky PDFs

Per user directive "don't skip preexisting bugs": the UX-001/002/011/015/018 modal-state-reset bugs overlap thematically with the async-safety issues in some of the same files (UploadDialog, SwapPicker, TrackSheet). This plan fixes them in-file while the component is already open for surgery. Modal state reset is Phase 6 formally, but taking it here for the overlapping components is strictly cheaper than a second surgery pass.

## Output
- Every async useEffect that fetches or sets a timer has a proper cleanup path: `AbortController` or `cancelled` flag, awaited/checked on every state update after the await/yield.
- Every Escape/Space/Enter handler with a stale-closure risk uses refs for mutable values.
- PDFViewer caps retry at 3 attempts before surfacing a terminal error.
- A focused test suite asserts the cleanup invariants on the highest-value paths (PDFOverlay unmount, UploadDialog abort, ChatPanel SSE abort).
</objective>

<context>
## Project Context
@.paul/PROJECT.md
@.paul/ROADMAP.md
@.paul/STATE.md
@.paul/phases/v44-00-full-audit/R2B-client-ux.md

## Source Files (touched)
@src/components/performance/PDFOverlay.tsx
@src/components/music/PDFViewer.tsx
@src/components/library/UploadDialog.tsx
@src/components/admin/library/LibrarySyncCard.tsx
@src/components/admin/SoundSystemSection.tsx
@src/components/setlist/v2/TrackSheet.tsx
@src/components/setlist/ChatPanel.tsx
@src/components/monitor/VerticalFaderStrip.tsx
@src/components/performance/TempoFlash.tsx
@src/components/nav/MobileTabBar.tsx
@src/components/performance/SwapPicker.tsx
</context>

<skills>
## Required Skills (from SPECIAL-FLOWS.md)

This plan touches frontend components. Per SPECIAL-FLOWS.md, `/ui-ux-pro-max` is required for any phase touching frontend UI/UX. HOWEVER — this plan is strictly correctness work (abort controllers, cleanup, ref-based handlers). No visual, layout, accessibility, or interaction-design changes. No new components. No styling.

Interpretation: `/ui-ux-pro-max` is for UI/UX design decisions (visual, layout, interaction). Pure correctness fixes that don't change user-observable visuals, interactions, or layout are adjacent to frontend files but not frontend UX work.

| Skill | Priority | When to Invoke | Loaded? |
|-------|----------|----------------|---------|
| /ui-ux-pro-max | recommended | If any fix changes observable behavior beyond "no stale setState" | ○ (not loaded; no visual changes) |

**BLOCKING:** Per SPECIAL-FLOWS.md, frontend UI/UX work requires `/ui-ux-pro-max`. This plan's APPLY should consult with the user before executing if they consider correctness-only changes to fall under the frontend-UX flow. Pausing at APPLY approval for confirmation.
</skills>

<acceptance_criteria>

## AC-1: Every component with a flagged async pattern cancels on unmount
```gherkin
Given a component from the R2B async list (PDFOverlay, UploadDialog, LibrarySyncCard,
  SoundSystemSection, TrackSheet, ChatPanel, VerticalFaderStrip, TempoFlash,
  MobileTabBar, PDFViewer)
When the component unmounts during an in-flight fetch, setTimeout, or SSE stream
Then no setState call fires after unmount
  And no AbortController.abort() signal is swallowed
  And any setTimeout/setInterval started in useEffect is cleared in the cleanup return
  And in dev React does NOT log "Can't perform a React state update on an unmounted component"
```

## AC-2: Stale-closure handlers use refs for mutable callbacks
```gherkin
Given a Space/Escape/Enter handler registered via addEventListener in useEffect
  (TempoFlash onDismiss, PDFOverlay Escape handler)
When the parent changes the callback prop (e.g., swaps to a new onDismiss)
Then the handler invokes the LATEST callback, not the one captured at mount
```

## AC-3: PDF retries cap at 3 attempts
```gherkin
Given a PDF URL that consistently returns 500
When PDFViewer attempts to load it
Then after 3 failed attempts the component surfaces a terminal error state
  And does NOT keep retrying forever
```

## AC-4: SSE streaming aborts on close
```gherkin
Given the ChatPanel is open with an active SSE stream
When the user closes the panel or navigates away
Then the SSE EventSource/fetch is aborted
  And no further message-append setState fires
  And the underlying network connection is released
```

## AC-5: ChatPanel and PDFOverlay correctness is regression-locked
```gherkin
Given the async-safety.test.tsx suite
When the tests run
Then they cover:
  - PDFOverlay unmount mid-URL-resolution (AC-1 critical path)
  - UploadDialog unmount during upload (AC-1 critical path)
  - ChatPanel unmount during SSE (AC-1 + AC-4)
  - TempoFlash prop-swap while mounted (AC-2)
  - PDFViewer retry exhaustion (AC-3)
  And all pass.
```

## AC-6: Zero regression in the existing 1292 tests
```gherkin
When the full vitest suite runs
Then 1292 pre-existing tests still pass
  And at least +5 net tests from async-safety.test.tsx pass
```

</acceptance_criteria>

<tasks>

<task type="auto">
  <name>Task 1: AbortController sweep — fetch-based async paths</name>
  <files>
    src/components/performance/PDFOverlay.tsx,
    src/components/music/PDFViewer.tsx,
    src/components/library/UploadDialog.tsx,
    src/components/admin/library/LibrarySyncCard.tsx,
    src/components/admin/SoundSystemSection.tsx,
    src/components/setlist/v2/TrackSheet.tsx,
    src/components/nav/MobileTabBar.tsx
  </files>
  <action>
    For each file, locate the flagged useEffect (see R2B.md for finding IDs mapped to each file) and install an AbortController-based cleanup:

    Pattern:
    ```ts
    useEffect(() => {
        const controller = new AbortController()
        ;(async () => {
            try {
                const res = await fetch(url, { signal: controller.signal })
                if (controller.signal.aborted) return
                const data = await res.json()
                if (controller.signal.aborted) return
                setState(data)
            } catch (e) {
                if ((e as Error).name === 'AbortError') return
                // normal error handling
            }
        })()
        return () => controller.abort()
    }, [deps])
    ```

    Specific per-file notes:
    - **PDFOverlay.tsx (UX-005):** File-URL resolution path at the useEffect that resolves `URL.createObjectURL` from IDB. Already has a `cancelled` flag — verify completeness and add AbortController to any fetch calls within.
    - **PDFViewer.tsx (UX-006):** fetch() call has timeout via setTimeout but no abort. Replace with AbortController + setTimeout that calls controller.abort().
    - **UploadDialog.tsx (UX-008, UX-009):** The `setTimeout` at L119 needs clearTimeout in cleanup; the upload fetch needs a controller. Also check whether the dialog's own unmount cancels in-flight uploads.
    - **LibrarySyncCard.tsx (UX-010):** Single fetch with no abort. Install controller, bail early on .aborted.
    - **SoundSystemSection.tsx (UX-024):** The scan fetch already has AbortSignal.timeout(8000); verify it also aborts on unmount via a second controller or use AbortSignal.any().
    - **TrackSheet.tsx (UX-013):** Native-key fetch on slot selection — needs abort when component unmounts or slot changes.
    - **MobileTabBar.tsx (UX-021):** Search lookup fires on keystroke; needs abort on navigation/unmount.

    Avoid:
    - Replacing working patterns with "cleaner" versions when they already correctly abort.
    - Catching ALL errors silently — preserve existing error reporting for non-abort errors.
    - Introducing AbortController.abort() without removing the legacy `cancelled` flag (pick one).
  </action>
  <verify>
    - `npx tsc --noEmit` — clean.
    - `grep -n "AbortController\|controller.abort\|signal:" <each file>` — at least one match per touched file.
    - `npx vitest run` — full suite green (no regression in existing behavior).
    - `grep -rn "Can't perform a React state update on an unmounted component" ./` — zero matches in test output.
  </verify>
  <done>AC-1 satisfied for the 7 fetch-based sites.</done>
</task>

<task type="auto">
  <name>Task 2: setTimeout / setInterval cleanup + ChatPanel SSE abort</name>
  <files>src/components/setlist/ChatPanel.tsx, src/components/monitor/VerticalFaderStrip.tsx, src/components/performance/TempoFlash.tsx</files>
  <action>
    **ChatPanel.tsx (UX-020):** the SSE streaming path. Depending on whether it uses EventSource or fetch with ReadableStream reader:
    - If EventSource: store in ref; in cleanup, call `.close()`.
    - If ReadableStream: install AbortController; on unmount call `.abort()` so the reader rejects.
    Also guard setState after await points with a cancelled flag since React streaming setStates per chunk.

    **VerticalFaderStrip.tsx (UX-019):** pending-state `setTimeout` at L52 — add clearTimeout in cleanup (the return path of that useEffect). The rAF cleanup is already present at L69/L116.

    **TempoFlash.tsx (UX-003, UX-022):** the inner `setTimeout(() => setIsBeat(false), 100)` at L36 has no clear; wrap in a ref and clearTimeout in cleanup. The outer `setTimeout(onDismiss, 10000)` already uses a ref — verify it's cleared.

    Avoid:
    - Breaking the 9.7s fade animation in TempoFlash.
    - Changing the SSE message shape or ChatPanel UX.
    - Skipping VerticalFaderStrip's existing rAF cleanup (that works).
  </action>
  <verify>
    - `grep -n "clearTimeout\|clearInterval" <each file>` — new clears present in cleanup.
    - `npx tsc --noEmit` clean.
    - `npx vitest run` suite green.
  </verify>
  <done>AC-1 (timer half) + AC-4 satisfied.</done>
</task>

<task type="auto">
  <name>Task 3: Stale-closure fixes via refs</name>
  <files>src/components/performance/TempoFlash.tsx, src/components/performance/PDFOverlay.tsx, src/components/performance/SwapPicker.tsx</files>
  <action>
    **TempoFlash.tsx (UX-003):** `onDismiss` passed via props is captured at mount in the 10-s setTimeout. If the parent swaps `onDismiss` (prop change), the timeout fires the old one. Fix:
    ```ts
    const onDismissRef = useRef(onDismiss)
    useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])
    // then in the timeout:
    setTimeout(() => onDismissRef.current(), 10000)
    ```

    **PDFOverlay.tsx (UX-023):** Escape handler registered via addEventListener captures the current `onClose` prop. Same fix — ref.

    **SwapPicker.tsx (UX-014):** Escape handler possibly broken; confirm whether it's an effect with missing deps or a stale closure. Apply the ref fix if it's the latter.

    Avoid:
    - Changing the debounce/focus behavior.
    - Adding `onDismiss` to the effect deps — re-registering the timeout on every prop change would reset the 10-s countdown.
  </action>
  <verify>
    - `grep -n "onDismissRef\|onCloseRef" <each file>` — ref declared and assigned in useEffect.
    - Tests in async-safety.test.tsx cover prop-swap scenario.
    - `npx tsc --noEmit` clean.
  </verify>
  <done>AC-2 satisfied.</done>
</task>

<task type="auto">
  <name>Task 4: PDFViewer retry cap (UX-007)</name>
  <files>src/components/music/PDFViewer.tsx</files>
  <action>
    Locate the retry-on-failure logic. Introduce a counter (e.g., `retryAttemptsRef.current`) initialized to 0; increment on each retry; at 3 attempts show a terminal error state ("Could not load chart — please try again later") and stop retrying.

    If retries are currently exponential-backoff or fixed-delay, preserve the cadence for the first 3 attempts.

    Avoid:
    - Changing the initial fetch path.
    - Resetting the counter on URL change if the URL is structurally the same (prevents infinite thrash on a truly broken chart).
  </action>
  <verify>
    - Test case in async-safety.test.tsx asserts 3-attempt cap.
    - `npx tsc --noEmit` clean.
  </verify>
  <done>AC-3 satisfied.</done>
</task>

<task type="auto">
  <name>Task 5: Regression test suite for critical async-safety invariants</name>
  <files>src/components/performance/__tests__/async-safety.test.tsx</files>
  <action>
    New React Testing Library suite. Follow existing component-test patterns in the codebase (grep for examples: `src/components/performance/__tests__/public-view.test.tsx`, `src/components/setlist/__tests__/print-modal.test.tsx`).

    Required cases:

    1. **PDFOverlay_aborts_URL_resolution_on_unmount** (AC-1 critical path): mount PDFOverlay with a blob URL that resolves asynchronously; unmount before resolve; assert no console.error for "setState on unmounted" (use vi.spyOn(console, 'error')).

    2. **UploadDialog_aborts_upload_on_unmount** (AC-1 critical path): mock fetch to return a slow response; mount; trigger upload; unmount; assert AbortController.abort was called.

    3. **ChatPanel_closes_SSE_on_unmount** (AC-1 + AC-4): mock EventSource; mount ChatPanel; unmount; assert .close() was called on the mock.

    4. **TempoFlash_uses_latest_onDismiss** (AC-2): mount with onDismissA; rerender with onDismissB; advance timers 10s; assert onDismissB called, not onDismissA. Use vi.useFakeTimers.

    5. **PDFViewer_caps_retries_at_3** (AC-3): mock fetch to always fail; mount PDFViewer; advance through all retries; assert fetch called exactly 3 times (or 4: initial + 3 retries — match whatever the design is); then terminal-error UI appears.

    Use testing-library/react, vi.useFakeTimers where timers matter, and vi.spyOn for event-source / console mocks.

    If a component is too coupled to global state / providers for direct testing, wrap it in a minimal test harness (existing tests show the pattern).
  </action>
  <verify>
    - `npx vitest run src/components/performance/__tests__/async-safety.test.tsx` — 5 cases pass.
    - Full suite 1297/1297 green (+5 net).
    - `npx tsc --noEmit` clean.
    - `npm run lint` clean.
    - `npm run build` clean.
  </verify>
  <done>AC-5, AC-6 satisfied.</done>
</task>

</tasks>

<boundaries>

## DO NOT CHANGE
- Server-side code — this is a client-only phase.
- Firestore rules, indexes, scheduling routes.
- UI visual design / layout / copy — correctness only.
- The debounce timings in TrackSheet (UX-012) and SongChartsLibrary (UX-017) — those are Phase 4/6 polish, not correctness.
- Modal state-reset bugs UX-001/002/011/015/018 — those are Phase 6 EXCEPT where the component is already being touched here (UploadDialog, SwapPicker, TrackSheet) and the fix is <5 lines.

## SCOPE LIMITS
- Not refactoring components for readability / file size (that's Phase 4).
- Not changing SSE protocol or ChatPanel message shape (UX-020 is about abort only, not redesign).
- No new dependencies.
- No new hooks library (keep cleanup patterns inline unless three+ components share the exact same helper — then extract to `src/hooks/use-abortable-fetch.ts` only if it doesn't balloon scope).

</boundaries>

<verification>
Before declaring plan complete:
- [ ] `npx vitest run` — full suite green; net count ≥ 1297 (+5).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npm run build` — clean.
- [ ] `npm run lint` — clean.
- [ ] No React "setState on unmounted component" warnings in any test output.
- [ ] Every file in `files_modified` has a cleanup path grep-verifiable: `return () => { ... controller.abort() ... }` or `clearTimeout` or `.close()`.
- [ ] All 6 acceptance criteria satisfied.
</verification>

<success_criteria>
- 11 async-without-AbortController sites each have a working cleanup path.
- 3 stale-closure sites use refs so callbacks stay fresh.
- PDFViewer retries cap at 3 attempts.
- 5 regression tests lock the critical paths (PDFOverlay/UploadDialog/ChatPanel/TempoFlash/PDFViewer).
- Zero regression in the 1292 existing tests.
- No client-visible UX change — this is pure correctness hygiene.
</success_criteria>

<output>
After completion, create `.paul/phases/v44-03-client-async-safety/v44-03-SUMMARY.md` with:
- Per-file diff summary (brief, since each fix is small and similar in shape).
- List of UX-NN findings closed.
- Test count before/after.
- Any components that turned out to already be safe on inspection.
- Commit hashes pushed to origin/master.
</output>
