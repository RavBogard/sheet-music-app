# Liturgy-Aware Service Outlines — Design Spec

**Date:** 2026-08-30
**Status:** Approved by Daniel (design walkthrough, sections 1–5, this date)
**Scope:** sheet-music-app (primary); shireishabbat / shirei-tshuvah-web (Phase 5 only, under that repo's own protocol)
**Approach chosen:** "Enrich the setlist" — the setlist IS the outline. Rejected: separate outline entity (sync tax forever); prose-only page numbers in notes (nothing compounds).

---

## 1. Purpose

One service outline, authored once through Claude/MCP (Daniel's native authoring surface), projected into role lenses:

- **Rabbi lens (primary deliverable):** a printed one-to-two-page sheet on the shtender — full service order, page numbers in *that day's book*, honors ("Rachel Cohen — birthday, candle lighting"), performer cues, reading body text. No charts/keys/BPM.
- **Musician lens:** Perform mode as it exists today (charts, keys, leads). Zero day-one change for musicians.

"That day's book" is a per-service selection; a service is in exactly one book. Today every Shabbat uses the legacy CRC siddurim; the new Shirei volumes (incl. the RH machzor Shirei Tshuvah) are feed-backed and coming into use.

## 2. Ground truth this design stands on

### 2.1 sheet-music-app (verified 2026-08-30 via origin/master)

- `SetlistTrack` already has `type: 'song'|'header'|'reading'|'prayer'|'transition'|'note'`, plus `performer` ("Rabbi/Cantor/Congregation/Band"), `description` (body text for readings/prayers), `estimatedMinutes` — all in `src/types/models.ts`, all rendered by `src/components/performance/ServiceFlowCard.tsx`. The outline concept is ~70% present.
- **Gap A:** the MCP write tools cannot set `performer`/`description`/`estimatedMinutes`. Schemas: `src/lib/mcp/tools/index.ts` (`add_track_to_setlist` ~L963–1013, `bulk_add_tracks` ~L1015+, `updateTrackPatchSchema` L211–221, `bulkTrackPatchSchema` L202–209, propose/commit L1353–1455); handlers in `src/lib/mcp/tools/setlist-write.ts` (`AddTrackArgs` ~L261–283) and `src/lib/mcp/server-tracks-write.ts` (`UpdateTrackPatch` L400–413, `BulkAddTrackInput` L1429–1441). Current reachable fields: `songId, title, type, key, bpm, leadMusician, referenceLink, notes, position, force` only. Note pre-existing drift: `update_track` accepts `position`, bulk does not.
- **Gap B:** no external-book reference exists. The existing `SetlistTrack.pageNumber` field means "page of the bonded PDF chart", is functionally inert on the live path (written only by the code-template engine in `src/lib/liturgical-templates.ts`, read only by admin `TemplateEditor.tsx`). **Do not reuse or rename it.**
- **Gap C:** no per-role view. `SetlistPerformClient.tsx` branches on role only for library hydration.
- Two template systems: code-defined `src/lib/liturgical-templates.ts` (TemplateSlot has `performer`/`pageNumber`/`onlyFor` rabbi variants) and the MCP-facing Firestore `setlistTemplates` collection (`src/lib/mcp/tools/templates.ts`, `TemplateTrack` + `COPYABLE_TRACK_FIELDS` L57–83 — currently `type, title, key, bpm, leadMusician, referenceLink, notes, songId, fileId, fileName` only).
- `generate_gig_packet` (`src/lib/mcp/tools/index.ts` ~L3018–3034): merges bonded charts to one PDF, returns 10-min signed Storage URL + `sizeBytes/pageCount/storagePath`; 20MB cap → `packet_too_large`. This is the delivery pattern the rabbi sheet reuses.
- Setlists are lazily hydrated (`Setlist.hydrated`; legacy embedded `tracks[]` vs top-level `tracks/{id}` docs) — new fields must work on the hydrated top-level path.

### 2.2 shireishabbat (C:\Users\dsbog\shireishabbat) + shirei-tshuvah-web

- Typst pipeline emits per-volume JSON feeds: `dist/<slug>-feed.json`, schema `build/schema/feed.schema.json` (`schemaVersion: 1`), generator `build/tools/extract_feed.py`, index `dist/feeds.json`.
- Feed units carry stable IDs (AR-3 format `<section>.<unit>@<occasion>-<service>`, e.g. `shma.mi-chamocha@rh-shacharit`), `name`, `section`, `caption`, `folios[]` (printed page numbers); plus top-level `pageIndex` mapping printed folio → `{unit, block}`.
- Three feed-backed books: `shabbat-maariv` (Friday night, 76pp), `shabbat-shacharit` (151pp), `shirei-tshuvah` (RH machzor ~202pp).
- Legacy CRC siddurim are mid-intake there with **no stable IDs yet**. Public PDFs:
  - Friday (48pp, 2019): https://www.centralreform.org/wp-content/uploads/Friday-Siddur.pdf
  - Saturday (54pp, 2019): https://www.centralreform.org/wp-content/uploads/Saturday-Siddur.pdf
- Reader webapp: separate private repo `C:\Users\dsbog\shirei-tshuvah-web` (static `index.html` + `app-feed.json`), live public at https://shirei-tshuvah-web.vercel.app (RH-morning subset). **No URL deep-linking yet**; units render as `<article id="u-<unit-id>" data-folio>`. Its own `PLAN-WEBAPP-V2-2026-08-30.md` already anticipates unit-id nav state.
- **Binding for Phase 5:** shireishabbat/CLAUDE.md two-surface protocol (Cowork writes specs only; Code makes all edits + git), unconditional stop on anchor mismatch, subagent model policy, 5-state status vocabulary.

## 3. Data model (Section 1 — approved)

### 3.1 `Setlist` additions

```ts
/** Book registry slug for the book used at this service (one book per service).
 *  Optional — setlists without a book behave exactly as today. */
book?: string; // 'crc-friday' | 'crc-saturday' | 'shabbat-maariv' | 'shabbat-shacharit' | 'shirei-tshuvah'
```

### 3.2 `SetlistTrack` additions

```ts
/** Reference into a liturgy book: "this moment is on p. <folio> of <book>". */
liturgyRef?: {
  book: string;      // registry slug; denormalized (usually = setlist.book) so rows survive copying and odd out-of-book rows are possible
  unitId?: string;   // AR-3 stable unit id — present only for feed-tier books; enables durable refs + future deep links
  folio: number;     // printed page number, ALWAYS present, resolved and written at AUTHORING time
};

/** Named congregants honored at this moment. Free-text names (no contact linkage — YAGNI). */
honors?: Array<{ name: string; note?: string }>; // e.g. {name:'Rachel Cohen', note:'birthday — candle lighting'}
```

### 3.3 Invariants

- `folio` is stored, never resolved at render time — nothing downstream depends on shireishabbat availability.
- Existing `pageNumber` keeps its current (chart-PDF) meaning; untouched.
- All new fields optional → zero migration, zero behavior change for existing setlists. Consistent with the standing "err public, never gate" policy — nothing here gates anything.
- Honors attach to tracks (moments); a service-wide honor sits on a header row.

## 4. Book registry & page maps (Section 2 — approved)

### 4.1 Location & shape

Static JSON in-repo (deliberate: book data changes rarely, deserves a git diff + deploy, must never add a runtime cross-repo fetch):

- `src/data/books/registry.json` — array of `{ slug, title, tier: 'feed'|'pagemap', pages, source }`
- `src/data/books/<slug>.json` — one file per book

### 4.2 Tier 1 — feed-backed (`shabbat-maariv`, `shabbat-shacharit`, `shirei-tshuvah`)

Book file = **trimmed snapshot** of the shireishabbat feed: units as `{id, name, folios[]}` (+ section/caption if cheap), plus `pageIndex`. Full feeds are ~25k lines with block text; the outline layer needs only unit → pages.

Sync script `npm run sync:books`: reads `C:\Users\dsbog\shireishabbat\dist\*-feed.json`, validates `schemaVersion === 1`, writes trimmed snapshots. Re-run manually when a new book build changes pagination. Snapshot-in-git = RH services keep working even if feeds move/break; **no work inside shireishabbat needed for Phases 1–4** (two-surface protocol untriggered).

### 4.3 Tier 2 — page-map (`crc-friday` 48pp, `crc-saturday` 54pp)

Hand-verified JSON entries: `{ name, aliases[], page }` — aliases cover transliteration variants + Hebrew ("Mi Chamocha"/"Mi Khamokha"/"מי כמוך"). Built once by a subagent reading the two public PDFs above; **delivered to Daniel as a one-page checklist to eyeball against the printed books BEFORE commit** (a wrong page number on the shtender is the unaffordable failure mode; the map gets human eyes once, then is trusted). Entries later gain `unitId` when the legacy Typst intake completes (Phase 6) — additive upgrade, same file shape, nothing downstream changes.

### 4.4 Lookup behavior (authoring time)

Claude resolves a title against that day's book — feed tier by unit match, pagemap tier by name/alias match — and writes the folio into the track. Ambiguity follows the existing bond-confidence pattern: high confidence commits; low confidence + multiple candidates → stop and ask; medium → commit but surface in the proposal summary.

## 5. MCP surface (Section 3 — approved)

### 5.1 Widen existing write tools (no new authoring verbs)

`add_track_to_setlist`, `bulk_add_tracks`, `update_track`, `bulk_update_tracks`, `propose_setlist_changes`→`commit_staged_changes` all gain: `performer`, `description`, `estimatedMinutes`, `liturgyRef`, `honors`. `create_setlist` and `update_setlist` gain `book`.

Implementation requirement: **one shared Zod fragment** consumed by all five schemas so they cannot drift (they already have — `position` asymmetry noted in §2.1). Staging path (propose/commit) must carry the full new field set through proposals.

### 5.2 New read tools

- `list_books` — registry contents: slugs, titles, tiers, page counts.
- `lookup_book_page` — input `{book, query}` → matching entries `{name, page(s), unitId?, confidence}`. Powers effortless authoring; low-confidence matches surface to Daniel per §4.4.

### 5.3 Validation on write

`liturgyRef` validated against the registry: unknown slug → reject; folio outside book page range → reject; `unitId` (when present) must exist in the book snapshot. Errors surface as `result.isError: true` with content prose — **never** JSON-RPC `error.code: -32602` (standing F-02 rule). Purpose: a hallucinated page number must never reach the shtender.

### 5.4 Templates

Firestore `setlistTemplates` `TemplateTrack`/`COPYABLE_TRACK_FIELDS` widen to carry `performer`, `description`, `estimatedMinutes`, `liturgyRef` — "clone last week's Friday night" brings the outline structure (the actual weekly motion). **Honors deliberately do NOT copy** through templates or `clone_setlist` — they are per-service by nature.

### 5.5 Deferred by design

No MCP tool edits the registry (git-managed data; changes deploy). No generate verb here (see §6).

## 6. Rabbi sheet (Section 4 — approved)

**New MCP tool `generate_service_sheet`** — input `{setlistId}`, output print-ready PDF via 10-minute signed Storage URL (same mechanics/plumbing as `generate_gig_packet`).

Content:
- **Header:** service name, date (+ Hebrew date), leading rabbi, book display name, **honors summary box** (every honor in one glance).
- **Order — one dense row per moment, all row types including songs:** title · **page number big and right-aligned** (the field the eye hunts for mid-service) · performer cue · inline honor ("→ Rachel Cohen — birthday, candles") · vocal lead where relevant. `header` rows render as visual dividers, not rows.
- Readings/prayers with `description` print body text in small type under the row.
- **Format:** one page if it fits, max two; generous type (lectern distance, standing, performance conditions). No cover art; max-density text (house style).
- **Absent by design:** charts, keys, BPM, transpositions (musician lens). Missing folio on a row → row prints with no number; generation never blocks (err-public philosophy).

Deferred (noted, not v1): `role: 'rabbi'|'musician'` option on the per-setlist print route; read-only `/perform/setlist/[id]?view=rabbi` web lens (Phase 4).

## 7. Phasing (Section 5 — approved; dependency-ordered, not calendar-driven)

| Phase | Contents | Exit proof |
|---|---|---|
| **1 — Book foundation** | Registry schema; 3 feed snapshots + `sync:books` script; subagent extraction of 2 legacy page maps from the public PDFs | **Daniel eyeballs page maps against printed books** (the one human gate in the project) before commit |
| **2 — Model + MCP** | Schema additions; shared Zod fragment widening all 5 write tools + templates; registry validation; `list_books` + `lookup_book_page` | Real Friday-night setlist authored end-to-end via MCP with pages/performers/an honor, **verified by auditor agent against prod, not by claim** |
| **3 — Rabbi sheet** | `generate_service_sheet` per §6 | Daniel prints one; it survives contact with an actual shtender |
| **4 — Web lenses** | Read-only rabbi web view; Perform-mode polish for outline-rich setlists on 11" iPads | ui-ux-pro-max gate applies (standing rule for any frontend phase) |
| **5 — Deep links (cross-repo)** | Stable public URL for full feeds; hash-based unit deep-linking in reader webapp; outline rows link into the book | Work in shireishabbat/shirei-tshuvah-web **under that repo's two-surface protocol** |
| **6 — Legacy tier upgrade** | CRC page maps gain `unitId`s when Typst intake of legacy siddurim completes; books upgrade to feed tier | Pure data change, zero code; **triggered by** the shireishabbat workstream |

Phases 1–3 are the product; 4–6 the compounding layer. Phases 1 and 2 can run as parallel lanes (registry is pure data; MCP work needs only its schema, fixed on day one).

## 8. Testing & verification expectations

- Unit tests: registry loader/validator; `lookup_book_page` matching incl. aliases + confidence; `liturgyRef` write-validation (unknown slug / out-of-range folio / bad unitId); shared-Zod-fragment parity test across all five write schemas (regression guard against re-drift).
- MCP integration: author a full outline (song + reading + header + honor) through propose→commit; template round-trip carries new fields, honors excluded.
- Rabbi sheet: golden-PDF or structural assertion tests (row order, folio rendering, honors box, header-as-divider, 2-page cap); missing-folio row renders without blocking.
- Time-dependent tests use `vi.useFakeTimers` (house rule). Gate = `tsc` + vitest + Vercel build (`npm run build` cannot run locally — missing NEXT_PUBLIC_FIREBASE_* in .env.local). Next.js route files export only handlers + route-segment config.
- Deploy = push to `origin master` (production branch; NOT `master:main`); verify on prod per standing practice (no local dev server).

## 9. Risks & mitigations

- **Wrong page number on the shtender** — the one unaffordable failure. Mitigations: human-verified page maps (Phase 1 gate); registry validation on every write; authoring-time resolution with confidence surfacing.
- **Feed drift** (shireishabbat rebuilds change pagination) — snapshots are pinned in git; `sync:books` is a deliberate manual step; feed `schemaVersion` checked.
- **Schema drift across the 5 write tools** — shared Zod fragment + parity test.
- **Legacy `tracks[]` (unhydrated) setlists** — new fields ride the hydrated top-level path; verify write tools' behavior on an unhydrated setlist (hydrate-on-write already exists; confirm, don't assume).
- **Fixture collisions** — any normalization/matching logic added for alias lookup gets a fixture audit (standing rule from 2026-05-26).

## 10. Decisions log

- Setlist = outline; no second entity. (Daniel, 2026-08-30)
- One book per service; book selected per service day. (Daniel)
- Rabbi surface = paper on shtender; web lens deferred. (Daniel)
- Registry = static JSON in git, two tiers; snapshots not runtime fetches. (Daniel: "exactly what i was thinking")
- Honors = free-text names, track-level, never copied by templates/clone. (approved §3)
- Existing `pageNumber` untouched; `liturgyRef` is a distinct concept. (approved §1)
- Phasing by dependency, not calendar. (Daniel: "don't worry about timing")
