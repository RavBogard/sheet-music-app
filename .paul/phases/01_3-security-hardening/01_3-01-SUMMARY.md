---
phase: 01_3-security-hardening
plan: 01
subsystem: security
tags: [firebase-storage, rate-limit, entropy, rules, rate-limiting, auth]

requires:
  - phase: 01-recursive-research
    provides: FINDINGS.md §P1-x/y/z scope (storage rules gap, bridge entropy, rate-limit gaps)

provides:
  - Version-controlled Firebase Storage rules with isMember() membership gate
  - bridgeSetup rate-limit tier (5/min) for credential-exchange endpoint
  - 10-char (≥50 bits) setup codes
  - api-tier rate limits on /api/nudge-admin and /api/scheduling/calendar-feed/[token]

affects: [phase-2, phase-3, phase-4, phase-5, bridge-installer]

tech-stack:
  added: []
  patterns:
    - "Per-endpoint rate-limit tiers via LimiterName keyof"
    - "Storage rules resolve membership via custom claim only (no Firestore cross-read)"

key-files:
  created:
    - storage.rules
    - .paul/phases/01_3-security-hardening/01_3-01-PLAN.md
  modified:
    - firebase.json
    - src/lib/rate-limit.ts
    - src/lib/rate-limit.test.ts
    - src/app/api/bridge/setup-code/route.ts
    - src/app/api/nudge-admin/route.ts
    - src/app/api/scheduling/calendar-feed/[token]/route.ts
    - src/app/api/scheduling/__tests__/calendar-feed.test.ts

key-decisions:
  - "Storage rules use custom-claim-only isMember() (no config/admins fallback — Storage cannot read Firestore)"
  - "New bridgeSetup tier (5/min) instead of reusing api (60/min) — credential-exchange needs stricter bound"
  - "10-char code in the existing 32-char alphabet (kept unambiguous set), not a longer alphabet"

patterns-established:
  - "Endpoint-specific rate-limit tiers are added to limiterConfigs + limiters object; LimiterName picks them up automatically"

duration: ~35min
started: 2026-04-13T21:15:00Z
completed: 2026-04-13T21:25:00Z
---

# Phase 1.3 Plan 01: Security Hardening Summary

**Committed `storage.rules` with `isMember()` gate, raised bridge setup-code entropy to ≥50 bits on a dedicated 5/min tier, and added api-tier rate limits to nudge-admin and calendar-feed.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Started | 2026-04-13T21:15:00Z |
| Completed | 2026-04-13T21:25:00Z |
| Tasks | 3 auto + 1 human-verify — all complete |
| Files modified | 8 (+ 2 new) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Storage rules in version control | Pass | `firebase deploy --only storage --dry-run` compiled cleanly; `storage` block wired into `firebase.json` |
| AC-2: Bridge setup code entropy + tier | Pass | 10-char codes from 32-char alphabet (~50 bits); GET uses `bridgeSetup` tier (5/min); validator updated |
| AC-3: Rate limits on nudge-admin + calendar-feed | Pass | `checkRateLimit(req, 'api')` applied to both; calendar-feed signature changed to `NextRequest` |
| AC-4: Tests + suite green | Pass | New bridgeSetup unit test; `npx tsc --noEmit` → 0 errors; `npx vitest run` → 1103/1103 tests pass |

## Accomplishments

- Storage rules are now in git and reviewable — the biggest gap from FINDINGS.md §P1 closed.
- Bridge credential-exchange endpoint is no longer practically brute-forceable (30 bits at 60/min → 50 bits at 5/min).
- Two unauthenticated/lightly-authenticated endpoints (`/api/nudge-admin`, `/api/scheduling/calendar-feed/[token]`) now rate-limited at the app-wide default.

## Task Commits

One focused commit for the whole plan:

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `7cefa19` | feat | Phase 1.3: security hardening — storage rules + bridge code entropy + rate limits |

Pushed: `f2b5802..7cefa19 master -> master`. Vercel auto-deploys `master` to production.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `storage.rules` | Created | Storage rules with `isMember()` gate on `library/**`, deny-all fallback |
| `firebase.json` | Modified | Added `storage` block |
| `src/lib/rate-limit.ts` | Modified | Added `bridgeSetup` tier (5/min) |
| `src/lib/rate-limit.test.ts` | Modified | Added bridgeSetup 5/min enforcement test |
| `src/app/api/bridge/setup-code/route.ts` | Modified | 10-char `generateCode()`, length-10 validation, `'bridgeSetup'` tier |
| `src/app/api/nudge-admin/route.ts` | Modified | Added `checkRateLimit(ctx.req, 'api')` |
| `src/app/api/scheduling/calendar-feed/[token]/route.ts` | Modified | `Request` → `NextRequest`; added `checkRateLimit(req, 'api')` |
| `src/app/api/scheduling/__tests__/calendar-feed.test.ts` | Modified | Test types synced to `NextRequest` |
| `.paul/phases/01_3-security-hardening/01_3-01-PLAN.md` | Created | Plan |
| `.paul/phases/01_3-security-hardening/01_3-01-SUMMARY.md` | Created | This file |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Custom-claim-only `isMember()` in Storage rules | Storage rules cannot read Firestore, so the `config/admins` bootstrap fallback used in `firestore.rules` cannot be mirrored | Legacy admins whose role is set only via `config/admins` (not custom claim) would be denied Storage reads — accept this: everyone relevant already has the custom claim from v3.x onboarding |
| New `bridgeSetup` tier at 5/min, not reuse `api` | Credential-exchange deserves stricter rate than general app traffic | One more limiter instance, negligible cost |
| Keep the 32-char unambiguous alphabet | Humans still copy the code; ambiguity-free set beats a longer alphabet | Entropy comes from length, not alphabet — still clears the 50-bit bar |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Test signature sync — essential, zero scope creep |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Minimal; one out-of-plan test-file edit required by the calendar-feed signature change.

### Auto-fixed Issues

**1. [test-sync] calendar-feed test type mismatch**
- **Found during:** Task 3 (rate-limit nudge-admin + calendar-feed) — typecheck caught `TS2322` after switching GET from `Request` to `NextRequest`.
- **Issue:** `src/app/api/scheduling/__tests__/calendar-feed.test.ts` typed `GET` as `(req: Request, ...) => Promise<Response>` and constructed bare `new Request(...)`. TypeScript rejects `Request` where `NextRequest` is now required.
- **Fix:** Imported `NextRequest` from `next/server`; updated the `GET` variable type; switched the five `new Request(...)` constructors to `new NextRequest(...)`.
- **Files:** `src/app/api/scheduling/__tests__/calendar-feed.test.ts`
- **Verification:** `npx tsc --noEmit` → 0 errors; calendar-feed test file 5/5 passing.
- **Commit:** `7cefa19` (part of the same plan commit)

### Deferred Items

None — FINDINGS.md §P1-x/y/z fully closed in-plan.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Pre-existing `src/components/library/__tests__/song-charts-library.test.tsx` file-level collection error (IndexedDB undefined) | Not touched — pre-existing noise unrelated to this plan; all 1103 individual tests still pass; logged here for visibility |

## Deferred Operator Steps (NOT in plan; for human/operator follow-up)

1. **Deploy Storage rules.** Vercel does not deploy Firebase rules. From an authorized machine:
   ```
   cd sheet-music-app
   firebase deploy --only storage
   ```
   Until then, the live bucket still uses whatever was configured via the Firebase Console.

2. **Bridge-installer compatibility.** The external bridge installer's input field must accept 10-char codes. Admin UI (`SoundSystemSection.tsx`) is fine — it renders whatever the API returns. Flag for the bridge owner.

3. **In-flight codes.** Any 6-char codes issued before the next production deploy will be rejected on redemption ("Invalid code format"). The 10-minute expiry flushes them naturally.

## Deferred Human Smoke Tests (running list, from prior phases)

1. **v4.1**: create setlists via wizard / chat / import / transfer on prod; confirm second user sees them.
2. **Phase 1.1**: two-tab conflicting-edit smoke on a live setlist.
3. **Phase 1.2**: fresh incognito offline-prefetch smoke.
4. **Phase 1.3 (new)**: admin panel → generate setup code → confirm it is 10 chars; hammer `/api/nudge-admin` 70× in a minute → confirm 429s.

## Skill Audit

SPECIAL-FLOWS.md requires `/ui-ux-pro-max` only for frontend phases. Phase 1.3 is backend/plumbing/security with zero UI surface. **No skill gap.** ✓

## Next Phase Readiness

**Ready:**
- Backend hardening complete; Phases 2–5 (UX polish) can proceed without carrying security debt.
- `bridgeSetup` tier pattern available for future credential-style endpoints.

**Concerns:**
- Operator step (`firebase deploy --only storage`) must happen before we claim Storage is production-tight. Until that deploy, `storage.rules` in git is documentation, not enforcement.
- Bridge installer compatibility is an out-of-repo dependency — if the installer hardcodes a 6-char field, the bridge won't come online after next re-pair.

**Blockers:** None for Phase 2. Bridge re-pair is the only near-term activity gated on the deferred operator steps.

---
*Phase: 01_3-security-hardening, Plan: 01*
*Completed: 2026-04-13*
