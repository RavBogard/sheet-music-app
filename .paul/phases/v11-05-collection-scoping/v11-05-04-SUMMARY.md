---
phase: v11-05-collection-scoping
plan: 04
subsystem: infra
tags: [multi-tenant, firestore, congregation, org-scoping, mcp, print, zustand]

requires:
  - phase: v11-03-01
    provides: "<html data-org> host→org hook + coerceOrgId (validate already-resolved org id)"
  - phase: v11-05-01
    provides: "doc-id NAMESPACING pattern with a bare CRC key (zero migration)"
  - phase: v11-05-03
    provides: "rowOrg(raw) single-org helper (missing → crc)"
provides:
  - "congregationDocId(org) — per-org config/congregation doc id (crc bare, others congregation__{org})"
  - "Org-scoped congregation reads across server (server-auth, print footer, suggestBand, suggest-band route), MCP (get_congregation_context), and the client congregation-store"
  - "scripts/seed-bl-congregation.mjs — idempotent dry-run-first BL congregation seed"
affects: [v11-05-05, v11-06]

tech-stack:
  added: []
  patterns: ["doc-id namespacing with bare-default-org key (zero migration)", "conditional content-hash key (add only for non-default org → cache byte-stable for default)"]

key-files:
  created: [scripts/seed-bl-congregation.mjs]
  modified: [src/lib/org/registry.ts, src/lib/server-auth.ts, src/lib/print-pipeline.ts, src/lib/mcp/tools/congregation.ts, src/lib/mcp/tools/index.ts, src/lib/mcp/tools/roster.ts, src/app/api/scheduling/suggest-band/route.ts, src/lib/congregation-store.ts, src/app/api/setlist/print/route.ts, src/app/api/setlist/print/public/route.ts, src/app/api/setlist/print/personal/route.ts]

key-decisions:
  - "CRC keeps the bare config/congregation doc id (zero migration, byte-identical)"
  - "Threaded org through PrintRequest + 3 print routes so the print footer is per-org (additive deviation, beyond files_modified)"
  - "leadHistory (getAllSetlists) org-scoping DEFERRED to v11-06 — setlists are public-by-design; equality-filter backfill dependency makes it own-slice work"

patterns-established:
  - "Add org to a content-hash ONLY when non-default → the default org's cache key is unchanged"

duration: ~35min
started: 2026-06-09T11:00:00Z
completed: 2026-06-09T11:12:00Z
---

# Phase v11-05 Plan 04: Congregation Per-Org Doc-Id Namespacing Summary

**The `config/congregation` singleton is now per-org via `congregationDocId(org)` — CRC keeps the bare `config/congregation` doc (byte-identical, zero migration), other orgs read `config/congregation__{org}`; scoping is live across server reads, the MCP `get_congregation_context` tool, the client congregation-store, and the print footer.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Started | 2026-06-09T11:00:00Z |
| Completed | 2026-06-09T11:12:00Z |
| Tasks | 3 completed (all PASS) |
| Files modified | 11 modified + 1 created + 2 tests |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Per-org doc id resolution | Pass | `congregationDocId('crc')='congregation'`, `('brotherslazaroff')='congregation__brotherslazaroff'` — unit tests in server-auth.test.ts |
| AC-2: Server reads org-scoped | Pass | getServerCongregationConfig(org) + print-pipeline footer + suggestBand + suggest-band route all use congregationDocId(org); CRC default-arg byte-identical (bare doc); unit asserts the resolved doc path |
| AC-3: Client store reads host org's doc | Pass | congregation-store attachListener resolves `coerceOrgId(document.documentElement.dataset.org)` → congregationDocId; CRC host (absent/crc) → bare doc. Verified by manual trace (data-org set server-side pre-hydration per v11-03-01) |
| AC-4: MCP get_congregation_context org-scoped | Pass | index.ts:510 threads orgFrom(extra); emulator proves BL caller→BL doc, CRC caller→CRC doc, absent-BL→defaults (no CRC-doc leak) |
| AC-5: BL congregation doc seeded | Pass | scripts/seed-bl-congregation.mjs (dry-run-first, idempotent, --force override); node --check clean. Actual prod `--apply` = phase-close gate (HARD-ish for correct BL identity) |

## Verification Results

- `npx tsc --noEmit` → 0
- `npx eslint` (12 changed files) → 0
- `npx vitest run src/lib/__tests__/server-auth.test.ts` → 21/21 (+6 new: 4 congregation-doc-path/resolution unit cases + 2 congregationDocId cases)
- full suite `npx vitest run` → **3316 passed / 0 failed** (78 skipped pre-existing; baseline 3312 + 4 new)
- emulator `mcp-congregation-context.emulator.test.ts` → **9/9** (6 original + 3 org cases)
- `node --check scripts/seed-bl-congregation.mjs` → clean

## Accomplishments

- Closed the last shared-singleton in v11-05: every tenant now reads its own congregation identity (name/shortName/footer/themeColor/scheduling), with CRC byte-identical and BL graceful-default until seeded.
- Single pure helper `congregationDocId(org)` is the one source of truth, reused by every read seam (server + MCP + client) — mirrors v11-05-01's liturgical-key namespacing.
- Print footer is now per-org (gig packets carry the right tenant's footer), threaded from the setlist's orgId (public/personal) or host `x-org-id` (gig-packet POST), with the result-cache key kept byte-stable for CRC.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/org/registry.ts` | Modified | + `congregationDocId(org)` pure helper |
| `src/lib/server-auth.ts` | Modified | `getServerCongregationConfig(org=crc)` reads congregationDocId(org) |
| `src/lib/mcp/tools/congregation.ts` | Modified | `getCongregationContext(uid,args,org=crc)` → scoped config read |
| `src/lib/mcp/tools/index.ts` | Modified | thread `orgFrom(extra)` at the get_congregation_context registration |
| `src/lib/mcp/tools/roster.ts` | Modified | suggestBand config read → congregationDocId(org); removed stale "until v11-05-04" comment |
| `src/app/api/scheduling/suggest-band/route.ts` | Modified | congregation read → congregationDocId(org) |
| `src/lib/print-pipeline.ts` | Modified | + `PrintRequest.org`; conditional content-hash org key; footer read → congregationDocId(org) |
| `src/app/api/setlist/print/public/route.ts` | Modified | set `printReq.org = rowOrg(setlist.orgId)` |
| `src/app/api/setlist/print/personal/route.ts` | Modified | set `printReq.org = rowOrg(setlist.orgId)` |
| `src/app/api/setlist/print/route.ts` | Modified | set `body.org = coerceOrgId(x-org-id)` (host-authoritative) |
| `src/lib/congregation-store.ts` | Modified | attachListener subscribes to congregationDocId(coerceOrgId(dataset.org)) |
| `scripts/seed-bl-congregation.mjs` | Created | idempotent dry-run-first BL congregation seed |
| `src/lib/__tests__/server-auth.test.ts` | Modified | +6 (doc-path resolution + congregationDocId) |
| `src/lib/mcp/__tests__/mcp-congregation-context.emulator.test.ts` | Modified | +3 org cases + seedBLConfig helper |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| CRC = bare `config/congregation` doc id | Zero migration; CRC byte-identical | No CRC backfill needed; BL is the only seed |
| Thread org via PrintRequest + 3 routes | Pipeline has no org context; footer must be per-org | +3 route files beyond files_modified (additive, safer) |
| Add org to print content-hash ONLY when non-crc | Per-org footers must not collide in result cache; CRC keys stay byte-stable | No cache-version bump; existing CRC cached prints preserved |
| Client store reads dataset.org at attach (no React context) | data-org is set server-side before hydration; avoids OrgProvider ordering risk | Zustand store stays provider-independent |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 1 | Print routes threaded org (additive, required for per-org footer) |
| Deferred | 1 | leadHistory org-scoping → v11-06 |

**Total impact:** One essential additive scope addition (print footer per-org), one deliberate deferral. No scope creep into vocab/visual (that is v11-05-05).

### Scope additions

**1. Threaded org through PrintRequest + 3 print routes (beyond files_modified)**
- **Found during:** Task 1 (print-pipeline footer scoping)
- **Issue:** `PrintRequest` had no org field and the pipeline loads no setlist → no org available at the footer read site, so AC-2 could not apply to print without threading.
- **Fix:** Added optional `PrintRequest.org`; public/personal routes set it from `rowOrg(setlist.orgId)`, the gig-packet POST from the host `x-org-id` (host-authoritative). Content-hash adds org only when non-crc → CRC cache keys unchanged.
- **Files:** print-pipeline.ts + 3 print routes
- **Verification:** tsc 0, eslint 0, full suite 3316/0 (print-pipeline.test.ts unaffected)

### Deferred Items

- **leadHistory (getAllSetlists) org-scoping → v11-06 isolation audit.** `getCongregationContext` returns a `leadHistory` built from `getAllSetlists`, which is currently all-tenant. v11-04-03 added an opt-in `org` filter to getAllSetlists, but (a) it is an EQUALITY filter (`where('orgId','==',org)`) with a backfill dependency — not crc-safe for unbackfilled docs — and (b) wiring it live makes get_congregation_context the FIRST live caller, a setlist-read behavior change deserving its own slice/verification. Setlist names are public-by-design ([[feedback_setlist_public_policy]]), so a cross-tenant leadHistory is a UX nit, not a security leak. The v11-06 isolation audit sweeps exactly these setlist reads.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Considered scoping leadHistory in-slice; existing emulator fixtures lack orgId (equality filter would break the 4 leadHistory tests) | Reverted the in-slice scoping; deferred to v11-06 (documented above). Restored existing tests to green. |

## Next Phase Readiness

**Ready:**
- congregationDocId namespacing is the single seam for v11-05-05 (CreationWizard + de-synagogue vocab), which needs an org-scoped congregation to read BL's identity.
- Seed script ready for the phase-close deploy gate.

**Concerns:**
- leadHistory cross-tenant read (deferred to v11-06, above).
- v11-05-05 is the last slice and is UI-bearing → **/ui-ux-pro-max is BLOCKING** per the v11.0 quality floor.

**Blockers:**
- None.

---
*Phase: v11-05-collection-scoping, Plan: 04*
*Completed: 2026-06-09*
