# ORDER → `live` (Code): count the rows the two catalog collections disagree about — and repair nothing

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0903-live-cw-6**, which owes this order in as many words and scopes its own admin-delete bypass to
the five `ZZTEST` fixtures alone · R-0903-live-cw-2 §2a · rules 1, 4, 5, 7, 8 addendum, 11, 18 · R-0803-168.
Status: DISPATCHABLE. **This order WRITES NOTHING.** Every step is a read, and G5 is that claim as a guard.
**No deploy, no `src/` change.**
Verified-against: `5e52e29ff0` [inherited: your 20:4xZ return, production serving it since 2026-09-03T20:27:30Z].
Tier: CLOSED — it asserts a measured catalog partition and a measured post-state from a prior wave.
NEXT: C1 count both collections → C2 diff them both ways → C3 characterise every `songs`-only row → C4 return.

---

## 1 · Why this exists, and what the stake actually is

Your ZZTEST wave found five rows that lived in `songs` with **no `library_index` document at all**, and the last
line of your return named the thing nobody had looked at: **the same shape may exist beyond those five, and a
non-fixture row in that state is invisible.** Nobody named it `ZZTEST`. `search_library` reads `songs`, so it shows
such a row as an ordinary `active` chart in search and in the chart picker Daniel authors from; `list_library`
reads `library_index`, so the browse has never shown it; and `get_chart_status` probes Storage by fileId and calls
it **healthy** [inherited: your rev-1 §2 table and §8.1, three instruments, one of them not ours].

**The stake is not tidiness.** A row visible in the picker is a row that can be put into a service, and
`download_chart` — which keys on `library_index` — returned `chart_not_found` for every one of the five. Whether
Perform mode's own fetch path behaves the same way on such a row is **unmeasured, and C3 is where it gets
measured.** If the answer is that it does, then a `songs`-only row is a chart that can be bonded into a Friday
service and cannot be opened at it.

**One datum you established for free:** the five deleted ids are gone from all 40 production collections, so this
survey can key on "in `songs`, absent from `library_index`" without filtering them out [inherited: your rev-2 §R4].

## 2 · C1–C4 · The wave

- [ ] **C1 · Count both collections, tenant-scoped.** Every `songs` document with `orgId: crc`, and every
      `library_index` row with `orgId: crc`. **Report both totals.** `library_index` is 891 and has been all day;
      **nobody in this family has ever measured how many documents `songs` holds**, and that number is the
      headline of this return whatever the diff says.
- [ ] **C2 · Diff by document id, BOTH directions, and report both.**
      **(a) In `songs`, absent from `library_index`** — the shape this order exists for.
      **(b) In `library_index`, absent from `songs`** — the mirror gap. It is probably common and probably
      benign (`dedupe_library` mirrors status into `songs` only *"when that doc exists"*, so the mirror was never
      universal), **and it is measured anyway**, because a count of (a) means nothing without knowing whether the
      two collections routinely diverge or never do.
- [ ] **C3 · Characterise every row in (a) — but read §3's G6 first, because the population size may stop you.**
      Per row: id, title, `status`, `orgId`, whether Storage bytes exist, **bond count via
      `find_setlists_referencing_chart`**, whether `download_chart` can fetch it, and whether the title carries a
      fixture signature (an epoch stamp, a `test-`/`ZZTEST`/`[role-…]` prefix) or reads like a real chart.
      **Add one thing the ZZTEST rows could not tell us: for one such row, does the app's own chart-fetch path
      resolve it, or does it fail the way `download_chart` does?** Read the deployed source for that answer if a
      live probe would need a bond — **do not create a bond to find out.**
- [ ] **C4 · Return** `RETURN-CODE-LIVE-SONGS-DIVERGENCE-CENSUS-2026-09-03.md` + a CLOSED board row: both totals,
      both diff counts, the per-row table for (a), and your reading of which rows are fixtures and which are not.
      **Recommend nothing about deleting anything.** What to do with what you find is this desk's, and Daniel's.

## 3 · Guards that can fail

**G1 · The standing Rosh Hashanah read, at open and at close.** `list_books` → `shirei-tshuvah` **184 / `feed`**.
FAIL: anything else.

**G2 · The catalog partition is identical at open and at close.** Whatever it reads at C1 — it should be
`891 == 788 + 101 + 2 + 0` if `D7-FINISH` has landed, or `891 == 787 + 102 + 2 + 0` if it has not, and **either is
fine here; this order does not care which, only that the two reads agree.** FAIL: any difference between them,
which would mean this wave wrote something.

**G3 · Tenant scope, and it is a judgment not a filter.** Only `orgId: crc` rows are enumerated **by name**. The
other tenant's rows — 52 of them in the library_index coverage figure, the Brothers Lazaroff catalog — are
reported as a **count only, never row by row.** FAIL: any other tenant's row id, title or filename appearing in
the return. **Their catalog is not ours to inventory**, and a census is exactly the artifact that would quietly
become one.

**G4 · The five ZZTEST ids are absent from both collections.** Re-confirm cheaply; it costs two lookups and it
proves the baseline this survey keys on. [inherited: your rev-2 §R4 — gone from all 40 collections.] FAIL: any
reappearance, which would be a much bigger finding than this census.

**G5 · Zero writes.** No tool is called with `force`, no `dryRun` is set false, no admin write path is entered.
G2's two agreeing reads are the evidence. FAIL: any write, however small or however obviously correct.

**G6 · The population is small enough to characterise one by one — and if it is not, that is the finding.**
**If diff (a) returns more than 25 rows, STOP at C2 and return the counts alone.** A residue of a handful is a
cleanup; a hundred is a systematic divergence with a cause, and the right next step then is to find the cause, not
to describe a hundred rows individually. **Either outcome is a successful wave.**

## 4 · Stop conditions

- **STOP and report immediately if any `songs`-only row is BONDED to a live setlist.** That outranks the whole
  census: it means a chart the band can open is backed by no catalog row, and it is a service-day problem rather
  than a hygiene one. Do not attempt to fix it; name it and stop.
- **STOP at C2 if diff (a) exceeds 25 rows** (G6).
- **NOTHING IS DELETED, MARKED, HEALED OR RESTORED UNDER THIS ORDER — nothing.** `R-0903-live-cw-6` authorized the
  admin-surface bypass **for five epoch-titled fixtures and for that population only**, and it said so precisely
  because a census is where such an authorization would try to grow. **A row this survey finds is not covered by
  it, however obviously it is junk.**
- **No deploy, no `src/` change.** The deploy-waiting backlog (the dead Google-Apps demotion, the two emulator
  tests, `get_chart_status`'s false green, `delete_chart`'s misdirecting hint, and whatever the md5 probe decides)
  belongs to a later order and must not be started here.
- **`D7-FINISH-AND-MD5-PROBE` is a different order** you also hold. Run either first; they touch nothing in common,
  and this one is read-only so it cannot disturb the other's guards.

## 5 · What a good return looks like

Two numbers nobody has (`songs` total, and the two diff counts), a table for a handful of rows or an honest "there
are 140 of these and here is the shape", **and no recommendation about what to do next.** The last part is
deliberate: the previous three orders in this program each came back with the executor having found the desk's own
defect, and that worked because the executor reported what it measured rather than what it would have decided.

Claude records; Daniel decides.
