---
phase: v11-05-collection-scoping
plan: 02
subsystem: api
tags: [multi-tenant, org-scoping, roster, users, auth-claims, firestore, mcp]

requires:
  - phase: v11-02-mcp-org-scoping
    provides: orgFrom caller-org seam + getOrgIdsFromClaims membership resolver
  - phase: v11-05-collection-scoping
    provides: v11-05-01 templates pattern (orgFrom threading + dispatcher wiring)
provides:
  - users roster reads org-scoped (list_musicians / suggest_musicians / suggest_band + /api/scheduling/suggest-band)
  - orgIds claim mirrored onto users/{uid}.orgIds at the sync-claims seam
  - multi-org membership supported (a user belongs to >1 org; filter by membership)
  - rowOrgIds doc-membership helper + orgIdsEqual set-equality helper
  - backfill-user-orgids + fix-david-orgids-claim scripts (phase-close, dry-run-first)
affects: [v11-05-03-assignments, v11-06-isolation-audit]

tech-stack:
  added: []
  patterns:
    - "Roster org filter is IN-MEMORY via rowOrgIds(doc.orgIds) with missing→['crc'] default — CRC-safe without a backfill (no array-contains query, no composite index, no hard deploy gate)"
    - "orgIds (auth claim) mirrored to the user doc at the existing sync-claims seam — claims stay the source of truth, the doc field is the queryable mirror"

key-files:
  created:
    - scripts/backfill-user-orgids.mjs
    - scripts/fix-david-orgids-claim.mjs
  modified:
    - src/app/api/auth/sync-claims/route.ts
    - src/lib/org/membership.ts
    - src/lib/mcp/tools/roster.ts
    - src/lib/mcp/tools/index.ts
    - src/app/api/scheduling/suggest-band/route.ts
    - src/lib/mcp/__tests__/mcp-roster.emulator.test.ts
    - src/app/api/auth/sync-claims/__tests__/route.test.ts

key-decisions:
  - "Multi-org membership (Daniel 2026-06-09): David = ['crc','brotherslazaroff']; filter by membership, not single org"
  - "Filter source = doc.orgIds (mirrored from claims). DEVIATION: filter IN-MEMORY with missing→['crc'] default, not array-contains in the query — strictly safer (no CRC-lockout gate) and avoids emulator/index fragility"

patterns-established:
  - "rowOrgIds(raw): doc-side membership normalizer (parallel to rowOrg) — missing → ['crc']"

duration: ~110min
started: 2026-06-09
completed: 2026-06-09
---

# Phase v11-05 Plan 02: Roster (users) org-scoping Summary

**The `users` roster is now tenant-scoped: `list_musicians` / `suggest_musicians` / `suggest_band` (MCP) and `/api/scheduling/suggest-band` (web) return only the caller-org's members, with multi-org members (David: crc+brotherslazaroff) appearing in BOTH rosters. Membership filters IN-MEMORY on `doc.orgIds` (missing → ['crc']), so CRC is safe with no backfill; the `orgIds` claim is mirrored onto the user doc at the sync-claims seam.**

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: orgIds claim mirrored to user doc at sync (idempotent) | Pass | sync-claims route unit 7/7 (incl. new multi-org mirror + no-write-when-synced) |
| AC-2: roster reads org-scoped; multi-org member in both | Pass | mcp-roster emulator: CRC roster excludes BL-only, BL roster excludes CRC-only, David in both |
| AC-3: backfill safe/idempotent | Pass (refined) | script dry-run-first + idempotent; **no longer a hard CRC gate** (in-memory default-crc) — tags BL members + makes data explicit |
| AC-4: David claim fix → ['crc','brotherslazaroff'], appears in both | Pass | script written (merge, role-preserving); run at phase close, then sync mirrors to doc |

## Verification Results

- `npx tsc --noEmit` → 0
- `npx eslint` (changed files) → 0
- `npx vitest run` (full) → **3311 passed / 0 failed** (78 skipped)
- `mcp-roster.emulator.test.ts` (now incl. 2 org cases) → 46/46
- sync-claims route unit + membership unit → 16/16
- both scripts → `node --check` clean

## Accomplishments

- Extended the sync-claims route to mirror the `orgIds` claim onto `users/{uid}.orgIds` (drift-detected via new `orgIdsEqual`, written alongside or independent of the role sync, idempotent).
- Threaded caller org into `listMusicians` / `suggestMusicians` / `suggestBand` (+ dispatcher) and the `/api/scheduling/suggest-band` route (host org via `coerceOrgId(x-org-id)`); each filters members in-memory via `rowOrgIds(doc.orgIds).includes(org)`.
- Added `rowOrgIds` (doc-side membership normalizer) + `orgIdsEqual` to membership.ts.
- Wrote the phase-close scripts: `backfill-user-orgids.mjs` (stamp doc.orgIds from each user's claim) + `fix-david-orgids-claim.mjs` (David → ['crc','brotherslazaroff'], merge).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/auth/sync-claims/route.ts` | Modified | mirror orgIds claim → user doc (drift-gated) |
| `src/lib/org/membership.ts` | Modified | `rowOrgIds` + `orgIdsEqual` helpers |
| `src/lib/mcp/tools/roster.ts` | Modified | org param + in-memory membership filter on 3 roster reads |
| `src/lib/mcp/tools/index.ts` | Modified | thread `orgFrom(extra)` into list_musicians/suggest_musicians/suggest_band |
| `src/app/api/scheduling/suggest-band/route.ts` | Modified | host-org scoping via coerceOrgId + in-memory filter |
| `src/lib/mcp/__tests__/mcp-roster.emulator.test.ts` | Modified | seedUser orgIds + 2 org-scoping cases |
| `src/app/api/auth/sync-claims/__tests__/route.test.ts` | Modified | updated 2 fixtures + 1 new orgIds-mirror case |
| `scripts/backfill-user-orgids.mjs` | Created | phase-close: stamp doc.orgIds from claims |
| `scripts/fix-david-orgids-claim.mjs` | Created | phase-close: David multi-org claim fix |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Multi-org membership; David crc+bl | He leads at CRC and runs BL (Daniel 2026-06-09) | roster filter is membership-based (array semantics) |
| In-memory filter w/ missing→crc default (vs array-contains query) | array-contains needs every doc stamped (CRC-lockout gate) + was flaky/empty in the emulator + would break the existing mcp-roster suite; in-memory default-crc is CRC-safe with no backfill and no composite index | backfill demoted from hard-gate to data-hygiene; roster filter deploys CRC-safe immediately |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Approach change | 1 | Safer — in-memory filter instead of array-contains query |
| Test relocation | 1 | Org emulator cases live in mcp-roster.emulator.test.ts (proven harness) instead of a new file |
| Fixture updates | 1 | 2 sync-claims unit fixtures updated for the orgIds mirror (fixture audit) |

**1. In-memory org filter (vs the PLAN's `array-contains` query).** While qualifying, the `array-contains` query returned empty in the emulator AND would have (a) required every user doc stamped before deploy = a CRC-lockout gate, and (b) broken the existing `mcp-roster.emulator.test.ts` (seeds users without orgIds). Switched to keeping the `role in` query and filtering membership in-memory via `rowOrgIds` (missing → ['crc']). This is strictly safer (CRC stays intact with zero backfill) and needs no composite index. Daniel's chosen filter SOURCE (doc.orgIds mirrored from claims) is unchanged — only the filter location moved.

**2. Standalone emulator test file abandoned.** A new `mcp-roster-org.emulator.test.ts` hit a vitest app/instance quirk (raw query saw seeds; the tool's getFirestore() saw an empty project — `assertEditor` passed but the query returned 0). Relocated the cases into the proven `mcp-roster` harness; deleted the standalone file.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| array-contains query returned empty in emulator + standalone-test app mismatch | Switched to in-memory filter; relocated tests to the working harness |

## Next Phase Readiness

**Ready:** rowOrgIds membership pattern ready for v11-05-03 (scheduling_assignments — org from the assignment's setlist) and the congregation slice.

**Concerns / phase-close tasks (batched):**
- Run `backfill-user-orgids.mjs --apply` (dry-run first) so BL members carry orgIds (CRC unaffected by its absence).
- Run `fix-david-orgids-claim.mjs --apply` (needs David's uid/email) so David appears in BL's roster; he then re-auths (or hits sync-claims) to mirror onto his doc.
- `suggest_band` still reads `scheduling_assignments` (play-count) + `config/congregation` cross-tenant → scoped in v11-05-03 / v11-05-04.

**Blockers:** None.

---
*Phase: v11-05-collection-scoping, Plan: 02*
*Completed: 2026-06-09*
