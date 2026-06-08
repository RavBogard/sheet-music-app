---
phase: v11-01-tenant-foundation
plan: 02
subsystem: database
tags: [multi-tenant, orgId, firestore, setlist-write, library-upload, recordings]

requires:
  - phase: v11-01-01
    provides: org module (src/lib/org/registry.ts DEFAULT_ORG_ID, types, ORGS registry)
provides:
  - orgId stamped on every server-side CREATE (setlists, tracks, library_index, songs, recordings)
  - tracks inherit parent setlist's orgId (never a caller param)
  - readParentOrgId helper in server-tracks-write.ts
  - orgid-stamping.emulator.test.ts (AC-1/AC-2/AC-3 coverage)
affects: [v11-01-03 backfill, v11-01-04 org-scoped rules, v11-02 MCP org resolution]

tech-stack:
  added: []
  patterns: [optional orgId param with DEFAULT_ORG_ID fallback; tracks derive orgId from parent doc, not caller]

key-files:
  created:
    - src/lib/__tests__/orgid-stamping.emulator.test.ts
  modified:
    - src/lib/setlist-write.ts
    - src/lib/mcp/server-tracks-write.ts
    - src/lib/library-upload.ts
    - src/app/api/recordings/upload/route.ts

key-decisions:
  - "orgId is OPTIONAL with DEFAULT_ORG_ID ('crc') fallback everywhere — zero forced caller changes"
  - "Tracks derive orgId from the PARENT setlist doc (readParentOrgId), never a caller param — a track can't mismatch its setlist's tenant"
  - "Recordings create site is the inline doc in the upload route (not a recordings-client.ts helper) — stamped there"

patterns-established:
  - "Server CREATE paths stamp orgId additively; UPDATE paths untouched (backfill stamps existing docs in v11-01-03)"

duration: ~25min
completed: 2026-06-08
---

# Phase v11-01 Plan 02: Write-path orgId stamping Summary

**Every server-side CREATE path now stamps `orgId` (default "crc"), and tracks inherit their parent setlist's orgId — the write-side precondition for safe strict org-scoped rules in v11-01-04.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Completed | 2026-06-08 |
| Tasks | 3 completed (3/3 PASS) |
| Files modified | 4 + 1 created |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: setlist + seeded tracks carry orgId | Pass | Emulator test: no-orgId→"crc"; orgId="brotherslazaroff"→setlist + all seeded tracks carry it |
| AC-2: later-added tracks inherit parent setlist orgId | Pass | addTrack + bulkAddTracks read parent via readParentOrgId; brotherslazaroff inherited; legacy no-orgId setlist→"crc" fallback |
| AC-3: library + recording create paths carry orgId; no regression | Pass | processChartUpload stamps library_index + songs (default crc + explicit org proven); recording doc stamped (grep+tsc); tsc EXIT 0; 169 emulator tests green |

## Verification Results

- `npx tsc --noEmit` → **EXIT 0**
- `npm run test:emulator` (scoped: orgid-stamping + setlist-write + server-tracks + mcp-setlist-write + mcp-chart-upload + mcp-list-library) → **6 files, 169 tests passed**
  - NEW `orgid-stamping.emulator.test.ts` → 7 tests green
  - Regression suites for all touched modules → green (no behavioral regression; orgId is purely additive)
- grep confirms orgId at all create sites: setlist payload + seed trackPayload (setlist-write.ts), addTrack payload + bulkAddTracks payload (server-tracks-write.ts), library_index + songs (library-upload.ts), recording doc (recordings/upload/route.ts)

## Accomplishments

- All 5 server-side create sites stamp orgId; CRC behavior unchanged (every existing caller omits orgId → "crc").
- Tracks structurally cannot mismatch their setlist's tenant — orgId is read from the parent doc, not accepted from the caller.
- Real-Firestore emulator coverage added proving the stamping + the legacy-fallback path.

## Task Commits

Not committed individually. Per the v11.0 AUTONOMY directive (auto-commit per PHASE) and the PAUL phase-commit pattern, v11-01-02 changes accumulate in the working tree toward a single phase-complete commit at the end of v11-01 (after 03 backfill + 04 rules). Working tree currently carries v11-01-01 + v11-01-02 changes, uncommitted.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-write.ts` | Modified | `orgId?` on CreateSetlistInput; resolve `input.orgId ?? DEFAULT_ORG_ID`; stamp on setlist payload + every seeded track |
| `src/lib/mcp/server-tracks-write.ts` | Modified | `readParentOrgId` helper; addTrack + bulkAddTracks read parent setlist orgId and stamp inserted tracks |
| `src/lib/library-upload.ts` | Modified | `orgId?` on ProcessChartUploadInput; stamp on library_index + songs dual-write |
| `src/app/api/recordings/upload/route.ts` | Modified | Stamp `orgId: DEFAULT_ORG_ID` on the recording doc |
| `src/lib/__tests__/orgid-stamping.emulator.test.ts` | Created | Emulator coverage for AC-1/AC-2/AC-3 (storage stubbed for the library path) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| orgId OPTIONAL + DEFAULT_ORG_ID fallback everywhere | Backward-compat: every current caller omits orgId → "crc", CRC unchanged | v11-02 wires MCP callers to pass the bearer's org; no caller churn now |
| Tracks derive orgId from parent setlist, not caller | A track always belongs to a setlist; its tenant must equal the setlist's | Eliminates an entire class of cross-tenant mismatch by construction |
| Stamp recording orgId in the upload route inline doc | recordings-client.ts is client-side; the real create site is the route | Correct site stamped; see deviation below |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Spec path correction; intent unchanged |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** One spec-path inaccuracy corrected during execution; no scope creep, no behavioral difference from plan intent.

### Auto-fixed Issues

**1. [Spec] Recording create-site path was wrong in the plan**
- **Found during:** Task 2 (library + recording create sites)
- **Issue:** Plan listed `src/lib/recordings-client.ts createRecording` as the recordings create site. That file lives at `src/lib/recordings/recordings-client.ts` and is purely CLIENT-side (subscribe + uploadRecording fetch wrapper) — it performs no Firestore write. The actual `recordings/{id}` CREATE is the inline `recordingDoc` in `src/app/api/recordings/upload/route.ts`.
- **Fix:** Stamped `orgId: DEFAULT_ORG_ID` on the recordingDoc in the upload route; left recordings-client.ts untouched.
- **Verification:** grep confirms orgId on recordingDoc; `tsc --noEmit` EXIT 0.
- **Note:** Recordings stamping is proven by static inspection (literal constant) rather than an emulator round-trip — the route requires a full HTTP + auth-context harness (createApiHandler, ctx.auth, multipart formData) that the firestore+auth emulator run doesn't provide. The recordings/{id} collection already has rules coverage (firestore-rules-recordings.emulator.test.ts).

### Deferred Items

None — plan executed as intended.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Glob tool timed out scanning repo root (many `.auditor-sweep*`/worktree dirs + node_modules) | Scoped searches to `sheet-music-app/src` and used the plan's named paths directly |

## Skill Audit

`/ui-ux-pro-max` (the only required flow) is triggered for frontend UI/UX phases only. v11-01-02 is a pure server-side data-layer plan with no UI surface — no required skill triggered. ✓

## Next Phase Readiness

**Ready:**
- Both preconditions for strict org-scoped rules now have one half each: NEW writes emit orgId (this plan). v11-01-03 backfill stamps EXISTING data.
- `DEFAULT_ORG_ID` + `readParentOrgId` pattern available for the backfill to mirror.

**Concerns:**
- Recordings create-path orgId is not emulator-covered (route-level harness gap) — low risk (literal constant), but worth a route-level integration test if recordings become tenant-filtered.

**Blockers:**
- None. Next: v11-01-03 (CRC backfill of existing setlists/tracks/library_index/songs/recordings + seed orgs/{crc,brotherslazaroff}), then v11-01-04 (org-scoped rules + emulator + deploy), safe once existing data + new writes both carry orgId.

---
*Phase: v11-01-tenant-foundation, Plan: 02*
*Completed: 2026-06-08*
