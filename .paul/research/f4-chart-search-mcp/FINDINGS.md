# FINDINGS — `f4-chart-search-mcp` Phase 0

**Lane:** f4-chart-search-mcp (Tier 1, P3)
**Coder:** coder-3
**Date:** 2026-05-26T03:00Z
**Status:** ⚠️ **BLOCKED — dispatch assumptions about text-body persistence do not hold; supervisor rescope ruling required before Phase 1.**

## TL;DR

The dispatch assumes `library_index/{id}.textBody` (or similar) exists,
populated at upload time. **It does not.** No persistent full-text body
field for chart content exists anywhere in Firestore. Chart bodies live
in Firebase Storage as binary/text files; text extraction is a runtime
operation (pdfjs `getTextContent`) used by setlist-import and chord-
detection — never persisted as a searchable string.

The example query the dispatch motivates ("find me the chart that has
the line 'Hineh ma tov'") **cannot be answered against persisted state**
under the v1 hard boundary "NO modifying the text-extraction pipeline —
read existing fields."

A stale HTTP endpoint at `src/app/api/library/search-content/route.ts`
already attempts substring search against `chordData.rawText` +
`chordData.sections[].label` + `chordData.chords[].name` — **all three
fields are never written**. The route returns empty for any non-trivial
query against production data. (See §3.)

## 1. Persistence surfaces probed

### 1.1 `library_index/{fileId}` document

Writers: `src/lib/library-upload.ts` `processChartUpload` L600-619.

Fields written (full list, from indexEntry construction):

```
id, rowId, fileId, source, driveMetadata?, nameLower, title, mimeType,
sizeBytes, collection, subfolder?, storagePath, contentHash, uploaderUid,
uploaderEmail, uploadedAt, modifiedTime, storageUrl, status,
enrichmentStatus, originalName, fileSize, uploadedBy, key?, bpm?, tags?,
originalStorageUrl?, sourceFormat?, driveFileId?, driveModifiedTime?,
driveMd5?, driveParents?
```

Later writers (post-enrichment, AI subscriber): `aiSuggestion: EnrichmentOutput`.

**No `textBody`, `text`, `rawText`, `lyrics`, `content`, `searchableText`,
`extractedText`, or any other body-content field is ever written to
`library_index/{id}`.**

Verified against production: queried `library_index/012dd661-f451-444c-88fb-11d589028908`
("T'Filat Haderech (Friedman).pdf") via Firebase MCP — full doc field
list matches the writer enumeration exactly; no body field present.

### 1.2 `library_index/{fileId}/chordData/page_<n>` subcollection

Writers:
- `src/app/api/library/chord-cache/route.ts` POST (browser client path) — writes:
  ```ts
  {
    chords: [{text, originalText, x, y, w?, h?, pxHeight?, source}],
    scannedAt, scanMethod, aiValidated, cacheVersion
  }
  ```
- `src/lib/print-pipeline.ts` `cacheChords` L166-189 (server print path) — writes:
  ```ts
  {
    chords: [{text, originalText, x, y, w, h}],
    scannedAt, scanMethod: 'textLayer', cacheVersion: 5
  }
  ```

**Both writers persist only chord SYMBOLS** (`"Em7"`, `"G/B"`, `"Am"`,
`"C"`) extracted from the PDF text layer's chord-shaped tokens. Lyrics,
section labels, and raw page text are **not persisted**.

Verified against production: queried `library_index/000cc80a-…/chordData`
collection → **empty** for that doc. Most library docs likely have no
`chordData` at all (cache is populated lazily on first PDFOverlay
render; many catalogue charts have never been opened).

### 1.3 `songs/{fileId}` document (catalog mirror)

Fields: `title, normalizedTitle, status, updatedAt, defaults.{key,bpm,leadMusician}`.
**No body content.**

### 1.4 Scraped charts (`.txt`)

`save_scraped_chart` packages `title\nartist\n\ncontent` as a `.txt`
file in Firebase Storage at `library/{fileId}.txt`. The TEXT IS the file
body — but it's stored in Storage, NOT mirrored to a Firestore field.
Searching it requires either streaming the blob at query time
(expensive) or persisting a copy to Firestore at upload time
(pipeline modification).

### 1.5 `aiSuggestion` blob on `library_index`

Free-text fields:
- `suggested_title` (string|null) — typically the canonical display title
- `suggested_lead` (string|null) — vocal lead name
- `suggested_tags` (string[]) — kebab-case e.g. `'friday-evening'`
- `concerns` (string[]) — AI's free-form prose notes for human reviewer
- `duplicate_candidates` (string[]) — fileId references

**This is the only persistent free-text surface that goes beyond title
+ key + lead.** `concerns[]` can carry sentences like "handwriting
illegible, possibly D minor; second page may be a different song" — but
it's reviewer-notes, not chart body content.

## 2. Runtime extraction surfaces (NOT persisted)

These exist as runtime helpers; their outputs are consumed in-flight and
never written to Firestore as searchable strings:

- **`src/lib/setlist-import/extract-document.ts`** — PDF text extraction
  via pdfjs `getTextContent`; consumed by setlist-import row inference;
  never persisted as a body field.
- **`src/lib/pdf-chord-extractor.ts`** — PDF text-layer scan filtered to
  chord-shaped tokens; output cached as `chordData.chords[]` (symbols
  only, per §1.2).
- **`src/lib/library/ai-enrichment.ts`** — sends the first ~N bytes of
  file content to Gemini for enrichment; Gemini returns the structured
  `EnrichmentOutput` (§1.5); the file content itself is never persisted
  back into Firestore.

Touching any of these falls under the dispatch's hard boundary:
"NO modifying the text-extraction pipeline — read existing fields."

## 3. `/api/library/search-content` — existing broken endpoint

`src/app/api/library/search-content/route.ts` (auth-gated; existing
deployed surface) already attempts the exact pattern F4 dispatch
describes:

```ts
const chordGroupSnap = await db.collectionGroup('chordData').limit(2000).get()
// ...
const searchableFields = [
    data.rawText,                                       // ← never written
    ...(data.chords || []).map((c) => c.name),          // ← chords have .text, not .name
    ...(data.sections || []).map((s) => s.label),       // ← sections never written
].filter(Boolean)
```

**Three independent field-name bugs.** None of `rawText`, `chords[].name`,
`sections[].label` are ever persisted by the two `chordData` writers
(§1.2). The route returns empty for any non-trivial query against the
production corpus — it's been silently broken since whenever it
shipped.

This means there is **no functional in-app full-text search today** for
Daniel + David to compare a new MCP tool against. The lane essentially
needs to define what "full-text chart search" *means* given persisted
state, then deliver it.

## 4. What CAN be searched against persisted state (no pipeline mods)

If we hold the v1 hard boundary firm, the searchable text-surface is:

| field | source doc | content shape | useful for |
|---|---|---|---|
| `title` | library_index | "Hashkivenu (Klepper-Freelander)" | author-known title (already covered by `search_library`) |
| `nameLower` / `normalizedName` | library_index | filename-derived | dedup keys (already covered) |
| `aiSuggestion.suggested_title` | library_index | AI's proposed canonical | gap-fill when title differs from filename |
| `aiSuggestion.suggested_lead` | library_index | "Rabbi Daniel" / null | finding charts annotated for a person |
| `aiSuggestion.suggested_tags` | library_index | `['friday-evening', 'frankel']` | thematic browsing |
| `aiSuggestion.concerns` | library_index | "second page may be different song" | AI's prose notes for reviewer |
| `chordData.chords[].text` (collectionGroup) | per-page subcoll | `"Em7"`, `"G/B"`, etc. | "find charts that use this chord progression" — narrow but real |

**Lyric search is NOT possible** without pipeline modification.

## 5. Three rescope options for supervisor

### Option A — Rescope to persisted text only

Build `search_chart_text({query, limit?, includeSnippets?, scope?})` that
searches the union of fields in §4. `scope` distinguishes:
- `metadata` (default): title + nameLower + aiSuggestion fields
- `chords`: chord-symbol search via `chordData.chords[].text` collectionGroup
- `all`: both

Snippet extraction works for the `concerns[]` and chord-text contexts.
Honest answer for Daniel: "this finds charts by chord progressions,
canonical title aliases, vocal-lead annotations, AI concern notes, and
tags — it does NOT search lyrics, because lyrics aren't indexed."

Bonus: also closes the broken `/api/library/search-content` route by
shipping the MCP equivalent (the HTTP route can be deleted or rewired to
proxy to the new MCP impl).

**Estimated effort:** ~120-180 LOC src + ~80 LOC tests. Stays within
the dispatch's stated scope/budget. **Does NOT modify text-extraction
pipeline.**

### Option B — Extend persistence (pipeline mod, scope expansion)

Add a `searchableText` field to `library_index/{id}` (or a sibling
`library_text_blobs/{id}` collection) populated at PCU time by reusing
the existing `extract-document.ts` PDF text extraction (and reading
scraped `.txt` Storage content for the scrape path). Then build the
substring scanner against that field.

**ENABLES lyric search.** **VIOLATES the v1 hard boundary** "NO
modifying the text-extraction pipeline" — but in a additive,
backward-compatible way (existing callers unaffected).

**Estimated effort:** ~180-300 LOC src + ~120 LOC tests, plus a
backfill MCP for existing ~750 library_index rows (~80 LOC + ~40 LOC
tests). Tier could justifiably bump to Tier 2 given the new persistence
shape and the backfill blast radius.

### Option C — Streaming probe (no persistence, expensive per-call)

Build `search_chart_text` that streams Storage bytes at query time and
runs pdfjs/textBody extraction in-handler. Caps at `limit:5` and
~30s budget per call.

**Possible but ergonomically bad.** Single MCP call could hit 50 PDFs
× ~200KB each = ~10MB transfer + ~50× pdfjs init. Latency probably
unacceptable for Claude-Desktop UX.

Not recommended; surfaced only for completeness.

## 6. Recommendation

**Option A.** It honors the v1 hard boundary, matches the dispatched
scope/effort budget, ships a useful tool (chord-symbol search alone
is novel — Daniel + David don't have that today), and incidentally
closes the broken HTTP route. The "no lyric search" gap is honest and
sets up Option B as a clean future lane if Daniel wants it.

Awaiting supervisor ruling on which option to pursue in Phase 1.

## 7. Source paths cited

- `src/lib/library-upload.ts` — `processChartUpload` writer (no body field)
- `src/lib/mcp/tools/library-upload.ts` — `saveScrapedChart` (file content → Storage `.txt`, not Firestore)
- `src/lib/mcp/tools/library.ts:324` — existing `searchLibrary` (title+key+bpm search)
- `src/app/api/library/chord-cache/route.ts` POST — chordData writer
- `src/lib/print-pipeline.ts:166` — `cacheChords` server writer
- `src/app/api/library/search-content/route.ts` — broken HTTP endpoint (§3)
- `src/lib/library/ai-enrichment.ts:125` — `EnrichmentOutputSchema`
- `src/lib/setlist-import/extract-document.ts:69` — runtime PDF text extraction
- `src/lib/pdf-chord-extractor.ts` — runtime PDF chord extraction
- Production probe: `library_index/012dd661-f451-444c-88fb-11d589028908` field listing via Firebase MCP
- Production probe: `library_index/000cc80a-…/chordData` empty
