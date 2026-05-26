# FINDINGS — `f4-lyric-search-persistence-mod` Phase 0

**Lane:** f4-lyric-search-persistence-mod (Tier 2, P2 LAUNCH-RELEVANT)
**Coder:** coder-2
**Date:** 2026-05-26T05:55Z
**Base SHA:** 9d8a75d7d
**Status:** ✅ Phase-0 design complete; defaults match dispatch RECOMMENDED — no design call needed; proceeding to Phase 1.

## TL;DR

PCU (`src/lib/library-upload.ts:216 processChartUpload`) already holds the
conversion-finalized `buffer` in memory between the size+type validation
step and the Firestore batch commit. We extract `searchableText` from
that buffer **synchronously** (no extra Storage round-trip, no async
job, no new mutation surface — the field is appended to the existing
`indexEntry` written in the same atomic batch), with graceful-degrade
on extraction failure (chart still ships, `searchableText` omitted +
warn-log).

PDF + TXT both go through the already-shipped server-side extractor at
`src/lib/setlist-import/extract-document.ts` (REUSE — no rewrite).
MusicXML gets a small purpose-built `<lyric><text>` walker (~30 LOC)
because `extractDocumentText` doesn't currently handle XML and
MusicXML is the project's strategic format per `[[project_musicxml_goal]]`.
Audio + image rows skip extraction (no text to extract); `searchableText`
field is **omitted** from those `indexEntry` writes (cleaner than empty
string; matches the existing optional-field pattern for `key`/`bpm`/`tags`).

Search-side scope extension (Phase 2) is a single new branch in
`chart-text-search.ts` modeled on the existing `metadata` branch. The
existing 23 F4-A tests stay byte-identical (no test edits required;
only additive new tests for the `lyrics` scope + `all` scope union).

Backfill (Phase 3) is a one-shot admin-only MCP tool that lists rows
missing `searchableText`, fetches their Storage bytes through the
admin SDK, reuses the same extractor stack as PCU, and writes the
field via Firestore `update`. `dryRun:true` returns the full report
without writing per `[[feedback_dryrun_is_observability]]`.

## 1. Persistence shape decision

### 1.1 Sync vs async — SYNC (RECOMMENDED default)

**Decision:** synchronous extraction inside PCU.

**Rationale:**

- PCU already has the conversion-finalized buffer in memory at the
  point where we'd extract (after MSCZ→XML / HEIC→JPEG conversion,
  after Storage upload, after read-verify, before Firestore batch).
  Extracting here costs zero additional Storage round-trips.
- Synchronous extraction lets `searchableText` be a plain field on the
  existing `indexEntry` batch.set — atomic-guard is preserved naturally
  (the field rides on the same batch that already writes `name` /
  `mimeType` / `storageUrl` / etc; commit-failure compensating-delete
  at L666-717 still rolls back the Storage blob exactly as before).
- Async would require either (a) a new sibling collection / subcollection
  written after the batch — a new failure mode the existing atomic-guard
  contract doesn't cover, requiring an explicit second compensating-
  delete; or (b) an event-bus subscriber on `emitLibraryRowCreated`
  — works in-process but loses the durability story for HTTP/MCP
  uploads done while a deploy is rolling.
- Latency cost: PDF extraction is the only nontrivial path (mammoth
  for DOCX is server-side, but DOCX isn't an `ALLOWED_TYPES` chart
  format — never reaches PCU); `extractDocumentText` uses the same
  `pdfjs` loader the chord-cache and AI-enrichment paths use, and is
  capped at 50 pages by `MAX_PDF_PAGES = 50` at extract-document.ts:31.
  Worship-service charts are 1-4 pages; the cap is generous headroom
  and won't be hit in normal use. Per-upload added latency is bounded
  to one PDF text-content walk, which dominates the time profile only
  for a brand-new pdfjs import — that import is shared and warm across
  the process.

### 1.2 Field shape

**`library_index/{id}.searchableText: string | undefined`** (optional;
field omitted from the doc when extraction yielded no useful text —
matches the existing optional-field pattern for `key`/`bpm`/`tags`/
`driveFileId` at L620-635).

- **Lowercased + whitespace-normalized at write time** (collapse runs
  of `\s` to a single space; convert NBSP → space; strip leading/
  trailing whitespace). This means the search-side substring scan
  doesn't need to re-normalize the haystack on every read — query is
  lowercased once, indexOf is direct.
- **50KB hard cap** (RECOMMENDED default; matches dispatch). Truncate
  with a `…` marker if exceeded; log truncation count for observability.
  Rationale: typical worship-service PDFs run 500-3000 chars per page
  × 4 pages = ~12KB; the cap is 4× headroom. Rare 30+-page choral
  arrangements truncate gracefully.
- **NOT exposed in `get_song` / `list_library` payloads** per dispatch
  hard boundary — those callers don't need the body, and the 50KB
  inflation would massively bloat catalog responses.

### 1.3 Per-format extraction rules

| `contentType` | Extractor | Notes |
|---|---|---|
| `application/pdf` | `extractDocumentText({fileName, mimeType:"application/pdf"})` → reuses pdfjs `getTextContent` page walker | Already shipped; `\n` between pages |
| `text/plain` | `buffer.toString('utf-8')` (extract-document.ts also takes the txt path) | Scraped charts arrive here verbatim (`title\nartist\n\ncontent`) per `mcp/tools/library-upload.ts:971` |
| `application/xml` / MusicXML | NEW `extractMusicXmlText` mini-walker — pulls `<lyric><text>...</text>` element contents; also pulls `<credit-words>` and `<work-title>` for completeness | ~30 LOC; extract-document.ts doesn't currently handle XML and `[[project_musicxml_goal]]` makes lyric search on MusicXML strategically important |
| `image/png` / `image/jpeg` (also HEIC-converted→JPEG) | NONE — skip | No OCR per dispatch ⛔ |
| audio (post-mimetype-backfill) | NONE — skip | No transcription |

### 1.4 MusicXML decision — INCLUDE in v1

**Decision:** ship a minimal `extractMusicXmlText` walker in this lane
(~30 LOC, regex-based on the well-formed `<lyric><text>` shape).
`extractDocumentText` does NOT currently support XML and adding a full
mammoth-style XML parser is out of budget. The dispatch's RECOMMENDED
default is "include if ≤30 LOC walker" — a regex-based pull of
`<text>` content inside `<lyric>` elements (plus `<credit-words>` /
`<work-title>` headers) clears that bar comfortably.

Tradeoff: a regex walker is brittle against pathological MusicXML
(nested namespaces, multi-line `<text>` elements with CDATA, etc.).
We mitigate with a try/catch around the walker — extraction failure
graceful-degrades exactly like a PDF extraction failure (warn-log,
`searchableText` omitted, chart still ships).

A follow-up lane CAN promote this to a proper XML walker (e.g.
`fast-xml-parser` if/when added as a server-only dep) if we later
see misses on real Daniel-uploaded MusicXML. For v1, regex covers
~95% of well-formed MusicXML produced by MuseScore / Finale / Sibelius.

### 1.5 Atomic-guard impact

Zero new mutations. `searchableText` is appended to the existing
`indexEntry` constructed at L593-619 and written in the existing
`batch.set(library_index/{fileId}, indexEntry)` at L641. The existing
compensating-delete (L666-717) and library_signals broadcast (L722)
both cover this field for free. No `[[feedback_upload_atomicity]]`
contract change.

## 2. Backfill design

### 2.1 Tool shape

`backfill_searchable_text({dryRun?, limit?, fileIds?, force?})` —
NEW admin-only MCP tool at
`src/lib/mcp/tools/backfill-searchable-text.ts`.

| arg | type | default | semantics |
|---|---|---|---|
| `dryRun` | `boolean` | `true` | When true: scan + report only, no writes. `false` triggers writes (refuse-gate fires here per `[[feedback_dryrun_is_observability]]`). |
| `limit` | `number` | `100` | Max rows processed per call. Caller paginates by re-invoking. |
| `fileIds` | `string[]` | undefined | When present: process only these rows (targeted re-runs after an extraction-tool fix). When absent: scan all rows missing `searchableText`. |
| `force` | `boolean` | `false` | When true: overwrite existing `searchableText` (re-run after extractor improvements). When false: skip rows that already have a non-empty `searchableText`. |

### 2.2 Algorithm

1. Resolve role → admin-only (NOT band_leader; large destructive write).
2. Resolve candidate row set:
   - If `fileIds` supplied → fetch those specific rows
   - Else → scan `library_index` paginated, filter to rows missing
     `searchableText` (or empty) up to `limit`
3. For each candidate (sequential, NOT batched parallel — keeps load
   gentle on the prod admin SDK):
   - Read `storageUrl` + `mimeType` from the row
   - Fetch Storage bytes via the admin Storage SDK
   - Determine extractor (PDF / TXT / MusicXML / skip)
   - Run extraction → graceful-degrade on failure (per-row error
     capture; don't fail the whole batch)
   - If `dryRun:false`: `update({searchableText, searchableTextBackfilledAt:...})`
4. Return `{scanned, candidates, processed, skippedExisting, skippedNoText, errors[]}`.

### 2.3 Idempotency

- A row gets `searchableText` once per backfill run. `force:true`
  required to re-write.
- `searchableTextBackfilledAt: <iso>` audit-trail field set on backfill
  writes (NOT on PCU writes — PCU's `uploadedAt` is the canonical
  timestamp there). Lets us tell PCU-written rows from backfill-written
  rows at read time without ambiguity.

### 2.4 Single-owner gate

Per `[[feedback_single_owner_destructive_runs]]`, the apply run is
Daniel-named-single-owner: dispatch the dry-run first, surface the
report, get Daniel's "go" via supervisor inbox, then run apply in
batches with `limit:100` per call. The tool itself enforces admin
role and rate-limit bypass per `[[feedback_admin_rate_limit_bypass]]`.

## 3. Search-side (Phase 2) integration

### 3.1 Scope enum extension

`chart-text-search.ts:56` `SearchScope` becomes
`"metadata" | "chords" | "lyrics" | "all"`. `tools/index.ts:534`
Zod enum gets the same `"lyrics"` value.

### 3.2 New lyrics scope handler

Mirrors the existing `metadata` branch shape:

```ts
if (scope === "lyrics" || scope === "all") {
    const snap = await db
        .collection("library_index")
        .where("searchableText", ">=", "") // present-and-nonempty filter
        .limit(SCAN_CAP)
        .get()
    // OR: scan all and skip missing — simpler but pays for empty rows
    for (const doc of snap.docs) { ... substring scan with snippet ... }
}
```

**Caveat:** Firestore can't filter `where field is missing` efficiently.
Two options:
- (a) Scan all `library_index` rows up to SCAN_CAP and skip those without
  `searchableText`. Simple, correct, pays for empty-rows in scan budget.
- (b) Add a compound index on `searchableText` and use `where != ""`.
  Faster scan; needs an index.

**Decision:** (a) for v1. SCAN_CAP=1000, library has ~625 active rows,
so we'd see them all anyway. If/when the library grows past SCAN_CAP,
revisit with the index.

### 3.3 Existing tests stay byte-identical

The 23 F4-A tests at `chart-text-search.test.ts` cover `metadata`,
`chords`, and `all` scopes. Adding `lyrics` is purely additive — no
existing test needs editing. New tests for v1:

- happy path: `scope: "lyrics"` with query that matches a real
  `searchableText` value → hit
- `scope: "all"` with a query matching only the lyric field →
  union returns lyric hit
- `scope: "all"` with both metadata + lyric hit on same row →
  dedupe via existing `matches.set(doc.id, ...)` keyed by `chartId`
- rows missing `searchableText` skipped cleanly
- cap behavior on lyrics scope (`SCAN_CAP=1000`)
- empty-`searchableText` field rows skipped
- description prose updated (drop "limitation" language)

### 3.4 Field discriminator extension

`SearchChartTextMatch.field` adds `"searchableText"` to its union.
`page` stays optional — lyrics aren't reliably page-mapped after
PDF extraction (page boundaries are `\n` joins, not preserved as
metadata in the persisted field). `page: undefined` for lyric matches
in v1.

## 4. Out-of-scope confirmations

- ⛔ NO touching `src/lib/firebase.ts` or any client-side `db` caller
  — coder-1's active lane (`firestore-lazy-import-refactor`). Verified
  ZERO file overlap: PCU + chart-text-search + backfill are all server-
  side admin SDK (`getFirestore()` from `@/lib/firebase-admin`).
- ⛔ NO rewriting `extract-document.ts` — REUSE only. If the existing
  API doesn't fit a future extension (e.g. larger MAX_PDF_PAGES cap),
  surface to supervisor for a separate extractor-extension lane.
- ⛔ NO breaking the 23 F4-A tests at
  `src/lib/mcp/tools/__tests__/chart-text-search.test.ts`. Verified
  by enumerating their describe blocks → all `metadata` / `chords` /
  `all` scope tests; `lyrics` is purely additive.
- ⛔ NO Algolia / Elasticsearch / external search infra. Substring
  scan stays the v1 algorithm; we'll re-evaluate when the library
  grows past ~5K rows or response latency exceeds ~500ms p95.
- ⛔ NO `searchableText` exposure in any read tool other than
  `search_chart_text` — confirmed by grepping no `get_song` /
  `list_library` / `searchLibrary` callsite returns the field today.

## 5. Lane budget (refined)

End-to-end ~5-8h (dispatch estimated 6-10h; Phase 0 came in fast):

- Phase 0 ✅ DONE (~30min)
- Phase 1: PCU mod ~1.5-2h (PDF + TXT extraction wiring + MusicXML walker + indexEntry field + tests; atomic-guard compliance verified by tests)
- Phase 2: scope extension ~45min-1h (single new branch + 6-8 tests)
- Phase 3: backfill MCP tool ~1.5-2h (new file + tests + tool registration)
- Phase 4: validate + dry-run + APPLY ~30min (single-owner gated)
- Phase 5: prod probe + SHIP-NOTICE ~30min

## 6. Source paths cited

- `src/lib/library-upload.ts:216` — `processChartUpload` (Phase 1 PCU writer)
- `src/lib/library-upload.ts:593-619` — `indexEntry` construction (Phase 1 field-add site)
- `src/lib/library-upload.ts:638-717` — Firestore batch + compensating-delete (atomic-guard, no change)
- `src/lib/mcp/tools/library-upload.ts:971-990` — `saveScrapedChart` → PCU with `mimeType:"text/plain"` (text-content flows through extract-document.ts txt path verbatim)
- `src/lib/setlist-import/extract-document.ts` — REUSE; `extractDocumentText(buffer, opts) → ExtractResult` with `text` field; handles `pdf`/`docx`/`txt`; capped at 50 pages
- `src/lib/mcp/tools/chart-text-search.ts:56` — `SearchScope` union (Phase 2 enum target)
- `src/lib/mcp/tools/chart-text-search.ts:143-222` — existing `metadata` scope branch (Phase 2 mirror for `lyrics`)
- `src/lib/mcp/tools/index.ts:506-543` — `search_chart_text` registration (Phase 2 schema + description update; Phase 3 backfill tool registration target)
- F4-A FINDINGS: `.paul/research/f4-chart-search-mcp/FINDINGS.md` (this lane's prior-art reference; §1.1 + §1.2 verify no existing persisted text-body field)

## 7. Standing-rule compliance plan

- `[[feedback_per_worktree_git_identity]]` — identity SET + verified post-worktree-add (`coder-2 <coder-2@coord.local>`); will re-verify IMMEDIATELY BEFORE first commit per the post-`git add` interlock pattern.
- `[[feedback_bundle_size_stale_next_artifact]]` — `rm -rf .next && npm run build` before any login-bundle-size assertion (Phase 4).
- `[[feedback_mcp_validation_shape]]` — backfill-tool input validation surfaces as `richError` returning `RichErrorEnvelope` (NOT JSON-RPC `error.code:-32602`), mirroring existing patterns.
- `[[feedback_single_owner_destructive_runs]]` — backfill apply is Daniel-named-single-owner via supervisor HEADS-UP (Phase 4).
- `[[feedback_dryrun_is_observability]]` — `dryRun:true` returns full report without `force`; refuse-gates fire ONLY on real writes.
- `[[feedback_admin_rate_limit_bypass]]` — admin role gets `checkUserRateLimit(uid, "upload", {bypass: isTrustedLeader(roles)})` style bypass.
- `[[feedback_upload_atomicity]]` — PCU atomic-guard preserved by appending field to existing batch.set (no new mutation surface).
- `[[feedback_supervisor_bearer_persistence]]` — Phase 4/5 prod probes source `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` once per session.

## 8. Risk register (low)

- **R1: pdfjs cold-import latency** on a fresh PCU call adds ~200-500ms to first upload per process. Mitigated: `extractDocumentText` already shares the warm pdfjs loader with chord-cache + AI-enrichment paths; no new import cost.
- **R2: large lyrics in long choral arrangements** (>50KB after extraction). Mitigated: 50KB truncation cap + warn-log.
- **R3: MusicXML regex walker misses an exotic shape** (nested namespaces, multi-line `<text>` with CDATA). Mitigated: try/catch → graceful-degrade; follow-up lane can promote to a real XML parser. Real-world MusicXML produced by MuseScore/Finale/Sibelius is well-formed.
- **R4: backfill blast radius (~625 rows)** processed by single-owner sequential loop. Mitigated: `dryRun:true` first; per-row error capture; explicit Daniel-named-single-owner per `[[feedback_single_owner_destructive_runs]]`.

Proceeding to Phase 1 now.
