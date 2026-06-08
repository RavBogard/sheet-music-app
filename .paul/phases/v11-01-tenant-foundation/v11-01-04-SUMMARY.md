---
phase: v11-01-tenant-foundation
plan: 04
subsystem: security
tags: [multi-tenant, orgId, firestore-rules, security-rules, isolation, deploy]

requires:
  - phase: v11-01-02
    provides: new writes stamp orgId
  - phase: v11-01-03
    provides: all existing data stamped orgId="crc" + orgs seeded
provides:
  - org-scoped Firestore rules (cross-tenant write isolation + orgs block) deployed to prod
  - callerOrgs/orgCreateOk/orgUpdateOk rule helpers (default-crc, lock-out-safe)
  - blocking emulator rules-test suite for org scope
affects: [v11-02 org claim wiring, v11-03 host routing, v11-05 isolation audit]

tech-stack:
  added: []
  patterns: [write-isolation rules (not write-requirement); rules .get('orgIds',[]) default-crc to avoid claimless lock-out]

key-files:
  created:
    - src/lib/org/__tests__/firestore-rules-orgscope.emulator.test.ts
  modified:
    - firestore.rules

key-decisions:
  - "WRITE-ISOLATION not write-requirement: orgId-absent writes allowed (client paths omit it); cross-tenant writes denied; orgId immutable across tenants"
  - "Reads UNCHANGED (err-public) — cross-tenant read filtering deferred to app query layer (v11-03)"
  - "callerOrgs() uses request.auth.token.get('orgIds', []) — a bare access THROWS for claimless CRC users → lock-out (caught by the emulator gate)"

patterns-established:
  - "Org-scope rule helpers reusable for any future tenant collection"

duration: ~25min
completed: 2026-06-08
---

# Phase v11-01 Plan 04: Org-scoped Firestore rules Summary

**Deployed cross-tenant write-isolation Firestore rules (reads unchanged, err-public) — the emulator gate caught and fixed a CRC lock-out bug before it shipped. Closes phase v11-01.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Completed | 2026-06-08 |
| Tasks | 3 completed (3/3 PASS) |
| Files | 1 modified (firestore.rules), 1 created (rules test) |
| Rules tests | 42 green (8 new orgscope + 34 regression) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: CRC users (no orgIds claim) keep FULL write access — no lock-out | Pass | Initially FAILED (bare token.orgIds throws) → fixed with `.get('orgIds',[])`; now green |
| AC-2: cross-tenant writes denied; orgId immutable across tenants | Pass | BL-claim user denied orgId='crc' create; orgId-flip update denied (non-admin), allowed (admin) |
| AC-3: reads unchanged (err-public) | Pass | Unauth setlists/tracks read OK; member songs/recordings OK; orgs public-read + write-denied |
| AC-4: rules compile + deploy to prod | Pass | `released rules firestore.rules to cloud.firestore`; prod setlists read confirms orgId="crc", no lock-out |

## Verification Results

- `firebase_validate_security_rules` → OK, no errors (twice — pre + post fix)
- `npm run test:emulator` (orgscope + tracks + recordings + monitor) → **42 tests passed** (orgscope = 8)
- `npx tsc --noEmit` → EXIT 0
- `firebase deploy --only firestore:rules --project crcmusiccharts` → compiled + released
- Prod read (firestore_query_collection setlists where orgId==crc) → returns docs with orgId="crc"

## Accomplishments

- Production Firestore now enforces cross-tenant write isolation: a caller can only write docs into a tenant their claim includes (default crc); orgId is immutable across tenants; admins exempt.
- CRC behavior fully preserved — claimless CRC users keep all read+write access; public /perform reads untouched.
- The mandatory emulator rules-test gate proved its worth: it caught a real lock-out bug (a bare `request.auth.token.orgIds` access throws for claimless users) BEFORE deploy.

## Task Commits

Committed as part of the v11-01 PHASE commit (see phase transition below) — not per-task, per the v11.0 auto-commit-per-phase directive.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `firestore.rules` | Modified | callerOrgs/orgCreateOk/orgUpdateOk helpers; org checks on setlists/tracks/songs/recordings CREATE+UPDATE; orgs/{orgId} block; reads untouched |
| `src/lib/org/__tests__/firestore-rules-orgscope.emulator.test.ts` | Created | Blocking rules-test suite (AC-1 no-lock-out / AC-2 isolation / AC-3 reads) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Write-isolation, not write-requirement | Client write paths (client-tracks/setlist-firebase/sync) omit orgId — hard-require would lock out CRC | Isolation enforced without breaking any current write |
| Reads unchanged (err-public) | /perform public reads + musician access must not break | Cross-tenant read filtering deferred to app query layer (v11-03) |
| `.get('orgIds',[])` in callerOrgs | Bare `token.orgIds` throws for claimless users → deny → lock-out | Claimless CRC users default to crc; no lock-out |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Critical — prevented a CRC lock-out |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** One critical auto-fix, exactly where the quality floor's blocking gate is designed to catch it.

### Auto-fixed Issues

**1. [Code/Rules] callerOrgs() threw for claimless users → CRC lock-out**
- **Found during:** Task 2 (emulator rules tests) — 3 AC-1 scenarios failed with "Property orgIds is undefined on object."
- **Issue:** `request.auth.token.orgIds is list` accesses a property that doesn't exist on the token for claimless CRC users, which THROWS (→ deny). Every CRC write would have been denied — a full lock-out — had this deployed.
- **Fix:** `request.auth.token.get('orgIds', [])` returns a default instead of throwing.
- **Verification:** re-validated (OK) + re-ran emulator (42 green) before deploy.
- **Commit:** part of the v11-01 phase commit.

### Deferred Items

None.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Rules lock-out bug (claimless token access throws) | Caught by the blocking emulator gate; fixed with `.get()`; re-tested before deploy |

## Skill Audit

`/ui-ux-pro-max` required only for frontend phases — v11-01-04 is security-rules/tests, no UI. No required skill triggered. ✓

## Next Phase Readiness

**Ready:**
- Phase v11-01 (tenant foundation) is COMPLETE: orgId types/registry (01), write-path stamping (02), data backfill + org seeding (03), enforced rules (04).
- Foundation laid for v11-02 (wire MCP/auth callers to pass the bearer's org + grant David's brotherslazaroff claim) and v11-03 (host→orgId routing + tenant-filtered queries).

**Concerns:**
- Cross-tenant READ isolation on the public surfaces is NOT yet enforced (by design — app query layer, v11-03). Until then, all setlists/tracks remain publicly readable regardless of tenant.
- The v11-05 isolation audit (mandatory) must validate end-to-end tenant separation once v11-02/03 land.

**Blockers:**
- None.

---
*Phase: v11-01-tenant-foundation, Plan: 04*
*Completed: 2026-06-08*
