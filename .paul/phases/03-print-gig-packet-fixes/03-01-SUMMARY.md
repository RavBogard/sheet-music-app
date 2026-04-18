---
phase: 03-print-gig-packet-fixes
plan: 01
subsystem: ui, api-client
tags: [print, pdf, auth, firebase]

requires:
  - phase: none
    provides: existing print infrastructure
provides:
  - Iframe-based printing (no black screen)
  - eventDate-aware print date
  - Resilient auth token handling in apiFetch
affects: []

tech-stack:
  added: []
  patterns: [iframe print pattern, token retry pattern]

key-files:
  created: []
  modified:
    - src/components/setlist/PrintModal.tsx
    - src/components/setlist/v2/SetlistEditorV2.tsx
    - src/lib/api-client.ts

key-decisions:
  - "Iframe over window.open for PDF printing — avoids black screen in modern browsers"
  - "apiFetch throws on token failure instead of silent fallback — surfaces auth issues early"

patterns-established:
  - "Token retry: getIdToken() → getIdToken(true) → throw"

duration: ~10min
completed: 2026-03-10
---

# Phase 3 Plan 01: Print Gig Packet Fixes Summary

**Fixed three print bugs: black screen (iframe), wrong date (eventDate), 401 auth (token retry).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~10min |
| Completed | 2026-03-10 |
| Tasks | 3 completed |
| Files modified | 3 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: No Black Screen | Pass | Iframe-based printing with fallback to download |
| AC-2: Date Defaults to eventDate | Pass | Passed via SetlistEditorV2, falls back to today |
| AC-3: Auth Token Retry | Pass | apiFetch retries with force refresh, throws on failure |

## Accomplishments

- Print uses hidden iframe instead of window.open — no more black screen
- Date field pre-fills with setlist eventDate when available
- apiFetch retries expired tokens before throwing clear error

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Task 1-3: Print fixes | `ce59e6b` | fix | Black screen, wrong date, 401 auth |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/components/setlist/PrintModal.tsx` | Modified | Iframe print, eventDate prop, date init |
| `src/components/setlist/v2/SetlistEditorV2.tsx` | Modified | Pass eventDate to PrintModal |
| `src/lib/api-client.ts` | Modified | Token retry with force refresh |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Iframe over window.open | Modern browsers block/blank blob URLs in new windows | Reliable cross-browser printing |
| Throw on token failure | Silent fallback caused mysterious 401s | Users see clear auth error |
| Fallback to download if iframe print fails | Cross-origin restrictions may block contentWindow.print() | Graceful degradation |

## Deviations from Plan

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| eventDate is Date\|null in hook, not string | Used .toISOString() when passing to PrintModal |

## Next Phase Readiness

**Ready:**
- Phase 4 (PDF Health Scanner) can proceed independently

**Concerns:**
- None

**Blockers:**
- None

---
*Phase: 03-print-gig-packet-fixes, Plan: 01*
*Completed: 2026-03-10*
