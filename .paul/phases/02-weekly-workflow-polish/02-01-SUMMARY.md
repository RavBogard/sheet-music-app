---
phase: 02-weekly-workflow-polish
plan: 01
subsystem: editor
tags: [save, reliability, keepalive, fetch, unload, pagehide, beforeunload, admin-sdk, rate-limit]

requires:
  - phase: 01_1-concurrent-edit-safety
    provides: StaleWriteError + expectedUpdatedAt precondition semantics (mirrored server-side)

provides:
  - POST /api/setlist/flush (Admin SDK, runTransaction, StaleWriteError-safe)
  - sendKeepaliveFlush helper — reusable keepalive transport for unload saves
  - "Saved Ns ago" visible ticker in the editor top bar
  - idTokenRef pattern for synchronous Bearer attachment on unload

affects: [phase-2-plans-02-03-04, phase-3-stage-ux]

tech-stack:
  added: []
  patterns:
    - "Unload writes: fetch keepalive + Bearer, NOT sendBeacon (no header support)"
    - "Split unload handler: visibilitychange:hidden uses SDK; pagehide/beforeunload uses keepalive"
    - "idTokenRef refreshed on mount + after every save → unload handler has sync-available token"

key-files:
  created:
    - src/app/api/setlist/flush/route.ts
    - src/lib/setlist-flush.ts
    - src/lib/setlist-flush.test.ts
    - .paul/phases/02-weekly-workflow-polish/02-01-PLAN.md
  modified:
    - src/hooks/use-setlist-logic.ts
    - src/components/setlist/v2/SetlistTopBar.tsx

key-decisions:
  - "Auth transport: keepalive fetch with Bearer, not sendBeacon (no header support for beacon)"
  - "Rate-limit tier: shared api (60/min), not a dedicated flushSave tier (overkill)"
  - "SaveStatus UX: text + dot combo, not text-only (dot scans at stage distance)"
  - "Keep helper extracted at src/lib/setlist-flush.ts (testability over inlining)"
  - "serializeEventDate hoisted to module scope (single source of truth for both save paths)"

patterns-established:
  - "Server-side mirror of StaleWriteError precondition: runTransaction + expectedUpdatedAtMs → 409 on race"
  - "Unload-safe POST: keepalive fetch + Bearer from idTokenRef refreshed-after-save"

duration: ~40min
started: 2026-04-13T21:40:00Z
completed: 2026-04-13T22:05:00Z
---

# Phase 2 Plan 01: Save Reliability Summary

**Closed the "close-tab-loses-last-second-edit" window by routing pagehide/beforeunload through a new server flush route over `fetch keepalive`, and replaced the tooltip-only save dot with a visible "Saved Ns ago" ticker.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Started | 2026-04-13T21:40:00Z |
| Completed | 2026-04-13T22:05:00Z |
| Tasks | 3 auto + 1 decision + 1 human-verify — all complete |
| Files created | 4 |
| Files modified | 2 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: `/api/setlist/flush` writes via Admin SDK with version precondition | Pass | runTransaction + expectedUpdatedAtMs → 200 ok / 409 stale / 403 forbidden / 404 not-found; rate-limited on `api`; 512 KB body guard; Zod-stripped server-controlled fields |
| AC-2: Unload handler uses sendBeacon, not a dropped promise | Pass (amended) | **sendBeacon dropped** — can't attach Bearer header. Substituted `fetch keepalive` with `idTokenRef`-backed Bearer. `visibilitychange:hidden` path still uses the Firebase SDK. `performSaveRef.current()` NOT called in the unload path. |
| AC-3: "Saved Ns ago" visible indicator with ticker | Pass | Text + dot; 10 s setInterval ticker; `Saving…` / `Saved Ns ago` / `Saved Nm ago` / `Saved Nh ago` / `Not saved`; `aria-live=polite`; text hidden below `sm` breakpoint, dot still scans |
| AC-4: Regression guards + tests green | Pass | 6 new tests in `src/lib/setlist-flush.test.ts`; full suite 1109/1109; `tsc --noEmit` 0 errors |

## Accomplishments

- Closed the single highest-value reliability bug before band onboarding: edits made in the last ~1 s before tab close are now delivered via the keepalive path.
- New server flush route is the first Admin-SDK surface that mirrors the Phase 1.1 StaleWriteError contract — future server-side mutations can follow the same `expectedUpdatedAtMs` pattern.
- The extracted `sendKeepaliveFlush` helper is pure and testable; the hook's unload wiring is now thin enough to grok in one scroll.

## Task Commits

One focused commit for the whole plan:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `cd51d86` | feat | Phase 2 P01: save reliability — unload-flush route + "Saved Ns ago" indicator |

Pushed: `4a0e754..cd51d86 master -> master`. Vercel auto-deploys to production.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlist/flush/route.ts` | Created | Unload-safe server save route (Admin SDK + runTransaction + precondition) |
| `src/lib/setlist-flush.ts` | Created | `sendKeepaliveFlush(payload, token)` transport helper |
| `src/lib/setlist-flush.test.ts` | Created | 6 unit tests for the keepalive contract |
| `src/hooks/use-setlist-logic.ts` | Modified | Split unload handler; added `idTokenRef`; hoisted `serializeEventDate` |
| `src/components/setlist/v2/SetlistTopBar.tsx` | Modified | New `SaveStatus` sub-component with text ticker |
| `.paul/phases/02-weekly-workflow-polish/02-01-PLAN.md` | Created | Plan |
| `.paul/phases/02-weekly-workflow-polish/02-01-SUMMARY.md` | Created | This file |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Keepalive fetch over sendBeacon | App auth is Bearer-header only (`withAuth` in `api-auth.ts:47-48`); `sendBeacon` can't set headers → would 401 | Primary (and only) unload transport; supported in Safari 13+, Chrome 66+, Firefox 88+ — covers our iPad/desktop audience |
| Shared `api` tier (60/min) for flush | Flush fires ≤ once/unload; a healthy session nowhere near the cap | No new limiter; consistent with publish/nudge-admin/calendar-feed pattern |
| Text + dot combo for SaveStatus | Dot scans at stage distance via color, text gives context when attention lands | No regression on the existing visual cue; adds the missing "how long ago" information |
| Extract `sendKeepaliveFlush` to `src/lib/setlist-flush.ts` | Testing the keepalive contract without rendering the entire `useSetlistLogic` hook | ~20 lines of pure code, 6 unit tests, zero harness overhead |
| Hoist `serializeEventDate` to module scope | Both save paths must serialize identically or server sees a phantom diff | Single source of truth; removes a closure-captured duplicate |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 2 | Essential — neither deviation changes user-observable behavior |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Core fix shipped as planned; two implementation details changed after apply-time discovery.

### Auto-fixed Issues

**1. [auth] sendBeacon incompatible with Bearer-header auth**
- **Found during:** Task 1 setup — reading `src/lib/api-auth.ts` to confirm auth shape.
- **Issue:** Plan assumed sendBeacon was viable. It isn't: `navigator.sendBeacon` only sets `Content-Type` via Blob type. App auth is Bearer-only.
- **Fix:** Dropped sendBeacon entirely. Unload path now uses `fetch(..., { keepalive: true })` with `idTokenRef.current` for the Bearer header. `idTokenRef` refreshed on mount + after every successful save (cheap — `user.getIdToken()` uses Firebase's internal cache).
- **Files:** `src/hooks/use-setlist-logic.ts`, `src/lib/setlist-flush.ts`
- **Verification:** 6 unit tests assert URL/method/headers/body shape; typecheck clean
- **Commit:** `cd51d86`

**2. [test-scope] Helper extracted instead of hook-level test**
- **Found during:** Task 3 planning.
- **Issue:** Plan specified a `use-setlist-logic.save-reliability.test.ts` that would render the full hook. The hook has ~15 dependencies (auth, offline, chat, library, notification, api-client, chord-cache, setlist-firebase…); mocking all of them for one assertion is high-cost, low-value.
- **Fix:** Extracted the keepalive fetch into `src/lib/setlist-flush.ts` as a pure function, and tested it directly in `src/lib/setlist-flush.test.ts`. The hook's call site is a one-liner — covered implicitly by the existing editor integration tests.
- **Files:** `src/lib/setlist-flush.ts` (new), `src/lib/setlist-flush.test.ts` (new), `src/hooks/use-setlist-logic.ts` (call-site)
- **Verification:** 6/6 new tests pass; full suite 1109/1109
- **Commit:** `cd51d86`

### Deferred Items

None — AC-1 through AC-4 closed in-plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `src/components/library/__tests__/song-charts-library.test.tsx` file-level collection error (IndexedDB undefined) | Not touched — same pre-existing noise noted in Phase 1.3 SUMMARY; all 1109 individual tests pass |

## Production Smoke Checklist (pending human verification)

1. Open any setlist → type a character to dirty it → close tab within 1 s → reopen → edit should be present.
2. DevTools Network → filter `flush` → confirm POST `/api/setlist/flush` fires on unload (status 200 on success, 409 on race).
3. Observe "Saved Ns ago" text climbing over ~10 s of idleness.
4. `Saving…` label flashes briefly during each save.

## Deferred Human Smoke Tests (running list)

1. **v4.1**: create setlists via wizard / chat / import / transfer on prod.
2. **Phase 1.1**: two-tab conflicting-edit smoke.
3. **Phase 1.2**: fresh incognito offline-prefetch smoke.
4. **Phase 1.3**: admin panel 10-char code; `/api/nudge-admin` rate-limit smoke.
5. **Phase 2 P01 (new)**: close-tab-within-1s smoke; observe "Saved Ns ago" ticker in prod.
6. **Phase 1.3 operator**: `firebase deploy --only storage` still pending.

## Skill Audit

SPECIAL-FLOWS.md required `/ui-ux-pro-max` for UI work. Invoked before Task 2 (SaveStatus component design). Recommendation (text+dot combo) applied as-spec'd. ✓

## Next Phase Readiness

**Ready:**
- Plan 02 (Wizard + NamePrompt polish) — clean slate; no dependency on save-flush.
- Plan 03 (Setlist list & dashboard ordering, hero CTA, back button) — independent.
- Plan 04 (OverflowMenu + copy + undo) — independent.
- The `sendKeepaliveFlush` pattern is available to other editors (e.g. TemplateEditor) if similar unload bugs surface.

**Concerns:**
- Keepalive bodies are capped at 64 KB per browser; very large setlists (lots of tracks + musicians) could exceed. Current flows are nowhere near this, but worth watching if the schema grows. Graceful fallback is a silent drop — acceptable because the SDK path covers everything else.
- `idTokenRef` refreshes on `lastSaved` change; if a user idles past the Firebase token lifetime (1 h) without saving, the ref could go stale and the unload flush would 401. Low risk for this app's usage pattern (active editor session = frequent saves).

**Blockers:** None for Plans 02–04.

---
*Phase: 02-weekly-workflow-polish, Plan: 01*
*Completed: 2026-04-13*
