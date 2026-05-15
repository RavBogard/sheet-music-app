# MCP Claude-First Eval — Cowork RE-RUN Report

**Date:** 2026-05-15
**Endpoint:** https://www.centralreform.live/api/mcp
**Authorized as:** Rabbi Daniel Bogard (admin)
**Scope:** Targeted re-run after connector refresh — Parts 0–3 only. Unaffected tasks from the prior report stand.

---

## Part 0 — Tool discovery

Tool count visible: **22** ✓ (matches expected post-Wave-6 surface)

The three previously-suspect tools, confirmed present with full schemas:

- `delete_chart(fileId)` — **PRESENT**. Schema: `{ fileId: string (min 1) }`. Description confirms admin-required deletes for `core`/`supplemental`, refuses if any setlist track still references the chart.
- `get_matrix(matrixIndex?)` — **PRESENT**. Schema: `{ matrixIndex?: integer 1..6 }`. Note: `matrixIndex` is bounded server-side at 1–6 via the JSON schema itself, not server-side validation.
- `add_track_to_setlist` with widened `type` — **PRESENT**. Enum: `'song' | 'header' | 'reading' | 'prayer' | 'transition' | 'note'`. The four new variants (reading / prayer / transition / note) are first-class.

No discovery gaps. The stale-cache caveat from the prior cowork run is fully resolved by the connector refresh.

---

## Part 1 — Re-run results

### T1R — Clone-and-tweak fidelity check

- **Source:** `NWPBba50fltX6pNcyOVK` — "Service — May 15" (19 tracks: 3 header, 13 song, 2 reading, 1 prayer).
- **Clone target:** `b1e03059-6586-4bbc-aa01-e49ca72ad6b3` — "⚠️ EVAL T1R — Clone Fidelity Check", eventDate 2026-05-22.
- **Method:** 19 sequential `add_track_to_setlist` calls with explicit `position`, type preserved per row, `songId` re-bonded on every song row, `key` / `leadMusician` propagated where set.
- **Verification:** `get_setlist` on the clone returned all 19 rows in correct order. Type histogram matches source exactly (header×3, song×13, reading×2, prayer×1). `Dvar torah` and `V'ahavta` came back as `type:'reading'`; `Silent Prayer` came back as `type:'prayer'`.

**Completion:** **yes** (full row-for-row fidelity, no type coercion).

**Closes prior-run gap?** **Yes — fully.** In the prior T1 the reading and prayer rows were rewritten as free-text `type:'song'`, which lost their service semantics. The widened enum eliminates that loss entirely. The chart-bonded song rows also kept their `fileId` and resolved `fileName` on read-back, so the clone is performable as-is.

**Remaining fidelity loss:** none material. Two minor notes:
1. There is no first-class `clone_setlist` primitive, so the clone took 1 list + 1 read + 1 create + 19 add calls = 22 round-trips for a 19-row source. The atomic clone tool from the prior priority list still earns its place.
2. The library's resolved `fileName` for a song row is derived from the chart, not copied from the source row — irrelevant for correctness (it's display-only), called out for completeness.

**Cleanup:** `delete_setlist` returned `{ ok: true, tracksDeleted: 19 }`. ✓

**Tool-call count:** 22 (1 list_setlists, 1 get_setlist, 1 create_setlist, 19 add_track_to_setlist, 1 get_setlist verify, 1 delete_setlist).

---

### T4R — Insert reading + transition (semantic check)

- **Throwaway:** `27b2f2d2-82db-4a15-9040-7683022f8a5c` — "⚠️ EVAL T4R — Insert Semantic".
- **Sequence:** 3 free-text song rows at positions 0/1/2 → insert `V'ahavta` (type `reading`) at position 2 → insert `Niggun` (type `transition`) at position 3.
- **Verification (get_setlist read-back):**

  | order | title       | type       |
  |-------|-------------|------------|
  | 0     | Song One    | song       |
  | 1     | Song Two    | song       |
  | 2     | V'ahavta    | **reading** |
  | 3     | Niggun      | **transition** |
  | 4     | Song Three  | song       |

  Insert semantics correct (Song Three shifted from order 2 → order 4 as expected). Inserted rows preserved their declared types — **no silent coercion to `song`**.

**Closes prior-run gap?** **Yes.** In the prior T4 attempt these came back as free-text `song` rows. Semantic typing is now end-to-end correct.

**Cleanup:** `delete_setlist` returned `{ ok: true, tracksDeleted: 5 }`. ✓

**Tool-call count:** 7.

---

### T7R — Library cleanup (delete_chart sweep)

**Step 1 — leftover EVAL charts from prior run:**

| fileId | result |
|---|---|
| `upload-5f993fa9-89bb-43a4-8686-97b8a0339959` (T5 Carlebach) | ok, deletedTracks: 0 |
| `upload-650361ae-8f1f-4633-a5fb-85aaaa5d9961` (T6 Direct Upload) | ok, deletedTracks: 0 |

**Step 2 — G-3 regression evidence on the two curated-catalog probes (BEFORE delete):**

`get_song(upload-a0c31045-...)` →
```json
{ "id": "upload-a0c31045-2e0c-4153-92a9-d13bc1ca96ee",
  "title": "⚠️ STRESS TEST 2026-05-15 — core probe",
  "fileName": "⚠️ STRESS TEST 2026-05-15 — core probe",
  "status": "active" }
```

`get_song(upload-bb13317e-...)` →
```json
{ "id": "upload-bb13317e-7db4-433d-baff-76d7f3bf178a",
  "title": "⚠️ STRESS TEST 2026-05-15 — supplemental probe",
  "fileName": "⚠️ STRESS TEST 2026-05-15 — supplemental probe",
  "status": "active" }
```

⚠️ **Notable finding for the eval design itself:** `get_song` does **not** surface the `collection` field in its response. The fields are `id`, `title`, `fileName`, `status` only. That means we **cannot** read regression evidence for G-3 off of `get_song` — the inferred-collection check assumed in the prompt isn't possible against the deployed schema. The two probes might still be in `core` / `supplemental`, but `get_song` won't tell us. To verify G-3 we need the response from the original `upload_chart` call (which *does* return `collection`), or a new admin tool that exposes the collection on read. See Part 2 — the fresh G-3 loop **does** confirm the gate works end-to-end via the upload-response path.

**Step 3 — sweep all 9 stress-test charts:**

| fileId | result |
|---|---|
| `upload-a0c31045-...` (CORE PROBE) | ok |
| `upload-bb13317e-...` (SUPPLEMENTAL PROBE) | ok |
| `upload-d7f4d5f4-...` (Adon Olam) | ok |
| `upload-5bfac6d1-...` (PDF chart) | ok |
| `upload-fc466d13-...` (MusicXML) | ok |
| `upload-d2724f75-...` (Adon Olamx) | ok |
| `upload-841fe659-...` (bad mime) | ok |
| `upload-5caf2ede-...` (not base64) | ok |
| `upload-66dd16e4-...` (scraped Amazing Grace) | ok |

All 11 deletions succeeded with `{ ok: true, deletedTracks: 0 }` — meaning no setlist track was referencing any of these (clean delete, no remove_track preamble needed).

**Step 4 — verification:**
- `search_library({query: "EVAL"})` → `[]` ✓
- `search_library({query: "STRESS"})` → `[]` ✓

Library is clean.

---

## Part 2 — G-3 admin gate regression

| step | call | result |
|---|---|---|
| 1 | `upload_chart` to `collection: 'core'`, tiny PDF | `{ ok: true, fileId: upload-79e2226c-..., collection: "core" }` |
| 2 | `get_song(upload-79e2226c-...)` | returns metadata; **no `collection` field exposed** (see T7R note) |
| 3 | `delete_chart(upload-79e2226c-...)` | `{ ok: true, deletedTracks: 0 }` |
| 4 | `upload_chart` to `collection: 'supplemental'`, tiny PDF | `{ ok: true, fileId: upload-89565e01-..., collection: "supplemental" }` |
| 5 | `get_song(upload-89565e01-...)` | returns metadata; **no `collection` field exposed** |
| 6 | `delete_chart(upload-89565e01-...)` | `{ ok: true, deletedTracks: 0 }` |

**Verdict:** Wave-4 G-3 admin gate is healthy in production — admin can write to both curated collections, the upload response confirms placement, and admin-scoped `delete_chart` reverses the operation. The single rough edge is the `get_song` envelope: it doesn't echo `collection`, so anyone other than the original uploader has no read path to confirm which collection a chart lives in. Worth surfacing as a small finding (it doesn't break Wave 4, it just makes after-the-fact auditing harder).

---

## Part 3 — get_matrix regression

| call | result |
|---|---|
| `get_matrix({})` | Returns full 6-matrix snapshot: Main L (0.75, on), Main R (0.75, on), MP Room (0.59, off), Oneg (0.40, off), Library (0.63, off), ALS (0.48, off). Envelope is `{ matrices: [{index, name, fader, on}, ...] }`. |
| `get_matrix({matrixIndex: 1})` | Returns one-element `{ matrices: [{ index:1, name:"Main L", fader:0.7498, on:true }] }`. |
| `get_matrix({matrixIndex: 99})` | **Schema-rejected** before reaching the server: `Input validation error: matrixIndex too_big, maximum 6`. |

**Two notes worth surfacing:**

1. **Bridge is responsive, not offline.** The eval prompt assumed X32 hardware was still down and predicted a `Mixer state not available — is the bridge online?` error envelope. In production the call returned live (or recently-cached) matrix state. Either the bridge came back online between the prior run and this one, or it's been serving cached state the whole time. Worth a quick sanity check with the sound team, but operationally this is healthier than expected.

2. **`matrixIndex: 99` is rejected at the JSON-schema layer**, not in server code. That's a tighter contract than the prompt anticipated (which expected a server-side "matrix N not found" envelope). The upside is that bad input never reaches the bridge; the downside is that the surface area for unit-style negative tests is constrained to indices in [1, 6]. No action needed — flagged for synthesis-doc accuracy.

`get_matrix` is reachable, returns a sensible envelope, and is a usable foundation for the `set_matrix_fader` / `set_matrix_mute` revert-on-change pattern.

---

## Part 4 — Final library state

- `search_library({query: "EVAL"})` → `[]`
- `search_library({query: "STRESS"})` → `[]`

All EVAL and STRESS charts from both the prior run and this re-run have been swept. The two G-3 probes uploaded during Part 2 were deleted before this verification. Library is at baseline.

---

## Part 5 — Verdict

The widened `type` enum + `delete_chart` + `get_matrix` surface materially **closes the three specific viability gaps** flagged in the prior cowork run, but does **not** change the overall claude-first read in the main report.

The widened enum unblocks faithful clone-and-tweak workflows for liturgical setlists (reading / prayer / transition / note are now declarable instead of being smuggled as free-text song rows), which was the single largest fidelity loss in the prior T1/T4. `delete_chart` makes admin cleanup a one-call operation per chart with the correct safety rails (refuses-on-reference, admin-gated for curated catalogs). `get_matrix` confirms the sound-engineer revert pattern is now legible from the LLM side. Together they upgrade three task verdicts from "partial" to "yes" and remove the "cleanup requires DB access" footnote.

What they do **not** do is reduce the need for the four ergonomic primitives still on the priority list — those operate at a different layer (bulk / atomic / publish / soft-delete semantics) than the type-enum and delete-shaped fixes shipped in Wave 6.

---

**Do the prior report's top-priority missing tools (`clone_setlist`, `update_track`, `bulk_update_tracks`, `publish_setlist`, soft-delete) still stand as written?**

**Yes**, all five remain top-priority — the only caveat is that `clone_setlist`'s urgency shifts slightly (the 22-call clone in T1R completed without semantic loss, so the ask is now "ergonomics + atomicity" rather than "fidelity"), and a soft-delete shape on charts is now informed by a small companion ask: surface `collection` in the `get_song` envelope so admins can audit catalog placement without round-tripping through `upload_chart`'s response.
