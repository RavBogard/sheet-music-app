# ORDER → `live` (Code): the one batched `src/` deploy — close the format-class hole, make the md5 guard fire, and retire three artifacts that describe a world the rulings replaced

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0904-live-cw-3** (format class is a PROGRAM property; `forceScore` is prohibited until the gate
ships) · **R-0904-live-cw-4** (both premises measured at the source: where the exact lane's protection actually
lives, and the field nothing writes) · **R-0903-live-cw-11** (the cross-check is BUILT, says what it certifies,
and reports its denominator) · **R-0904-live-cw-1** (a guard names the source line whose behaviour it asserts) ·
R-0903-live-cw-5 · R-0903-live-cw-4 (the push is the only path; a red build never promotes) · R-0903-live-cw-2 §3 ·
R-0803-168 · R-0831-guards-2 · rules 1, 4, 5, 8 addendum, 11, 18.
Status: **DONE — closed by `RETURN-CODE-LIVE-SRC-BATCH-2026-09-04.md` (E1–E6 complete, shipped `95cab8bbe0`).** **This order writes NO row of the production catalog.** Its only production change is
the deploy itself. It adds **no new write path** — the single-row marking tool `R-0904-live-cw-2` §2 specifies is
deliberately NOT here, and why is in §5.
Verified-against: `5e52e29ff0` [inherited: your 00:1xZ row — production serving it since 2026-09-03T20:27:30Z].
**Re-verify the tree by content before your first edit** (rule 8: a mount's HEAD is never held in a variable).
Tier: CLOSED — every claim below names the file and line it was read at, and each track states a behaviour change
an instrument can see.
NEXT: E1 the format-class gate → E2 the md5 cross-check → E3 the dead demotion and its two tests → E4
`get_chart_status` → E5 `delete_chart`'s hint → E6 one deploy, guards, return.

---

## 1 · What this is, and the one thing in it that is urgent

Five `src/` changes that have been batched behind one deploy, plus the deploy. **Four are hygiene and have waited
without cost. E1 has not** — it is reachable today by one optional argument on a tool that is otherwise safe, and
`R-0904-live-cw-3` §2 currently holds the line with a prohibition rather than a gate. **A prohibition on a
family of lanes is not a guard; it is a promise. E1 replaces the promise.**

## 2 · E1–E5 · The wave

- [ ] **E1 · The format-class gate, applied by EVERY grouping lane, on group EMISSION.**
      **The mechanism, measured, so you do not fix the wrong half.** The exact lane is protected by its KEY
      CONSTRUCTION: `DEDUPE_STRIPPABLE_EXTENSION_RE` (`src/lib/mcp/tools/library.ts:1365-1366`) is the shared
      stem-identity set MINUS the audio tokens, and its own comment names the 2026-09-01 live-catalog measurement
      behind that choice — five mixed groups, three of which would have marked a real chart, **`Mizmor Shiru
      L'adonai .mp3` over `Mizmor Shiru Ladonai.pdf` among them, by name**. The canonical picker
      (`isGoogleAppsMime`, `library.ts:41`, applied at `:160-161`) does something narrower and says so: it demotes
      Google-Apps mimes only. **The fuzzy lane builds no key at all** — `clusterBySimilarity` unions candidates by
      Levenshtein similarity over names, where an extension exclusion has nothing to bite on. **So the fuzzy lane
      reassembles exactly the group the exact lane was fixed to prevent, and the source already holds the
      measurement proving that group wrong.**
      **Therefore: NOT another regex.** A regex is a property of names, and the fuzzy lane's premise is that names
      are unreliable. Classify each row into a **format class** — chart bytes · audio · Google-Apps — from its
      `mimeType`, reusing the classifiers that already exist rather than inventing a fourth
      (`isGoogleAppsMime`, and the `isNonChartArtifactShape` family the browse surfaces use); **a group whose
      members span more than one class is NOT EMITTED, by any lane — exact, fuzzy or hash.** The lane reports
      `formatClassRefusals` as a count, per `R-0903-live-cw-11` §3: a gate that cannot say how often it fired
      cannot be trusted to have fired.
      **Where the class is unknown** (a null or unrecognised mime), the group is refused and counted, not emitted
      — an unknown class is not a matching class.

- [ ] **E2 · The md5 cross-check asks the OBJECT, not the row — and reports its denominator.**
      `crossCheckMd5` (`src/lib/library/content-hash.ts:117`) is correct and unit-tested; **its input is the
      problem.** `driveMd5` is written at exactly one site — the Drive poller, `poller.ts:477` — which reaches no
      Storage-backed `upload-*` row and has nothing to write for Google-Apps rows, since Drive exposes no
      `md5Checksum` for them. **`storageMd5Hash` is READ at exactly one site (`backfill-content-hash.ts:329`) and
      WRITTEN AT NONE: the field has never existed on a single row.** That is the whole of `{claimed: 0, agreed:
      0, mismatched: 0}` across 853 rows.
      **Do not add the field and do not backfill it.** `getStorageObjectMd5(fileId, mimeType)`
      (`src/lib/firebase-storage.ts:253`) already returns the object's own `md5Hash` from metadata **without
      downloading bytes**, and is already proven in production by the backup cron. The backfill calls it inside
      the loop that is already holding the object and passes the result as `storageMd5Hash`. **A claim read off
      the artifact at the moment of use cannot go stale and needs no migration; a claim stored on the row is a
      second copy of a fact.**
      **Then the shape (`R-0903-live-cw-11` §3):** `md5CrossCheck` becomes
      `{applicable, claimed, agreed, mismatched}`. **GREEN requires `claimed == applicable` and `mismatched == 0`.
      `applicable == 0` reports NOT APPLICABLE and is never a pass.** `applicable` is the count of rows whose
      bytes were fetched from a source that exposes a checksum — so the 29 rows with no Storage object are outside
      the denominator by construction, not by exception.
      **And say what it certifies, in the source, in one sentence (`R-0903-live-cw-11` §2):** the store computed
      that md5 over the bytes the store holds, so agreement proves **the read was faithful** — it does not prove
      the bytes are the right chart and it is not an independent witness to provenance. `crc32c` is present on
      every object too; take it if it is free, and describe it the same way.

- [ ] **E3 · The dead Google-Apps demotion, and the two emulator tests that assert the shape the rulings
      forbid.** `R-0903-live-cw-5` made Google-Apps its own format class — it never groups with a real-bytes row —
      and you confirmed at D-wave S4 that the demotion is dead code that can no longer fire [inherited: your 20:4xZ
      return]. **Once E1 lands, a mixed-class group cannot be emitted at all**, so the demotion tiebreak is
      unreachable by construction rather than by circumstance. Retire it **with its reason recorded in the source**
      — the comment that survives should say the class gate now decides, not merely that this code is unused.
      The two emulator assertions at `src/lib/mcp/__tests__/mcp-dedupe-library-index.emulator.test.ts:427` and
      `:993` **seed and then require mixed-mime groups** ("status outranks the Google-Apps demotion"; "PDF beats
      earlier Google-Doc"). **They are not wrong tests; they are tests of a retired rule.** Replace each with the
      assertion the ruling actually wants: **that group is never emitted, and the refusal is counted.** Do not
      simply delete them — a deleted test leaves no evidence the behaviour changed on purpose.

- [ ] **E4 · `get_chart_status`'s green means bytes, and it is read as "the band can open this."**
      `getChartStatus` (`src/lib/mcp/tools/library-verify.ts:63-104`) probes Storage/Drive health and projects
      enrichment; **it never reads `library_index` at all.** So a `fileId` with no catalog row returns
      `{status: 'ok'}` whenever bytes happen to sit at a candidate path — which is exactly what the ZZTEST
      fixtures did before they were deleted. Add the catalog fact to the answer: **`ok` requires reachable bytes
      AND an index row**, and a row that has bytes but no index row gets its own named status rather than a green.
      **MEASURE, do not assume, one adjacent thing while you are in this function: whether this path is
      tenant-scoped.** `delete_chart` carries an explicit cross-tenant wall (`library-upload.ts:742-751`) and I
      could not find the equivalent here. **If it is absent, that is a finding for a ruling, NOT a fix inside this
      order** — report it and change nothing about it.

- [ ] **E5 · `delete_chart`'s hint sends the caller back to the tool that misled them.** A missing index row
      returns `chart_not_found` with the hint *"Verify the fileId via list_library / search_library"*
      (`library-upload.ts:732-738`, and again at `:744-750` for the cross-tenant case). **But `search_library`
      reads `songs` and `delete_chart` requires a `library_index` row** — so for a `songs`-only row the hint names
      the very tool that just showed the caller the row. **That loop is what `R-0903-live-cw-6` spent a whole
      sitting inside.** Re-word it so the two states are distinguishable: no index row is not the same as no such
      chart, and a row visible in `search_library` but absent here is a `songs`-only row that this tool cannot
      delete — **report it, do not retry.** Leave the cross-tenant branch's message deliberately
      indistinguishable from a genuine absence; that ambiguity is a security property (`library-upload.ts:742-743`
      says so) and it is not this order's to improve.

- [ ] **E6 · One deploy, then the guards, then the return.** `RETURN-CODE-LIVE-SRC-BATCH-2026-09-04.md` and a
      CLOSED board row: per-track what changed and what proves it, G1–G8, the before/after `forceScore` dry-run
      plans side by side, the `md5CrossCheck` shape before and after, and E4's tenant-scope finding stated
      plainly whichever way it came out.

## 3 · Guards that can fail

**G1 · The standing Rosh Hashanah read, before the first edit and after the deploy.** `list_books` →
`shirei-tshuvah` **184 / `feed`**. [measured: `live-cw`, `list_books`, 2026-09-03 23:4xZ.] FAIL: any other page
count or tier. This runs on every satellite deploy and this one is no exception.

**G2 · E1 IS PROVED BY THE GROUP THAT DISAPPEARS.** Run `dedupe_library {forceScore: 0.85, dryRun: true}`
**before** your first edit and **after** the deploy. Before: the Mizmor group is present — it keeps
`1czN_ywRWm2bnj…` (the PDF) and marks both mp3s including `1d-aXA4WzVjKYv…`, inside a plan of 15 groups and 19
marks [inherited: your 00:1xZ return R3]. **After: that group is ABSENT, `formatClassRefusals` is at least 1, and
no group in the plan spans two format classes.** FAIL: the group survives, or the refusal count is zero, or any
emitted group is mixed. **Both runs are dry. Neither is executed, before or after** — `R-0904-live-cw-3` §2
permits the dry run and only the dry run.

**G3 · E2 IS PROVED BY A GUARD THAT CAN NOW FAIL.** `backfill_content_hash {dryRun: true}` over a bite of rows
that includes Storage-backed `upload-*` rows. **`applicable > 0` and `claimed == applicable`.** FAIL: `applicable`
is 0 on a bite containing Storage-backed rows — that is the old vacuum wearing a new field name; or `claimed <
applicable`, which means the object read is not reaching rows the denominator counts. **A `mismatched > 0` is NOT
a failure of this order** — it is the finding the guard exists to produce, and it stops the wave and comes back
here (`R-0903-live-cw-2` §3: a wrong hash makes a false pair confidently).

**G4 · ZERO catalog writes.** No status flips, no marks, no restores, no deletes, no backfill committed. Every
`backfill_content_hash` call in this order carries `dryRun: true` and never `force`. FAIL: any write to
`library_index` or `songs`. The pre- and post-partitions are RECORDED as observations with their provenance and
**cannot fail this order** (`R-0903-live-cw-10`); the five rows `D7-FINISH` named are re-read and must be
unchanged — `1HmJ7mu9qYx6eG…` and `1PYjUUqxH12ip7…` **`active`** (F1's result), `1VuMq83_0W8ya9…`,
`1d-aXA4WzVjKYv…` and `1czN_ywRWm2bnj…` **`active`**.

**G5 · The rollback target is named BEFORE the push.** Record the deployment currently serving production and
confirm it stays rollback-able. FAIL: you cannot name it. [inherited: `9933d2abef` was the intact rollback at the
20:27:30Z deploy — re-read it rather than trusting this line.]

**G6 · A red build never promotes, and the push is the only path** (`R-0903-live-cw-4`). If the build is red,
**stop and return** — do not retry it into green and do not hand-promote. The 2026-09-01 19:22Z ERROR build that
left production serving is this family's own evidence that the failure mode is real.

**G7 · NO NEW WRITE PATH.** This order adds no tool that can change a catalog row's status. FAIL: a single-row
marking path lands here. `R-0904-live-cw-2` §2 specifies that tool and §5 below says why it is not in this deploy.

**G8 · The 257 `songs`-only fixture rows are untouched**, and no lane in this order reads them for any purpose
but a count. Their disposition is with Daniel and is not in this wave.

## 4 · Stop conditions

- **STOP if E1 cannot be built without changing what the EXACT lane groups.** The exact lane's behaviour on this
  catalog is measured and correct — 91 groups, zero mixed [inherited: `library.ts:1350-1356`'s own 2026-09-01
  measurement]. **A gate that changes the exact lane's output has caught something real or broken something real,
  and either way it is a finding, not a merge.**
- **STOP if G3's `applicable` is 0 after E2.** Do not adjust the denominator to make it non-zero.
- **STOP before any `force` on anything.** Nothing in this order commits a catalog write.
- **STOP if E4's tenant-scope question turns out to have an answer that needs code.** Report it; a security fix
  discovered mid-wave does not ride a hygiene deploy uninspected.
- **Do not touch the 257 fixtures, and do not extend `R-0903-live-cw-6`'s admin bypass by a single row.**

## 5 · Why the marking tool is NOT in this deploy

`R-0904-live-cw-2` §2 fixes the shape of the single-row mark, and Daniel's `R-0903-live-cw-8` decision has been
waiting on it since 21:4xZ. It would have been easy to add here. **It is not here because this deploy changes READ
paths and that one adds a WRITE path to the catalog Daniel authors in, and a rollback should not have to choose
between them.** If E1–E5 need reverting, reverting them must not also revert a marking tool — or worse, leave one
half-live. The tool gets its own order, its own guards and its own deploy, written by this desk when this one
returns.

Claude records; Daniel decides.
