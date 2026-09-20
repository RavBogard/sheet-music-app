# HANDOFF → a NEW Cowork desk in centralreform.live: the integration program

Lane: **live-cw (Opus Cowork)** — you, the third project desk · paired Code lane: **live (Code)**, host-side
From: the Fable vision lane (`vision`), sitting of 2026-09-01 · Authority: **R-0901-vision-8** (ledger)
Status: **DISPATCHABLE — pick up by opening a `live-cw` row on the family board and saying so.**
Assume no prior context. Everything you need is on disk, in the ledger, or in the live MCP.

## Read, in this order, before your first act

1. `~/shireishabbat/COORDINATION.md` — v1.2, seventeen rules. It is the law. `python3
   ~/shireishabbat/planning/board_lint.py` prints what is open on the family board.
2. `~/shireishabbat/STATUS.md` — the board. Your row goes there (rule 2: every artifact in this
   program crosses repo lines). Stamps come from `date -u`; rows are ~1,200 chars; the body of
   anything longer goes in a doc you link.
3. The ledger `~/shireishabbat/liturgy-map/DECISIONS-LOG.md` — **grep by id, never load it** (1.4 MB).
   Yours: **R-0901-vision-8** (this program) · R-0901-vision-1 §7 (integration deferred until now) ·
   R-0901-cont-1 §3 (the park this lifts) · R-0901-vision-5 (the pin exception; master is the branch
   of record) · R-0831-live-pagemap-1 (printed volumes generate from their press commit) ·
   R-0901-vision-6 + R-0901-corpus-cw-6 (gold = sung together — NOT what you are building; read them
   so you never conflate) · R-0901-corpus-cw-7 §3 (identity binding inside every import).
4. `sheet-music-app/CLAUDE.md` and `AGENTS.md` — the satellite's own protocol, and the MCP's
   `instructions` string (the stage → confirm → commit posture, `STOP_AND_ASK_THRESHOLD = 0.5`).
5. `HANDOFF-CODE-SATELLITE-ADOPTION-RETURN-2026-09-01.md` and
   `HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md` (this root) — what the two satellite Code
   waves already did, and how a deploy here actually goes (two build cycles; the cron/route defect).

## What the family built while the satellite was quiet (the briefing owed since cont-1 §3)

- **`~/shireishabbat`** is the liturgy source of truth: Typst source for CRC's books, a build that
  emits per-book JSON **feeds** where every unit carries a stable **AR-3 id** —
  `section.unit@occasion-service`, e.g. `shma.mi-chamocha@shabbat-maariv` — plus printed folios, and
  `dist-app/` (gitignored; the app's carrier). Printed volumes are pinned to their press commit
  (rule 6). A corpus program is importing CRC's legacy printed books (2019 Friday/Saturday siddur,
  Machzor-2008, Beit Mitzvah, Learner's) into the same identity space — Saturday is in; Friday is
  next (C4); every import now binds its units to existing identities as it is transcribed.
- **`~/shirei-tshuvah-web`** is the reader, live at **siddur.centralreform.org**: a shelf of books
  (machzor, both Shirei Shabbat volumes, the legacy Shabbat morning siddur), page call on each book's
  PRINTED numbers, RTL, place memory. It consumes the feeds by `tools/sync-books.js` with pins.
- **Your satellite already consumes the same feeds**: `scripts/sync-books.mjs` trims them into
  `src/data/books/*.json`; `list_books` serves 5 books (feed tier: `shabbat-maariv` 69pp ·
  `shabbat-shacharit` 145pp · `shirei-tshuvah` 184pp; pagemap tier: `crc-friday` 48pp ·
  `crc-saturday` 102pp); `lookup_book_page` resolves a prayer to a printed page and, on feed books,
  to a unit id; a setlist row carries `liturgyRef {book, unitId?, folio}` (`src/lib/books/types.ts`).
  [all measured on the live MCP and the mount, 2026-09-01T21:4xZ]
- **The gap, measured:** `search_library("Mi Chamocha")` → 19 rows; at least 5 Drive/upload
  duplicate pairs; Chamocha/Chamochah split; **no row carries a liturgical identity** — only a title
  stem and `titleSpecificity`. The seam exists at the setlist row and is missing at the chart.

## The ruling, in program terms (R-0901-vision-8)

1. **QUIET is lifted, fully.** You and `live` may ship to production as work lands. **Guard, not
   veto:** Rosh Hashanah begins sundown **Sept 11**; the machzor pagemap on the band's iPads is
   verified. Every deploy before then asserts `list_books` still serves `shirei-tshuvah` at **184 /
   `feed`**, and the deploy return says it did.
2. **One prayer identity, owned by shireishabbat.** A **moment** is the book-independent half of an
   AR-3 id (`shma.mi-chamocha`). The moment list is a named, versioned artifact exported from the
   shireishabbat build (working name `moments.json`: id · display names · aliases/transliterations ·
   per-book occurrences → unitId + printed page), with producer, pin and a failing guard (rule 5).
   You CONSUME it (extend `sync-books.mjs`); you never hand-copy it and never carry liturgical text
   (rule 7). Pagemap books (`crc-friday`, `crc-saturday`) get their entries mapped to moments
   satellite-side, marked as such, until the corpus program imports them as feed books.
3. **Charts bind to moments; AI proposes, Daniel confirms in batches.** A chart carries one or more
   moments (a medley carries several) with confidence + provenance, through the existing stage →
   confirm → commit posture. Clarified titles commit; generic stems come to Daniel with the
   alternatives. Duplicates are surfaced in the same pass, never silently merged.
4. **Payoffs, in this order:** (a) library hygiene — dedupe and normalize BEFORE anything binds;
   (b) setlist by moment — pick the prayer, see every chart for it, the service's book fills the
   page; (c) Perform mode shows the congregation's page beside the chart; (d) the reader learns the
   music — a metadata-only artifact FROM the satellite (never chart bytes: third-party sheet music)
   consumed by the webapp. (d) takes its own family row and **returns to a sitting before it ships**.
   It is repertoire, not gold.
5. **Lanes:** you design and rule with Daniel; `live` executes and runs git host-side (rule 8
   addendum — git through the Cowork mount here is untrusted). The moments PRODUCER is shireishabbat
   build work: you write its spec (fields, pin, guard) and queue it `FOR COWORK (cont):` — the webapp
   desk briefs its Code lane, which built the feed producer and `dist-app/`.

## Shape of the work — phases, each with a done-when (you refine these; you do not skip them)

- **L0 — Read and measure.** Row open. Full-library census: rows, duplicates (Drive id vs upload
  id, same stem), spelling families, orphans, `titleSpecificity` distribution, how many rows already
  sit on setlists with a `liturgyRef`. Return a `RETURN-L0-*.md` at this root with numbers and
  provenance. *Done when Daniel can see the size of the hygiene job in one table.*
- **L1 — Hygiene.** Dedupe (`dedupe_library`, `reconcile_library` exist — measure before trusting),
  normalize spellings into title + aliases, quarantine non-charts. Every merge staged and confirmed;
  nothing deleted, everything reversible. *Done when `search_library` for any stem returns one row
  per distinct arrangement.*
- **L2 — The moments contract.** Spec `moments.json` (schema, producer, pin, guard) → `FOR COWORK
  (cont)`. Meanwhile map the two pagemap books' entries to moment ids satellite-side. *Done when the
  artifact lands in `dist-app/`, `sync-books.mjs` consumes it, and a guard fails on a missing pin.*
- **L3 — Binding.** Data model on the library row (`moments: [{id, confidence, provenance,
  confirmedBy}]`), AI proposal pass over the whole library, batch confirmation with Daniel through
  the MCP (a `propose_moment_bindings` / `confirm_moment_bindings` pair, or the existing
  stage/commit tools extended — your call). *Done when every active chart has a moment or an
  explicit "none" with a reason.*
- **L4 — Setlist by moment.** Authoring: pick a moment → every bound chart, ranked by recent use ·
  key · vocal lead; the setlist's `book` fills `liturgyRef` via the moment's per-book occurrence.
  *Done when a full Friday setlist builds from moments alone and the rabbi sheet prints right pages.*
- **L5 — Perform mode page.** The iPad shows the congregation's printed page for the row's book.
  *Done when a band member can call the page without looking at the siddur.*
- **L6 — The reader learns the music.** Spec the metadata-only artifact; family row; return to a
  sitting. Not before L3 is confirmed data.

## Constraints that do not bend

- **Licensing (rule 7):** chart PDFs are third-party sheet music. They never enter shireishabbat,
  the public mirror, or any fork-facing surface — not as files, not as text. Metadata only crosses.
  Liturgical TEXT never enters the satellite — ids, names, pages only.
- **Pinning (rule 6):** what you consume from a printed volume is generated from its press commit;
  `pin: "HEAD"` on the legacy book is a ruled exception (vision-5 §1), not a pattern.
- **Stage, then commit.** Nothing binds, merges, or deletes on Daniel's behalf without a confirm
  step. Confidence is surfaced, not hidden. Low confidence + siblings > 1 = stop and ask.
- **Rulings are minted only in a Cowork sitting with Daniel** (rule 1). Yours are
  `R-<MMDD>-live-cw-<n>`; `live` never spends one — it stops and returns. `ruling_lint.py --id`
  after every append; every number tagged `[measured: …]` / `[inherited: …]` / `(unmeasured)`.
- **Disk is the bus (rule 4).** You cannot message the other desks. Queue lines name ONE slug.
  The vision desk is reached by `FOR COWORK (vision):` and answers on the board.

## Questions Daniel has NOT yet answered — bring them to him in your sitting, not to a guess

- Whether a chart's binding is per **arrangement** (Moshav vs Shur vs Friedman) or the library
  row grows a parent "song" grouping first. (This decides L3's data model.)
- How much of the pagemap books' moment-mapping is worth doing by hand now versus waiting for C4
  (Friday import is next in the corpus program).
- What "ranked" means in L4 — recency, the rabbi leading, the band that night, key. He knows.
- Whether the Perform page (L5) shows the printed number only, or the number and the moment name.

## First moves

Open your `live-cw` row (say you picked up this handoff). Run `board_lint.py`. Read the two
satellite returns. Do L0 — measure before proposing anything. Then sit with Daniel on the open
questions above and mint your first ruling. Hand `live` its first order as `HANDOFF-CODE-LIVE-*.md`
at this root, with `order_lint.py` (in shireishabbat/planning) run on it if it applies.

Claude records; Daniel decides.
