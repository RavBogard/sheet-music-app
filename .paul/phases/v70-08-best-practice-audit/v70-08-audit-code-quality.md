# v70-08 Best-Practice Audit — Code Quality + Data Integrity

Scope: the v7.0 doc-import surface only — setlist-import libs, setlist-write.ts, the 5 import API routes, ImporterModal, recordings module/routes/model, SetlistMetaEditSheet, the image-chart print-embed path. READ-ONLY audit. MCP territory excluded.

**P0: 0 · P1: 2 · P2: 6 · P3: 4**

---

## P0 — data corruption / shipped crash

None.

---

## P1 — real correctness bug / unhandled error path / runtime-failure type hole

### [P1] commit-document route accepts any-shaped `eventDate` string and crashes the request on a bad value

**Location:** `src/app/api/setlists/import/commit-document/route.ts:17` (schema `eventDate: z.string()`) → `src/lib/setlist-write.ts:62-64` (`toTimestamp` → `Timestamp.fromDate(new Date(value))`)

**Description:** The route validates `eventDate` only as "a string", then passes it through `commitDocumentSetlist` → `createSetlistServerSide` → `toTimestamp`, which does `Timestamp.fromDate(new Date(value))`. An unparseable string produces an `Invalid Date`; `Timestamp.fromDate` then throws a `RangeError`. There is no try/catch in `commit.ts` or `setlist-write.ts`, so the throw unwinds to `createApiHandler`'s catch-all and returns an opaque 500 `INTERNAL_ERROR`. The setlist parent doc is NOT written (the throw happens before `db.collection('setlists').doc().set()`), so no partial write — but the failure mode is a generic 500 with no actionable message, and the schema is the wrong place to be lax. In practice ImporterModal always sends a valid `<input type=date>` value, so this is latent rather than live; severity is P1 because it is a server-side throw with no typed handling on a write path.

**Recommended fix:** Validate the date at the schema boundary — `z.string().refine(s => !Number.isNaN(Date.parse(s)), 'invalid date')` — or guard `toTimestamp` to return a typed failure / throw a domain error the route maps to a 400. Mirror the validation rigor already applied to `name`.

### [P1] `extract-structure` and `resolve` routes have no role gate — any authenticated user can drive Gemini calls and full-library scans

**Location:** `src/app/api/setlists/import/extract-structure/route.ts:62` (`{ schema }` — no `role`); `src/app/api/setlists/import/resolve/route.ts:54` (`{ schema: SetlistStructureSchema }` — no `role`); `src/app/api/setlists/import/extract-document/route.ts:24` (no options at all)

**Description:** The doc-import pipeline's first three routes are gated only by `requireAuth` (default true) — any authenticated user (including a `pending` / `member` role) can: upload a 25MB document for server-side text extraction, trigger a billed Gemini `generateContent` call, and run a full `getServerLibrary()` scan + levenshtein matching over every track. Only the final `commit-document` route enforces `role: 'band_leader'`. The route comments explicitly say "no role gate — matches import/parse", so this is a deliberate consistency choice, but it means the expensive/billed steps of a band-leader-only feature are open to the whole authenticated user base. This is a real abuse/cost surface, not just style.

**Recommended fix:** Add `{ role: 'band_leader' }` to all three upstream routes so the entire doc-import pipeline matches the `commit-document` gate and the actual feature audience. If `import/parse` parity is genuinely desired, that decision should be re-confirmed — but the safer default for a billed AI + full-library-scan path is the role gate.

---

## P2 — code quality / maintainability / test-coverage gap

### [P2] Large dead TanStack-table block in SetlistGrid.tsx (confirmed)

**Location:** `src/components/setlist/grid/SetlistGrid.tsx` — `declare module '@tanstack/react-table'` (132), `getMeta` (137), `COLUMNS` (171), `SortableRowProps`/`SortableRow` (434-~700, includes the `flexRender` call at 643), `useReactTable` call producing `table` (1431-1437)

**Description:** Confirmed the v70-03-01 SUMMARY finding. `SortableRow` has zero call sites; the `table` variable from `useReactTable` is never referenced after its definition; `flexRender` is imported and used only inside dead `SortableRow`. The sole live render path is `MobileCardList` at line 1712. This is several hundred lines of dead code plus four unused `@tanstack/react-table` imports and an unused `@dnd-kit` `useSortable` usage inside the dead row. It inflates the file, and the v70-03 SUMMARY notes ~41 grid-dir test failures are "the pre-existing dead-table baseline" — i.e. there are still tests asserting against this dead code.

**Recommended fix:** Delete `COLUMNS`, `SortableRow`, `SortableRowProps`, `getMeta`, the `declare module` augmentation, the `useReactTable` call, and the now-unused `@tanstack/react-table` imports. Remove or rewrite the grid-dir tests that target the dead table so the failing baseline shrinks. Out of scope for this read-only audit but should be a v7.0 cleanup phase.

### [P2] `commitDocumentSetlist` / `createSetlistServerSide` have no test through the commit ROUTE; the route handler itself is untested

**Location:** test gap — `src/app/api/setlists/import/commit-document/route.ts` has no test; `src/lib/setlist-import/__tests__/commit.emulator.test.ts` covers only `commitDocumentSetlist` directly (AC-1 flatten + persist, no-sections bucket)

**Description:** Coverage exists for the pure flatten (`commit.emulator.test.ts`) and for `createSetlistServerSide` (`setlist-write.emulator.test.ts`), but nothing exercises the route handler — the `body.serviceType as Setlist['templateType']` cast, the `body.sections as SetlistSection[]` / `body.tracks as ResolvedTrack[]` casts, the `ctx.auth.email || "Unknown"` fallback, the rate-limit branch, or the bad-`eventDate` throw path (P1 above). The `z.array(z.any())` schema means the casts are the only "contract" and they are completely untested. Same gap for the `execute` route's union-read cast block (lines 141-154).

**Recommended fix:** Add a route-level test (or emulator integration test) for `commit-document` covering: a well-formed payload → 201 + correct setlist/tracks docs; a malformed `tracks` element surviving `z.any()` → assert the cast doesn't silently corrupt the write; a bad `eventDate` → assert the response status.

### [P2] `z.array(z.any())` schemas defeat validation on the two write routes

**Location:** `src/app/api/setlists/import/commit-document/route.ts:20-21`; `src/app/api/setlists/import/execute/route.ts:26`

**Description:** Both write routes validate `sections`/`tracks`/`items` as `z.array(z.any())`, then immediately `as`-cast the elements to their real types (`SetlistSection[]`, `ResolvedTrack[]`, `ParsedItem[]`). The comment justifies it ("payload is produced by our own resolve route"), but the resolve route's response is JSON over the network — a client can POST anything. A malformed element (e.g. `title` missing, `order` a string) passes validation and reaches the Firestore write; `createSetlistServerSide` will happily write `title: undefined` (the `?? 'Untitled'` fallback only exists in the `execute` route's mapper, NOT in the shared `setlist-write.ts` create path — `commit.ts`'s `toSongInput` does `title: track.title` with no fallback). Note `extract-structure` and `resolve` already have proper `SetlistStructureSchema` Zod schemas — the contract types exist; the write routes just don't reuse them.

**Recommended fix:** Reuse `SetlistStructureSchema` (extended with the resolve-route's `libraryMatch`/`missingChart`/`recordingCandidates` fields) as the `commit-document` schema. For `execute`, define a real `ParsedItem` Zod schema. This removes the `as` casts and closes the "undefined title written to Firestore" hole.

### [P2] `Recording.durationSeconds` is in the model and used by UI, but never written by the upload route

**Location:** `src/types/models.ts:109` (`durationSeconds?: number`) vs `src/app/api/recordings/upload/route.ts:102-112` (`recordingDoc` never sets it)

**Description:** The model comments `durationSeconds` as "for the v70-03 inline `<audio>` UI", but the upload route's `recordingDoc` never populates it — no server-side audio probe, no client-supplied value accepted. Every recording is persisted with `durationSeconds` undefined. Either the field is dead (UI silently handles `undefined`) or the inline-audio UI shows no duration. Not a corruption bug — the field is optional — but it is a model/writer mismatch that will mislead future readers.

**Recommended fix:** Either drop `durationSeconds` from the model until something writes it, or have the upload route / client populate it (client can read `HTMLAudioElement.duration` before upload and send it as a form field). Document the decision.

### [P2] Duplicated levenshtein-match logic across `resolve.ts` and `import/parse/route.ts`

**Location:** `src/lib/setlist-import/resolve.ts:48-102` (`normalize`, `score`, `bestMatch`, `allMatches`, `CONFIDENCE_THRESHOLD = 0.82`)

**Description:** `resolve.ts`'s header comment explicitly states the match algorithm "mirrors the proven approach in `import/parse/route.ts` ... the logic is intentionally duplicated here." Two independent copies of the normalize + levenshtein + 0.82-threshold matcher now exist. Intentional or not, it is a maintenance hazard: a threshold tweak or a normalization fix has to be made in two places, and they will drift.

**Recommended fix:** Extract the matcher into a shared `src/lib/setlist-import/library-match.ts` (or `src/lib/string-utils.ts` alongside `levenshteinDistance`) and have both `resolve.ts` and `import/parse/route.ts` consume it.

### [P2] Inconsistent error-body parsing between ImporterModal's CSV path and doc-import path

**Location:** `src/components/setlist/importer/ImporterModal.tsx` — `handleParse` (191-200) / `handleExecute` (285-294) use a verbose try/catch with a `res.statusText` fallback; `handleDocSubmit` (117-143) / `handleCommitDocument` (231-234) use the terser `.json().catch(() => ({}))` form

**Description:** Two different error-extraction idioms in the same component for the same purpose. The CSV path produces a richer fallback message ("Server error 500: ... The request may have timed out"); the doc-import path produces a plainer "(server error 500)". Not a bug, but it is exactly the kind of in-file inconsistency that makes the component harder to maintain and produces inconsistent UX on failures.

**Recommended fix:** Extract one `extractApiError(res, fallback)` helper and use it in all four handlers.

---

## P3 — style / minor polish

### [P3] ImporterModal doc-import handlers are untested

**Location:** test gap — `src/components/setlist/importer/ImporterModal.tsx` (`handleDocSubmit`, `handleCommitDocument`, `previewGroups` memo)

**Description:** No test file for ImporterModal. The 3-route chaining in `handleDocSubmit`, the interview-seed logic, the `previewGroups` grouping/sorting memo, and the commit error path are all unverified. The pure helpers (`interview-defaults.ts`) are well tested, but the component glue that wires them is not. Lower severity because the underlying libs and routes have coverage, but the orchestration is the part most likely to regress.

**Recommended fix:** Add a React Testing Library test for the doc-import flow with the three `apiFetch` calls mocked — assert step transitions, interview seeding, and the commit payload shape.

### [P3] `commit.ts` `toSongInput` has no `title` fallback while the `execute` route's mapper does

**Location:** `src/lib/setlist-import/commit.ts:33-37` (`title: track.title`) vs `src/app/api/setlists/import/execute/route.ts:147` (`title: (rec.title as string) ?? 'Untitled'`)

**Description:** Minor inconsistency in the two paths feeding the same `createSetlistServerSide`. `commit.ts` trusts `track.title` is present (reasonable — `TrackSchema.title` is required `z.string()` *at the extract-structure boundary*, but `commit-document`'s own `z.array(z.any())` schema does not re-enforce it — see P2). The `execute` route defends with `?? 'Untitled'`. Pick one convention.

**Recommended fix:** Once the `z.array(z.any())` schemas are replaced (P2), `title` is guaranteed and neither fallback is needed — remove the `execute` route's fallback for consistency. Until then, add a matching guard in `toSongInput`.

### [P3] `extract-structure` route's defensive empty-text check duplicates the lib's own check

**Location:** `src/app/api/setlists/import/extract-structure/route.ts:36-38` vs `src/lib/setlist-import/extract-structure.ts:130-136`

**Description:** The route does `if (!text || !text.trim()) return 400` and `extractSetlistStructure` does the identical check returning `{ ok: false, reason: 'empty' }`. The route's comment acknowledges it's "defensive". Harmless, but the lib already handles it — the route just maps `reason: 'empty'` to a different status (the lib path would fall into the 422 branch). Slightly muddled: an empty text gives 400 via the route guard but a Gemini-returned-empty gives 422.

**Recommended fix:** Drop the route-level guard and let the `reason: 'empty'` result map to a consistent status, or keep it but align the status codes intentionally and document why they differ.

### [P3] `ProtectedApiContext` / `createApiHandler` lean heavily on `any` defaults

**Location:** `src/lib/api-wrapper.ts:36` (`ProtectedApiContext<P = any, B = any>`), `:56` (`TParams = any, TBody extends z.ZodType = any`)

**Description:** Shared infra, not strictly v7.0 surface, but every v7.0 route flows through it. The `any` defaults mean `ctx.body` is `any` whenever a route omits the generic — which is why the import routes can do `ctx.body!.items` and `body.sections as SetlistSection[]` without a type error. The `z.infer<TBody>` typing works *when a schema is passed*, but `z.array(z.any())` schemas (P2) collapse `z.infer` back to `any[]`, so the casts are unchecked.

**Recommended fix:** Out of scope to change the wrapper here, but noting it: the type-safety of the import routes is bounded by their Zod schemas. Fixing the `z.array(z.any())` schemas (P2) is what actually closes the `any` leakage — the wrapper itself is fine once real schemas are supplied.
