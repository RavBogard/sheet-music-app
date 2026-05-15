---
phase: v70-08-best-practice-audit
plan: 02
subsystem: api
tags: [security, zod-validation, role-gate, session-cookie, doc-import, firebase-auth]

requires:
  - phase: v70-04
    provides: extract-document.ts (text extraction lib + extract-document route)
  - phase: v70-05
    provides: extract-structure.ts (SetlistStructureSchema, Section/TrackSchema)
  - phase: v70-06
    provides: resolve.ts (ResolvedTrack type, resolve route)
  - phase: v70-07
    provides: commit-document route, setlist-write.ts, execute route refactor
  - phase: v70-08-01
    provides: v70-08-AUDIT.md (the P0-P3 punch list this plan remediates)
provides:
  - band_leader role gate on all 3 upstream doc-import routes
  - eventDate schema-boundary validation on commit-document
  - real Zod shapes (ResolvedTrackSchema / ParsedItemSchema) replacing z.array(z.any())
  - MIME gate + MAX_PDF_PAGES cap in the doc-extraction path
  - verifySessionCookieRequest() — real __session-cookie auth boundary for file-serving routes
affects: [v70-08-03 (ImporterModal a11y+UX), v70-08-04 (doc-import performance), v70-08 phase transition]

tech-stack:
  added: []
  patterns:
    - "File-serving routes authenticate via verified __session cookie (real boundary) instead of forgeable Sec-Fetch-* metadata"
    - "Write-route array payloads validated against exported resolve-output Zod schemas, not z.array(z.any())"

key-files:
  created: []
  modified:
    - src/app/api/setlists/import/extract-document/route.ts
    - src/app/api/setlists/import/extract-structure/route.ts
    - src/app/api/setlists/import/resolve/route.ts
    - src/app/api/setlists/import/commit-document/route.ts
    - src/app/api/setlists/import/execute/route.ts
    - src/lib/setlist-import/extract-document.ts
    - src/lib/setlist-import/extract-structure.ts
    - src/lib/setlist-import/resolve.ts
    - src/lib/drive-file-auth.ts
    - src/app/api/recordings/file/[id]/route.ts
    - src/lib/setlist-import/__tests__/extract-document.test.ts

key-decisions:
  - "Task 4 fixed recordings/file/[id] PROPERLY (session-cookie verification) — session-cookie infra already existed, fold-forward not needed"
  - "Did NOT rewire /api/drive/file to the new helper — out of the named audit-finding scope; left for a future plan"
  - "execute route uses .nullish() (not .optional()) because import/parse emits null for header-item fields"

patterns-established:
  - "verifySessionCookieRequest(req) in drive-file-auth.ts — shared helper, real auth boundary for routes serving bytes to browser elements"

duration: ~35min
started: 2026-05-14T17:45:00Z
completed: 2026-05-14T18:20:00Z
---

# Phase v70-08 Plan 02: Import-route hardening Summary

**Closed the v7.0 doc-import backend-security cluster: band_leader role gates on the 3 upstream import routes, real Zod validation replacing `z.array(z.any())`, MIME + PDF-page caps, and a real `__session`-cookie auth boundary for `recordings/file/[id]` (replacing forgeable `Sec-Fetch-*`).**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~35 min |
| Started | 2026-05-14T17:45:00Z |
| Completed | 2026-05-14T18:20:00Z |
| Tasks | 4 completed (4/4 qualify PASS) |
| Files modified | 11 |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Upstream doc-import routes band_leader-gated | Pass | `{ role: 'band_leader' }` added to extract-document, extract-structure, resolve; `createApiHandler` passes `options.role` → `withAuth` → 403 for `member`. Verified via `next build`. |
| AC-2: commit-document rejects unparseable eventDate at schema boundary | Pass | `eventDate: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date')` — bad value → 400 VALIDATION_ERROR, never reaches `Timestamp.fromDate` RangeError. |
| AC-3: Write-route array payloads validated with real Zod shapes | Pass | commit-document → `z.array(SectionSchema)` + `z.array(ResolvedTrackSchema)`; execute → `z.array(ParsedItemSchema).min(1)`. `next build` compiles; resolve/extract-structure suites still green (round-trip confirmed). |
| AC-4: extract-document rejects unsupported MIME early + caps PDF pages | Pass | Route calls `detectDocumentFormat` before `Buffer.from(arrayBuffer())` → 400. `extractPdfText` throws over `MAX_PDF_PAGES=50` → `extraction_failed`. +2 tests (over-cap + boundary) pass. |
| AC-5: recordings/file weak-auth resolved or folded forward | Pass | RESOLVED — not folded forward. `verifySessionCookieRequest()` verifies the HttpOnly `__session` cookie via `getAuth().verifySessionCookie`; route now accepts Bearer token OR verified session cookie. |

## Accomplishments

- **Closed the audit's #1-priority P1**: the 3 upstream doc-import routes (`extract-document`, `extract-structure`, `resolve`) are no longer open to any signed-in `member` — they were a billed-Gemini + full-library-enumeration surface.
- **Eliminated the `z.array(z.any())` escape hatch** on both write routes by exporting `SectionSchema`/`TrackSchema` and adding `LibraryMatchSchema` + `ResolvedTrackSchema` + `ResolvedStructureSchema` to resolve.ts.
- **`recordings/file/[id]` is now a real auth boundary** — the forgeable `Sec-Fetch-*` heuristic is replaced by cryptographic `__session`-cookie verification; `<audio>` elements still authenticate (the cookie is sent automatically).
- **Bounded the doc-extraction attack surface**: unsupported MIME types rejected before the file is buffered; PDFs capped at 50 pages so a pathological document cannot drive an unbounded parse loop.

## Task Commits

No atomic per-task commits — `auto_commit: false` in `.paul/config.md`, and this is a multi-plan phase. All 11 modified files remain uncommitted in the working tree; they will be bundled into the `feat(v70-08)` phase-transition commit after plans 03 + 04 close (mirrors the v70-07 bundled-commit pattern).

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `src/app/api/setlists/import/extract-document/route.ts` | Modified | `{ role: 'band_leader' }`; early `detectDocumentFormat` MIME gate before buffering |
| `src/app/api/setlists/import/extract-structure/route.ts` | Modified | `{ role: 'band_leader', schema }` |
| `src/app/api/setlists/import/resolve/route.ts` | Modified | `{ role: 'band_leader', schema: SetlistStructureSchema }` |
| `src/app/api/setlists/import/commit-document/route.ts` | Modified | `eventDate` Date.parse refine; `sections`/`tracks` → `SectionSchema`/`ResolvedTrackSchema` |
| `src/app/api/setlists/import/execute/route.ts` | Modified | `items` → `z.array(ParsedItemSchema).min(1)`; `ParsedItem` now `z.infer`-derived |
| `src/lib/setlist-import/extract-document.ts` | Modified | `MAX_PDF_PAGES = 50` const; `extractPdfText` throws over the cap |
| `src/lib/setlist-import/extract-structure.ts` | Modified | Exported `SectionSchema` + `TrackSchema` for reuse at the route boundary |
| `src/lib/setlist-import/resolve.ts` | Modified | Added `LibraryMatchSchema`, `ResolvedTrackSchema`, `ResolvedStructureSchema` |
| `src/lib/drive-file-auth.ts` | Modified | Added `CookieReader` interface + `verifySessionCookieRequest()` helper |
| `src/app/api/recordings/file/[id]/route.ts` | Modified | Bearer-OR-session-cookie auth; dropped `hasBrowserFetchMetadata` fallback |
| `src/lib/setlist-import/__tests__/extract-document.test.ts` | Modified | pdfjs mock reads a `PAGES=N` marker; +2 page-cap tests |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Fixed `recordings/file/[id]` properly instead of folding forward | Session-cookie infra already exists (`server-auth.ts` uses `verifySessionCookie`; `/api/auth/session` mints `__session`) — the "proper fix is too large" branch in the plan did not apply | AC-5 fully resolved; no residual-risk debt carried into v7.1 |
| Did NOT rewire `/api/drive/file` to `verifySessionCookieRequest` | The audit finding is scoped to `recordings/file`; `/api/drive/file` is the pre-existing pattern it inherited from but is not in this plan's named scope. Expanding there would broaden blast radius without its own verification | `/api/drive/file` still uses `hasBrowserFetchMetadata` (still exported, no dead code). Candidate for a future fold-forward plan |
| `execute` route schema uses `.nullish()` not `.optional()` | `import/parse` route's Gemini prompt explicitly emits `null` for a header item's non-title fields — `.optional()` only would 400 valid live payloads | `ParsedItem` is now `z.infer<typeof ParsedItemSchema>` (`string \| null \| undefined`); handler's truthy checks already tolerate it |

## Deviations from Plan

### Summary

| Type | Count | Impact |
|------|-------|--------|
| Auto-fixed | 0 | — |
| Scope additions | 0 | — |
| Scope decisions (narrowing) | 1 | `/api/drive/file` left untouched — see Decisions |
| Deferred | 0 | — |

**Total impact:** Plan executed as written. One deliberate scope-narrowing decision (not rewiring `/api/drive/file`), which the plan's Task 4 explicitly framed as "ideally" / optional.

### Deferred Items

None — the plan's named scope executed exactly. (`/api/drive/file` weak `Sec-Fetch-*` auth is a pre-existing, separate finding — not introduced or in-scope here; a candidate for v7.1 fold-forward.)

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Test pdfjs mock had `numPages: 1` hardcoded — couldn't simulate a large PDF | Extended the mock to parse a `PAGES=N` marker from the buffer; tests build `%PDF-1.4\nPAGES=999\n…` to drive numPages |

## Next Phase Readiness

**Ready:**
- v70-08-03 (ImporterModal a11y + UX) can proceed — backend hardening is independent of the frontend work; no shared files.
- v70-08-04 (doc-import performance) can proceed — `getServerLibrary` projection + resolve caching + client `AbortController` are untouched here.
- Exported schemas (`ResolvedStructureSchema` etc.) are available if later plans want stricter typing.

**Concerns:**
- `execute`'s `type: z.enum(['header','song'])` now 400s the whole request on a stray item type, vs. the prior silent-skip. Risk is low (parse's Gemini prompt strictly emits `header`/`song`) and stricter rejection is the audit's intent — but worth a glance if any CSV-import regression surfaces.

**Blockers:**
- None.

---
*Phase: v70-08-best-practice-audit, Plan: 02*
*Completed: 2026-05-14*
