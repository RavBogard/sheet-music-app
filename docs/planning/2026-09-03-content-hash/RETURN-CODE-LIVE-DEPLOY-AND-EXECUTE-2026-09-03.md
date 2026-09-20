# RETURN → `live-cw`: DEPLOY-AND-EXECUTE · **DEPLOYED GREEN. D2–D6 DONE. D7 STOPPED AT 1 OF 3, ON G5.**

Lane: **live (Code)**, host-side `~/CentralReform.live` · Order:
`HANDOFF-CODE-LIVE-DEPLOY-AND-EXECUTE-2026-09-03.md` (`R-0903-live-cw-4`/`-5`, Daniel at the keyboard 19:4xZ)
Production now serves **`5e52e29ff036af046bb52706cf577d163b0d95e7`**, deployment
**`dpl_BuXnR1g6UgneAMu71MNVMsbp4zNh`**, first served **2026-09-03T20:27:30Z**.
Rollback candidate, unchanged and still available: `dpl_Be6oqj7XDJphUarSahvnkNANEuz9` = `9933d2abef`.

---

## D0 · The outcome in one line

**The build was green on the first try** — the foreseen red is not what happened — and every stage the deploy was
blocking ran: `contentHash` is populated for **853 of 891 rows**, the legacy run is seeded (**85 rows, 67 `active` /
18 `archived`**), and the byte-identity lane's answer is unusually small and clean: **86 clusters, 85 of them already
resolved, exactly ONE waiting on Daniel.** **D7 restored 1 of its 3 rows and stopped on the other two**, because
their target status would have been invented rather than read — which is what G5 exists to prevent, though not for
the reason G5 gives.

## D1 · The tree, and what production was serving

```
HEAD                       5e52e29ff036af046bb52706cf577d163b0d95e7   ✓ matches Verified-against
origin/master...master     0 behind / 7 ahead                          ✓ exactly seven
production /api/version    9933d2abefd41e77950b7399715ef2b40e03be78   ✓ read, not inherited
G2 census                  891 = 786 active + 103 duplicate + 2 archived + 0 orphaned   PASS
G6 NUL scan                1032 tracked .ts/.tsx under src/ · 0 NUL files               PASS
```

The seven, oldest first: `05ab3f5821` (W1 NULs) · `16a61278ac` (W2 reversibility) · `749a7810b2` (W3 undo+seed) ·
`e2fb0eb5f6` (W4 contentHash) · `b59f303f03` (W5 hash lane) · `4ab2d282e6` (stale tool description) ·
`5e52e29ff0` (W4 amended).

**GATE: D1's "the working tree is clean" clause — proceeded.** The tree is not bare: `src/build-info.json` is
modified, and four untracked paths stand (`.playwright-mcp/`, `docs/BRAND-DOSSIER.md`, `docs/brand-assets/`, one
PDF artifact). All five are recorded as pre-existing in my 18:4xZ and 19:5xZ rows — the same rows this order's
Verified-against inherits. **The deciding fact is that none of it is in any of the seven commits**: `git push`
carries commits, Vercel builds the pushed commit, and a working-tree change cannot reach production through either.
`src/build-info.json` is additionally a *generated* file — its working copy records `a7aab82a8c` from the
2026-09-01 local build, while the committed copy says `93e76c39e0`; neither is what production reports, because
`/api/version` prefers `VERCEL_GIT_COMMIT_SHA`. Nothing was committed, stashed or reverted.

## D2 · The push, and the build that was expected to fail

```
git push origin master   →   9933d2abef..5e52e29ff0  master -> master
```

`origin/master` was at `9933d2abef` — the exact commit production was serving, so the push moved the branch and
the alias from the same starting point, with no third state in between.

**The build went green in about two minutes.** Watched on the custom domain, which §1 measured to be the only
unprotected surface:

```
2026-09-03T20:25:43Z  serving 9933d2abefd41e77950b7399715ef2b40e03be78
2026-09-03T20:27:30Z  serving 5e52e29ff036af046bb52706cf577d163b0d95e7
```

§2 is worth answering rather than passing over: it was right that **Vercel ran the first real `next build` these
seven commits have ever seen**, and right that my local gate cannot see the route-export class of failure. It
simply did not fire this time. The hazard is unchanged for the next wave; only this instance of it is closed.

## D3 · Proof the new code is the code answering

Not the deployment's own claim — three tools that did not exist at `9933d2abef`, called live:

| tool | response | reading |
|---|---|---|
| `undo_dedupe_group` | `restore_target_required`, with `0 of the 0 rows with a recorded prior status` | **present**, and refusing exactly as designed |
| `seed_legacy_dedupe_run` | `validation_error: rows: expected array, received undefined` | **present**, arguments validated |
| `backfill_content_hash` | answered | **present** |

Census after D3: **891, unchanged** — the refusal branch wrote nothing, which is the property `CONTENT-HASH` G3
picked it for.

**A second thing this proved, unasked.** `undo_dedupe_group` checks `role !== "admin"` *before* it reaches the
`restore_target_required` branch (`src/lib/mcp/tools/undo-dedupe.ts:115`). Getting that refusal therefore means the
bearer **passes the admin gate** — my desk file had recorded the client as `musician`, and that was true of reads
only. Every admin-only write in this wave was reachable, and the desk file is corrected.

## D4 · The `contentHash` backfill

Run as **8 resumable bites of 120 rows** rather than one call — 891 rows at the observed rate is roughly 356 s of
work, past a 300 s function ceiling, and the tool is built to resume. `limit` counts bytes-read rows, so skips are
free and each bite after the first re-walked the finished rows without re-downloading them.

```
bite  1  38s  read=120 hashed=120 skip=0    failed=37  remaining=734
bite  2  36s  read=120 hashed=120 skip=120  failed=37  remaining=614
bite  3  38s  read=120 hashed=120 skip=240  failed=37  remaining=494
bite  4  37s  read=120 hashed=120 skip=360  failed=37  remaining=374
bite  5  31s  read=120 hashed=120 skip=480  failed=37  remaining=254
bite  6  30s  read=120 hashed=119 skip=600  failed=38  remaining=134
bite  7  33s  read=120 hashed=119 skip=719  failed=38  remaining=15
bite  8   6s  read=16  hashed=15  skip=838  failed=38  remaining=0
```

**The two populations, never blended, as R-0903-live-cw-3 §3 requires:**

| population | rows | hashed | failed | bytes downloaded |
|---|---|---|---|---|
| `chart` | 785 | 785 | 0 | **193.9 MB** |
| `nonChart` (audio, gapps, other artifacts) | 106 | 68 | 38 | **344.6 MB** |

**Total: 853 rows hashed, 38 failed, 0 remaining, 538.5 MB read once.** Every failure is the same named reason —
**`bytes_unreachable`, 38 rows** — the population the tool is built to name rather than skip in silence. Coverage
reports `total: 943, eligible: 891, filteredOut: {other_org: 52, bytes_unreachable: 38}`; the 52 is the Brothers
Lazaroff tenant, correctly outside a `crc` caller's scope.

**Two things to flag, one of them a real gap in the guard:**

1. **`md5CrossCheck` never fired.** Cumulative across all eight bites: `{claimed: 0, agreed: 0, mismatched: 0}`.
   The stop condition — "STOP if the mismatch rate is not near zero" — is *satisfied*, but **vacuously**: no row
   in the whole 853 claimed a `driveMd5` or a Storage `md5Hash` for the recomputed md5 to be checked against. So
   the cross-check contributed **no** assurance that the bytes downloaded are the bytes each row claims. The
   sha256 column is populated and internally consistent; the independent confirmation the design wanted is simply
   absent, because the metadata it depends on is absent. **Reported, not worked around** — it needs a decision
   about whether that metadata should be backfilled, and that is not this order's.
2. **The chart population's cost was mis-modelled by about three orders of magnitude.** The order describes "a
   chart population of a few hundred KB in total" against a large audio population. The audio side is right —
   344.6 MB — but the charts came to **193.9 MB**, not hundreds of KB. It cost nothing here (the run is resumable
   and it finished), but any future estimate built on that sentence would be badly wrong.

## D5 · The legacy seed

Dry run first, then the write; both read the 85 rows verbatim out of
`L1-W2-DEDUPE-UNDO-2026-09-01.json` at the CentralReform.live root.

```
runId legacy-2026-09-01 · seeded 85 · stillMarked 83 · priorStatusHistogram {active: 67, archived: 18}
noLongerMarked 2 · markedWithNoRecord 20
```

Every figure matches the tool's own documented expectation, including the **20** rows marked with no record at all
— the population that makes a default-to-`active` restore unsafe, and the population two of D7's three rows turn
out to belong to. **D5 ran before D7**, as ordered.

## D6 · The hash pass, dry run only — and this is the answer the wave existed for

```
hashPassCoverage   {hashed: 853, unhashed: 38, hashFailed: 0}      ← agrees with D4 exactly
name pass          groupsFound 0 · wouldMark 0 · committed 0        ← nothing left for names to find
hashGroups         86 clusters
filterOrder        orgId → status==='duplicate' skip → empty name → empty key → chartFormatClass partition
coverage           891 total, 789 eligible, filteredOut {status:{duplicate:102}}
```

**Of the 86 byte-identical clusters, 85 carry a `noActionReason` — they are conclusions, not decisions.** The
shape of all 85 is the same: three byte-identical rows of which two are already hidden and one is visible, so the
existing mark is byte-justified and nothing follows from it. That is a strong result on its own: **the marks
already standing in this catalog are, where bytes can speak, correct.**

**Exactly ONE cluster needs a decision, and it is Daniel's:**

| | fileId | name | bytes | mime | status | bonds |
|---|---|---|---|---|---|---|
| kept | `1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC` | `Mizmor Shiru L'adonai .mp3` | 7,959,323 | `audio/mpeg` | `active` | 0 |
| dup | `1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_` | `Mizmor Shiru Ladonai.mp3` | 7,959,323 | `audio/mpeg` | `active` | 0 |

sha256 `8851625b112548251b6e9657bff5b671919dfd01b72e74e3d41fbec939226f09` on both. Two uploads eleven minutes
apart on 2026-04-23, byte-for-byte the same 7.96 MB recording, one with a stray apostrophe and a trailing space in
its name. Neither is bonded to anything. **No mark was written and none is authorized** — this is the byte-decided
list §D6 says comes to Daniel through the desk, and it is one row long.

**G4 held throughout:** `wouldMark: 0`, `committed: 0`, and the `duplicate` population never rose above 103.

## D7 · One restore made, two held — and G5 is right for the wrong reason

**What I found before touching anything.** All three rows read straight out of `library_index`:

| row | fileId | status | `priorStatus` field | `dedupeRunId` | `dedupedAt` | mime |
|---|---|---|---|---|---|---|
| Adon Olam | `1gTZdh60yL9z…` | `duplicate` | **absent** | null | 2026-09-02T01:18:47Z | `…google-apps.document` |
| Hashiveinu | `1HmJ7mu9qYx6…` | `duplicate` | **absent** | null | **2026-05-28T00:40:02Z** | `…google-apps.document` |
| Mi shebeirach | `1PYjUUqxH12i…` | `duplicate` | **absent** | null | **2026-05-28T00:40:02Z** | `…google-apps.document` |

**G5's stated failure mode does not obtain.** It says that a row outside the seeded population "cannot be restored
by the authorized instrument". It can: `undo_dedupe_group` has a second mode, and `fileId` + `toStatus` consults no
run record at all — `planRowRestore` takes the status from the argument. Dry-run plans for **all three** returned
cleanly, `mode: "row"`, `source: "explicit"`, `songMirrored: true`, `skipped: 0`. The instrument reaches every one
of them.

**But the hazard G5 is protecting is real, and it applies to two of the three.** The danger was never
reachability; it is that `toStatus` on an unrecorded row is a status *I* choose. And:

- **Adon Olam is in the 85-row file with `priorStatus: "active"`**, so after D5's seed its target status is
  **read from a record**, not chosen. **Restored** — `fromStatus: duplicate → toStatus: active`, `restored: 1`,
  `skipped: 0`, `songMirrored: true`.
- **Hashiveinu and Mi shebeirach are in neither undo artifact.** Not in `L1-W2-DEDUPE-UNDO-2026-09-01.json`, and
  not in `L3-NAMING-DEDUPE-UNDO-2026-09-03.json` either (that file's 2 restores and 5 hides are different rows).
  They were marked **2026-05-28**, three months before either sweep, by a run that recorded nothing. Naming
  `active` for them would be exactly the invention R-0903-live-cw-2 §5 forbids. **Held. Not restored, not
  hand-edited, not touched.**

**The evidence that would decide them, so this comes back to you as a one-line ruling and not a question.**
`active` is very probably right, from the code rather than from optimism: the pre-L1-W2 dedupe **skipped
`archived` rows entirely** — L1-W2 on 2026-09-01 is what put them into the hygiene scan — and the pass grouped
*active* rows whose normalized names collide. A row marked `duplicate` on 2026-05-28 was therefore `active` when
it was marked, because the run that marked it could not see any other kind of row. That is an inference from the
marking code's scope, which is stronger than a guess and weaker than a record, and G5 reserves that call for this
desk rather than for me.

## D8 · Guards

| guard | required | observed | verdict |
|---|---|---|---|
| G1 | `shirei-tshuvah` 184 / `feed`, before the push and after D7 | 184 / `feed`, both | **PASS** |
| G2 | pre-state `891 = 786 + 103 + 2 + 0` | identical | **PASS** |
| G3 | post-state `891 = 789 + 100 + 2 + 0`, three rows moved | **`891 = 787 + 102 + 2 + 0`** — one row moved | **FAIL, by the stop above** |
| G4 | no new mark; `duplicate` never above 103, lands at 100 | never above 103; `wouldMark: 0`; lands at **102** | **PASS on the mark; the landing figure follows G3** |
| G5 | all three reachable before D7 | reachable — but two have no recorded prior status | **STOP, as written** |
| G6 | zero NUL across tracked `src/` `.ts`/`.tsx` | 0 of 1032 | **PASS** |

G3 fails because I stopped, not because something moved that should not have: **exactly one row changed status in
this entire wave**, and it is one of the three D7 names. No fourth row differs in either direction.

## D8 · What R-0903-live-cw-5 §4 turns out to be true of

The order asked me to look and report, and to change nothing. Both halves are confirmed, from the deployed source:

1. **The Google-Apps demotion is now dead code.** `chartFormatClass` (`src/lib/mcp/tools/library.ts:69`) returns
   `gapps` for a Google-Apps mime, `text` for `text/plain`, `score` otherwise, and it is the **last** partition in
   `filterOrder` — D6's own output confirms it runs. So a gapps row can only ever be grouped with other gapps
   rows. The demotion at `library.ts:160-161` ranks a Google-Apps row below a real-bytes row *inside a group* —
   a comparison that can now only happen when both sides are gapps, where it is a no-op. **The rule cannot fire.**
2. **Two emulator tests assert the state the rule forbids**, both in
   `src/lib/mcp/__tests__/mcp-dedupe-library-index.emulator.test.ts`:
   - `"L1-W2 rank — status outranks the Google-Apps demotion"` (line 427) seeds an `archived` **PDF** beside an
     `active` **Google-Doc** of the same name and asserts `groups[0].kept` is the gdoc.
   - `"canonical-picker — mixed-mime group: PDF beats earlier Google-Doc (groups-7/9 fix)"` (line 993) seeds a
     Google-Doc beside a PDF and asserts `groupsFound: 1`.

   Under the format partition neither pair forms a group, so both assertions are unreachable. Note the first test's
   own comment already says "No live group has this shape today" — it was pinning an ordering decision, and the
   ruling has since removed the shape that decision applied to. **Neither test nor the picker was changed.**

## D8 · Everything reported and not touched

- The two red emulator tests and the dead demotion above — `src/` is out of scope here.
- The two observability defects from the ZZTEST return (`get_chart_status`'s false green; `delete_chart`'s hint
  pointing at readers that cannot see the gap). The deploy that could carry a fix has now happened, so these are
  fixable in a next order rather than blocked.
- The `md5CrossCheck` gap in D4 above — a guard that cannot currently be exercised.
- The wider `songs`-without-`library_index` survey, still owed its own order by `R-0903-live-cw-6`.
- The 38 `bytes_unreachable` rows: named as a population, not repaired.

## D8 · What is owed back

**One ruling, one line long:** may `Hashiveinu` (`1HmJ7mu9qYx6…`) and `Mi shebeirach` (`1PYjUUqxH12i…`) be restored
to `active` on the marking-code inference above, or does the desk want them left marked? The moment that is
answered, D7 finishes as two `undo_dedupe_group` calls and the post-state becomes G3's `891 = 789 + 100 + 2 + 0`.

**And one thing for Daniel, when the desk is ready to put it to him:** the single byte-decided cluster in D6 —
the two identical 7.96 MB `Mizmor Shiru` recordings. Nothing else in the catalog is waiting on a person.

Claude records; Daniel decides.
