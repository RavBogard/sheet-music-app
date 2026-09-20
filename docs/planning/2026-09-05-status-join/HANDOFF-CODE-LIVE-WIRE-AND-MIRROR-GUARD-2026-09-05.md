# ORDER → `live` (Code): the wire `status` becomes the joined one, and the sync-mirror guard gets a fixture it can reach — program wave 7b

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0905-live-cw-1** §1/§3/§5 (the wire carries the same expression the gate reads; ONE binding, never
the spread; ships in code, no solo deploy) · **R-0905-live-cw-3** §3/§4/§5 (Scenario 1 is re-cut, the closing
`contract:` test's population is restored, the header claim is corrected) · `R-0904-live-cw-34` §1/§2 · rule 18 ·
`R-0831-guards-2` (a guard is shown to fail, not promised) · `-30` §3(c) (no line to
`ci/gated-suite-exclusions.txt`, ever) · `-38` (2) (a precondition is an observable fact, not an ordinal).
Status: OPEN — dispatchable now. Precondition, observable: `src/lib/mcp/tools/library.ts` contains the line
`const { enrichment, status: _joinedStatus, ...rest } = w02` (the shape wave 7 shipped). If it does not, STOP and
report — this order is written against that tree and nothing else.
Verified-against: `c581a201ff` [inherited: `live`'s 2026-09-05 21:3xZ CLOSED row and
`RETURN-CODE-LIVE-STATUS-JOIN-2026-09-05.md` §6]. **Every line cited below was read off a files-only mount with
no `.git`, so each is named BY ITS CONTENT (`R-0904-live-cw-39`) and re-measured by `live` against its own HEAD
before a byte is written.** A citation that does not match its quoted text is a mismatch: stop, apply nothing.
Tier: LIGHT — one binding moved in one file, one test file's fixtures and header, one new case.
NEXT: F1 (the wire, negative first), then F2 (the mirror guard), then F3 (the return). F1 and F2 are independent;
do not fold their tests into one file.

---

## 1 · F1 — the wire carries the value the gate used

Today the gate reads the authoritative value and the response reports the mirror. The row that makes this urgent
is the REVERSE divergence, and it is already in your own test file as *"SHOWS a row active in `library_index`
whose songs mirror says archived"*: that row is now correctly shown and arrives on the wire saying
`"status":"archived"` (`R-0905-live-cw-1` §2).

- [ ] In `searchLibrary`'s `.map()` — the block whose comment currently reads *"`status` is joined for the GATE
  above and is dropped here on purpose"*, and whose code reads
  `const { enrichment, status: _joinedStatus, ...rest } = w02` — **keep the destructure** (it is what stops the
  spread erasing a good `songs` value with `undefined` for an index row carrying no status field) and assign the
  status EXPLICITLY on the returned row, from the same expression the filter uses.
- [ ] **The expression is computed ONCE.** `R-0905-live-cw-1` §3: a `??` written twice is a rule written twice.
  The filter already binds `const status = w02Map.get(s.id)?.status ?? s.status` on the line beneath the comment
  beginning *"R-0904-live-cw-34 §1/§2: gate on `library_index.status`"*; the mapper must read that same
  derivation rather than re-deriving it. Shape is yours (a small helper, or a pre-pass that stamps the row) —
  what is ordered is that there is ONE site where the fall-back rule lives.
- [ ] The `no-w02` early return (*"Row has no `library_index` — surface empty enrichment so the wire shape is
  consistent"*) is unchanged: with no index row the wire keeps `s.status` exactly as today.
- [ ] **Fail branch, shown before the fix** (`R-0831-guards-2`, and `-38` (2) — a red run after the fix proves
  nothing): extend `__tests__/library-status-join.test.ts` with the wire assertion for the reverse-divergence row
  — `library_index` `active`, `songs` `archived`, row SHOWN, and the returned row's `status` reads `active`. It
  must fail against unmodified source first. Add the erasure case beside it: an index row that EXISTS and carries
  no `status` field must arrive on the wire with the `songs` value intact, never `undefined`. **If either case
  cannot be made to fail cleanly, STOP and report which** — never a line to `ci/gated-suite-exclusions.txt`.
- [ ] `bond-corrections.ts` is NOT touched: its `searchLibrary` call maps six fields and reads no `status`
  (`R-0905-live-cw-1` §4). If your re-measure finds it reading one, that is a mismatch — stop.

## 2 · F2 — the sync-mirror guard gets fixtures the pipeline admits

`R-0905-live-cw-3`: Scenario 1's fixture is a Drive shortcut, `junk-filter.ts`'s
`if (mime.startsWith("application/vnd.google-apps.")) return true` classes it non-chart, and `sync-engine.ts`'s
`const ingestFiles = allFiles.filter(` drops it before either batch — so the test dies at
`expect(libraryWritesFor('shortcut-lechu')).toHaveLength(1)` and never reaches
`expect(songsData).not.toHaveProperty('status')`, the assertion its name advertises.

- [ ] Re-cut Scenario 1 onto a mime the ingestion filter admits, keeping ALL of its surviving claims: verbatim
  name with no `.pdf` strip, `normalizedTitle`, `fileId` and `id`, `createdAt` present on a first write,
  `merge: true`, and no `status`. **Rename it** — the word "shortcut" leaves with the fixture; a title naming a
  case the test cannot reach is how this survived unread. Keep it distinct from Scenario 2, which asserts only
  the verbatim title.
- [ ] The closing `contract:` test — *"NO songs/* write ever carries a status field"* — currently seeds `A.pdf`,
  a google-apps `B.pdf` and `C.mp3`, and two of the three are dropped at ingestion, so its loop iterates over one
  row (`R-0905-live-cw-3` §4). Give it fixtures the filter admits so the sweep has a real population, and keep
  its `expect(allSongsWrites.length).toBeGreaterThan(0)`.
- [ ] Correct the file header's claim *"Mirrors EVERY `library_index` batch.set, regardless of MIME type (no MIME
  filter)"*: true of the mirror SITE, false of the pipeline since the ingestion filter landed. Say both.
- [ ] **Scenario 4 and Scenario 5 are NOT touched.** Scenario 4 was already re-cut for this exact reason and its
  comment is the record of it; Scenario 5 asserts the drop directly and is what keeps the re-cut honest.
- [ ] **The mutation that proves the re-cut** (`R-0831-guards-2`): put a google-apps mime back on the re-cut
  Scenario 1's fixture and confirm it goes red at the FIRST expect rather than at the `status` one — that is the
  difference between a guard and a fixture, and it is the whole finding.

## 3 · F3 — the return

- [ ] State: the site(s) F1 changed and where the single binding now lives; the before/after of both new negative
  cases; the re-cut test's new name; the `contract:` test's population before and after; and the
  `Unit & Integration Tests` count **as a delta against `c581a201ff`**, not as a count on your own sha — the form
  `R-0905-live-cw-2` §1 credits. Say explicitly whether `sync-engine-songs-mirror` Scenario 1 is now green, since
  that is one of the three ungated reds.
- [ ] No deploy. `R-0905-live-cw-1` §5: the wire and the join are one behaviour and reach production together,
  with whatever deploy carries the join. If your desk wants that deploy, say so as its own line.

## 4 · What this order does NOT authorize

`server-songs.ts`'s G-15 `"active"` default (out of scope, `R-0905-live-cw-1` §6). The fourteen `Lint & Type
Check` errors and the `E2E Smoke` red (program item 8, `R-0905-live-cw-2` §4 — enumerated and triaged by the wave
that repairs them, not here). The `registry.test.ts` folio pair (`-27` §4, routed to `machzor`/`corpus`). Whether
Drive shortcuts should be ingested at all (`R-0905-live-cw-3` §6). Waves 4, 5 and 6 are untouched and do not
block this. No id is minted by the executor. `ci/gated-suite-exclusions.txt` is not touched under any branch.
