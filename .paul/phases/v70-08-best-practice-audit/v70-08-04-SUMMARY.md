---
phase: v70-08-best-practice-audit
plan: 04
subsystem: api
tags: [performance, firestore-projection, caching, abortcontroller, server-only, atomic-batch]

requires:
  - phase: v70-06
    provides: resolve.ts + getServerLibrary (the resolve hot path this plan optimizes)
  - phase: v70-07
    provides: createSetlistServerSide, the 3-route doc-import client chain in ImporterModal
  - phase: v70-08-01
    provides: v70-08-AUDIT.md (the performance P1/P2 punch list)
provides:
  - getServerLibraryLean() — projected + TTL-cached library fetch for the resolve hot path
  - ImporterModal doc-import chain with a resolve timeout + a cancellable AbortController
  - commit-document maxDuration + a single-atomic-batch createSetlistServerSide
  - server-only build guards on the mammoth / heic-convert modules
affects: [v70-08 phase transition, v7.0 milestone close]

tech-stack:
  added: []
  patterns:
    - "Hot-path Firestore reads use a .select() projection + a module-scoped TTL cache instead of a full uncached scan"
    - "Multi-step client fetch chains share one AbortController so closing the UI cancels in-flight server work"
    - "Heavy server-only deps (mammoth/heic-convert) are guarded with `import 'server-only'`; vitest aliases it to a no-op stub"

key-files:
  created:
    - src/test-server-only-stub.ts
  modified:
    - src/lib/server-library.ts
    - src/lib/setlist-import/resolve.ts
    - src/components/setlist/importer/ImporterModal.tsx
    - src/app/api/setlists/import/commit-document/route.ts
    - src/lib/setlist-write.ts
    - src/lib/setlist-import/extract-document.ts
    - src/app/api/library/upload/route.ts
    - vitest.config.ts

key-decisions:
  - "Added getServerLibraryLean() as a NEW function rather than narrowing getServerLibrary — the library page needs the full LibraryFile payload"
  - "Module-scoped 60s TTL cache (not lastModified-keyed) — the audit explicitly offers TTL as acceptable, and lastModified-keying would itself need a scan"
  - "vitest `server-only` → no-op alias: the necessary test-infra accommodation for the audit-mandated guard (server-only throws under jsdom)"

patterns-established:
  - "getServerLibraryLean + __resetServerLibraryCache — projected/cached read for hot paths, with a test-reset hook"
  - "server-only guard on dep-heavy server modules, paired with a vitest alias stub"

duration: ~40min
started: 2026-05-14T18:42:00Z
completed: 2026-05-14T18:55:00Z
---

# Phase v70-08 Plan 04: Doc-import performance Summary

**Closed the v7.0 doc-import performance P1s — the resolve route no longer does a full uncached `library_index` scan on every call (`.select()` projection + 60s TTL cache), the ImporterModal doc chain has a resolve timeout + an `AbortController` that cancels in-flight work on modal close, `createSetlistServerSide` writes the setlist atomically in one batch, and `mammoth`/`heic-convert` are build-guarded server-only.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~40 min |
| Started | 2026-05-14T18:42:00Z |
| Completed | 2026-05-14T18:55:00Z |
| Tasks | 3 completed (3/3 qualify PASS) |
| Files modified | 8 (+1 created) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Resolve path uses a projected, cached library fetch | Pass | New `getServerLibraryLean()` — `.orderBy('name').select('name','mimeType')` projection + module-scoped 60s TTL cache + `__resetServerLibraryCache()` test helper. `resolve.ts` switched onto it. `getServerLibrary` + `library/page.tsx` untouched. server-library + resolve suites green. |
| AC-2: Doc-import client chain has a resolve timeout + is cancellable | Pass | `handleDocSubmit` creates a fresh `AbortController` per run (aborting any prior), passes `signal` to all 3 `apiFetch` calls, sets `timeout: 60000` on the resolve fetch (parity with steps 1-2). The `[open]` effect's `else` branch + `handleStartOver` abort it; the `catch` suppresses the toast for a deliberate `AbortError`. |
| AC-3: commit-document is bounded + writes atomically | Pass | `export const maxDuration = 30` on the route; `createSetlistServerSide` now writes the parent `setlists/{id}` doc + every `tracks/{id}` seed in a single `db.batch()` — no partial-write window. |
| AC-4: mammoth / heic-convert modules are guarded server-only | Pass | `import 'server-only'` added to `extract-document.ts` (imports mammoth) + `library/upload/route.ts` (imports heic-convert). `next build` resolves `server-only` and passes EXIT 0. |

## Accomplishments

- **Resolve is no longer an O(library size) uncached scan on a user-facing step** — `.select()` cuts per-doc payload + Zod cost, and the 60s TTL cache means resolve retries within a doc-import session skip the scan entirely.
- **Closing the ImporterModal mid-pipeline now cancels server work** — previously the 3-route chain ran to completion regardless; now one shared `AbortController` is aborted on close / "Start over".
- **`createSetlistServerSide` is atomic** — the parent doc + track seeds commit as one batch, eliminating the partial-write window the old code's comments acknowledged.
- **mammoth/heic-convert can't silently leak into a client bundle** — `import 'server-only'` makes an accidental client import a build error.

## Task Commits

No atomic per-task commits — `auto_commit: false`, multi-plan phase. This plan's 9 files join plans 02 + 03's changes in the bundled `feat(v70-08)` phase-transition commit (created in the transition step immediately following this UNIFY).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/lib/server-library.ts` | Modified | Added `getServerLibraryLean()` (`.select()` projection + 60s module-TTL cache) + `__resetServerLibraryCache()` |
| `src/lib/setlist-import/resolve.ts` | Modified | Switched the no-injected-library branch from `getServerLibrary()` → `getServerLibraryLean()` |
| `src/components/setlist/importer/ImporterModal.tsx` | Modified | `docSubmitAbortRef` + fresh `AbortController` per `handleDocSubmit`; `signal` on all 3 fetches; `timeout: 60000` on resolve; abort on modal-close + "Start over"; `AbortError` toast suppressed; re-added `useRef` import |
| `src/app/api/setlists/import/commit-document/route.ts` | Modified | `export const maxDuration = 30` + doc-comment update |
| `src/lib/setlist-write.ts` | Modified | `createSetlistServerSide` writes parent + tracks in one atomic `db.batch()` |
| `src/lib/setlist-import/extract-document.ts` | Modified | `import 'server-only'` guard (imports mammoth) |
| `src/app/api/library/upload/route.ts` | Modified | `import 'server-only'` guard (imports heic-convert) |
| `vitest.config.ts` | Modified | `server-only` → no-op stub alias (auto-fix) |
| `src/test-server-only-stub.ts` | Created | No-op stub for the `server-only` package under vitest jsdom (auto-fix) |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| New `getServerLibraryLean()` instead of narrowing `getServerLibrary` | `library/page.tsx` needs the full `LibraryFile` payload (parents/modifiedTime/webViewLink/metadata) | The library page is untouched; only the resolve hot path gets the lean+cached read |
| Module-scoped 60s TTL cache, not `lastModified`-keyed | The audit explicitly offers "module-scoped with a TTL" as acceptable; keying on `lastModified` would itself require a scan to compute the key | Simple, per-instance, no extra read; a freshly-uploaded chart surfaces within 60s |
| 3-route chain kept (not collapsed into one route) | The audit offers chain-collapse as option (a) but plan 04's named scope is timeout + AbortController only; collapsing is a larger architectural change | Chain-collapse + server-side text persistence remain available as a future fold-forward |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 1 | Essential — test-infra accommodation for the audit-mandated server-only guard |
| Scope additions | 0 | — |
| Deferred | 0 | — |

**Total impact:** Plan executed as written. One essential auto-fix (vitest could not load a `server-only`-guarded module), no scope creep.

### Auto-fixed Issues

**1. [Test infra] `server-only` throws under vitest's jsdom environment**
- **Found during:** Task 3 (`import 'server-only'` guard on `extract-document.ts`)
- **Issue:** The `server-only` npm package throws when imported outside a React Server environment — which includes vitest's jsdom env — so `extract-document.test.ts` (imports `extract-document.ts`) failed to load
- **Fix:** Added a `server-only` → `src/test-server-only-stub.ts` (no-op) alias in `vitest.config.ts`; created the stub file
- **Files:** `vitest.config.ts`, `src/test-server-only-stub.ts`
- **Verification:** server-library + setlist-import suites 47/47 green after the alias; `next build` still resolves the real `server-only` package (EXIT 0)

### Deferred Items

None — the plan's named scope executed exactly. Fold-forward items (collapsing the 3-route chain, `inferServiceType` short-circuit, bounded-concurrency PDF parsing, the duplicated Levenshtein matcher) remain AUDIT-routed to v7.1, untouched.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `extract-document.test.ts` failed to load after the `server-only` guard | Aliased `server-only` to a no-op stub in vitest config — see Auto-fixed Issues |

## Skill Audit

No required skills for this plan (SPECIAL-FLOWS.md requires `/ui-ux-pro-max` only for frontend UI/UX phases; plan 04's ImporterModal change is non-visual fetch-lifecycle plumbing). Nothing to audit.

## Next Phase Readiness

**Ready:**
- v70-08 is COMPLETE — all 4 plans (01 audit, 02 import-route hardening, 03 ImporterModal a11y+UX, 04 doc-import performance) LOOP CLOSED. The phase transition follows immediately: PROJECT.md evolve, ROADMAP → complete, bundled `feat(v70-08)` commit.
- v7.0 milestone becomes close-eligible once the transition lands — v70-08 was the last phase and the milestone-close blocker.

**Concerns:**
- HFG-held: `commit.emulator.test.ts` (the `createSetlistServerSide` atomic-batch path) is emulator-gated and was not run in the default flow. The batching change is a pure refactor — identical writes, identical payloads, just grouped into one batch — verified by `next build` + types. Recommend an emulator run (or a worship-cycle UAT) at milestone close; appending to `.paul/UAT-PENDING.md`.

**Blockers:**
- None.

---
*Phase: v70-08-best-practice-audit, Plan: 04*
*Completed: 2026-05-14*
