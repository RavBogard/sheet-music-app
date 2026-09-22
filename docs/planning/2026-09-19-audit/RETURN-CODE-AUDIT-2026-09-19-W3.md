# Wave 3 return — the four items the account role was blocking

2026-09-22. The MCP account is `admin`, which unblocked everything Wave 2B
parked. All four items are closed, or closed with a named gap.

| item | state | where |
|---|---|---|
| **(j)** clear the AI review queue | **DONE** | 270 rows cleared in production |
| **(i)** re-measure web vitals | **DONE** | `/login` confirmed fixed; two routes lack post-fix traffic |
| **(p)** retire the completed backfills | **DONE** | `f551af1e` — one retired, four kept, with evidence |
| **(n)** register the legacy Shabbat feeds | **DONE** | `940836e1` |

---

## First, two defects in the tools this wave had to use

Both produced confidently wrong numbers, and both were load-bearing.

**`list_review_queue` cannot see past 200 rows and says otherwise.**
`readReviewQueue` caps its Firestore query at `PAGE_LIMIT = 200`
(`src/lib/library/review-queue.ts:162`). `listReviewQueue` then computes
`truncated` by comparing what it returned against that already-capped array, so
a queue of any size at or above 200 returns exactly 200 rows and
`truncated: false`. The handoff's "50+ rows frozen" was the same artifact one
level down — read off a default `limit: 50`. The real queue was **270**.
Nothing here depended on the count in the end, because clearing it drains the
queue in rounds, but a reader trusting `truncated` would have stopped at 200.
**Not fixed in this wave** — it is a read-path change in a tool I was actively
using to write, and it wants its own commit.

**`get_web_vitals_summary` defaults to the top 5 routes.**
`DEFAULT_TOP_ROUTES = 5` (`src/lib/mcp/tools/web-vitals-summary.ts:55`), sorted
by sample count. Two of the three routes (i) is about — `/setlists/[id]` and
`/login` — sit below that line, so the default call reports neither and looks
like they have no data at all. Pass `topRoutes: 50` and both are there. The
surface keys are also not normalized: `/perform/setlist/[id]/track/<uuid>`,
`/perform/<driveId>` and `/qr/<code>` each land as their own route, which
fragments the sample counts and is most of why the top-5 cut was so misleading.

Separately, `scripts/supervisor-prod-bearer.mjs` now reports a healthy bearer
as dead. Its health probe calls `list_minted_bearers` against `/api/mcp`, and
the (p) split moved that tool to `/api/ops/mcp`, so the helper exits 3 on a
perfectly good credential. Worked around here by reading `.env.local` directly.

---

## (j) — 270 rows, not 50

Queue state on arrival: 270 rows, all `review_pending`, all `source: salvage`,
all `supplemental`, all PDF, enriched 2026-05-20..23 and frozen since.
`aiFailed` and `importFailures` were both empty. Auto-apply was already on at
threshold 0.90 (`get_ai_config`), so the gate the handoff names was live; what
remained was the rows that predate it.

Applied the gate as the rule: **confidence >= 0.90 -> `accept_enrichment`**,
**< 0.90 -> `reject_enrichment`**. Dry run first over the visible 200 — 134/66,
zero errors, planned patches were gap-fills of `key`, `bpm`, `tags`, `name`.
Then applied in rounds until the queue drained.

    round 1   200 rows   accept 134   reject 66
    round 2    70 rows   accept  51   reject 19
    round 3   empty

**185 accepted, 85 rejected, 0 errors.** Verified empty afterwards:
`counts: {aiReview: 0, aiFailed: 0, importFailures: 0}`.

Why the rejections are not a loss: `rejectEnrichment` flips `enrichmentStatus`
to `human_rejected` and stamps reviewer and time. It does **not** delete
`aiSuggestion` — the suggestion stays on the row
(`src/lib/library/review-queue.ts:439`). And `acceptEnrichment` is gap-fill
only: it never overwrites a human-set field and never touches `collection`. So
neither verb could overwrite something Daniel had set by hand.

## (i) — one route proved, two short of traffic

The fix commit is `56dbdc36`, deployed 2026-09-20 08:39. Anything older than
that is pre-fix, which is what made the 30-day window look like nothing had
changed.

| route | before (30d, mostly pre-fix) | after |
|---|---|---|
| `/login` LCP | **8980 ms** (n=3) | **584 ms** median, synthetic, 3 runs |
| `/library` CLS | **1.0** (n=10) | 0.05 — but n=**1** |
| `/setlists/[id]` CLS | **0.58** (n=13) | no post-fix samples at all |
| `/perform/setlist/[id]` CLS | 0.02 (n=73) | 0.05 (n=11) — was never regressed |

`/login` is settled. RUM had 3 samples in 30 days and none since the deploy, so
I measured it directly against production with Playwright: LCP 624 / 516 / 584
ms, CLS 0 on every run. Against roughly 9 seconds, that is not a margin anyone
needs more samples to believe.

`/library` and `/setlists/[id]` are **not** proved. Both are behind auth, both
are low-traffic, and between them they have one CLS sample since the fix
landed. That one sample moved 1.0 -> 0.05, and the code change is the right
shape — the skeleton and the virtualizer now import one `ROW_ESTIMATE_PX` — but
one sample is one sample. This needs a week of band traffic, not more work.

## (p) — the confirmation inverted the premise

Full reasoning is in `f551af1e` and in the comment block at
`src/lib/mcp/surfaces.ts`. Short version: the handoff assumed six completed
one-shot migrations. Confirming them found **one**.

`seed_legacy_dedupe_run` was a true one-shot: it imported the hand-written
09-01 undo artifact into `dedupeRuns/legacy-2026-09-01`. That record exists and
carries its 83 prior-status rows, and the source JSON is no longer in the repo
to re-import. Retired.

The other four are recurring hygiene sweeps, and the confirming run itself
turned up **278 rows of live drift**:

| tool | found | after running |
|---|---|---|
| `backfill_track_mimetype` | 253 tracks with a null `mimeType` | 0 |
| `backfill_setlist_test_flag` | 21 setlists with no `isTest` | 0 |
| `backfill_library_index` | 4 rows with an unhydrated `fileSize` | 0 |
| `backfill_content_hash` | already clean | 0 |

All four now report zero and all four stay on the ops surface, because "empty
today" is not "will never fill again". Deleting them would leave the next 278
rows of drift with no remedy. `backfill_heal_metadata` is not a sweep at all —
it takes a required `fileId` and repairs one file, so it has no completed state
to confirm and was mis-classified by the handoff.

The mimetype heal was checked before it ran: all 253 were `null` -> a concrete
type (239 pdf, 13 text/plain, 1 png). No `octet-stream`, and no MusicXML row
was rewritten.

Ops surface is now **47 tools**; authoring is unchanged at 97.

**The tenant half is not fully closed.** `backfill_content_hash` and
`backfill_library_index` scope by `orgFrom(extra)`, so today's confirmation is
crc-only: 927 of the 990 `library_index` rows. The remaining 63 are Brothers
Lazaroff and need a BL-org bearer, which a crc bearer cannot mint —
`mint_admin_bearer` reuses the caller's uid by design. Since nothing was
deleted on the strength of that gap it costs nothing to leave open, but it
should be closed by whoever next holds a BL credential.

## (n) — landed, and the field that decides it

`crc-friday` and `crc-saturday` are pagemaps with folios but no unit ids, so no
row in them reached a moment and nothing joined to the cue log. The two feeds
carry the ids, and they are now registered as feed-tier books **alongside**
those pagemaps: 78 units against Friday's 48 entries, 95 against Saturday's 62.
**173 occurrences that were being dropped now land** — moments.json goes 225 ->
312 moments, 473 -> 646 occurrences, 9 -> 11 books.

The correctness rests entirely on reading `printedFolio` and not `folios`. I
re-measured rather than taking Wave 2B's word for it:

| feed | units | with id | with `printedFolio` | `printedFolio` range | `folios` range | units where the two disagree |
|---|---|---|---|---|---|---|
| `legacy-shabbat-evening` | 78 | 78 | 78 | 2–48 | 1–55 | **73 of 78** |
| `legacy-shabbat-morning` | 96 | 96 | 95 | 50–101 | 1–63 | **95 of 95** |
| `legacy-slichot` | 8 | 8 | **0** | — | — | — |

The two fields are not interchangeable, and the wrong one is wrong almost
everywhere. `VOLUMES` declares `folioSource: "printedFolio"`, `trim()` reads
it, and `legacyPrintedRemapper` replaces the folios the moments producer emits.
Verified on the written output: 0 of 95 morning book units and 0 of 173 legacy
moment occurrences carry anything other than the printed folio.

`pages` is 48 and 102, taken from the pagemaps rather than the feeds'
`printing.pages` of 48 and **54** — the morning feed's 54 counts the reader
edition, and asserting folio 101 against it would have thrown on correct data.

`legacy-slichot` stays unregistered: 0 of its 8 units carry a `printedFolio`,
because Selichot is a separate handout with no printed original. This matches
the exclusion already written into the `crc-machzor-2008` registry note.

Six new tests pin all of this (`scripts/__tests__/sync-books-moments.test.ts`),
including that a volume *without* `folioSource` still reads `folios`.

---

## Verification

`npx tsc --noEmit` clean. `npx vitest run src/lib/books src/lib/liturgy
scripts/__tests__ src/lib/mcp/__tests__/surfaces.test.ts` — **517 passed**.
Full production build (`--webpack`) clean from an empty `.next`.

## What is left

1. **`list_review_queue`'s 200-row blindness** — `truncated` is computed after
   the cap, so it can never report `true`. Wants a `count()` aggregation.
2. **`get_web_vitals_summary`** — the top-5 default hides exactly the routes
   anyone asking about a regression is asking about, and the surface key is not
   normalized for `/perform/.../track/<uuid>`, `/perform/<driveId>`, `/qr/<code>`.
3. **`scripts/supervisor-prod-bearer.mjs`** — health-probes a tool that now
   lives on the ops surface; reports a good bearer as revoked.
4. **(i) on `/library` and `/setlists/[id]`** — re-read after a week of band
   traffic. Nothing to build.
5. **(p) on the Brothers Lazaroff tenant** — 63 `library_index` rows, needs a
   BL-org bearer.
