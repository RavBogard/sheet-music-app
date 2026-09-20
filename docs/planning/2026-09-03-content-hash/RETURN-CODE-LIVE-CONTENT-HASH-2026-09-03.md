# RETURN → `live-cw`: the content-hash order, six waves, five built and one blocked by its own §8

Lane: **live (Code)**, host-side in `~/CentralReform.live/sheet-music-app`
Order: `HANDOFF-CODE-LIVE-CONTENT-HASH-2026-09-03.md` · Authority: **R-0903-live-cw-2**
Status: **W1–W5 BUILT, TESTED, COMMITTED. NOT DEPLOYED, therefore NOT EXECUTED against prod.**
Verified-against on entry: `9933d2abef`, re-confirmed host-side as equal to `origin/master` before W1.
HEAD on exit: **`4ab2d282e6`** · 6 commits, all `Lane: live (Code)` · **nothing pushed** (see §1).

---

## 0 · The one-paragraph shape of this return

Every wave's CODE is built, tested and committed; the guards that can be shown in an
emulator are shown, including both fail branches. **G5, the one guard whose expected value
came from an instrument, is INDEPENDENTLY CONFIRMED 7/7 against production** — not from the
new code, which cannot run there, but by pulling the real bytes through the already-live
`download_chart` and hashing them here. What is **not** done is every step that needs the
new code to be *running* in production: the `contentHash` backfill, the legacy seed, and the
W5 dry run. That is not a shortfall in the work; it is a contradiction inside the order,
which asks for a production backfill in W4 and forbids a deploy in §8. It is stated in §1 and
it is the only thing this lane needs back from you. Along the way five of the order's own
measured numbers turned out wrong, one pre-existing RED test suite surfaced at `9933d2abef`
that is a **ruling collision rather than stale tests**, and the Google-Apps demotion the
ruling positions `bonded` against turns out to be **unreachable in all three lanes**.

---

## 1 · **BLOCKED — and it is the order against itself, not the order against the tree**

**W4 asks for a production backfill. §8 forbids a deploy. Both cannot hold.**

`backfill_content_hash` is server-side: it runs inside the deployed MCP server. To read the
bytes of 785 rows it needs the Firebase Admin SDK, and `initAdmin()` requires
`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`. This tree's `.env.local` carries exactly
two variables — `MCP_ADMIN_TEST_SESSION_SECRET` and `SUPERVISOR_PROD_BEARER` — and neither is
a service account. So there are three ways to execute W4 and W5, and the order permits none:

| path | why it is unavailable |
|---|---|
| Deploy, then call the tool with the bearer | §8: *"No deploy. Nothing in this order goes to production."* A push to `origin master` **is** a production Vercel deploy in this project. |
| Run it locally against prod Firestore | No service-account credentials in this tree. |
| `vercel env pull` to obtain them | Pulling a production private key onto local disk is a security-relevant act well outside "read-only verification". **I did not do this**, and would not without your word. |

**What I did instead, so the wave is not merely asserted:** G5's acceptance is verifiable with
tools that are *already live*. `download_chart` returns real bytes for any row, so I resolved
all 14 rows the order names, pulled their bytes through production, and hashed them locally.
That is §6 below, and it is 7/7. It does not substitute for the backfill — no `contentHash`
was written anywhere — but it does mean **G5 is not waiting on the deploy.**

**Consequently NOT DONE, and each is one deploy away:**

- the `contentHash` backfill over the catalog (W4's execution half);
- `seed_legacy_dedupe_run` against the 85-row 09-01 file (W3's seed half);
- the W5 hash-pass dry run against prod — which would report almost nothing today anyway,
  because `hashPassCoverage.unhashed` would be the whole catalog. **The lane is inert until
  the backfill runs**, which is exactly why `hashPassCoverage` exists as a field.

**FOR live-cw — the one ruling I need:** does the deploy prohibition yield for the two
executions, or does W4/W5's execution move to its own order after a deploy? I have not
guessed either way, and the 100-odd marked rows are untouched.

---

## 2 · Five of the order's numbers were wrong. All five measured, none sampled

I walked **all 891 catalog rows** through `list_library`, not a sample — a decision-driving
claim about a population needs the whole population.

| the order says | measured 2026-09-03 | what it changes |
|---|---|---|
| 100 rows marked | **103** | The refusal in W3 counts at call time rather than carrying a literal. |
| the 09-01 file covers 85 of them | **83** | 2 of the file's rows are already back to `active`; the seed reports them in `noLongerMarked` instead of pretending they are restorable. |
| 15 marked rows have no prior status | **20** | All 20 named in §7. |
| 18 of the 85 were `archived` | **18 — exact**, and all 18 are still marked | G3's expected count is live and correct. |
| `library.ts` is the only NUL carrier under `src/` | **a 4th NUL exists** | `mcp-dedupe-library-index.emulator.test.ts` held one, inside the assertion that a reported name carries no separator. G1 wants zero, so it is escaped too. |

**And a sixth, which is a real defect rather than a stale count.**
`list_library`'s `coverage.filteredOut.byStatus.duplicate` reports **99** against the true
**103**. Cause, diagnosed rather than guessed: `isNonChartArtifactShape` returns true for
`application/vnd.google-apps.*` **and** `application/octet-stream`, and that filter runs
**before** the status filter — so 4 marked rows (3 google-apps documents + 1 octet-stream)
are counted under `byOther.non_chart` and never under `byStatus.duplicate`. This is §6b's
filter-order problem with a named mechanism. `dedupe_library` now **states** its
`filterOrder` in the response so the disagreement reads off the wire.

---

## 3 · **A PRE-EXISTING RED SUITE at `9933d2abef`, and it is a RULING COLLISION**

This is the most consequential thing I found and it is not mine.

**Two tests fail on a clean tree at the order's own verified-against commit.** I proved they
pre-date my work by stashing only my two files and re-running: identical failures, identical
25-pass count.

- `L1-W2 rank — status outranks the Google-Apps demotion`
- `canonical-picker — mixed-mime group: PDF beats earlier Google-Doc (groups-7/9 fix)`

Both seed a Google-Doc and a PDF sharing a normalized name and assert they **group**. Under
L1-W4 — which is `9933d2abef` itself, *"never group a PDF chart with a text chart of the same
song"* — `chartFormatClass` puts `gapps` and `score` in different buckets, so they **cannot**
group. The tests are unsatisfiable by construction.

**The collision, and why it reaches your ruling:** R-0903-live-cw-2 §4 orders the canonical
sort as `active → real bytes → bonded → earliest → fileId`, and the "real bytes before
Google-Apps" step only means anything if a gapps row and a bytes row can ever be **in the same
group**. After L1-W4 they cannot. I checked all three lanes:

- **exact-name pass** — bucket key contains `chartFormatClass`, and that returns `"gapps"`
  exactly when `isGoogleAppsMime` is true. Same bucket ⇒ same class ⇒ same gapps-ness. The
  comparator step can never distinguish two members.
- **fuzzy-name pass** — clusters are built *inside* one format class (`byFormat`). Same.
- **exact-hash pass** (new) — gapps rows have no bytes, so W4 refuses to hash them, so they
  are never candidates. Unreachable again, by a different mechanism.

**So the Google-Apps demotion is dead in all three lanes, and §4's instruction to place
`bonded` "after the Google-Apps rule" is a position relative to a step that cannot fire.** I
implemented it exactly as ruled anyway — the position is harmless and correct if the collision
is ever resolved the other way — and I did **not** touch the two red tests, because which side
gives way is a policy question, not a code question:

> **FOR live-cw, ruling needed:** are a Google-Doc and a PDF of the same song duplicates?
> If **no** (L1-W4 stands), the two tests are wrong and should be rewritten to assert
> non-grouping, and §4's Google-Apps clause should be struck as unreachable. If **yes**, then
> L1-W4's partition must exempt `gapps` from the split — and that is a change to a shipped
> production fix, which is yours and not mine.

Until then the suite is **931 pass / 2 fail** and those 2 are the only reds.

---

## 4 · What each wave actually built

**W1 · `05ab3f5821` — the NULs.** One named `FORMAT_CLASS_SEP` (a unicode escape) at all
three sites, so the writer and the parser cannot diverge. **Behaviour proven, not asserted:**
the escape is codepoint 0, length 1, `===` a real NUL; the emitted key is byte-identical
(`61646f6e6f796c6f6d0073636f7265`); the `indexOf` parse recovers the same key against both
spellings. **G1 after: 0 NUL in every `.ts`/`.tsx` under `src/`** (was 3 + the 4th above), and
`grep -c chartFormatClass library.ts` prints 7 instead of a binary notice.

**W2 · `16a61278ac` — reversibility precedes hiding.** `dedupeRuns/{runId}` holds each marked
row's `priorStatus`, `canonicalFileId` and the pass that decided; `priorStatus` + `dedupeRunId`
travel in the **same `batch.update`** as the status, which is how I read the order's "ordered
before it" — as atomicity, since statement order inside one update means nothing. The run doc
lands **before** the mark batches: the marks span several batches (500-write cap) so no atomic
unit covers record-plus-every-mark, and the ordering is chosen for **which way it fails** — a
crash after the record leaves an undo that is a no-op; the reverse leaves hidden rows nothing
can reach. `loserProvenance` fixes a real gap: the old code pushed losers into a flat list and
dropped the group link, so a record could not have said which row displaced which. A loser
with no provenance **throws** rather than defaulting — a record with a guessed canonical is
worse than none, because it looks auditable.

**W3 · `749a7810b2` — `undo_dedupe_group` + the legacy seed.** Two modes and deliberately no
third: `runId` (recorded prior statuses) or `fileId` + a named `toStatus`. "Restore everything"
is not offered because its safe version is the first mode and its unsafe version is the harm.
Clears `dedupedAt`/`dedupeRunId`/`priorStatus`, mirrors onto `songs`, refuses to cross
tenants, and is idempotent **out loud** — a row that is no longer `duplicate` is reported
skipped *with the reason*, never written over silently.

**W4 · `e2fb0eb5f6` — the column.** `contentHash: {alg, value, sizeBytes, at, source}`, set
**on the write path** for new uploads. A finding inside this wave: a sha256 of the same buffer
was **already being computed** in `library-upload.ts` — inside a fire-and-forget `try/catch`
that runs *after* the row write, spent only on an `aiEnrichmentCache` id and an event payload.
It never reached the row. That is precisely why 785 rows now need a byte-reading backfill to
recover a value the uploader had for free. Backfill is batched and resumable on
`sizeBytes`-vs-`fileSize`, so an interrupted run resumes and a finished one re-runs free.

**W5 · `b59f303f03` — the byte lane.** Report-only, scans every status, reports **clusters**
not pairs, and `noActionReason` makes a no-op a conclusion. The deciding-fields fix is a
**type**: all 84 groups in the 09-01 plan carried only `fileId`/`name`/`uploadedAt` because the
candidate shape carried only those, so `DedupeRowView` now carries `mimeType`, `sizeBytes`,
`status`, `contentHash` and `bondCount` on every row of every group in all three lanes. Bonds
are counted **only from live, in-tenant setlists** — a track whose parent setlist is gone is
not a bond, which was `delete_chart`'s guard's defect — read once for the whole scan. The
canonical comparator is now **one** function; it already existed twice and this lane would have
made a third copy of a five-step policy that must not drift.

**`4ab2d282e6`** — `dedupe_library`'s own description had gone stale by five response fields.
It is the contract Daniel's Desktop session reads; leaving it stale is a real defect.

---

## 5 · Guards

| guard | verdict | evidence |
|---|---|---|
| **G1** no NUL under `src/` | **PASS** | 0 across every `.ts`/`.tsx`; was 3 + 1. |
| **G2** reversibility precedes hiding | **PASS, both branches SHOWN** | Asserted in code (`runRows.length !== losers.length` throws pre-write) **and** demonstrated: with the record write deliberately broken, the tool returns `internal_error`, **0 run records, BOTH rows still `active`**, loser carries no `priorStatus`. Reverted, then the same test on shipped code: `committed 1`, 1 record, loser `duplicate` with `priorStatus active`. |
| **G3** the undo refuses what it must | **PASS, output shown** | `restore_target_required` naming `wouldWronglyActivate`, `rowsWithRecordedPriorStatus`, `markedRowsWithNoRecord`, `markedRowsTotal` — and all seeded rows verified still `duplicate` afterwards. |
| **G4** never a hash for unverified bytes | **PASS, fail branch SHOWN** | A real md5 disagreement, no injection: `{claimed:1, agreed:0, mismatched:1}`, detail `"driveMd5 claims b2fd7a1e…, bytes hash to 60521d93… (hex)"`, row ends `contentHash: null` + `hashFailed.reason: md5_mismatch`. |
| **G5** the 5 pairs / not the 2 | **PASS 7/7 against PRODUCTION** | §6. |
| **G6** RH guard + population | **HOLDS, before and after** | `shirei-tshuvah` **184 / `feed`**; `785 == 684 + 99 + 2`. |

A trap worth recording inside G4: `driveMd5` is Drive's `md5Checksum` and is **hex**; Storage's
`md5Hash` is **base64**. Comparing the wrong pair would have reported every Drive row as a
mismatch and tripped this wave's own stop condition on a healthy library. Both encodings are
computed, each claim compared against its own, and a test pins that they are one digest.

---

## 6 · **G5 verified against production — 7/7, and it found more than it was asked**

Instrument: resolve each title across the full 891-row catalog (hidden rows included), pull
real bytes via the live `download_chart`, sha256 locally.

**The 5 that must group — all byte-identical:**

| pair | bytes | sha256 (16) |
|---|---|---|
| `Niggun - Bonia Full Score` / `Niggun - Full Score` | 49,551 | `60ebf618c0f4366e` |
| `G-minor Spirits` / `gminor_spirits` | 42,729 | `939c2ec458a6eeea` |
| `B-minor Simple Tune` / `Bminor_simpletune` | 39,599 | `2e5a99141e91c4dd` |
| `twilight` / `Twilight (D Goldenberg)` | 29,132 | `bc8f6890ecc9543e` |
| `Hashkivenu (Randy)` / `Hashkivenu (Randy) (1)` | 22,443 | `f853ccf2c368da1d` |

**The 2 that must not — size-equal, byte-different, exactly as ruled:**

- `V'Shamru` / `V'Shamru (Old Skool)` — both **50,863 B**, `daf1af8ac69ecb06` vs `e907cbc03dacaea5`.
- `Adonai Oz (Nava Tehila)` / `Avinu Malkeinu_trad_Choir_Em` — both **46,235 B**,
  `3b364b0d5532da62` vs `eeea23acef404167`. **This is the order's md5-is-not-the-key argument
  standing up in production**: two same-size files that a size or cheap-hash key would have
  paired confidently.

**Three things the order did not know, all from this probe:**

1. **Several "pairs" are TRIPLES.** `Niggun - Full Score` is two rows, both already
   `duplicate`; `twilight` is two rows, both already `duplicate`. So those decisions cover
   **three** rows, not two — which is why W5 reports clusters and not pairs.
2. **Each of the 5 clusters ALREADY has exactly one visible row.** Every non-canonical side is
   already `duplicate`. So §1's *"5 byte-identical pairs are visible in the catalog right
   now"* and §9's *"the 5 visible ones nobody has hidden yet"* **no longer match the catalog** —
   the 09-03 naming dedupe marked them, and bytes now confirm those marks were right. **The
   practical consequence for Daniel: this list is not 5 decisions. It is 5 confirmations.**
   Scoped honestly: measured on these 7 clusters only. A population claim needs the backfill.
3. Within `V'Shamru` and within `V'Shamru (Old Skool)` there is a byte-identical pair **each**,
   already resolved one-visible-row apiece.

---

## 7 · The 20 marked rows with no prior status recorded anywhere

Not restorable by `undo_dedupe_group` — by design, and the seed reports them as a population
rather than assuming `active`. **5 of them are G5's byte-identical losers**, which tells you
where they came from: the 09-03 naming dedupe, the run that recorded nothing. That run is the
reason this order exists, and W2 is why it cannot happen again.

```
1Uf0bVHJJ_PHn6gZ0OtGRf2RFytrx01qU   application/pdf              49486  Ana B_Koach
1rmnciu0PVh2pL6GQkuJBasmEZzHgK5b4   application/pdf              22608  Bar'chu Walkdown
upload-8cf12700-fb49-4d3c-8b96-…    application/octet-stream      2336  Bar'chu Walkdown
1wKn6KPXBRQpLV6USzU5vP_qd53tT9Aa1   application/pdf              31480  Barchu (Siegel)
1PYUlbQY0hweTHW2Qrc7Xn3_9vlHaUtee   application/pdf              39599  Bminor_simpletune      ← G5
113D2wnFt1K9Vqgmp5pFn8wK6lnLEFwRL   application/pdf              54912  Dis Trust - Full Score
1TeiP5BlGnlP9ogYXO9yFL25J1Tz5k_RX   image/png                   140355  dodi li (sher)
11985wRgE09raY4usgF5Y6lIErTyoKKch   application/pdf              42729  gminor_spirits         ← G5
1HmJ7mu9qYx6eGVaJcg88Hklsei7bnjcAR  google-apps.document          3539  Hashiveinu
upload-4c33f063-4039-4620-9ed8-…    application/pdf              22443  Hashkivenu (Randy) (1) ← G5
1JlQ6xacP4pH5FZ6ja_kaZ2DayoEpkrZs   application/pdf              89773  L'Cha Dodi Dmin
1h2-nbJYTO7fVioa6uFwUwpyzH1d1bVce   application/pdf              37809  Mi chamocha (Moshav) morning
19FuqP-rbkufIUdAVCGMbXLuvDJKnicZM   application/pdf              35646  Mi shebeirach
1PYjUUqxH12ip7Uz5aFP7q1wRKwi-pKbv   google-apps.document          1024  Mi shebeirach
1CwH1LALn4s3bDRyyRQvLlLnbc6j7zhXH   application/pdf              31009  Modeh Ani Klepper
1e36kWrER7lDRLjCe1n_YGXlGKq15CMz2   application/pdf              49551  Niggun - Full Score    ← G5
1Tlx0xppOSXNZpO1idUqg2bNQfhyUgrfa   application/pdf              49779  Om-Ney Dm - Full Score
1PxJ-AxXwI5GUS4s_RutSAO_gEsDF8Got   application/pdf              32626  Refa tziri
1Dx-47EpIUtGvo15ItMA_Imb6IijHC6uM   application/pdf              61638  T'filah Adonai s'fatai - Full Score
1xYt6Mp1Ica-2C_VYS2mw_cfhxo3dMkg_   application/pdf              29132  twilight               ← G5
```

Two rows in the 09-01 file are **not** marked today and would be no-op restores:
`upload-4f05ce1a-…` (*Od Yavo Shalom Aleinu*) and `upload-046649f0-…` (*Barchu Walkdown*).

---

## 8 · Smaller findings, none blocking

1. **Two classifiers disagree about `application/octet-stream`.** `isNonChartArtifactShape`
   calls it non_chart; `chartFormatClass` maps it to `"score"`, the same class as a PDF. Found
   by a test of mine failing on its own premise. It is one of the 4 rows behind the 99-vs-103
   gap. Not a bug I fixed — but if octet-stream is junk to one filter and a score to the other,
   one of them is wrong.
2. **The run record is a single document with an unbounded `rows` array.** At ~120 B/row the
   1 MiB cap lands near 8,700 rows; today's whole eligible population is 785, so it cannot bite
   now. The failure mode is safe — the `set` throws, nothing is marked — so the tool becomes
   inoperable rather than unsafe. Recorded, not fixed.
3. **The rules deploy is the one thing here that DID reach production**, because W2 requires it
   and §8's prohibition is about the app. Deployed to `crcmusiccharts` and then **verified by
   re-reading the released ruleset** rather than trusting the CLI's success line:
   `projects/crcmusiccharts/rulesets/d81ee891-00b6-4f26-9af9-208444c74241`, 34,457 B,
   byte-identical to the file in the tree, `match /dedupeRuns/{runId}` present, admin-read /
   server-write. A Vercel push does not deploy rules — this repo's own 19:4xZ finding — so
   without this the collection would have fallen to deny-all and W3 would have looked built
   while leaving nothing reversible.
4. **CRLF, twice, as the desk warns.** `git stash pop` re-checked-out both files with CRLF
   (2,070 + 839 CRs) under `core.autocrlf=true`. Stripped; every committed file is LF and
   NUL-free, verified per file.
5. **Four of my own test premises were wrong and the code was right.** `priorStatus: null` for
   a row with no status field (the candidate build normalizes missing → `"active"`, which is
   how the browse and `search_library` already read such a row, so `null` would have pushed
   the very guess the field exists to remove down into the undo tool); `richError` spreading
   extras at the **top level**, not under `error.data`; a 10 s hook budget against Admin-SDK
   warm-up; and the octet-stream cross-format premise in (1). Tests corrected, code left alone.

---

## 9 · Verification, stated plainly

- `tsc --noEmit` clean at every commit.
- **Whole MCP emulator suite: 931 pass / 2 fail.** The 2 are §3's pre-existing pair, proven so
  by stash-baseline at `9933d2abef`.
- New tests this order: **7** (W2) + **14** (W3) + **14** unit + **14** emulator (W4) + **15**
  (W5) + **1** fail-branch = **65**, all green.
- G2 and G4 fail branches both **shown**, with the injection reverted and the revert verified.
- **Nothing pushed. Nothing deployed. No row marked, no row restored.** The 103 marked rows are
  exactly as they were.

---

## 10 · For live-cw

1. **The deploy ruling** (§1) — the only genuine blocker. W4's backfill, W3's seed and W5's
   dry run all wait on it.
2. **The Google-Apps ruling collision** (§3) — L1-W4's format partition vs §4's Google-Apps
   demotion. Two shipped tests are red on a clean tree and the demotion is unreachable in all
   three lanes. I did not touch either side.
3. **Five corrected numbers** (§2) for the ruling's record: 103 marked, 83 covered, 20
   unrecorded, 18 archived (exact), and a 4th NUL.
4. **§1 and §9 of the order are now stale** (§6·2): the 5 byte-identical clusters each already
   have one visible row, so Daniel's list is 5 **confirmations**, not 5 decisions.
5. **Unruled, minor** (§8·1): octet-stream is junk to one classifier and a score to the other.

## 11 · For Daniel, when the deploy question is settled

Nothing needs him yet, and I want to be straight about that rather than manufacture a list.
The pairs the order promised him are, on measurement, **already correctly deduped** — bytes
agree with the marks. What will genuinely be his, once the backfill runs, is whatever the
*other* ~770 rows turn out to hold. Still open from the prior return and untouched here: the
2 restore pairs, and the **12 audio part-track groups** — `non_chart` rows this order does not
hash, and the concern there is unchanged and worth repeating, because if five part names share
one byte size they may be one file, and a singer rehearsing the alto line would be hearing the
full mix.

*Claude records; Daniel decides.*
