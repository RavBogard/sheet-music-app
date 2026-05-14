---
phase: v70-07-interview-form-setlist-preview-commit
plan: 01
subsystem: api
tags: [setlist-write, server-side-write, firebase-admin, import-execute, mcp-coordination, emulator]

requires:
  - phase: (existing) src/app/api/setlists/import/execute/route.ts
    provides: the proven inline server-side setlist-write logic (parent doc + batched tracks seed) that this plan extracted
  - phase: (existing) src/lib/firebase-admin.ts
    provides: initAdmin + getFirestore — the Admin SDK entry points the module uses
provides:
  - src/lib/setlist-write.ts — createSetlistServerSide + updateSetlistServerSide + ServerSetlistTrackInput / CreateSetlistInput / CreateSetlistResult / SetlistMetadataPatch types. The single server-callable setlist-write path.
  - import/execute/route.ts now writes via createSetlistServerSide (one server-side write path, not two)
affects:
  - v70-07 plan 02 (interview form + ImporterModal "Document" option + preview)
  - v70-07 plan 03 (commit wiring — POST /api/setlists/import/commit-document → createSetlistServerSide)
  - MCP write tools (Daniel's parallel workstream) — consume createSetlistServerSide + updateSetlistServerSide

tech-stack:
  added: []
  patterns:
    - "Server-side setlist writes go through ONE module (src/lib/setlist-write.ts, firebase-admin) — createSetlistServerSide builds the setlists/{id} parent doc then seeds top-level tracks/{id} via a batched write (the Admin-SDK equivalent of createSetlistService's client-side applyEdit fanout). Multiple consumers (import/execute, v70-07 doc-commit, MCP write tools) call it instead of duplicating the write."
    - "The shared write module does NOT auto-default optional fields (eventDate etc.) — callers that want a default (like the CSV import) pass it explicitly; the module writes exactly what it's given."

key-files:
  created:
    - src/lib/setlist-write.ts
    - src/lib/__tests__/setlist-write.emulator.test.ts
  modified:
    - src/app/api/setlists/import/execute/route.ts

key-decisions:
  - "Signature Daniel-approved 2026-05-14 (create + update): createSetlistServerSide(CreateSetlistInput) → { setlistId, trackCount }; updateSetlistServerSide(setlistId, SetlistMetadataPatch) → void. New file src/lib/setlist-write.ts (not an edit to the shared server-setlists.ts)."
  - "updateSetlistServerSide is metadata-patch-only (name/eventDate/serviceType→templateType/rabbi/serviceNotes) — does NOT touch tracks/trackCount/ownerId/hydrated. Server-side track CRUD is out of scope (future work if MCP needs it)."
  - "No version-precondition (expectedUpdatedAt) on update — the sole-admin app's silent-LWW-on-conflict posture (v6.0 decision) makes server-side preconditions unnecessary."
  - "import/execute passes `eventDate: new Date()` explicitly to preserve its prior behavior of defaulting eventDate at import time — the module itself does not auto-default eventDate (Daniel OK'd 2026-05-14). Net behavior unchanged; timestamp source shifts from Firestore serverTimestamp() to request-time new Date() (functionally equivalent for a 'default to ~now' quirk)."
  - "eventDate written as a Firestore Timestamp (Timestamp.fromDate) — firestoreTimestampSchema accepts Date/{seconds,nanoseconds}/string; a server-side Timestamp is the cleanest representation."

patterns-established:
  - "Cross-workstream worktree gotcha: when a parallel-workstream merge adds a dependency to package.json on master, the sheet-music-app/ git worktree's node_modules goes stale (worktrees share .git, not node_modules) → next build fails with Module not found. Fix: npm install in the worktree. Saved to memory project_mcp_parallel_workstream.md."

duration: ~55min
started: 2026-05-14T21:00:00Z
completed: 2026-05-14T21:55:00Z
---

# Phase v70-07 Plan 01: Server-Callable Setlist-Write Module Summary

**Extracted the server-side setlist-write logic (parent `setlists/{id}` doc + batched top-level `tracks/{id}` seed) that lived inline in `import/execute/route.ts` into a reusable, firebase-admin-based module `src/lib/setlist-write.ts` — exposing `createSetlistServerSide` and `updateSetlistServerSide` — and refactored `import/execute` to call it, so there is now ONE server-side setlist-write path. This is the MCP-workstream coordination point: Daniel's MCP write tools consume the same module.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~55min (incl. resolving a stale-worktree `next build` red herring) |
| Started | 2026-05-14T21:00:00Z |
| Completed | 2026-05-14T21:55:00Z |
| Tasks | 3 auto PASS (autonomous — no checkpoints; Task 2 briefly DONE_WITH_CONCERNS, resolved) |
| Files modified | 2 created, 1 modified |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: createSetlistServerSide writes a setlist + its tracks | Pass | Builds `setlists/{id}` (name/ownerId/ownerName/trackCount/hydrated:true/server-timestamped date+updatedAt, plus eventDate as a `Timestamp` / `templateType` from `serviceType` / `rabbi` when provided) + one `tracks/{id}` per input track with `setlistId` + 0-based `order` + the track fields; returns `{ setlistId, trackCount }`. Proven by the emulator test (full-input + minimal-input cases). |
| AC-2: updateSetlistServerSide patches setlist metadata | Pass | Maps `name`/`rabbi`/`serviceNotes` through, `serviceType`→`templateType`, `eventDate`→`Timestamp`; re-stamps `updatedAt`; touches nothing else. Emulator test confirms patched fields update while `trackCount`/`ownerId`/`hydrated`/tracks are untouched. |
| AC-3: import/execute refactored onto the shared module, no behavior change | Pass | The inline `setlistPayload` build + `db.batch()` tracks-seed block is replaced by a single `createSetlistServerSide(...)` call; the route keeps its Drive-download + `library_index`-entry logic, its `band_leader` auth, its schema, and its `201 { success, setlistId, message }` response. `next build` ✓. Prior eventDate-default behavior preserved via an explicit `eventDate: new Date()` arg (see Decisions). |
| AC-4: Emulator coverage proves the real Firestore round-trip | Pass | `src/lib/__tests__/setlist-write.emulator.test.ts` — 3 tests against the Firebase emulator (create full-input round-trip incl. tracks + order, create minimal-input omits optionals, update metadata patch leaves tracks/ownerId/trackCount untouched). `npm run test:emulator` → 3/3; full emulator suite 38/38, no regressions. HFG data-layer coverage shipped. |

## Verification Results

- `npx tsc --noEmit` → `setlist-write.ts` and `import/execute/route.ts` are both type-clean. The remaining tsc errors are entirely in Daniel's MCP test files (`src/lib/mcp/__tests__/auth.test.ts` + `tokens.test.ts`) + the pre-existing `performance-toolbar.test.tsx` baseline — none introduced by this plan.
- `npx next build` → ✓ Compiled successfully; `/api/setlists/import/execute` + `/api/setlists/import/resolve` both build. (See Issues — this initially failed on a stale-worktree red herring.)
- `npm run test:emulator` → **38/38** across 7 emulator-test files, including the new `setlist-write.emulator.test.ts` 3/3. Zero regressions.

## Accomplishments

- **One server-side setlist-write path shipped.** `src/lib/setlist-write.ts` is the single firebase-admin write module — `import/execute` already calls it, and v70-07 plans 02/03 + the MCP write tools will too. No more inline-in-a-route duplication.
- **MCP coordination point delivered.** The `createSetlistServerSide` + `updateSetlistServerSide` signature was agreed with Daniel before implementation; his MCP write tools can now consume it without building a competing path.
- **HFG coverage.** This is a data-layer write phase — it ships a real-Firestore emulator test (not a clause-(b) waiver).
- **No new dependencies, in-lane.** `setlist-write.ts` is the "new server-side write module" Daniel's handoff explicitly assigned; `import/execute` is setlist-import territory. No MCP territory, no shared-file edits, no `SetlistGrid.tsx`.

## Task Commits

Project config has `auto_commit: false`; per memory `feedback_paul_phase_commits`, the entire `.paul/phases/v70-07-interview-form-setlist-preview-commit/` directory (so far: PLAN 01 + SUMMARY 01) + the 3 source files will be committed as a bundled commit at the v70-07 **phase** transition — which happens after plan 03 closes, NOT now (v70-07 is a 3-plan phase; this is plan 01 of 3).

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–3 | `<v70-07 phase-commit>` (deferred to phase close after plan 03) | feat | setlist-write module + import/execute refactor + emulator test |

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/setlist-write.ts` | Created | `createSetlistServerSide` + `updateSetlistServerSide` + input types — the single server-callable setlist-write path (firebase-admin; create = parent doc + batched tracks seed; update = metadata patch) |
| `src/app/api/setlists/import/execute/route.ts` | Modified | The inline `setlistPayload` build + `db.batch()` tracks seed replaced by a `createSetlistServerSide(...)` call; `FieldValue` import dropped (now unused); Drive-download + `library_index` logic untouched |
| `src/lib/__tests__/setlist-write.emulator.test.ts` | Created | 3 emulator tests — create full-input round-trip, create minimal-input (optionals omitted), update metadata patch (tracks/ownerId/trackCount untouched) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Signature: `createSetlistServerSide` (create-only for setlist+tracks) + `updateSetlistServerSide` (metadata-patch-only); new file `src/lib/setlist-write.ts` | Daniel-approved 2026-05-14 (the MCP coordination point). A new file avoids editing the shared `server-setlists.ts`. | v70-07 plans 02/03 + MCP write tools have one agreed write path |
| `updateSetlistServerSide` is metadata-only, no track CRUD | v70-07 + the immediate MCP need are metadata edits; server-side track CRUD is unscoped | Smaller surface; track CRUD is a clean future addition if needed |
| No version-precondition on update | Sole-admin app's silent-LWW-on-conflict posture (v6.0 decision) | Simple `db.doc().update()`; no StaleWriteError path server-side |
| `import/execute` passes `eventDate: new Date()` explicitly | Preserves the route's prior eventDate-default behavior; the module deliberately does not auto-default | CSV-import behavior unchanged; timestamp source shifts serverTimestamp() → new Date() (functionally equivalent) — Daniel OK'd |
| `eventDate` written as a Firestore `Timestamp` | `firestoreTimestampSchema` accepts Date/{seconds,nanoseconds}/string; a server-side Timestamp is cleanest | Round-trips correctly through reads + the v6.0 sync engine |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | A union-type tsc error in the import/execute refactor — fixed at qualify, no production impact |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Minimal. One qualify-time type fix in the refactor. No scope creep, no deferred items. Plus one environment red herring (stale worktree node_modules) — not a code issue (see Issues).

### Auto-fixed Issues

**1. [Type] `resolvedTracks` union type broke the import/execute `.map`**
- **Found during:** Task 2 (import/execute refactor) — first qualify run.
- **Issue:** `resolvedTracks` is inferred as a union (`Record<string, unknown>` from the song push | a narrow `{ id, type, title }` object from the header push), so `t.key` / `t.leadMusician` / etc. failed to resolve in the `.map(t => …)` that builds `ServerSetlistTrackInput`s.
- **Fix:** Read each track through a `const rec = t as Record<string, unknown>` view inside the map (localized cast — no change to the upstream `resolvedTracks` declaration).
- **Files:** `src/app/api/setlists/import/execute/route.ts`
- **Verification:** `npx tsc --noEmit` → `import/execute/route.ts` type-clean.

### Deferred Items

None — plan executed as written.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `npx next build` failed: `Module not found: Can't resolve 'mcp-handler'` in `src/app/api/mcp/route.ts` | **Red herring — not a code or master problem.** `package.json` already had `mcp-handler@^1.1.0` (committed with the MCP Phase 3+4a merge at `9a11d1a0`; Vercel built it to production successfully). The cause was stale worktree `node_modules` — git worktrees share `.git` but NOT `node_modules`, and this worktree wasn't `npm install`-ed after the master fast-forward pulled in the new MCP deps. **Fix: `npm install` in `sheet-music-app/`** (in-lane — refreshes local node_modules, not a package.json edit). `next build` then green. Recurring gotcha — saved to memory `project_mcp_parallel_workstream.md` (npm install in the worktree after any master pull that adds a dep). |
| Union-type tsc error in the refactored `.map` | See Auto-fixed #1. |
| `tsc` reports errors in Daniel's MCP test files + `performance-toolbar.test.tsx` | Pre-existing / parallel-workstream — not introduced by this plan, not in this plan's lane. Flag-only. |

## Skill Audit (per .paul/SPECIAL-FLOWS.md)

| Expected | Invoked | Notes |
|----------|---------|-------|
| /ui-ux-pro-max | N/A | SPECIAL-FLOWS.md requires `/ui-ux-pro-max` for "any phase that touches frontend UI/UX". v70-07-01 is backend-only — a server-side write module + an API-route refactor + an emulator test, no components/styling/user-facing surface. v70-07's UI (interview form + ImporterModal "Document" option) is **plan 02**, where `/ui-ux-pro-max` IS required. Consistent with v70-02/04/05/06 backend phases. |

## Next Phase Readiness

**v70-07 is a 3-plan phase — plan 01 of 3 complete. The phase is NOT done; do NOT run the phase transition.** (The mechanical PLAN-count = SUMMARY-count check would say "transition" because plans 02/03 aren't authored yet — but v70-07 is explicitly a 3-plan phase per Daniel's 2026-05-14 split decision. Route to plan 02.)

**Ready:**
- `src/lib/setlist-write.ts` is shipped — v70-07 plan 03's commit route (`POST /api/setlists/import/commit-document`) calls `createSetlistServerSide`; Daniel's MCP write tools consume `createSetlistServerSide` + `updateSetlistServerSide`.
- Next: **v70-07 plan 02** — interview form UI + ImporterModal "Document" option + setlist preview. `/ui-ux-pro-max` is BLOCKING for plan 02 (frontend UI). It consumes v70-06's resolved `{ sections, tracks }` shape; surfaces `missingChart` tracks + `recordingCandidates`; structured form (NOT chat); service date REQUIRED with auto-suggest; service type auto-inferred from doc keywords.

**Concerns:**
- Nothing committed yet — the v70-07 source files (setlist-write.ts, import/execute, emulator test) are uncommitted and will be bundled into the single v70-07 phase commit at phase close (after plan 03). They sit uncommitted across plans 02/03. (If that feels risky given the parallel MCP workstream, an option is an interim commit after plan 01 — flag to Daniel.)
- `import/execute`'s `eventDate: new Date()` vs the old `serverTimestamp()` — functionally equivalent, Daniel OK'd, but noted here for the record.

**Blockers:** None.

---
*Phase: v70-07-interview-form-setlist-preview-commit, Plan: 01*
*Completed: 2026-05-14*
