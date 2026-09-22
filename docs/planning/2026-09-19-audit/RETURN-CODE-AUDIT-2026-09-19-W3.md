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

Both produced confidently wrong numbers, and both were load-bearing. Described
here as they were found; **all three are fixed in Wave 3b below.**

**`list_review_queue` cannot see past 200 rows and says otherwise.**
`readReviewQueue` caps its Firestore query at `PAGE_LIMIT = 200`
(`src/lib/library/review-queue.ts:162`). `listReviewQueue` then computes
`truncated` by comparing what it returned against that already-capped array, so
a queue of any size at or above 200 returns exactly 200 rows and
`truncated: false`. The handoff's "50+ rows frozen" was the same artifact one
level down — read off a default `limit: 50`. The real queue was **270**.
Nothing here depended on the count in the end, because clearing it drains the
queue in rounds, but a reader trusting `truncated` would have stopped at 200.
Left unfixed while the queue was being drained — a read-path change in a tool
being actively written through is the wrong thing to land mid-run. **Fixed in
Wave 3b.**

**`get_web_vitals_summary` defaults to the top 5 routes.**
`DEFAULT_TOP_ROUTES = 5` (`src/lib/mcp/tools/web-vitals-summary.ts:55`), sorted
by sample count. Two of the three routes (i) is about — `/setlists/[id]` and
`/login` — sit below that line, so the default call reports neither and looks
like they have no data at all. Pass `topRoutes: 50` and both are there. The
surface keys are also not normalized: `/perform/setlist/[id]/track/<uuid>`,
`/perform/<driveId>` and `/qr/<code>` each land as their own route, which
fragments the sample counts and is most of why the top-5 cut was so misleading.
**Both fixed in Wave 3b.**

Separately, `scripts/supervisor-prod-bearer.mjs` now reports a healthy bearer
as dead. Its health probe calls `list_minted_bearers` against `/api/mcp`, and
the (p) split moved that tool to `/api/ops/mcp`, so the helper exits 3 on a
perfectly good credential. Worked around at the time by reading `.env.local`
directly. **Fixed in Wave 3b.**

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
| `backfill_content_hash` | already clean on crc | 0 (but see BL below) |

All four now report zero and all four stay on the ops surface, because "empty
today" is not "will never fill again". Deleting them would leave the next 278
rows of drift with no remedy. `backfill_heal_metadata` is not a sweep at all —
it takes a required `fileId` and repairs one file, so it has no completed state
to confirm and was mis-classified by the handoff.

The mimetype heal was checked before it ran: all 253 were `null` -> a concrete
type (239 pdf, 13 text/plain, 1 png). No `octet-stream`, and no MusicXML row
was rewritten.

Ops surface is now **47 tools**; authoring is unchanged at 97.

**The tenant half** — `backfill_content_hash` and `backfill_library_index`
scope by `orgFrom(extra)`, so the confirmation above is crc-only: 927 of the 990
`library_index` rows. The remaining 63 are Brothers Lazaroff. **Closed in Wave
3b**, and the answer strengthens the verdict here: BL has 52 rows with no
`contentHash` at all.

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

All three tool defects above are **fixed** in this wave, and the Brothers
Lazaroff tenant gap is **closed**. See the Wave 3b section below.

---

# Wave 3b — the three defects, fixed, and the BL tenant confirmed

## The fixes

**`list_review_queue` now counts instead of guessing.** `readReviewQueue`
gained three `count()` aggregations and returns `totals` alongside the capped
arrays; `listReviewQueue`'s `counts` is now the TRUE bucket size and a new
`returned` field says how many rows the call actually handed back, with
`truncated` comparing the two. An aggregation transfers a number, not
documents, so this costs three round trips and no extra reads. Pinned by an
emulator regression test that seeds **201** rows — the cheapest number that can
tell the old implementation from the new one, since at exactly the 200 cap the
broken version is indistinguishable from correct.

**`get_web_vitals_summary` now sees the whole app.** Two changes, and the
second is the one that mattered. `DEFAULT_TOP_ROUTES` went 5 → 25, but the real
defect was upstream: `getSurface()` normalized three path shapes and missed
four, so every chart a musician opened became its own surface key. The
normalizer is now a first-match-wins table covering the track, chart, QR,
setlist and library-review routes, extracted as a pure `normalizeSurface()`
and applied **on read as well as on write** — which means the 90 days already
in the sink re-normalize immediately rather than waiting out the TTL.

I introduced and then caught a bug writing it, worth recording because the
shape is easy to repeat: my first version chained `.replace` calls, so the
track rule rewrote to `/perform/setlist/[id]/track/[trackId]` and the setlist
rule that ran next matched `[id]` as its own `[^/]+` and collapsed it straight
back. Every track sample would have been filed under the setlist route — the
same fragmentation, just hidden better. Hence first-match-wins, and hence the
ordering test.

**`supervisor-prod-bearer.mjs` stops blaming the bearer.** `DEFAULT_ENDPOINT`
now points at `/api/ops/mcp`, where `list_minted_bearers` actually lives after
the (p) split. More usefully, "tool not found" is no longer folded into the
revoked bucket: it gets its own exit code (`PROBE_TOOL_MISSING = 5`) and an
error that names the real cause. A server answering "no such tool" is proof the
credential got far enough to be told so, which is the opposite of a bad bearer
— the old message sent the reader off to have Daniel replace a credential with
nothing wrong with it. Verified live: the helper now exits 0.

## (p) — the Brothers Lazaroff tenant, confirmed

Minted a short-lived `mcpTokens` doc stamped `orgId: "brotherslazaroff"` and
bound to the **same admin uid** the crc root bearer resolves to
(`93Xn3DbS0bSNb8zmfzLyfOMX1A13`, role `admin`), used it for **dry runs only**,
and revoked it immediately — confirmed revoked at `2026-09-22T15:02:15Z` by
reading the doc back, not by trusting the write's own success message. The
Admin SDK credential came from the existing firebase-CLI-token → temp-ADC
recipe already used by the 2026-06 migrations; no service-account key was
created and nothing was persisted.

Both org-scoped tools, dry-run against BL's 63 rows:

| tool | BL result |
|---|---|
| `backfill_library_index` | **clean** — 63 scanned, 0 rows changed, 0 unresolved |
| `backfill_content_hash` | **52 of 63 rows carry no current `contentHash`** |

So the tenant answer is not symmetric, and it lands on the side the commit
already took: **`backfill_content_hash` is not a finished migration on either
tenant's terms** — crc is clean only because it was run, and BL has 52 rows of
real work outstanding. Retiring it would have been a mistake, and this is the
evidence that would have been missing. `md5CrossCheck` agreed 52 of 52 with
zero mismatches, so the byte path and the rows agree about which object belongs
to which row.

**Not run, deliberately.** Hashing those 52 rows is a write against another
tenant's data, and the task was to confirm, not to sweep. It needs a named
owner and a deliberate go-ahead. Flagging it as the one open item rather than
quietly doing it.

## Verification

`npx tsc --noEmit` clean. **738 unit tests passed** across 42 files. **57
emulator tests passed** (`review-queue` + `mcp-library-review`, including the
new 201-row regression). Full production build (`--webpack`) clean from an
empty `.next`.

## Open

1. **52 Brothers Lazaroff rows need `backfill_content_hash`.** Needs an owner
   and a go-ahead; it is a write on BL data. Everything needed to run it is
   confirmed working.
2. **(i) on `/library` and `/setlists/[id]`** — still waiting on band traffic,
   but the summary will now actually show them, and the re-normalization means
   the history already collected counts toward it.
