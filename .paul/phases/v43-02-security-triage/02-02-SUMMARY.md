---
phase: v43-02-security-triage
plan: 02
subsystem: security
tags: [drive-file, sec-fetch, auth-heuristic, api]

requires:
  - phase: v43-01-recursive-research
    provides: S03 finding (drive file proxy browser-header bypass)
provides:
  - hasBrowserFetchMetadata helper (narrowed heuristic)
  - diagnostic 401 logging with userAgent + ip
  - regression tests for forged-header rejection
affects: [future v4.3 session-cookie migration (S03 follow-up)]

tech-stack:
  added: []
  patterns:
    - "Helper-in-lib pattern: any route.ts export beyond HTTP handlers goes to src/lib/*"

key-files:
  created:
    - src/lib/drive-file-auth.ts
    - src/lib/__tests__/drive-file-auth.test.ts
  modified:
    - src/app/api/drive/file/[fileId]/route.ts

key-decisions:
  - "Narrow heuristic instead of replacing with session cookie — session-cookie migration is a larger plan (touches login flow + middleware); this ships immediate risk reduction"
  - "Kept Sec-Fetch-Dest !== empty branch (not just same-origin Site) so browser image/embed/audio fetches still pass even when Site is 'none' or absent"
  - "Helper signature: HeaderReader interface { headers: { get(name): string | null } } — lets tests fake a request without constructing full NextRequest"

patterns-established:
  - "Defense-in-depth comments at code site should explicitly say 'NOT a cryptographic boundary' when they aren't — prevents future mis-reliance"

duration: ~20min
started: 2026-04-14T12:15:00Z
completed: 2026-04-14T12:25:00Z
---

# v4.3 P2 Plan 02: Drive File Proxy Heuristic Narrowing Summary

**Closed audit finding S03: `/api/drive/file/[fileId]` no longer admits requests based on forgeable Referer or Accept headers. Helper renamed to `hasBrowserFetchMetadata` and documented as defense-in-depth only (real fix is a session cookie, tracked as follow-up).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~20 min |
| Tasks | 2 of 2 completed |
| Files modified | 1 route |
| Files created | 2 (helper module + test) |
| Commits | 2 atomic + push to origin/master |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Narrowed heuristic | Pass | Only `Sec-Fetch-Site: same-origin\|same-site` OR `Sec-Fetch-Dest != empty` admit |
| AC-2: Legitimate browser requests pass | Pass | Regression tests verify same-origin + image/document Dest |
| AC-3: Bearer alone sufficient | Pass | Unchanged path via `createApiHandler` auth |
| AC-4: Diagnostic 401 logging | Pass | Adds userAgent + ip; preserves secFetchSite/Dest/referer |
| AC-5: Non-boundary comment | Pass | JSDoc in `src/lib/drive-file-auth.ts` explicitly says "NOT a cryptographic auth boundary" + follow-up note |
| AC-6: Quality gates | Pass | tsc clean; full `next build` green; 1174/1174 tests (12 new + known env-vars failure untouched) |

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| T1: Narrow heuristic + diagnostic log + helper extract | `9386aa4` | feat | hasBrowserFetchMetadata replaces isTrustedBrowserRequest |
| T2: Regression tests | `d3a3fd3` | test | 12 tests; REGRESSION cases for Referer/Accept forging |

Plus carry-over hotfix from P2-01: `1c94568` — moved SYSTEM_PROMPT + sanitizeUserMessage to `@/lib/chat-prompt` after Vercel build caught the route.ts export rule.

Pushed to `origin/master`; Vercel auto-deploying.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/drive-file-auth.ts` | Created | `hasBrowserFetchMetadata` + `HeaderReader` interface |
| `src/lib/__tests__/drive-file-auth.test.ts` | Created | 12 regression tests |
| `src/app/api/drive/file/[fileId]/route.ts` | Modified | Import + call renamed helper; expand 401 log payload |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Narrow-not-replace | Session-cookie migration touches login flow + middleware; ship immediate risk reduction today, do the proper fix as its own plan | S03 formally closed at the "narrowed" level; follow-up tracked |
| Keep Sec-Fetch-Dest !== empty branch | Some fetches set Dest but not Site (cross-origin embeds, old Safari on certain contexts) — removing it would break chart images on some devices | Heuristic still admits `<img>`, `<audio>`, `<embed>` fetches |
| Proactively move helper to src/lib/ | Applied the lesson from P2-01 Vercel build failure: Next.js route files may only export HTTP handlers | Avoided a second hotfix cycle |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Helper-extract to `src/lib/drive-file-auth.ts` (not in plan but necessary for testability + route-export rule) |
| Deferred | 0 | — |

**Total impact:** Zero AC deviation. The helper extraction was dictated by the P2-01 learning (Next.js route export rule); adding it proactively avoided a Vercel-side failure that would have been repeat-of-last-commit.

## Skill Audit

Plan declared `/ui-ux-pro-max` not required (backend-only). Confirmed: no frontend changes. Not invoked — no gap.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| tsc error on `Pick<NextRequest, 'headers'>` signature because test fakes didn't provide full Headers object | Introduced minimal `HeaderReader` interface with only `headers.get(name)` |

## Next Phase Readiness

**Ready:**
- Two P0 security items (S01, S03) closed with tests
- Observability baseline: prod 401 logs now carry userAgent + ip for any blocked client

**Concerns:**
- `hasBrowserFetchMetadata` is still not a real security boundary — server-side `curl --header "Sec-Fetch-Site: same-origin"` will still pass. Follow-up plan needed: Firebase Auth session cookies
- Mobile Safari (pre-iOS 16.4) does not send Sec-Fetch-*; those requests will now 401. If any band-member device runs an old iOS, watch the 401 logs after deploy

**Blockers:** None

**Next plan (recommended):**
Phase 2 has one remaining P0: **S02 bridge credential exposure** (CRIT-003). That requires a design decision between (a) return minted short-lived scoped creds, (b) migrate bridge to user-auth + API endpoint, (c) keep current + add audit log + rotation-on-use. This is a `checkpoint:decision` plan — write it next.

Alternative: drop to Phase 4 (P0 Data Integrity — D01 orphan cascade, D02 .passthrough, D03 assign race) which is all autonomous and also onboarding-blocking.

---
*Phase: v43-02-security-triage, Plan: 02*
*Completed: 2026-04-14*
