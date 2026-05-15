# v70-08 Best-Practice Audit — Security Dimension

Scope: security review of the v7.0 surface only — doc-import API routes + libs, recordings (routes, rules, index, storage helpers), image-chart upload changes, and the ImporterModal. MCP territory excluded.

**P0: 0 · P1: 2 · P2: 4 · P3: 2**

---

## P0 — Exploitable hole / data loss / auth bypass

None.

---

## P1 — Significant security weakness

### [P1] `extract-document` / `extract-structure` / `resolve` accept any authenticated user — no role gate, and no upload-permission check

**Location:** `src/app/api/setlists/import/extract-document/route.ts:24`, `extract-structure/route.ts:28`, `resolve/route.ts:28`

**Description:** The first three stages of the doc-import pipeline are gated only by "any authenticated user" (default `createApiHandler` behavior — no `role` option). The final `commit-document` route is correctly `band_leader`-only, but the pipeline that precedes it is open to every signed-in account, including `member` and `pending` roles. Concretely this means any logged-in community member can:
- POST arbitrary documents (up to 25MB) for server-side text extraction (`extractDocumentText` runs `mammoth`, `pdfjs` on attacker-supplied bytes — see related P2 below);
- drive the `extract-structure` route, which spends a paid Gemini API call per request (rate-limited to 10/min/user, but still 10 free Gemini calls/min for any member);
- enumerate the library via `resolve` — the route returns fuzzy-matched library file IDs + names for any title string the caller supplies, effectively a library search/enumeration primitive available to non-band roles.

The library is otherwise locked down (`library_index` is `allow read, write: if false` server-only; `songs` is `isMember()`-read). `resolve` is a hole in that boundary: a `member` who cannot read `library_index` directly can still extract `{fileId, name}` pairs through it. The route comments assert parity with `import/parse`, but `import/parse` having the same gap is not a justification — it is the same finding in older code.

**Recommended fix:** Add `{ role: 'band_leader' }` to all three routes (only band leaders create setlists, so only they need the upstream pipeline). At minimum gate `resolve` behind `band_leader` since it leaks library contents. If a softer gate is desired for `extract-document`/`extract-structure`, require `musician`+ rather than any-authenticated, and consider checking the `canUpload` flag the way `library/upload` does.

### [P1] `recordings/file/[id]` falls back to forgeable `Sec-Fetch-*` headers as its access-control gate

**Location:** `src/app/api/recordings/file/[id]/route.ts:22-31` (`requireAuth: false` + `hasBrowserFetchMetadata` fallback), `src/lib/drive-file-auth.ts:31-37`

**Description:** The recordings serving route is the *only* access control for recording audio bytes (the admin SDK bypasses Storage rules — stated in the route's own comment). It accepts a request when *either* a valid Bearer token is present *or* `hasBrowserFetchMetadata` returns true. `drive-file-auth.ts` explicitly documents that the `Sec-Fetch-*` check is "NOT a cryptographic auth boundary" and "A dedicated attacker CAN forge them." So in practice any unauthenticated party who sends `Sec-Fetch-Site: same-origin` (or any non-`empty` `Sec-Fetch-Dest`) on a `GET /api/recordings/file/{id}` can stream any recording, given a recording ID. Recording IDs are `rec-<uuidv4>` (unguessable), so this is not a wide-open enumeration, but recording IDs are readable by every `isMember()` account via the `recordings` collection, and IDs may also leak through logs, share links, or browser history. The net effect: the "members only" intent of the recordings collection is downgraded to "anyone with the ID" for the actual audio bytes.

This is inherited from the `/api/drive/file` pattern, and the helper file itself flags the intended fix (a Firebase session-cookie check). It is called out here because v70-03 newly applied this weak pattern to a fresh collection that was *designed* to be band-internal (the firestore.rules comment stresses recordings are NOT public, unlike `tracks`).

**Recommended fix:** Implement the session-cookie auth the helper's S03 follow-up describes, or sign short-lived URLs for `<audio>` playback instead of relying on `Sec-Fetch-*`. Until then, document the residual risk; do not treat `recordings/file` as a true members-only boundary.

---

## P2 — Hardening / defense-in-depth

### [P2] Doc-import file uploads are size-capped but not type-validated before being fed to parsers

**Location:** `src/app/api/setlists/import/extract-document/route.ts:28-47`, `src/lib/setlist-import/extract-document.ts:66-99`

**Description:** `extract-document` checks `file.size` but does not reject by MIME type before handing the buffer to `extractDocumentText`. Format detection happens *inside* the lib via `detectDocumentFormat`, which trusts `file.type` then the filename extension; an unsupported file returns a clean `{ ok: false }`, so there is no crash. But a file the *attacker labels* `.pdf` / `.docx` (regardless of real content) is passed straight into `pdfjs.getDocument` / `mammoth.extractRawText`. Those are third-party parsers running on fully attacker-controlled bytes, with `maxDuration = 60` allowing a 60-second CPU window per request. Combined with the P1 finding (any authenticated user can call this), that is a denial-of-service / parser-exploit surface. There is also no page-count cap on PDFs — `extractPdfText` loops every page of a 25MB PDF.

**Recommended fix:** Reject early when `detectDocumentFormat(file.name, file.type)` is null (return 400 before buffering the whole file if possible). Add a PDF page-count ceiling in `extractPdfText`. Consider lowering `MAX_FILE_SIZE` for documents — 25MB of PDF is a lot of parser work.

### [P2] `commit-document` and `execute` validate `sections`/`tracks`/`items` as `z.array(z.any())` — server-side write content is effectively unvalidated

**Location:** `src/app/api/setlists/import/commit-document/route.ts:15-22`, `src/app/api/setlists/import/execute/route.ts:25-28`

**Description:** Both routes accept arbitrary array contents. `commit-document` casts `body.sections`/`body.tracks` to `SetlistSection[]` / `ResolvedTrack[]` and `execute` casts to `ParsedItem[]` with no runtime checks. `commitDocumentSetlist` → `flattenResolvedStructure` → `toSongInput` reads `track.title`, `track.key`, `track.vocalLead`, `track.referenceLink`, `track.libraryMatch.{fileId,name}` and writes them verbatim into Firestore `tracks/{id}` docs via the Admin SDK (which bypasses `firestore.rules`). A `band_leader` caller (the gate) can therefore:
- write arbitrary strings/objects into track fields — e.g. forge a `fileId` pointing at any `library_index` doc, or stuff oversized/garbage payloads;
- in `execute`, supply an `item.referenceLink` / `item.libraryMatchId` of any shape.
Exploitability is low because the route is `band_leader`-gated and band leaders are trusted, but "the payload is produced by our own resolve route" (the schema comment's justification) is a client-trust assumption — the client fully controls the body. Defense-in-depth is missing here.

**Recommended fix:** Replace `z.array(z.any())` with the real `SectionSchema` / a `ResolvedTrackSchema` (the shapes already exist in `extract-structure.ts` / `resolve.ts` — export and reuse them). Cap array length. This is cheap since the Zod types are already written.

### [P2] `execute` route fetches an attacker-supplied Google Drive URL server-side (SSRF-adjacent)

**Location:** `src/app/api/setlists/import/execute/route.ts:77-96`

**Description:** For each item with a `chartUrl`, the route extracts a Drive file ID via regex and `fetch()`es `https://drive.google.com/uc?export=download&id=...` server-side, then uploads the response to Storage. The regex constrains the host (the URL is hardcoded to `drive.google.com`, only the ID is interpolated, and the ID is `[a-zA-Z0-9-_]+`), so this is *not* arbitrary SSRF — good. Residual concerns: (1) the response is only checked for `content-type: application/pdf` and `driveRes.ok`, but the body is otherwise trusted and stored; (2) no size cap on the downloaded buffer — a large Drive file is buffered fully into memory and uploaded; (3) it is `band_leader`-gated so exploitability is low.

**Recommended fix:** Cap the downloaded buffer size (e.g. reject if `content-length` or streamed bytes exceed `MAX_FILE_SIZE`). Otherwise acceptable given the host constraint + role gate; noting for completeness.

### [P2] `recordings/upload` does not verify `songId` references a real song, and does not validate `notes`/`title` length

**Location:** `src/app/api/recordings/upload/route.ts:68-113`

**Description:** `songId` is taken from form data and written straight into the `recordings` doc as an FK with no existence check — a band leader can create recordings linked to non-existent song IDs (orphan records; the firestore.rules comment even calls `songId` an "optional FK"). `title` and `notes` are free-form strings with no length cap, written verbatim. Low severity — `band_leader`-gated, and a malformed `songId` only produces an orphan — but there is no input-shape discipline. Note this route also does not use `createApiHandler`'s `schema` option (it can't easily — multipart), so all field validation is manual and partial.

**Recommended fix:** Optionally verify `songId` exists in `songs/{id}` before write, or document that orphans are tolerated. Add length caps on `title` / `notes`.

---

## P3 — Minor / nice-to-have

### [P3] `extract-structure` returns raw Gemini output to the client on malformed results

**Location:** `src/app/api/setlists/import/extract-structure/route.ts:51-54`, `src/lib/setlist-import/extract-structure.ts:191-198`

**Description:** On a malformed/empty extraction the route returns `{ error, raw: result.raw }` where `raw` is the verbatim Gemini response. This is intentional ("so a human can review what the model produced") and the input was the user's own document, so no cross-user leakage. The only minor concern: `raw` could echo back model-fabricated content or, in an error path, fragments of the prompt structure. Negligible — flagged only for awareness.

**Recommended fix:** None required. Optionally truncate `raw` to a few KB.

### [P3] Drive-imported chart from `execute` is stored with `mimeType: 'application/pdf'` based only on a response header

**Location:** `src/app/api/setlists/import/execute/route.ts:87-112`

**Description:** The route trusts `driveRes.headers.get('content-type')` to decide the file is a PDF, then hardcodes `mimeType: 'application/pdf'` in the `library_index` entry and uploads with that content type. A Drive file serving a misleading `content-type` header would be stored mislabeled. Impact is cosmetic/rendering-only (no script execution path — PDFs are served `inline` and rendered by pdfjs), and the route is `band_leader`-gated.

**Recommended fix:** Optionally sniff the buffer's magic bytes (`%PDF-`) before trusting the header. Low priority.

---

## Notes on what is clean

- `firestore.rules` `recordings/{recordingId}` block is correct: `read: isMember()`, `create/update/delete: isSignedIn() && (isBandLeader() || isAdmin())` — mirrors the `songs` block, matches the documented intent, and the deny-all fallback covers the collection. No over-permissive rule.
- The `recordings` composite index (`songId ASC, createdAt DESC`) matches the client query in `recordings-client.ts` exactly — no security concern.
- `recordings/upload` correctly enforces `band_leader`/`admin` in the handler body (the route can't use the `role` option cleanly with multipart, so the manual check at line 51 is the right call), correctly caps size at 25MB, and validates audio MIME against an allowlist with a filename-extension backstop.
- `setlist-write.ts` `createSetlistServerSide` always sets `ownerId` from `ctx.auth.uid` at the call sites (`commit-document:46`, `execute:138`) — a caller **cannot forge `ownerId`**; it is never read from the request body. `updateSetlistServerSide` is metadata-only and explicitly does not touch `ownerId`. Good.
- `commit-document` is correctly `band_leader`-gated and rate-limited.
- Rate limiting is present on every v7.0 route (`upload` tier on the import + recordings-upload routes, `api` tier on recordings-file), keyed per-user via the JWT `sub` claim, and fails closed to an in-memory limiter.
- `firebase-storage.ts` recording helpers: `getRecordingStoragePath` strips leading dots and guards double extensions; `recordingId` is a server-generated `rec-<uuidv4>` (never client-controlled), and `downloadFromStoragePath` reads the exact `storagePath` stored on the doc — there is **no path-traversal vector** from filenames into the storage path.
- `library/upload` image-chart additions: `image/png`/`jpeg`/`heic`/`heif` added to `ALLOWED_TYPES` with a filename-regex backstop; HEIC is converted to JPEG server-side via `heic-convert` on validated-type input, size-capped at 25MB, behind `canUpload`/privileged-role check. No new injection surface from the image support.
- No secrets or other users' PII are logged or returned in the audited routes — log lines carry setlist IDs, recording IDs, titles, and the caller's own email/uid only.
