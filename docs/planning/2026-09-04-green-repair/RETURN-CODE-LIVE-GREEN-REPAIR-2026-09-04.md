# RETURN → `live-cw` (Opus Cowork): the red baseline repaired, 16 of 19 — and THREE left red, not one

Lane: **live (Code)**, host-side in `~/CentralReform.live` (rule 8 addendum) · Order:
**`HANDOFF-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`** (`R-0904-live-cw-16`…`-22`)
Executed at **`cdf1c37386`**, verified by content at the mount before the first edit. **No deploy. No commit to
`master` yet at the time of writing — see §Git. No catalog row changed state. No workflow file, no
`vercel.json`, no repository setting touched.**

**THE HEADLINE: the order's criterion was 19 → 1 and I delivered 19 → 3, on purpose, each red with a named
ruling.** Two of the three are the SAME class-2 defect caught by TWO tests, which the order believed was
caught by one; the third is R2's own STOP clause firing exactly as written. Sixteen tests moved red → green.
Nothing was deleted, renamed (bar the one the order authorised), skipped or softened.

---

## G5 · the suite's own two lines, verbatim, with their labels

**BEFORE** (`npx vitest run`, whole suite, at `cdf1c37386` with no edits):

```
 Test Files  7 failed | 342 passed | 6 skipped (355)
      Tests  19 failed | 3990 passed | 78 skipped (4087)
```

**AFTER, run 1:**

```
 Test Files  3 failed | 346 passed | 6 skipped (355)
      Tests  4 failed | 4006 passed | 78 skipped (4088)
```

**AFTER, run 2** (same tree, no edits between the two runs):

```
 Test Files  2 failed | 347 passed | 6 skipped (355)
      Tests  3 failed | 4007 passed | 78 skipped (4088)
```

No arithmetic across the two lines. **Both after-runs are quoted because they DISAGREE, and the disagreement
is reported rather than hidden** — see §The fourth red.

`Tests` total **4087 → 4088**: exactly the +1 the order predicted for R3's new test. `skipped` **78 → 78**,
unchanged. `Test Files` **355 → 355**, unchanged.

---

## Per test, not per file (19 rows)

Every one of the 19 was also confirmed failing ALONE at baseline before any edit, so **contention was
eliminated as a cause before any theory was formed** — 3+2+2+2+4+3+3 = 19, identical to the suite's count.

### R1 · `src/lib/mcp/tools/__tests__/library.test.ts` — 2 → GREEN

Cited line re-verified: `library.ts:72` is `export function chartFormatClass(...)`, `:73` the
`// E1 (R-0904-live-cw-3)` comment, **`:74` is `if (!m) return "unknown"`** — as the order wrote it.

| test | was | now |
|---|---|---|
| `keeps every real chart rendering in one class` | RED, `'unknown'` vs `'score'` at `:268` | **GREEN** |
| `keeps the Google-Apps class distinct and tolerates missing mime` | RED, same at `:279` | **GREEN** |

The first test's loop asserted five mimes as `"score"`; **only `application/octet-stream` moved**, and
`library.ts:96`-`:98` names it in a comment as deliberately not a chart rendering. So it came OUT of the loop
into its own assertion at `"unknown"` rather than being dropped — the boundary is still covered, and the four
real renderings still assert one class. The second test's own comment said the opposite of the ruling
(*"must stay groupable with real charts"*); it now records why a mime-less row groups with nothing, and that
`refuseOnFormatClass` refuses a set containing `unknown`. **Production reach zero — 892 rows, 0 with an empty
mimeType** — is written into the test body, not just this return. **File alone: 2 failed | 18 passed (20) →
20 passed (20).** 0 tests deleted.

### R2 · `src/lib/__tests__/sync-engine-songs-mirror.test.ts` — 3 → 2 GREEN, **1 STAYS RED**

Cited lines re-verified: the comment ends at `:145`, the filter is `:146`-`:148`, and
`stats.skippedNonChart = allFiles.length - ingestFiles.length` **is at `:149`** — the counter B4 proposed
asserting genuinely exists, and `syncLibraryIndex` returns `SyncStats`, so a test can read it.

| test | was | now |
|---|---|---|
| **S1** `new Drive shortcut mirrors to songs/*` | RED, 0 library writes | **STILL RED — R2's STOP clause** |
| **S4** `empty/missing name → NO songs/* write` | RED, 0 library writes | **GREEN** |
| **S5** `non-chart MIME types ARE mirrored` | RED, 0 songs writes | **GREEN, inverted + renamed** |

**S1 · WHY IT IS STILL RED, and which ruling stopped me: R2's own STOP clause, under `R-0904-live-cw-17` §2.**
The order asked for a chart-shaped fixture so the shortcut mirror is actually exercised. **Measured: no such
fixture can exist.** `isNonChartArtifactShape` rejects the entire Google-Apps namespace on
`mime.startsWith("application/vnd.google-apps.")` (`junk-filter.ts:35`); a Drive shortcut **is**
`application/vnd.google-apps.shortcut`; and the ingestion filter reads `f.mimeType`, never
`shortcutDetails.targetMimeType` (`sync-engine.ts:146`-`:148`). **So every shortcut is dropped before the
mirror, and deliberately — `sync-engine.ts:16` names the ~134 Drive shortcuts as part of what this change
excludes.** Giving the fixture a PDF mime would turn it green while testing a shape Drive cannot return;
inverting it would report the deletion of a named behaviour as a repair, which R2 refuses. **The whole
argument is now a comment above the test**, so the next reader does not have to re-derive it. **The question
that belongs to you, not to a test edit: should a shortcut-bonded row still reach `songs/*` at all?** The
picker's Dexie mirror is the consumer.

**S4 · the fixture was failing for the FILTER's reason, not the guard's.** Its old fixture was
`{ name: '   ', mimeType: 'application/vnd.google-apps.folder' }` and asserted **1 library write** — folders
are now dropped at ingestion, so it measured the filter and never reached the empty-name guard it is named
for. The fixture is now a whitespace-named **PDF**: a blank name is not itself non-chart-shaped
(`junk-filter.ts:47` rejects a leading dot and audio/office extensions, not blank), so it is ingested and the
skip at **`sync-engine.ts:294`-`:303`** is what is measured. **Still failable:** if the empty-name guard were
removed, the songs write becomes 1 and the test fails; if the filter widened to swallow PDFs, the library
write becomes 0 and it fails.

**S5 · inverted, and RENAMED — the one rename the order authorised.** Old title: *"non-chart MIME types
(folder, audio, doc) ARE mirrored — no MIME filter"*. New title: *"non-chart MIME types (folder, audio, doc)
are DROPPED at ingestion — v11.5-04-02 filter, counted in stats.skippedNonChart"*. It now asserts **both
collections empty** for all three artifacts, which is what distinguishes *dropped at ingestion* from
*mirrored but MIME-filtered* — the actual change. **Still failable and not vacuous:** it also asserts the PDF
still reaches both collections and still carries no `status`, so a filter that widened to swallow charts
fails it; and `stats.skippedNonChart === 3` pins that the drop is counted, not silent.

**Scenarios 2, 3, 6 and the `contract:` test PASS today and still pass** — writes happen for a PDF and for an
existing row; only the non-chart contract inverted. **File alone: 3 failed | 4 passed (7) → 1 failed | 6
passed (7).** 7 tests before, 7 after.

### R3 · the F1 hero — 6 → GREEN, plus the test nobody had written

Cited lines re-verified at the mount. **One drift to report: `MAX_PUBLIC_SERVICES = 5` is at
`public-setlist-order.ts:13` as the order says, but it is applied at `:97`-`:98`, not `:90`-`:92`.** Used what
I measured. The hero opens at `PublicSetlistListing.tsx:261`, its `aria-label` is at `:267`, its `<h2>` at
`:278`, the two `<section>`s at `:298` and `:308`, and `data-testid="signin-reserve"` is at `:225` — all
exactly as written. **The cap did not move; the hero is the sixth `<a>`.**

**The component change is two attributes and nothing else:** `data-testid="upcoming-list"` and
`data-testid="past-list"` on the two sibling `<section>`s, each with a comment saying it is a test landmark.
`+17/-2` on that file, all of it the two attributes and their comment. **`getAllByText(..., 2)` was refused as
the primary route**, as ordered.

| test | was | now |
|---|---|---|
| `renders SSR-prefetched cards immediately …` | RED, *Found multiple elements: Erev Shabbat (SSR)* | **GREEN** |
| `renders a publishedAt:null setlist …` | RED, *…: Saturday B'nei Mitzvah* | **GREEN** |
| `filters isTest:true rows out of the SSR-prefetched slice` | RED, *…: Real Service* | **GREEN** |
| `caps the listing at 5 services total, upcoming-first` | RED, 6 links vs 5 | **GREEN** |
| `reserves the sign-in card slot during authLoading …` | RED, *…: Shabbat Morning* | **GREEN** |
| `does NOT reserve the slot … (cachedUser present)` | RED, *…: Shabbat Morning* | **GREEN** |

**One thing the order's route needed extending, and I am naming it rather than quietly doing it:** in the
first three tests the ambiguity is not only `getByText` — the sibling `getByRole("link", { name: /…/i })`
matches the hero's accessible name too (`Go to next service: <title>` contains the title). Both queries are
scoped to `within(getByTestId("upcoming-list"))`. **In the isTest test only the POSITIVE half is scoped: the
sandbox-exclusion assertion stays on `screen` deliberately, because an `isTest` row must be absent from the
WHOLE document, hero included, not merely from the list.**

**The cap test gained a second assertion rather than a weaker one:** `within(upcoming-list)` counts 5, and
`screen` counts **6** — "the cap plus exactly one hero". That is what would catch a *third* render site
appearing, and it still fails if the cap moves to 4 or 6. It also asserts `past-list` is absent, since all
five rows should be upcoming.

**THE NEW TEST (`-18` §3), and the order was right that nothing covered this.** Re-measured:
`grep -rl "Go to next service" src --include=*.test.ts --include=*.test.tsx` returns **one** file,
`src/components/performance/__tests__/public-setlist-order.test.ts`, whose only F1 reference is `:52`, a
`describe` over the pure selector `firstUpcomingSetlist` — **not the DOM**; and
`src/app/perform/__tests__/page.test.tsx:144` caps the SSR **prop**, not the markup (**it passes today and
still passes**). Added to `public-view.test.tsx`:
**`renders the F1 'next service' hero for the soonest upcoming service, above the listing`**. It asserts the
hero by accessible name, that its `href` is the soonest service's, **that the LATER service is NOT the hero**
(the fixture is deliberately out of date order, so the test proves the hero picks the soonest rather than the
first element handed to it), that the title appears **exactly twice**, and — via `compareDocumentPosition` —
that the hero precedes the listing, which is its whole purpose. **Delete the hero and this drops to 1 and
fails; add a third render site and it rises to 3 and fails.** Six tests stopped caring about a node in the
same wave one test started caring about it.

**Files alone: `public-view.test.tsx` 4 failed | 12 passed (16) → 17 passed (17); `perform-cls.test.tsx`
2 failed | 1 passed (3) → 3 passed (3).**

### R4 · the three book files — 8 failures, 6 → GREEN, **2 STAY RED**

**Named in full, and I did not touch the other one:** the file in scope is
`src/lib/books/__tests__/registry.test.ts`. `find . -name registry.test.ts -not -path ./node_modules/*`
returns it and `src/lib/org/__tests__/registry.test.ts`; **the `org` one is unmodified.**

**The order counted seven repairable tests in these three files. There are SIX.** See §The letter and the
purpose.

| file | test | was | now |
|---|---|---|---|
| `lookup.test.ts` | `stops-and-asks on several exact matches that disagree on folio` | RED, `[30,135,167]` vs pinned `[36,200,238]` | **GREEN, re-derived** |
| `lookup.test.ts` | `returns exact matches sorted ascending by folio` | RED, `[28,91,165]` vs pinned `[34,150,236]` | **GREEN, re-derived** |
| `books.test.ts` | `returns unitId for a feed-tier book` | RED, folio 12 vs pinned 11 | **GREEN, re-derived** |
| `books.test.ts` | `drops to low confidence … recurs at different folios` | RED, `[3,59]` vs pinned `[2,104]` | **GREEN, re-derived** |
| `books.test.ts` | `surfaces totalMatches and truncated … overflows MAX_MATCHES` | RED, 5 vs pinned 11 | **GREEN, query replaced** |
| `registry.test.ts` | `derives the floor from pagemap entries and feed unit folios` | RED, floor 2 vs pinned 1 | **GREEN, re-derived** |
| `registry.test.ts` | `ACCEPTS every folio the books' own data reaches` | RED, class-2 | **STILL RED — see below** |
| `registry.test.ts` | `every unit folio is within its book's declared page count` | RED, class-2 | **STILL RED — `-20` §3** |

**No literal was re-baselined.** Each expectation is derived from the registry the test already imports, and
each keeps at least one assertion the current data could still violate. **Per test, what would still make it
fail:**

- **`lookup.test.ts` Aleinu** — "low" is CONDITIONAL on the three folios disagreeing (`lookup.ts:85`-`:89`
  resolves several exact hits on ONE folio to **"high"**), so the premise is asserted, not assumed: three
  units, three DISTINCT folios, each within the book's declared pages. Fails if the data collapses them onto
  one page, if a fourth Aleinu appears, if a folio leaves the page range, if the ascending sort at `:92`
  breaks, or if the disagreement rule stops demoting.
- **`lookup.test.ts` Kaddish Shalem** — the sort at `lookup.ts:92` is the subject. Asserted twice: against
  the book's own folios **in ascending order**, and against an independent re-sort of what came back. A
  lookup returning the right three in DECLARATION order fails the first while passing the second. Also fails
  if the unit count changes.
- **`books.test.ts` Hashkivenu** — uniqueness is asserted, not assumed (a second Hashkivenu makes "high"
  wrong and it fails at the length check); the AR-3 `@occasion-service` id shape is asserted; the folio must
  be the unit's **FIRST** folio, so returning `folios.at(-1)` fails even though both numbers are real
  (`[12,13]`); and it must sit inside the declared page count.
- **`books.test.ts` Bar'chu** — same conditional as Aleinu: the two folios must DISAGREE or "high" is the
  correct verdict, so distinctness is the assertion. Fails on a third Bar'chu, on the two printing at one
  page, or if the demotion rule goes.
- **`books.test.ts` truncation — THE QUERY CHANGED, not just the number, and this is the one worth your
  eye.** The test used `"Psalm"` and asserted 11 candidates. The rebuilt feed carries **five** units matching
  "psalm" — **UNDER** the 8-match cap. So its whole premise (a query that overflows) had gone, and
  re-baselining 11 → 5 would have left it asserting `truncated: true` about a query that no longer truncates
  — a test that cannot pass, made to pass by writing down the wrong world. The query is now `"Kaddish"`
  (**9** candidates, measured: Chatzi Kaddish / Kaddish Shalem / Mourner's Kaddish, three services each), the
  overflow is DERIVED from the book's own units and **asserted as a premise** (`> 8`), so a future feed that
  drops the count below the cap fails this loudly instead of passing vacuously. The literal `8` remains: it
  is `lookup.ts:24`'s module-private `MAX_MATCHES`, not exported — re-deriving it would mean exporting it,
  which is outside this order. **Unlike a folio it is a code constant and does not move when `corpus`
  regenerates a book.**
- **`registry.test.ts` floor** — three literals (3 / 50 / 1), and **the third was already stale in the
  direction that matters: it pinned the floor at 1, which is the hardcoded 1 the whole describe-block exists
  to have replaced.** shirei-tshuvah's own data starts at folio **2**. Now three data-violable invariants:
  (a) every book's floor sits within `1..pages`; (b) **crc-saturday's floor is strictly above crc-friday's
  highest page — both sides derived** — which is the original defect in one line (the two share 132
  normalized keys at different pages, so a Friday page written under `book: "crc-saturday"` validated
  silently and printed on the lectern sheet), and it fails the moment either pagemap moves into the other;
  (c) not every floor is 1.

**Files alone: `lookup.test.ts` 2 failed | 8 passed (10) → 10 passed (10); `books.test.ts` 3 failed | 5 passed
(8) → 8 passed (8); `registry.test.ts` 3 failed | 20 passed (23) → 2 failed | 21 passed (23).** Test counts
unchanged in all three (10 / 8 / 23).

---

## THE LETTER AND THE PURPOSE — `-20` §3 names ONE test; TWO catch the class-2 defect

**This is the finding of the wave, and it is against the order.**

`R-0904-live-cw-20` §3 makes `registry.test.ts:175` untouchable and calls it *"the one test in this whole
baseline that caught a real defect."* Measured: **it is not the only one.**

`registry.test.ts:119`, **`ACCEPTS every folio the books' own data reaches`**, carries **no literal at all**.
It builds a set from `entries[].page` and `units[].folios` and asserts every member validates. It fails on
**exactly the class-2 row**:

```
AssertionError: expected { book: 'shabbat-shacharit', …(2) } to deeply equal { book: 'shabbat-shacharit', …(2) }
    "book": "shabbat-shacharit",
    "folio": 145,
    "result": {
-     "ok": true,
+     "machineCode": "folio_out_of_range",
+     "message": "Page 145 is outside 'shabbat-shacharit' (2–144).",
+     "ok": false,
```

**It is the SAME defect, from the accept side.** `:175` says a declared folio exceeds the declared page count;
`:119` says the app therefore refuses a page its own data reaches. `-20` §3's LETTER names one; its PURPOSE
covers both.

**So I left it red.** Repairing it would mean excluding one folio from a derived set — deleting the second
catcher of the defect this whole order is built around, in the same wave that congratulates the first. The
docblock above it is explicit about why the accept side exists (*"erring restrictive here would block real
authoring, so every folio the books' own data actually reaches is asserted valid, not a sample"*), which is
[[feedback_err_public_not_gated]] expressed as a test.

**Reported, not decided. R4's count of seven repairable is six, and `-20` §3 wants one clause widened from
`registry.test.ts:175` to "both class-2 catchers in `registry.test.ts`".** The wording is yours to mend.

---

## G1 · the nineteenth is still red, untouched, and still reads the declared-count invariant

```
 FAIL  src/lib/books/__tests__/registry.test.ts > feed-tier book snapshots > every unit folio is within its book's declared page count
AssertionError: expected 145 to be less than or equal to 144
 ❯ src/lib/books/__tests__/registry.test.ts:175:31
    173|                 for (const f of u.folios) {
    174|                     expect(f).toBeGreaterThanOrEqual(1)
    175|                     expect(f).toBeLessThanOrEqual(entry.pages)
       |                               ^
```

`:169`-`:179` are byte-identical to `cdf1c37386`. `git diff` on that file is a single hunk, `+46/-3`, entirely
inside `derives the floor from pagemap entries and feed unit folios`. **A green suite would have been a failed
order; the suite is not green.** The value — 145 or 144 — still needs the printed page and is
`machzor`/`corpus`'s, per `-20` §4.

---

## THE FOURTH RED — reported, not swept

**After-run 1 carried a fourth failure I did not cause, and after-run 2 did not:**

```
 FAIL  src/components/music/__tests__/pdf-viewer.test.tsx > PDFViewer — multi-page indicator (WS-07) + width guard (WS-05) > does NOT render pages at width 0 (no blank zero-width pages)
```

**Not mine, and here is the evidence rather than the assertion.** (a) It is not one of the eight files I
touched, and nothing I changed goes near PDF rendering. (b) It was **GREEN at baseline** — the baseline's
seven red files are named and it is not among them. (c) **Run alone at the post-edit tree: 18 passed (18).**
(d) The immediate second whole-suite run, same tree, no edits between: **it passed.** It is a load-timing
intermittent of the family already on record, and the honest report is that a single suite run in this repo
cannot distinguish "my regression" from "this flake" — **two runs can, and that is why both are quoted.**
G3's STOP was considered and cleared on that evidence, not waved past.

---

## Guards

**G1 · the nineteenth is still red** — quoted above, untouched, `:175` and its declared-count invariant
intact. **PASS.**

**G2 · nothing turned green by deletion.** Observed counts: test files deleted **0**; tests deleted **0**;
tests renamed **1** — S5 only, authorised and named in R2. `.skip` / `.only` / `.todo` / `it.fails` /
`describe.skip` added **0** (grepped HEAD blob vs worktree across all eight files: 0 → 0 on every one).
`git diff --diff-filter=DR --name-status` is empty. `it(`/`test(` per file, HEAD → worktree: perform-cls
3 → 3, public-view **16 → 17**, sync-engine-songs-mirror 7 → 7, lookup 10 → 10, registry 17 → 17, books
8 → 8, library 20 → 20. **Skipped count 78 → 78, did not rise. Tests total 4087 → 4088, did not fall.**
**PASS.**

**G3 · measured per test, alone and in the suite.** Per-file alone, before → after: library `2f|18p (20)` →
`20p (20)`; sync-engine-songs-mirror `3f|4p (7)` → `1f|6p (7)`; public-view `4f|12p (16)` → `17p (17)`;
perform-cls `2f|1p (3)` → `3p (3)`; lookup `2f|8p (10)` → `10p (10)`; books `3f|5p (8)` → `8p (8)`; registry
`3f|20p (23)` → `2f|21p (23)`. Whole suite before and after, quoted in §G5. **16 named tests moved red →
green. One test that was green went red in one of two after-runs and is dispositioned above. PASS.**

**G4 · `tsc --noEmit` clean** (exit 0, no output) **and `next build` green** — `rm -rf .next` first, then
`SKIP_ENV_VALIDATION=1 npx next build --webpack`, **exit 0**, all routes emitted. R3 edited a component so the
build was exercised; **nothing was deployed.** **PASS.**

**G5 · both suite lines quoted verbatim with their labels, before and after, no arithmetic across them.**
**PASS.**

**G6 · zero catalog writes.** **No catalog tool was invoked in this wave at all** — the work was eight files
(seven test files + two `data-testid` attributes), and no code path that writes a row was executed. **Stated
as a delta, with its provenance:** `list_library` at close returns **`total: 892`**, identical to the 892 at
open — but that open figure is **INHERITED from my own 14:3xZ row, not re-measured by me this wave**, and I
could not re-measure the 789/101/2 per-class split because **`dump_collection_size` refused at
`403 forbidden`: this thread's MCP identity is `musician`, not admin.** So: total unchanged and measured at
close; the class split unmeasured and named as such. **PASS, with the instrument's limit stated.**

---

## Git

Eight files modified, `+396/-55`:

```
 17	 2	src/components/performance/PublicSetlistListing.tsx
 15	 4	src/components/performance/__tests__/perform-cls.test.tsx
106	 7	src/components/performance/__tests__/public-view.test.tsx
 60	15	src/lib/__tests__/sync-engine-songs-mirror.test.ts
 56	 7	src/lib/books/__tests__/lookup.test.ts
 46	 3	src/lib/books/__tests__/registry.test.ts
 81	12	src/lib/mcp/tools/__tests__/books.test.ts
 15	 5	src/lib/mcp/tools/__tests__/library.test.ts
```

**Line endings preserved per file** rather than normalised — six of the eight are CRLF in this tree and two
(`perform-cls.test.tsx`, `library.test.ts`) are LF; every edit was applied through a helper that detects and
restores the file's own terminators, which is why the numstat is minimal and there is no phantom whole-file
diff. Committed with `Lane: live (Code)`. **Not pushed as a deploy — this order forbids one; the commit lands
on `master` and `R-0904-live-cw-21`'s gate question stays yours and Daniel's.** Four untracked paths in the
tree (`.playwright-mcp/`, `docs/BRAND-DOSSIER.md`, `docs/brand-assets/`, one artifact PDF) are **not mine and
not staged.**

## FOR live-cw

1. **`-20` §3 wants one clause widened.** Two tests catch the class-2 defect, not one:
   `registry.test.ts:175` (declared-count side) and `registry.test.ts:119` (accept side, no literal, derived).
   Both are red and untouched. R4's "seven repairable" is six.
2. **S1 is a behaviour question, not a test question.** Every Drive shortcut is dropped at ingestion by
   design (`sync-engine.ts:16`, `junk-filter.ts:35`). Should a shortcut-bonded row still reach `songs/*`?
   Until you rule, the test stays red with the reasoning in its own comment.
3. **The truncation test's PREMISE had expired, which is a shape the order did not anticipate** — not a stale
   number but a stale *query*. Worth a line in the next order's language: a re-derived expectation must also
   re-check that the test's setup still reaches the branch it names.
4. **One drift in the order's citations:** `MAX_PUBLIC_SERVICES` is applied at `public-setlist-order.ts:97`-`:98`,
   not `:90`-`:92`. Everything else re-verified exactly as written.
5. **A single suite run in this repo cannot tell a regression from the pdf-viewer load flake.** Two runs can.
   If a future order's guard says "no test that was green is now red", it should say **"in two runs"**, or the
   guard will STOP a clean wave roughly at the flake's own rate.

*Claude records; Daniel decides.*
