# RETURN-CODE-AUDIT-2026-09-19-W2B — CentralReform.live (sheet-music-app)

Executor: Claude Code (Opus), one session, 2026-09-20
Against: `c5f8092e5e` (master) — the rulings addendum-2 commit
Wave: Wave 2, round two — after the rulings addendums and the published `dist-app`

---

## The three things Daniel must see

### 1. The MCP account is still `member`. (i) and (j) are still blocked, and the ruling says to say so rather than work around it.

R-0919-audit-17 authorized the connector and said: if a tool still answers
`403 forbidden_role … callerRole: "member"`, that is the account's role, not
the connector — stop and report it. It does, so this is the report.

```
get_web_vitals_summary  → 403 forbidden  "requires admin role."   callerRole: "member"
list_review_queue       → 403 forbidden_role  "Library-review tools require an admin account."
```

The connector is authenticated and every non-admin tool works. **(i) the web
vitals re-measurement and (j) the AI review-queue clearing need the account
elevated to `admin`, or Daniel running those two reads himself.** Nothing else
in this repo unblocks them.

### 2. `.live` agrees with the producer's published artifact — proven by fetching it, not by trusting the last local build.

The `dist-app` artifact exists (run `35518946924`, `publish-app-surface:
success`, 22.8MB, unexpired). The new `--from-latest` / `--from-run` mode
downloaded it and re-derived every book snapshot and `moments.json` from it:

| artifact | result |
|---|---|
| `shabbat-maariv` | 48 units, maxFolio 68 / 69 pages — **no drift** |
| `shabbat-shacharit` | 94 units, maxFolio 143 / 144 pages — **no drift** |
| `shirei-tshuvah` | 122 units, maxFolio 182 / 184 pages — **no drift** |
| `moments.json` | 225 moments, 473 occurrences, 9 books — **provenance only** |

"Provenance only" is the honest verdict and it is worth a sentence. The
producer rebuilt, so `builtAt` moved from `2026-09-16T16:17:10Z` to
`2026-09-20T15:24:51Z` and the six machzor volumes' unpinned `gitSha` moved
from `e5a87e3-LICENSED` to `80de868-LICENSED`. **Not one moment and not one
occurrence changed.** The regenerated file is committed, so the repo now
records that it consumed the published artifact rather than a laptop build.

### 3. The Friday/Saturday pagemaps and the reader's feeds do not share a page-numbering base. (n) cannot be done the way the handoff describes it.

This is the (o) comparison the plan asked for, and it turned up something
bigger than a one-page disagreement. See the full report below. The short
version: `crc-friday` is pages 3–47 of the printed CRC booklet and
`legacy-shabbat-evening` is folios 1–55 of the reader's own typesetting of the
same service. They are two editions, not two copies. The offset between them
is not constant — it drifts from `+1` to `−8` across Friday and from `+48` to
`+38` across Saturday.

So registering those feeds as feed-tier books "alongside the pagemaps", which
is what (n) says to do, would put the reader edition's folios under a slug the
app treats as the printed booklet. That is exactly the error
`machzorRemapper` exists to prevent, one book over. **(n) needs a name-keyed
crosswalk, the way `crc-machzor-2008` already works — not a feed registration.**
I did not build it: it needs Daniel's eyes on about 20 name pairs first.

---

## What shipped

| item | state | where |
|---|---|---|
| **(l)** moments agreement check in CI | **DONE** | `.github/workflows/ci.yml` — `Books Agree With Producer` |
| **(m)** `sync:books` from the published artifact | **DONE** | `scripts/ops/lib/fetch-dist-app.mjs`, `scripts/ops/sync-books.mjs` |
| **(n)** `crc-friday`/`crc-saturday` unit identity | **REPORTED, not done** | this return — the numbering finding blocks the planned approach |
| **(o)** "Returning the Torah" + name comparison | **DONE (report)** | this return |
| R-0919-audit-15 — notify band stays MCP-only | **DONE** | `NotifyBandDialog.tsx` + its test deleted |
| R-0919-audit-19 — signed-out Perform live-update | **DONE (recorded)** | `docs/ACCESS-POLICY.md` |
| **(i)** web vitals, **(j)** review queue | **BLOCKED** | account role, see above |
| **(p)** split the MCP tool surface | not started | surveyed in W2 |
| **(q)** iPad Perform skips | **DONE** | see below — the premise needed correcting first |

---

## (m) — reading the producer's published artifact

`npm run sync:books` used to read `dist-app/` off a hard-coded path on Daniel's
laptop, so a book or moments update was blocked on him having run a Typst build.
Three new modes read the published artifact instead:

```
npm run sync:books -- --from-latest          # newest unexpired dist-app
npm run sync:books -- --from-run <runId>     # one specific producer run
npm run sync:books -- --from-url <zip url>   # an explicit archive url
```

**The transport is a token-gated artifact, and it should stay one.** `dist-app/`
is the licensed carrier — the untrimmed feeds inside it hold every block of
liturgical text. There is no public URL to fetch and there must not be one.
`--from-url` is not a way around that; it is the same GitHub artifact URL,
which still requires the token.

Four things the implementation is careful about:

- **Only the JSON this repo consumes is unpacked** — `*-feed.json`,
  `moments.json`, `books.json`. The ~22MB of licensed PDFs in the artifact are
  never written to disk. What is written goes to a temp directory outside the
  repo and is removed when the sync finishes.
- **The pin guard is untouched.** A fetched artifact runs through the identical
  `trim` and `trimMoments`. A printed volume still regenerates from its press
  commit or not at all (R-0831-live-pagemap-1). Fetching changes where the bytes
  come from, not what may be built from them.
- **The token refusal names the variable.** `SHIREISHABBAT_ARTIFACT_TOKEN`
  needs `actions:read` on `RavBogard/ShireiShabbat`; a workflow's own
  `GITHUB_TOKEN` is scoped to this repo and cannot read another repo's
  artifacts. Missing it fails with that sentence, not a bare 401 three steps
  later.
- **An all-expired listing is refused by name and date**, pointing at
  `publish-app-surface`, rather than downloading its way into an unexplained
  410.

## (l) — the agreement check, and why it does not go red every week

New CI job **`Books Agree With Producer`**, on the same `substantive`
classifier as the rest. It runs `sync:books --from-latest --check --strict`.

The `--strict` flag is new and is the whole of (l): without it the script
reports drift and leaves the judgement to whoever ran it; with it, a
disagreement is a failed build. Drift that nothing fails on does not stay
invisible — it surfaces on an iPad, mid-service, as a page number that is
wrong, and nothing is fixable live.

**Provenance is not drift.** Every producer rebuild stamps a new `builtAt`, and
an unpinned book's `gitSha` moves with every commit there; neither changes
which moment is printed on which page. A check that went red on every producer
commit would be ignored inside a week, so `momentsDrift` separates the two:
`DIFFERS` means a moment or an occurrence moved, `provenance` means only the
stamp moved. The pin guard is upstream of this and unaffected — `trimMoments`
still *throws* when a pinned volume's sha does not match, and a throw is not a
verdict to be weighed.

**Proved non-vacuous.** With one occurrence's folio changed from its real page
to 999, `--strict` exits 1 and names `moments.json`. With only the timestamp
and the unpinned shas moved, it exits 0 and prints `provenance`.

**One thing Daniel has to do for this check to mean anything.** The job needs
`SHIREISHABBAT_ARTIFACT_TOKEN` as a repository secret. Until it exists the step
emits a GitHub `::warning` — *"this run did NOT compare against the producer"* —
and passes, because painting every unrelated PR red for a setup gap is how a
check gets ignored. **Do not read a green tick on that job as agreement until
the secret is set.** That is the one soft spot in this item and it is deliberate.

## (o) and (n) — the normalized name comparison

R-0919-audit-14 settled the page: the printed CRC Saturday booklet prints
"Returning the Torah" on **p.90**, `.live`'s pagemap is right, and the fix
belongs in shireishabbat's `legacy-shabbat-morning` folio map. Nothing in this
repo changes. (For the record, this repo carries it as an alias on **Eitz
Chayim, p.90**, and the `legacy-shabbat-morning` feed carries
`torah.returning-the-torah` at folio **49** — not 89, which is a third number
and part of the finding below.)

The comparison is normalized on NFD-stripped, punctuation-folded names, matched
first on the entry's own name and aliases, then on whole-word containment
against an unclaimed feed unit (the feed prefixes a unit with its section —
"Candles Candle Blessing" — or trails a noun — "Motzi Blessing").

| | crc-friday ↔ legacy-shabbat-evening | crc-saturday ↔ legacy-shabbat-morning |
|---|---|---|
| live entries | 48 | 62 |
| feed units with folios | 78 | 96 |
| matched | 42 | 46 |
| pages agreeing | **2** | **0** |
| pages disagreeing | 40 | 46 |
| ambiguous (one name, several units) | 3 | 4 |
| live entries with no feed match | 3 | 12 |
| feed units no entry claimed | 36 | 50 |
| page offset (live − feed) | +1 … −8, **10 distinct values** | +48 … +38, **11 distinct values** |

**The disagreement list is not 86 wrong pages.** It is two different editions
of the same service. `crc-friday` runs pages 3–47 of a 48-page printed booklet;
`crc-saturday` runs 50–101 of the same printed object continuing; each feed
restarts its own folio numbering at 1 and runs to 55 and 63. The reader's
edition also prints material the pagemap has no entry for — kavannot, teachings,
"please be seated" instructions — which is why its pagination drifts steadily
ahead of the booklet's rather than sitting at a fixed offset.

**Therefore (n) as written does not follow.** Registering these two feeds as
feed-tier books alongside the pagemaps would file the reader edition's folios
under slugs the app treats as the printed CRC booklet. That is the same class
of error the machzor remapper was written to prevent: a wrong page wearing a
right name.

**What would work**, and what I recommend as the next item: the
`crc-machzor-2008` pattern. That book carries `unitId` *and* the printed `page`
on each entry, and `machzorRemapper` folds the six per-service feeds onto it —
taking the identity from the feed and the page from the pagemap. Doing the same
for Friday and Saturday means adding a `unitId` to each pagemap entry, keyed on
the name match above. The machinery already exists; what it needs is a reviewed
crosswalk.

**It needs Daniel because ~20 pairs are not mechanical**, and this repo does not
hand-edit book data on a guess. Specifically:

*One name, several feed units — which one is the row?*

- **L'chah Dodi** → `shabbat-presence-lchah-dodi` or its `-kavannah` (both p.8)
- **Kriyat Sh'ma** → `the-shma`, `the-shma-kavannah`, `please-be-seated` (Friday); plus `kriyat-shma-teaching`, `torah.shma-procession-call` (Saturday)
- **T'filah** → `tfilah-kavannah`, `silent-amidah-note`, `please-be-seated` (Friday); `tfilah-kavannah`, `concluding-the-tfilah` (Saturday)
- **Mi Shebeirach** → `torah.mi-shebeirach-healing` or `torah.mi-shebeirach-congregation`
- **Reading of the Haftarah** → `blessing-before`, `haftarah-reading`, `blessings-after`

*Entries with no feed unit at all — is the printed booklet carrying something
the reader's edition dropped, or is it a name only Daniel can bridge?*

- Friday: **K'dushat Hasheim**, **Rosh Chodesh**, **Prayer for the State of Israel** (the feed has `prayer-for-state-of-israel` at p.43 and `kdushat-hashem` at p.30 — near-certain matches that the strict matcher would not take on its own)
- Saturday, 12 of them, including **Lev Tahor**, **Hodu L'Adonai**, **P'sukei D'zimrah**, **Ahavah Rabah Ahavtanu**, **The One**, **Torah Service**

Once those are settled, the crosswalk is mechanical and testable, and every
Friday and Saturday row reaches a moment id for the first time.

## (q) — the skips, and what the count was actually measuring

The handoff reads: *"64 skipped tests, concentrated in `e2e/stress-ipad.spec.ts`
(4), `perform-ipad-offline.spec.ts` (4) … The surface the band depends on is
where the skips are."* The second sentence does not follow from the first, and
checking it was the useful part of this item.

**Of the 42 `test.skip` calls across `e2e/`, 40 are conditional guards, not
quarantined tests.** They read `test.skip(<condition>, <reason>)` and fire only
when you run the wrong Playwright project or without a credential:

- the iPad specs self-skip unless `--project=ipad-webkit` (or `-landscape`) —
  a WebKit-viewport assertion is meaningless on chromium;
- `perform-ipad-deep.spec.ts` skips without `MCP_BEARER`, which it needs to
  mint test users and seed fixtures;
- `role-gate-matrix.spec.ts` confines itself to chromium because the assertions
  are server-side and every extra viewport multiplies cost without adding
  signal.

Run `--project=ipad-webkit` and they run. They are specs doing their job, counted
as debt by a runner that reports a guard as a skip. **The band's surface is not
where the untested holes were.**

The 2 unconditional ones are both in `authoring-stress.spec.ts`, and both skip at
runtime only when an affordance is missing, with a note that a separate affordance
test files that finding. That is a deliberate don't-double-report, not a hole.

**The real debt was in the unit tests, and it was worse than a count of skips
suggests** — not because tests were skipped, but because of which test was.

### The editor has had no accessibility coverage since May

`SetlistGrid.a11y.test.tsx` was the WCAG AA audit for the setlist editor. The
whole file — 513 lines, including the nested sticky-right ChartCell block — sat
under one `describe.skip`, quarantined on 2026-05-20 because it drove the desktop
TanStack-table DOM that `0ec6773c` deleted. The note said it needed "a
from-scratch card-DOM a11y suite". Nobody wrote one. So from May until today the
surface Daniel authors on had **no automated accessibility check at all**, and the
fact was sitting inside a skip count.

**Written: `MobileCardList.a11y.test.tsx`, 5 tests against the DOM that ships.**
Four states an author actually reaches — a service of song rows, a service with
section headers and chartless rows, an empty setlist, and the list's own naming —
plus the drag handle, which gets its own assertion because `MobileCardList` wires
dnd-kit's `KeyboardSensor`, and that sensor is reachable only through a focusable,
*named* control. An unnamed handle takes reorder away from anyone not using a
pointer, and does it silently.

**Proved non-vacuous — and the first attempt to prove it failed usefully.**
Removing the handle's `aria-label` turned the handle test red, as intended. But
the three axe cases stayed green, which is exactly what a vacuous suite looks
like. Rather than accept that, I checked jest-axe against a known violation
(`image-alt`) to confirm the harness fires at all, then injected that same
violation into the card list: both populated axe cases went red, and the
empty-state case correctly stayed green because no card renders in it. The audits
do see the card DOM.

### Dead code removed, with the evidence for calling it dead

`BatchActionBar` was imported by `SetlistGrid` and **never rendered** — multi-select
was removed in T1.1 (2026-05-12) and the component was left for a "T2.6 dead-code
sweep" that never happened. Its own test file carried the line *"Skipped rather
than deleted to preserve the assertions for historical reference"*, which is what
git is for.

Deleted: the component, its skipped test, its `index.ts` export, and
`handleBulkSet` — an 80-line callback in `SetlistGrid` with no remaining caller.
`SetlistGrid.selection.test.tsx` went with them; its own header says *"Delete the
whole file in T2.6"*, and multi-select is not coming back, so there is nothing to
rewrite it against.

`ReconciliationProvider.test.tsx` had a `describe.skip` on its WCAG AA block with
**no stated reason at all**. The provider is live and the rest of the file runs.
Un-skipped it: 19 tests pass, including the 3 axe cases. It had been skipped for
nothing.

### What the sweep still owes

The T2.6 sweep is not finished, and this return should say so rather than imply
otherwise. `useGridSelection`, `selection.selectedIds`, `handleDragHandleClick`,
`selectedTracks` and `handleBulkDelete` are all still in `SetlistGrid.tsx`.

**They are genuinely dead, and that is a measurement rather than a guess:**
`selectedIds` and `onDragHandleClick` are declared on the TanStack `TableMeta`
interface — the meta for the table `0ec6773c` deleted — and `MobileCardListProps`
carries neither. Nothing can put a row into the selection set, so the bulk-delete
branch in `handleContextDelete` (which requires `size >= 2`) is unreachable and
every delete already falls through to `handleDeleteRow`.

I stopped there deliberately. Removing it is behaviour-preserving on that
evidence, but it is ~150 lines threaded through the authoring surface, it is its
own tracked item, and it is not what (q) asked for.

**GATE: did not finish the T2.6 selection sweep — proceeded because (q)'s bar is
the disposition of each skip, because the dead subsystem is provably unreachable
rather than misbehaving, and because a refactor of the band's authoring surface
deserves its own change instead of riding along with a test cleanup.**

### Disposition of every remaining skip

| where | count | disposition |
|---|---|---|
| `e2e/*` conditional guards | 40 | **Not debt.** Run `--project=ipad-webkit`, or set `MCP_BEARER`, and they run. |
| `e2e/authoring-stress.spec.ts` | 2 | **Not debt.** Runtime guard; the affordance test files the finding. |
| `src/__tests__/login-*.test.ts` | 3 | **Not debt.** `describe.skipIf(!buildPresent)` — they run after a build. |
| `html-to-pdf.test.ts` | 1 | **Not debt.** Needs a real Chromium binary (`CHART_RENDER_CHROME_PATH`); production self-tests via `?selftest=1`. |
| `MobileCardList.test.tsx` | 5 | Needs a rewrite against the inline edit pane (the Radix Sheet it asserts is gone) and against `chart-bind-dialog` (which replaced the anchored popover). Title-on-blur, delete-from-pane and the mobile bind all still exist — only the DOM moved. |
| `SetlistGrid.dnd.test.tsx` | 3 | Needs a card-DOM rewrite of the delete path. The other 4 tests in the file (pure `computeReorderUpdates`) run and pass. |
| `SetlistGrid.edit.test.tsx` | whole file | Needs a card-edit suite, not a port: there is no inter-cell keyboard nav left to assert, because the card pane commits on blur. |
| `SetlistGrid.contextmenu.test.tsx` | whole file | Needs a card-DOM rewrite against `mobile-card-context-menu-*`. |
| `SetlistGrid.undo.test.tsx` | whole file | Needs undo driven through the card edit pane. `useUndoStore` is live and `MobileCardList` writes undo entries, so the behaviour exists and is untested. |

**The keep-awake half is Daniel's and is not claimed here.**
`docs/IPAD-KEEP-AWAKE-ACCEPTANCE.md` is a seven-step manual protocol still marked
outstanding hardware verification, and `src/hooks/use-wake-lock.ts` records a
Yizkor-service failure (2026-05-23) and a three-month misdiagnosis. It needs an
iPad afternoon. No automated test substitutes for it, and this session does not
pretend otherwise.

**Net: the repo's skip count goes 69 → 31**, and more to the point, the editor
has an accessibility audit again.

## R-0919-audit-15 — notify band stays MCP-only

`src/components/setlist/NotifyBandDialog.tsx` (386 lines) and its test (153
lines) are deleted. Verified unwired before deleting: nothing in `src/`
imported the component except its own test. `/api/setlist/notify-band` and the
`notify_band` / `preview_notify_band` MCP tools are untouched — telling the
band still works, it just has no button.

## R-0919-audit-19 — recorded, not built

Written into `docs/ACCESS-POLICY.md` as its own section, next to the read-surface
table it qualifies: the `get`/`list` split, the live-update consequence for
signed-out devices, and Daniel's ruling that no replacement poll is to be built.
The section also carries the one thing that is still open and is not closed by
it — the download half of the anonymous chart surface.

---

## Suites

| suite | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run scripts/__tests__/` | 15 files, 222 tests, 0 failed |
| `npx vitest run` (whole suite, before (q)) | 402 files passed, 4813 tests passed, 0 failed (69 skipped) |
| `npx vitest run` (whole suite, after (q)) | **403 files passed, 4821 tests passed, 0 failed** (31 skipped) |
| `npm run test:emulator` | **94 files, 1308 tests, 0 failed** |

**The first whole-suite run was not green, and the reason is worth writing
down.** It came back 2 failed / 4811 passed, in `src/lib/sync/__tests__/edit-log.test.ts`
and `src/app/perform/__tests__/page.test.tsx`. Both were bare 30-second
timeouts with no assertion failure, in files nothing in this round touches.
Run on their own they finish in 2.5s and 3.2s.

That is the same shape of explanation the Wave 1 return gave for six emulator
files, and one of those six turned out to be a real failure hiding behind it.
So a re-run in isolation was not treated as the answer: the whole suite was run
a second time, under the same conditions, and came back clean at 402/402. Two
whole-suite runs, the second green, is the evidence for calling the first one
contention.

**The emulator suite then found one that was not a timeout, and it was worth
finding.** `http-executor.emulator.test.ts` failed on `processed: 0,
remaining: 3` against an expected `processed: 1, remaining: 2` — an assertion,
not a clock running out, so it does not get waved off.

The mechanism is a 40-millisecond stopwatch. `runBatchWithDeadline` reads the
batch and writes `processing` *before* the loop, and the loop checks the
deadline before item 1 (`src/lib/intake/http-executor.ts:181`). Two tests gave
it a 40ms budget against an 80ms item, so on a busy machine those two Firestore
round-trips spent the entire budget, the loop broke before processing anything,
and the failure read like a broken executor when it was a lost race.

Both now budget 1500ms against a 3000ms item — same assertions, same semantics,
about 35x the headroom, with the mechanism written into the test so the numbers
do not get tightened back. Nothing in `src/lib/intake` changed: the executor is
correct, the stopwatch was not. Re-run green at 94/94, 1308/1308.

`ci/gated-suite-exclusions.txt` still carries its one line,
`sync-engine-songs-mirror.test.ts`. It passed in both whole-suite runs here,
but the list is remove-only *on CI's word*, not a laptop's, so the line stays
until the gated job reports it green.

New tests: `scripts/__tests__/sync-books-artifact.test.ts`, 20 tests over the
whole decision surface of (l) and (m) — which artifact is chosen, what counts as
drift, the token refusal, the unzip/tar fallback, and that the extraction asks
for no PDF. Nothing in it touches the network or a real zip; the fetch and the
subprocess are injected.

The moments agreement was also verified **against the real artifact**, not only
against fixtures: downloaded run `35518946924` and re-derived every book.
