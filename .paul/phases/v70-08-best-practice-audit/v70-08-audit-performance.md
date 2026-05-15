# v70-08 Best-Practice Audit — Performance

Scope: performance dimension of the v7.0 milestone surface only — doc-import API routes + libs, ImporterModal, recordings routes/lib/wiring, image-chart print-embed path, /api/library/upload (HEIC), and the mammoth/heic-convert dependencies. MCP territory excluded.

**P0: 0 · P1: 2 · P2: 4 · P3: 3**

---

## P0
None.

---

## P1

### [P1] `getServerLibrary()` loads the entire library on every doc-import resolve — unbounded, paginated-but-still-full scan in the hot path
**Location:** src/lib/server-library.ts:20-81, called by src/lib/setlist-import/resolve.ts:139 (route src/app/api/setlists/import/resolve/route.ts)
**Description:** Every `/api/setlists/import/resolve` call reads the *full* `library_index` collection — `getServerLibrary` loops 500-doc pages until exhausted, with no caching and no field projection (`.select()` is not used, so every doc's full payload is transferred and Zod-parsed). `resolve.ts` then builds two in-memory candidate arrays and runs a Levenshtein scan per track. For a synagogue library this is tolerable today, but it is an O(library size) Firestore read on a user-facing interactive step, repeated on every retry, and it grows without bound as the library grows. The sibling `/api/library/upload` route already demonstrates the better pattern (prefix-bounded queries + `.select('name','status')`).
**Recommended fix:** Project only the fields resolve needs (`name`, `mimeType`) via `.select()`, and add a short-lived server-side cache (e.g. module-scoped with a TTL, or `unstable_cache`/Next data cache keyed on the library's `lastModified`) so repeated resolves within a session don't each re-scan the collection. At minimum, `.select()` cuts per-doc payload and Zod-parse cost substantially.

### [P1] The 3-route client chain re-ships the full extracted document text and the full structure between round-trips, with inconsistent/missing timeouts
**Location:** src/components/setlist/importer/ImporterModal.tsx:108-148; routes extract-document → extract-structure → resolve
**Description:** `handleDocSubmit` makes three serial round-trips. Step 1 returns the entire extracted document `text` to the browser; step 2 ships that same full text back up to the server (`JSON.stringify({ text })`) for Gemini. For a 25 MB-cap document the extracted text can be very large, and it crosses the wire twice (down then up) purely as a client relay — the browser does nothing with it. Step 2 then returns the full `{ sections, tracks }` structure, which step 3 ships back up again. Additionally the `resolve` fetch at line 136 omits the `timeout` option entirely (steps 1 and 2 set `timeout: 60000`), so a slow library scan there can hang the modal indefinitely with no abort. The serial chain also means total latency is the *sum* of three cold-start + network legs with no progress granularity between them.
**Recommended fix:** Either (a) collapse the chain into one orchestration route so the document text never leaves the server, or (b) if the independent-routes architecture is kept for testability, persist the extracted text/structure server-side (e.g. a short-lived doc keyed by an import-session id) and pass only the id between client steps. Add an explicit `timeout` to the resolve fetch for parity. Add an `AbortController` so closing the modal cancels in-flight requests.

---

## P2

### [P2] mammoth and heic-convert risk leaking into client bundles — no enforced server-only boundary
**Location:** src/lib/setlist-import/extract-document.ts:6 (`import mammoth`), src/app/api/library/upload/route.ts:11 (`import heicConvert`)
**Description:** `mammoth` (.docx parsing) and `heic-convert` (HEIC→JPEG) are heavy server-only dependencies. They are currently only imported from route handlers / server libs, so they *should* stay server-side — but nothing enforces it. `extract-document.ts` has no `import 'server-only'` guard, and it is a plausible target for a future client import (it also exports the pure `detectDocumentFormat`, which a client component might reasonably want). If that happens, mammoth's large dependency tree silently lands in a client bundle.
**Recommended fix:** Add `import 'server-only'` to the top of `extract-document.ts` (and any other module that statically imports mammoth or heic-convert) so an accidental client import fails the build. If `detectDocumentFormat` is needed client-side, split it into a dependency-free module.

### [P2] `extract-document` PDF path parses pages strictly sequentially with no per-document page cap
**Location:** src/lib/setlist-import/extract-document.ts:45-60 (`extractPdfText`)
**Description:** `extractPdfText` loops `for (pageNum = 1..numPages)` awaiting `getPage` + `getTextContent` one page at a time. A large service-outline PDF (the 25 MB cap allows hundreds of pages) is processed fully serially, and there is no page-count ceiling — a pathological PDF can run the route to its 60 s `maxDuration` and time out. Unlike the print pipeline (which is inherently page-bound by the chart count), this is unbounded user-supplied input.
**Recommended fix:** Cap the number of pages parsed (service outlines are realistically a handful of pages — e.g. stop after 50 and warn), and/or parse pages with bounded concurrency (`Promise.all` over small batches) to use the 60 s budget more efficiently.

### [P2] `commit-document` route has no `maxDuration` and `createSetlistServerSide` does a non-atomic parent-set + batch-commit
**Location:** src/app/api/setlists/import/commit-document/route.ts (no `maxDuration`); src/lib/setlist-write.ts:111-139
**Description:** The route comment explicitly says "No maxDuration override … only does a Firestore batch write" — but `createSetlistServerSide` does *two* sequential network operations: `setlists/{id}.set()` then a separate `batch.commit()` for all track docs. On Vercel the route inherits the default function timeout (often 10 s on Hobby/older configs). For a large imported setlist on a slow connection this is two serial round-trips; if the function times out between them, the parent doc exists with `trackCount` set but zero track docs (the code comments acknowledge this "recoverable" partial state, but it's still a correctness-adjacent perf risk). A single Firestore batch can hold up to 500 writes, so the parent + all tracks could be one atomic batch.
**Recommended fix:** Set an explicit `maxDuration` on the route (e.g. 30). Combine the parent `set` and the track seeds into a single `db.batch()` so it's one atomic round-trip (well within the 500-write limit for any realistic setlist), eliminating the partial-write window and one network leg.

### [P2] ImporterModal `inferredText` derivation runs unmemoized inside `handleDocSubmit` but, more importantly, builds a large concatenated string from every track
**Location:** src/components/setlist/importer/ImporterModal.tsx:151-162
**Description:** After resolve, the modal builds `inferredText` by joining the filename + every section name + every `${track.title} ${track.notes}` into one string just to feed `inferServiceType`. This is O(tracks) string allocation on the main thread. It's only run once per import so not a re-render hotspot, but `inferServiceType` only scans for a fixed keyword set — joining the entire structure into one big string is wasteful when a short-circuiting scan over the array would do.
**Recommended fix:** Pass the array to `inferServiceType` (or an iterator) and let it short-circuit on the first keyword hit instead of materializing one large concatenated string. Minor, but trivial to fix.

---

## P3

### [P3] `previewGroups` is memoized but the preview row keys use `${track.title}-${track.order}` — fine, but the per-render `resolved.tracks.filter(...)` in the footer is not memoized
**Location:** src/components/setlist/importer/ImporterModal.tsx:731-732
**Description:** The preview footer recomputes `resolved.tracks.length` and `resolved.tracks.filter((t) => t.missingChart).length` on every render of the preview step. `resolved` only changes once (after the import chain completes), so this is recomputed needlessly on every unrelated state change (e.g. `isCommitting` toggling). Negligible for setlist-sized arrays but it's a real unmemoized derived value in a component the audit was asked to look hard at.
**Recommended fix:** Fold the missing-chart count into the existing `previewGroups` `useMemo` (or a sibling `useMemo`) so the footer reads memoized values.

### [P3] `recordings-client` subscription is correctly open-gated, but RecordingCell's `hasRecordings` is never populated — every row shows the neutral state until opened
**Location:** src/components/setlist/grid/cells/RecordingCell.tsx:11-15; RecordingBindPopover.tsx:56-60
**Description:** This is by design (the comment in RecordingCell says so) and is the *correct* performance trade-off — no per-row Firestore listener across a large setlist. Noting it only so the audit is complete: the consequence is purely cosmetic (the icon can't show a "has recordings" state without opening the popover), not a perf defect. If a "has recordings" indicator is ever wanted, the right move is a single batched `where('songId','in', [...])` query for the whole setlist, *not* per-row listeners.
**Recommended fix:** No change required. If the indicator becomes a requirement, add one batched chunked `in` query at the grid level rather than reintroducing per-row subscriptions.

### [P3] `extract-document` reads the whole upload into a Buffer before any size/format short-circuit on content
**Location:** src/app/api/setlists/import/extract-document/route.ts:43; src/app/api/recordings/upload/route.ts:92; src/app/api/library/upload/route.ts:104
**Description:** All three upload routes do `Buffer.from(await file.arrayBuffer())`, fully buffering up to 25 MB in function memory before processing. The size check happens first (good), so oversized files are rejected before the buffer read in extract-document and library/upload — but the whole file is still resident in memory for the duration. For a single-admin app at this scale this is fine; flagging only as a known ceiling. heic-convert additionally re-slices the buffer (`originalBuffer.buffer.slice(...)`) creating a second full copy.
**Recommended fix:** No action needed at current scale. If memory pressure ever shows up, stream parsing (mammoth/pdfjs both support streamed input) would avoid the full-buffer residency.
