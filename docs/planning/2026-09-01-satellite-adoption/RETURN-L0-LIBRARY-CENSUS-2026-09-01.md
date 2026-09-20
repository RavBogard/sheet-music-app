# RETURN → L0: the library, measured

Lane: **live-cw (Opus Cowork)** · Order: `HANDOFF-COWORK-LIVE-INTEGRATION-2026-09-01.md`
Authority: **R-0901-vision-8** · R-0831-live-pagemap-1 · R-0901-vision-5 · R-0901-corpus-cw-7 §3
Status: **L0 CLOSED.** No writes anywhere. No ruling ids spent. No deploy. No `src/` diff.

**Instrument, stated once so every number below inherits it.** All figures are
`[measured: live centralreform.live MCP over HTTPS from the host, 2026-09-01T22:0xZ]`. The census
is **exhaustive, not a sample**: `list_library` paged at limit 200 across five offsets returned
**891 unique fileIds against a reported total of 891**, and the four hygiene tools were called in
**`dryRun`** — the F-05 dry-run-is-observability contract, so nothing was written. Raw JSON and the
analysis scripts are in the host's session scratch, outside any repo.

**Rosh Hashanah guard (R-0901-vision-8 §1) re-asserted at the top of this lane, not just at deploy:**
`list_books` → `shirei-tshuvah` **184 pages, tier `feed`**; `crc-friday` 48, `crc-saturday` 102.
Unchanged from the satellite-deploy return. Nothing in L0 touched it.

---

## The table Daniel asked for: the size of the hygiene job

| # | what | measured | what it means for L1 |
|---|---|---|---|
| 1 | rows in the catalog Daniel browses | **762** | 695 PDF · 66 text charts · 1 image |
| 2 | rows in `library_index` all-in | **891** — 856 active, 20 archived, 15 duplicate | the browse hides 129 |
| 3 | **rows the hygiene tools say exist** | **943** | **52 more than `list_library` can see — unexplained, see §D** |
| 4 | duplicate rows by at least one instrument | **113** | ~15% of the visible catalog |
| 5 | …that `dedupe_library` catches **as shipped** | **8** | the default pass is 7% effective here |
| 6 | …that it catches with `forceScore: 0.85` | **71** | still misses 42 (§B) |
| 7 | archived rows shown in the catalog anyway | **20**, 17 with an active twin, 12 byte-identical | a filter mismatch, not a dedupe miss (§C) |
| 8 | non-chart artifacts | **117** hidden + **11** `.doc/.docx` filed as `application/pdf` | the quarantine job is small and bounded |
| 9 | dead or unreachable chart bytes | **1 orphan**, 0 needing re-bond, 873 already healthy | **the bytes are fine; the names are the problem** |
| 10 | transliteration families spanning >1 row | **~130 families over 369–391 rows** | the real grouping job (§A) |
| 11 | rows with a liturgical identity | **0** | as vision-8 measured. L3 is greenfield |
| 12 | charts ever used on a setlist | **175 of 762** | 587 charts have never been called |
| 13 | setlist rows carrying a `liturgyRef` | **140** of 1,275, across **3** of 75 setlists | the seam exists and is barely used |
| 14 | distinct charts on a row that also carries a `liturgyRef` | **13** | the chart↔liturgy join, today, is thirteen rows wide |

Item 13 independently reproduces the satellite-deploy return's D3.4 (116 `shirei-tshuvah` refs) by a
different route — that lane queried the `tracks` collection; this one walked all 75 setlists
one at a time and got 116 `shirei-tshuvah` + 24 `crc-saturday`. Two instruments, same number.

---

## A. The finding that changes L3's design: confidence is computed inside a spelling silo

`titleSpecificity` and `siblingsInCatalog` are computed per **stem**, and a stem is a
transliteration. So the library's own confidence signal cannot see across spellings. L'cha Dodi is
the clean case — **12 rows, three stems, three different confidence stories about the same prayer**:

| row | stem | titleSpecificity | siblingsInCatalog |
|---|---|---|---|
| `L'Chah Dodi (Friedman).pdf` +3 more | `l'chah dodi` | 0.6 | 5 |
| `Lecha Dodi (Ben Barak)` +3 more | `lecha dodi` | 0.3 | 6 |
| `L'cha Dodi (Nava Tehila)` | `lecha dodi sameach` | **0.8** | **1** |
| `L'cha Dodi (Taubman, Dm) — band chart` | `l'cha dodi band chart` | 0.6 | 1 |

The third row reads **high confidence, unique in catalog** — the guide's rule says *commit
silently* — while eleven other L'cha Dodi charts sit beside it. `STOP_AND_ASK_THRESHOLD = 0.5`
is doing its job on the arithmetic it is given; the arithmetic is scoped to the wrong set.

The same shape in Mi Chamocha: eight skeleton families where there is one prayer, with
Chamocha/Chamochah/Michamocha splitting rows that belong together.

**Consequence, and it is the argument for the whole program:** binding charts to moments is not a
convenience on top of a healthy library — it is the only signal that is not spelling-dependent.
Every confidence number in the satellite today is computed inside a silo the moment id would
dissolve. **This is also why L1 must precede L3 in the ruled order and cannot be skipped**: a
proposal pass run against the current stems would inherit the silo.

## B. `dedupe_library` as shipped will not do L1's job — measured, not assumed

The order said *measure before trusting*. Three instruments on the same library:

| pass | groups | rows it would mark |
|---|---|---|
| `dedupe_library` default (exact normalize) | 8 | **8** |
| `dedupe_library` with `forceScore: 0.85` | 66 | **71** |
| an extension-stripping exact normalize, visible rows only | 83 | **84** |

The union is **113 rows**; the three passes agree on only 42. The dominant duplication shape in
this library is a Drive row named `X.pdf` beside an upload row named `X` — **65 of my 83 groups
span a Drive id and an upload id** — and the tool's normalizer keeps the extension, so the exact
pass cannot see the pattern at all. The fuzzy pass catches most of them by similarity, but still
misses 42 that stripping `.pdf` would catch outright: `Achot ketana`/`Achot ketana.pdf`,
`Dodi Li`/`Dodi Li.pdf`, `V'Shamru`/`V'Shamru.pdf`, and 39 more.

Conversely the fuzzy pass flags **29 rows this census never saw** — `.mp3` pairs, Google Docs, and
rows `list_library` does not return at all (§D). **Neither instrument is a superset of the other**,
which is why L1's first act is a normalizer change, not a `force: true` run.

## C. Twenty archived rows are in the catalog and invisible to dedupe

`dedupe_library` / `reconcile_library` filter `status: archived` out of their scan
(`filteredOut.byStatus.archived = 20` on both). `list_library`'s default browse does **not** —
it hides `duplicate` and `orphaned` only. So 20 archived PDFs appear in the catalog Daniel
browses, **17 of them have an active row of the same name and 12 are byte-identical by
`fileSize`**, and no hygiene tool can ever reach them. This is a filter-contract mismatch, not a
dedupe defect, and it is cheap to fix from either side. It should be decided, not patched:
**should the browse hide `archived`, or should the hygiene tools scan it?**

## D. The three hygiene tools and `list_library` disagree about how big the library is

`list_library` reports `coverage.total: 891` and returns 891 unique fileIds. `dedupe_library`,
`reconcile_library` and `backfill_library_index` all report `coverage.total: 943`. The three agree
with each other and disagree with the browse by **52 rows**, and cycle-3 DATA-002 added that
uniform `coverage` field *specifically* so these four tools could be correlated. Some of the 29
rows only the fuzzy pass flags are in that gap — they resolve to no row `list_library` will return.

**Not diagnosed here on purpose.** It is a source question in `src/lib/mcp/tools/`, it is Code's
to answer, and guessing at it would put an unmeasured number under a ruling. **Queued for `live`.**

## E. Small and bounded

- **11 rows carry `mimeType: application/pdf` but names ending `.doc` / `.docx`** — all in
  `uploads`, all secular (Dylan, Marley, The Band). The browse hides them as non-charts by
  extension while the stored mime says otherwise. Quarantine candidates, and the mime is wrong.
- **1 orphan**, 0 `needsRebond`, 0 `transient`, 873 already healthy: the storage layer is sound.
- **5 rows are missing `fileSize`** and would hydrate from Storage; 23 cannot be resolved.
  `namesNormalized: 0` — the old leading-space defect is fully drained.
- **28 of 75 setlists carry no tracks at all**; only **3** have a `book` set.

---

## Queue

**FOR DANIEL (decide-by: your next sitting with this desk).** The four questions the order carries
forward, plus two L0 raised. They are in the sitting note, not repeated here.

**FOR CODE (live).** Not orders yet — this desk briefs `live` after the sitting. Standing:
(1) why `list_library` sees 891 and the hygiene tools see 943 (§D); (2) the dedupe normalizer
should strip the file extension before grouping — the change is small and its fail branch is
demonstrable on the 42 pairs listed above; (3) `archived` is in the browse and out of the hygiene
scan (§C) — one of the two moves once Daniel says which.

**FOR COWORK (vision).** Nothing from L0. R-0901-vision-8's ordering held on contact with the
data: L1 before L3 is not sequencing hygiene, it is the difference between binding on a silo'd
signal and binding on a real one (§A).

**Not touched by this lane:** every write path. No setlist, chart, library row, book registry or
Firestore document was modified; all four hygiene tools ran `dryRun`. No git, in any repo.

Claude records; Daniel decides.
