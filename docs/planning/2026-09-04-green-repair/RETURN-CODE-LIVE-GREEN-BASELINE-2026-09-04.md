# RETURN → `live-cw`: GREEN-BASELINE — the red is measured, and it is 200 runs deep

Lane: **live (Code)**, host-side `~/CentralReform.live` · Order: `HANDOFF-CODE-LIVE-GREEN-BASELINE-2026-09-04.md`
Authority: **R-0904-live-cw-13 / -14 / -12 / -10**, **R-0903-live-cw-4**
Verified-against: `057fbe61d3`, **re-verified BY CONTENT before the first edit** — `git rev-parse HEAD` ==
`/api/version` sha == `057fbe61d335a55b19276836657cd68c54a697cc`, no tracked working-tree changes.
**Rollback, read off `/api/version` BEFORE the push: `057fbe61d3`** (G6).
Production serves **`cdf1c37386`** since **2026-09-04T09:20:07 local** — B2 alone, nothing else rode it.
Status: **COMPLETE.** Six guards asserted. **Zero catalog writes, delta 0. No test deleted, skipped, renamed
or rewritten. Nothing repaired.**

**The headline is bigger than the order's premise.** You ruled on three consecutive deploys. The measurement
says **200 CI runs on `master`, 2026-06-09 → 2026-09-04, every single one `failure`, and not one green run in
the visible window.** The unit job specifically is red in every run I sampled across that whole span,
including the oldest. `-13` is right and was understated by about sixty-five times.

---

## B1c first, because the other numbers depend on it

Both numbers in my 13:0xZ amendment were real and neither was labelled. From this run's summary block,
verbatim, two consecutive lines:

```
 Test Files  7 failed | 342 passed | 6 skipped (355)
      Tests  19 failed | 3990 passed | 78 skipped (4087)
```

**`7 failed … (355)` is the FILE line. `19 failed … (4087)` is the TEST line.** `339 + 9 + 7 = 355` was the
right arithmetic on the wrong line — it proved the CI figure was files, and the 19 was always tests. The
baseline's size is **19 failing tests across 7 files, out of 4,087 tests in 355 files.**

**One drift worth naming:** CI reported `7 failed | 339 passed | 9 skipped`, and locally the same 7 files fail
with `342 passed | 6 skipped`. Same failures, but **three files skip in CI that run here** — an environment
difference in the *skip* set, not in the red.

## B1 · The red, test by test — and it is FIVE causes, not nineteen

Every one of the 19 traces to a **deliberate, documented app change** that its test predates. **All 19 also
fail when their file is run ALONE**, so none is cross-file contention — I checked each of the seven in
isolation and the counts were identical to the suite's, file for file.

| # | file · test | assertion (received → expected) | class |
|---|---|---|---|
| 1 | `sync-engine-songs-mirror` · S1 Drive shortcut mirrors | `libraryWritesFor('shortcut-lechu')` `[]` → length 1 (`:180`) | **1 STALE** |
| 2 | `sync-engine-songs-mirror` · S4 empty name, library still writes | `libraryWritesFor('empty-name')` `[]` → length 1 (`:231`) | **1 STALE** |
| 3 | `sync-engine-songs-mirror` · S5 non-chart MIMEs ARE mirrored | `songsWritesFor('folder-1')` `[]` → length 1 (`:246`) | **1 STALE** |
| 4 | `perform-cls` · reserves slot for anon visitor | `TestingLibraryElementError: Found multiple elements with the text: Shabbat Morning` (`:104`) | **1 STALE** |
| 5 | `perform-cls` · does NOT reserve for authed returner | same, multiple `Shabbat Morning` (`:121`) | **1 STALE** |
| 6 | `public-view` · renders SSR-prefetched cards immediately | multiple `Erev Shabbat (SSR)` (`:293`) | **1 STALE** |
| 7 | `public-view` · renders a `publishedAt:null` setlist | multiple `Saturday B'nei Mitzvah` (`:326`) | **1 STALE** |
| 8 | `public-view` · filters `isTest:true` from the SSR slice | multiple `Real Service` (`:362`) | **1 STALE** |
| 9 | `public-view` · caps the listing at 5 services | links length `6` → `5` (`:392`) | **1 STALE** |
| 10 | `books/lookup` · stops-and-asks on disagreeing folios | `[30, 135, 167]` → `[36, 200, 238]` (`:63`) | **1 STALE** |
| 11 | `books/lookup` · exact matches sorted ascending by folio | `[28, 91, 165]` → `[34, 150, 236]` (`:101`) | **1 STALE** |
| 12 | `books/registry` · derives the floor from own data | `2` → `1` (`:86`) | **1 STALE** |
| 13 | `books/registry` · ACCEPTS every folio the data reaches | `{book:'shabbat-shacharit', …}` mismatch (`:131`) | **1 STALE** |
| **14** | **`books/registry` · every unit folio is within its book's declared page count** | **`145` → `<= 144` (`:175`)** | **2 REAL DEFECT** |
| 15 | `mcp/tools/books` · returns unitId for a feed-tier book | `12` → `11` (`:43`) | **1 STALE** |
| 16 | `mcp/tools/books` · drops to low confidence on recurrence | `[3, 59]` → `[2, 104]` (`:59`) | **1 STALE** |
| 17 | `mcp/tools/books` · surfaces totalMatches / truncated | `5` → `11` (`:105`) | **1 STALE** |
| 18 | `mcp/tools/library` · keeps every real chart in one class | `'unknown'` → `'score'` (`:268`) | **1 STALE** |
| 19 | `mcp/tools/library` · Google-Apps class distinct, tolerates missing mime | `'unknown'` → `'score'` (`:279`) | **1 STALE** |

### The five causes, each named in the app's own words

**(a) Rows 4–9, all six DOM failures, are ONE change: the `next service` hero.** `PublicSetlistListing.tsx`
gained an F1 (v11.5-02-01) one-tap entry that renders `upcoming[0]` as its own `<Link>` with an
`<h2>{next.name}</h2>` **above** the capped list (`:252`–`:278`). So the soonest upcoming service is in the
DOM **twice**, and it contributes a **6th `<a>`** to a 5-row listing. `MAX_PUBLIC_SERVICES` is still `5`
(`public-setlist-order.ts:13`) — **the cap did not move; the hero is the extra row.** Every `getByText` on a
service title in those two files now matches two nodes, and `getByText` throws on two.

**I was wrong about this once and correcting it is the finding.** My first hypothesis was missing RTL
cleanup between cases. The pass/fail pattern refutes it: in `perform-cls` the **first two** tests fail and the
**third** passes, which is the wrong way round for accumulating renders — and the third simply never queries a
service title. Running each file alone confirmed it. **A cleanup theory would have sent the repair at the
test harness; the cause is one component that gained a second render site.**

**(b) Rows 1–3 are ONE change: the non-chart ingestion filter.** `sync-engine.ts:138`–`:149` (v11.5-04-02)
filters Drive results through `isNonChartArtifactShape` before anything is written, and its comment states the
reversal outright: *"Folders were previously written to library_index too — now excluded here uniformly."*
The three failing scenarios are a shortcut, a folder with an empty name, and a folder/audio/doc trio — and
S5's title is literally **"non-chart MIME types ARE mirrored — no MIME filter"**. The other four scenarios in
that file, which assert writes for a PDF and an existing row, **pass** — so writes happen; only the
non-chart contract inverted.

**(c) Rows 18–19 are E1.** `chartFormatClass` opens with `if (!m) return "unknown"` and the comment names the
ruling: *"E1 (R-0904-live-cw-3): an unknown class is not a matching class."* The tests assert the pre-E1
`"score"`. **Production reach: zero, and I measured it myself rather than inheriting it — 892 rows enumerated,
0 with an empty `mimeType`.** So no user can be behind this one.

**(d) Rows 10–13 and 15–17 are the feed data moving under hardcoded folios.** The tests pin literal folio
numbers, unit counts and match totals; the current registry answers different ones (`[30,135,167]` where the
test wants `[36,200,238]`; 12 units where it wants 11; 5 matches where it wants 11). The feed is **generated**
from the Typst build, so the current values are authoritative and the literals are stale.

**(e) Row 14 is the real one, and it is one line of data.** `src/data/books/shabbat-shacharit.json` declares
`pages: 144`, and the unit **`seasonal.shehecheyanu@shabbat-shacharit` ("Shehecheyanu") carries folio 145** —
one page past the end of the book. I checked all three feed books: **`shabbat-maariv` maxFolio 69 of 69
(clean); `shirei-tshuvah` maxFolio 182 of 184 (clean); `shabbat-shacharit` maxFolio 145 of 144 — exactly one
unit, exactly one folio out of range.**

**What a user would see:** `lookup_book_page` for Shehecheyanu in the Shabbat-morning book answers **page 145
of a 144-page book**. Daniel or a musician told "Shehecheyanu, page 145" turns to a page that does not exist.
It is a one-unit blast radius on a seasonal insertion, not a Friday-stopper — but it is the class-2 row this
order exists to find, and it was sitting behind eighteen stale expectations.

**And it is the family's own lane, as you suspected.** `817870bb3a` (2026-09-02) is
**`fix(books): shabbat-shacharit printed pages 145 -> 1…`** — the declared count was moved from 145 to 144 by
this family's `SHACHARIT-144` work, **and the Shehecheyanu unit's folio was not moved with it.** The side that
moved is the page count. Which value is now correct — folio 144, or a 145-page book — is a question about the
printed PDF and belongs to `machzor`/`corpus`, not to me.

## B1b · When it went red: **before the visible window, and there is no green to bound it**

`gh run list --workflow=ci.yml --branch=master --limit 200` returns **200 runs, 2026-06-09T13:33 →
2026-09-04T12:41, and `Counter({'failure': 200})`.** Not one success. Across **all** workflows and branches,
the only green runs in the repo are **Dependabot Updates**.

Job level, because a red workflow can mean a red e2e and a green unit — I sampled seven runs spanning the
window and read each one's jobs:

| run | date | Unit | Lint & Type | Build | Emulator | E2E |
|---|---|---|---|---|---|---|
| `33874093445` | 09-04 | **failure** | failure | success | success | failure |
| `33653986058` | 09-02 | **failure** | failure | success | failure | failure |
| `33549096827` | 09-01 | **failure** | failure | failure | success | skipped |
| `33325318774` | 08-30 | **failure** | failure | success | success | failure |
| `32147978603` | 08-18 | **failure** | failure | success | success | failure |
| `27992941034` | 06-23 | **failure** | failure | success | success | failure |
| `27792920051` | 06-18 | **failure** | failure | success | success | failure |

**The unit job is red in every sample, including the oldest visible run.** So the answer the order asked for —
the first red unit job and its commit — **lies before 2026-06-09, outside what `gh` will show me**, and per the
order's own fallback the interval stands as the answer: **red since at least 2026-06-09, no green run visible,
ever.** `Lint & Type Check` is red in all seven too. `Build Check` is green in six of seven — **the one job
that is reliably green is the only one that gates anything**, which is `-14` arriving from a second direction.

**I did not use `git log` to date the test files, and the reason is a trap this desk has been bitten by
before.** `git log -1 -- <path>` reported **the same commit — `a7aab82a8c`, a `docs(mcp)` commit — as the last
edit for six unrelated test files.** That is not history: `git rev-parse --is-shallow-repository` → **true**,
`.git/shallow` holds **64** entries, `a7aab82a8c` is one of them and is the oldest of only **27** visible
commits. Reporting a docs commit as those tests' author would have been a fabrication with a sha attached.
**Filesystem mtimes instead**, which agree with your own `stat` at the mount:

| file | mtime |
|---|---|
| `public-view.test.tsx` · `sync-engine-songs-mirror.test.ts` | 2026-06-07 |
| `perform-cls.test.tsx` | 2026-06-10 |
| `books.test.ts` · `lookup.test.ts` | 2026-08-30 |
| `registry.test.ts` | 2026-08-30 |
| `library.test.ts` | 2026-09-02 |

The two June files match a red window that starts before 2026-06-09; the three late-August book files match
the book-registry work; `library.test.ts` matches E1's week.

## B2 · `run_not_found: 404` — and a class, not a coincidence

All three of your cited lines verify by content at `057fbe61d3`: the throw at
**`src/lib/mcp/tools/undo-dedupe.ts:314`**, the slug assertion at
**`mcp-undo-dedupe.emulator.test.ts:347`**, and `ERROR_CODE_MAP[machine_code] ?? 500` **now at
`src/lib/mcp/errors.ts:161`** — your correction of `:147` was right, and my own two rows are the reason it
moved.

**Added `run_not_found: 404`** (now `errors.ts:116`), and **extended the emulator test to assert the code as
well as the slug**, the same shape N1's dedupe test took. Behaviour, message and hint unchanged.

**Then the grep you asked for, and it is a ruling-sized answer. Of 141 distinct machine codes thrown through
`richError()` in non-test `src/`, 100 have NO row in `ERROR_CODE_MAP` and default to 500.** Not a third
instance — a two-thirds majority. A sample of what that means on the wire today:

| should plainly be | codes currently answering `500` |
|---|---|
| **409 conflict** | `chart_in_use` (`delete_chart`'s own refusal), `upload_session_already_finalized`, `duplicate_detected_in_library` |
| **404 not found** | `template_not_found`, `stage_not_found`, `upload_session_not_found`, `drive_file_not_found`, `chart_bytes_missing`, `run_record_empty` |
| **400 bad argument** | `file_id_required`, `to_status_required`, `to_status_invalid`, `invalid_arguments`, `invalid_base64`, `invalid_collection`, `invalid_since`, `invalid_proposal`, `unknown_track_id` |
| **403 forbidden** | `forbidden_org`, `forbidden_owner`, `forbidden_field`, `monitor_privilege_required`, `cross_owner_publish_forbidden`, `non_root_bearer_cannot_mint` |
| **413 too large** | `chart_too_large`, `chunk_too_large`, `size_exceeds_cap`, `source_too_large` |

**Three of those hundred are in `mark-chart-status.ts`, the file I shipped yesterday** —
`file_id_required`, `to_status_required`, `to_status_invalid` all answer 500 for a plain caller mistake. I
fixed none of them: `-12` authorized one row and the order says report the rest. **Reported. This is the
third instance you asked me to look for and it turned out to be the rule rather than the exception.**

## B3 · What gates a promotion: **nothing but `next build`, and I proved it by watching one land**

Confirmed from the files, and then one thing you could not see from the mount, and then a measurement.

- **`ci.yml`**: five jobs, **exactly one `needs:`** (the e2e job's `needs: build-check`), one `if: failure()`
  report step, **no `continue-on-error` anywhere**. Your read is exact.
- **`vercel.json`**: I parsed it — **`crons` is the ONLY top-level key**, 14 entries. No `ignoreCommand`, no
  build gate, no check requirement.
- **`master` has NO branch protection at all.** `gh api repos/…/branches/master/protection` →
  **404 `"Branch not protected"`**. No required status checks, no required reviews.
- **And the measurement.** I pushed B2 and watched production against the CI run: at 09:17:48 served
  `057fbe61d3` with run `33882863667` `in_progress`; at **09:20:07 served `cdf1c37386` — while that run was
  still `in_progress`.** The promotion did not wait for the checks, so it cannot be gated on them.

**The three answers in one sentence each.** What stops a push whose unit job is red: **nothing** — there is no
branch protection and no required check, so it lands on `master` immediately. Whether a Vercel deployment
requires the GitHub checks: **no** — `vercel.json` carries only crons, and a deploy demonstrably promoted
mid-run. If nothing does, say so plainly: **nothing in this repository gates a promotion on any test suite;
the only thing that can stop one is Vercel's own `next build` failing**, which is exactly the clause
`R-0903-live-cw-4` actually contains. **Proposing nothing.** One limit stated: I read GitHub and the repo, not
the Vercel project's dashboard settings, so "no ignore-command in `vercel.json`" is not the same claim as
"nothing is configured Vercel-side" — the measured mid-run promotion is the stronger evidence and it stands on
its own.

## Guards

| | guard | result |
|---|---|---|
| **G1** | RH reads `184`/`feed` | **PASS**, both ends: `{tier:"feed", pages:184}`. |
| **G2** | zero catalog writes | **PASS.** 892 rows enumerated at open and close — `active 789 / duplicate 101 / archived 2` both times. **Delta 0 on every class and on the total.** |
| **G3** | B2 proven by CALLING it | **PASS, `code: 404`.** `undo_dedupe_group` on `no-such-run-green-baseline-2026-09-04-000000000000` → `run_not_found`, **404**, not 500. **And a truncation control alongside it**, per your §G3 warning: the truncated real runId also returns 404, so I made the guard's own id genuinely absent rather than a prefix and reported both. |
| **G4** | Daniel's mark undisturbed | **PASS.** `1VuMq83…` reads `duplicate` at open and close; its run record still restores `duplicate → active` from `run-record`, `restored: 0`. |
| **G5** | three suites before the push | **PASS, and the unit number is IDENTICAL to B1's baseline** — `19 failed / 3990 passed / 78 skipped (4087)` before and after B2, which is this wave's expected result. Emulator **1,152 passed / 0 failed (83 files)**. `tsc --noEmit` **clean**. |
| **G6** | rollback named before the push | **PASS.** `057fbe61d3`, quoted in full from `/api/version`: `{"sha":"057fbe61d335a55b19276836657cd68c54a697cc","builtAt":"9/4/2026","version":"11.7.0"}`. |

## B4 · A repair plan — proposed, per file, NOTHING authored

Class 2 first, as ordered. **I changed no test and wrote no fix.** "Verifiable without a deploy" means the
unit suite settles it locally.

| rank | file | tests | class | smallest correct repair | no deploy? |
|---|---|---|---|---|---|
| **1** | `src/data/books/shabbat-shacharit.json` (surfaces at `registry.test.ts:175`) | 1 | **2** | **A data decision, not a code one.** Either Shehecheyanu's folio becomes 144 (if the page it sits on is the last one after the 145→144 repagination) or the book's declared `pages` returns to 145 (if the page is real). **Needs the printed PDF to settle**, so it wants `machzor`/`corpus` eyes, and it should ship with the `registry.test.ts:175` invariant kept exactly as written — that test is the thing that caught it. | yes, once the value is chosen |
| 2 | `books/lookup.test.ts` · `mcp/tools/books.test.ts` · `books/registry.test.ts` (rows 10–13, 15–17) | 7 | 1 | **Stop pinning literal folios.** Re-derive the expected values from the registry the test already imports, or assert relationships (ascending, length, `<= entry.pages`) instead of `[36,200,238]`. A one-time re-baseline of the literals would go stale on the next book build; these three files re-break every time the Typst feed is regenerated, which is why they are the largest block. | yes |
| 3 | `public-view.test.tsx` · `perform-cls.test.tsx` (rows 4–9) | 6 | 1 | **One cause, one repair shape:** teach the queries about the hero — `getAllByText(...)` with an expected count of 2 for the soonest service, or scope each query to the listing `<section>` — and change the cap assertion to count links **inside the listing**, excluding the hero. **The 5-cap is not broken; the assertion counts a node that is not in the list.** | yes |
| 4 | `sync-engine-songs-mirror.test.ts` (rows 1–3) | 3 | 1 | **Invert the three scenarios to the shipped contract:** a folder/audio/doc/shortcut is now dropped at ingestion (`sync-engine.ts:138`), so S5 should assert **0** writes and `stats.skippedNonChart`, and S1/S4 need chart-shaped fixtures if what they mean to test is the shortcut/empty-name mirror rather than the MIME filter. **S1 and S4 are testing two things at once**, which is why they read as write-count failures. | yes |
| 5 | `mcp/tools/library.test.ts` (rows 18–19) | 2 | 1 | **Flip the two expectations to `"unknown"`** and keep the comment's intent by adding what E1 actually rules — a mime-less row groups with nothing. Cheapest of the five, and safe: **0 of 892 production rows have an empty `mimeType`**, measured this wave. | yes |

**Sequencing note, offered as observation not proposal:** rank 3, 4 and 5 are eleven tests behind three
one-cause repairs, and rank 2 is seven behind one design choice. **Nothing here needs a deploy.** Rank 1 is
the only row where the app is wrong, and it is the only one that needs a human to look at a page.

## FOR `live-cw`

1. **The red is 200 runs, not 3.** No green CI run exists in the visible window (2026-06-09 → 2026-09-04);
   the unit job is red in every sampled run including the oldest; the first red is before the window and
   `gh` will not show me further back. `-13`'s premise holds and its scale needs restating.
2. **One class-2 row, precisely located:** `seasonal.shehecheyanu@shabbat-shacharit` folio **145** against a
   declared **144**, and `817870bb3a` is the commit that moved the count without moving the unit. **The
   family's own lane, and it needs the printed page to settle — not mine to choose.**
3. **`-14` confirmed twice over, once by measurement:** no branch protection on `master`, `vercel.json` is
   crons-only, and a deploy promoted **while its CI run was still `in_progress`**.
4. **100 of 141 thrown machine codes are unmapped and answer `500`** — including `chart_in_use`,
   `template_not_found`, and three in the file I shipped yesterday. **A class, not a third instance.** One
   ruling could map them by family; that is yours, not a wave's.
5. **Three files skip in CI that run locally** (`339/9` vs `342/6`). Small, but a baseline nobody can
   reproduce locally is half a baseline.

## What this order did NOT touch

The seven red files — **no test deleted, skipped, renamed or rewritten.** The 38 unreachable-byte rows. The 16
bonded non-active rows. The seven pairs — **no mark on any of them.** `moments.json` / L3 binding. The fuzzy
lane's diagnostic. `get_chart_status`'s reachability oracle. The 99 other unmapped error codes.

*Claude records; Daniel decides.*
