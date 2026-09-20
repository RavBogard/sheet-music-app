# ORDER → `live` (Code): enumerate the `songs`-only fixture rows, freeze the list, then delete them — and stop the whole wave on one row that does not look like litter

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live`
Authority: **R-0904-live-cw-5** (Daniel at the keyboard 00:4xZ: delete, overriding this desk's recommendation to
hide; the bypass extends ONCE, to a FROZEN LIST, never to a predicate; the enumeration is the safety argument) ·
**R-0903-live-cw-6** (the admin-surface instrument, and the scope sentence this ruling knowingly extends) ·
R-0904-live-cw-2 §4 · R-0903-live-cw-10 · R-0903-live-cw-11 §3 · rules 1, 4, 5, 8 addendum, 11, 18.
Status: **DISPATCHABLE — and it is the only order this desk holds that DESTROYS DATA.** Read §6 before §2.
Verified-against: `5e52e29ff0` [inherited: your 00:1xZ row]. **Re-verify by content before the first delete.**
Tier: CLOSED — it states an exact closing arithmetic that an instrument can check.
NEXT: X1 enumerate and freeze → X2 re-prove the two emptiness properties → X3 delete against the frozen list →
X4 the closing arithmetic → X5 return.

---

## 1 · What this is

`live`'s census found **`257` documents in `songs` with no `library_index` row**, every one of them carrying a
test-fixture signature in its title, none of them bonded to any setlist [inherited:
`RETURN-CODE-LIVE-SONGS-DIVERGENCE-CENSUS-2026-09-03.md` C0–C2]. They are four months of probe and harness litter.
They are invisible in the band's browser library and **visible in the picker Daniel authors from**, where two of
them sort ahead of the alphabet [measured: `search_library {query: "", limit: 20}`, `live-cw`, 2026-09-03 23:4xZ —
`[role-band_leader] tiny` and `[role-musician] tiny` returned as rows one and two].

**This desk recommended hiding them and was overruled.** `R-0904-live-cw-5` §0 records both. Nothing about the
recommendation survives into this order except one thing: **the care that would have been unnecessary for a
reversible act is mandatory for this one.**

## 2 · X1–X5 · The wave

- [ ] **X1 · ENUMERATE ALL OF THEM, THEN FREEZE THE LIST.** Re-derive the `songs`-minus-`library_index` set for
      `orgId: "crc"`, and **write every row to `FIXTURE-PURGE-MANIFEST-2026-09-04.json` at the repo root** — per
      row: `id`, `title`, `fileName`, `status`, `orgId`, every timestamp the doc carries, the Storage object path
      and size if one resolves, and the signature class you classify it into. **Commit that file before X3
      touches anything** (it is your tree; rule 8 addendum, git host-side). **From X1 onward THE MANIFEST IS THE
      SET.** X3 deletes ids read out of that file and nothing else. **Do not re-run the query at delete time** —
      `R-0904-live-cw-5` §1: a predicate re-evaluated between the review and the act can grow; a list cannot.
- [ ] **X2 · Re-prove the two emptiness properties against the frozen list, yourself.**
      **(a) ZERO BONDS.** One collection-group sweep over every `tracks` subcollection in production, intersecting
      `chartId` / `fileId` / `driveFileId` / `songId` / `chartFileId` against the manifest's ids — the technique
      your census used, not `257` per-row calls. **This is re-run, never inherited**: zero was true at 23:1xZ and
      Daniel authors continuously (`R-0903-live-cw-10`). **Any bond, on any id: STOP the wave.**
      **(b) ZERO UNSIGNATURED.** Every row in the manifest matches a named fixture signature **by its own title** —
      `b6-fixture` · `iPad …` probe · `ZZ`-prefixed · other probe/stress/harness · `[role-…]`. **Report the count
      per class, and report the unsignatured count as a LISTING, not a tally** (`R-0903-live-cw-11` §3: a check
      that cannot name its population has not checked it). **One row that matches nothing: STOP THE WHOLE WAVE**,
      not that row alone — a population defined by "none of these is real" is falsified by one, and everything
      after it is now a different question.
- [ ] **X3 · Delete, against the frozen list, both halves, one id at a time.** The `songs/{id}` document AND its
      Storage object, through the Firestore/Storage admin surface — the instrument `R-0903-live-cw-6` authorizes
      and `R-0904-live-cw-5` §1 extends to this set. **Both halves per id, verified per id before the next one**,
      or the row is half-deleted in the shape this order exists to clear. **Take it in bites and report progress
      by manifest position**, so an interruption resumes rather than restarts.
      **A row whose Storage object does not resolve is not an error** — many of these are text fixtures and some
      may never have had bytes; record it and delete the document. **A delete that reports success and leaves the
      document readable IS an error: STOP after that id and report it.** Repeating an unknown failure mode across
      `257` ids is not diligence.
- [ ] **X4 · The closing arithmetic, which is the proof.** `library_index` **UNCHANGED, to the document** — the
      partition must read exactly what it read at X1's open [inherited: `892 == 790 + 100 + 2 + 0` at your 00:1xZ
      return, post-F1; re-read it, do not trust this line]. **`songs` reads `944`.** And then the property the
      whole wave exists to produce: **`songs` and `library_index` are the same size, and the songs-only
      divergence is `0`.** Re-run the census's own C2(a)/C2(b) computation to say so.
- [ ] **X5 · Return** `RETURN-CODE-LIVE-FIXTURE-PURGE-2026-09-04.md` + a CLOSED board row: the manifest's commit
      sha, the per-class counts and the unsignatured listing, the bond sweep's result, deletions attempted vs
      confirmed with both halves, anything that resisted, and X4's four numbers.

## 3 · Guards that can fail

**G1 · The standing Rosh Hashanah read, before X3 and after X4.** `list_books` → `shirei-tshuvah` **184 /
`feed`**. [measured: `live-cw`, `list_books`, 2026-09-03 23:4xZ.] FAIL: any other page count or tier.

**G2 · THE MANIFEST EXISTS AND IS COMMITTED BEFORE THE FIRST DELETE.** FAIL: X3 begins with the manifest
uncommitted. **This is not bureaucracy and it is not an undo** (`R-0904-live-cw-5` §3): nothing in this system
reverses a delete, and the manifest is the only artifact from which a wrongly-deleted row could be identified and
re-created by hand.

**G3 · THE OTHER TENANT IS UNTOUCHED AND UNNAMED.** `brotherslazaroff` reads **`52`** in `songs` and **`52`** in
`library_index` at open and at close [inherited: that census's C1]. **No id, title or filename of theirs appears
in the manifest, the return, or any other artifact.** FAIL: either count moves, or one of their rows is named
anywhere.

**G4 · EVERY DELETED ID CAME OUT OF THE MANIFEST.** The set of ids deleted equals a prefix of the manifest, and
nothing else. FAIL: a deletion whose id is not in the file — however obviously it belongs.

**G5 · `library_index` DID NOT MOVE.** The partition at close is identical to the partition at X1, document for
document. FAIL: any change at all. **This is the guard that catches a wave that reached a real chart**, and it is
the reason the whole thing can be checked with arithmetic instead of trust.

**G6 · THE FIVE `D7-FINISH` ROWS ARE UNTOUCHED AND STILL READ AS THEY DID.** `1HmJ7mu9qYx6eG…` and
`1PYjUUqxH12ip7…` **`active`**; `1VuMq83_0W8ya9…`, `1d-aXA4WzVjKYv…` and `1czN_ywRWm2bnj…` **`active`**. FAIL:
anything else. None of them is `songs`-only and none can legitimately be in the manifest; if one is, that is X2's
stop firing.

**G7 · NO `src/` CHANGE AND NO DEPLOY.** The admin surface needs neither. The `src/` batch is a different order
you also hold (`HANDOFF-CODE-LIVE-SRC-BATCH-AND-DEPLOY-2026-09-04.md`) and it must not be started inside this one.

**G8 · NO `dedupe_library` CALL WITH `forceScore` OTHER THAN `dryRun: true`** (`R-0904-live-cw-3` §2), on this
wave as on every other, until the format-class gate ships.

## 4 · Stop conditions

- **STOP on one unsignatured row — the whole wave, not that row.** X2(b).
- **STOP on any bond, on any id.** X2(a). A fixture something points at is a finding.
- **STOP if `library_index`'s count changes at any point during X3.** Mid-wave, not only at close.
- **STOP after any id whose delete reports success and leaves the document readable.**
- **Do not create a `library_index` row to make `delete_chart` reach these rows.** `R-0903-live-cw-6` refuses that
  path and still does: no authorized tool writes that row either, and it would put fixtures into the band's
  browse on the way to deleting them.
- **Do not use `cleanup_all_test_data`.** Its scope is wider than the ruling, and these docs carry no
  `uploadedBy` for it to match anyway [inherited: the ZZTEST order's §4].
- **Nothing else in the catalog is in scope** — not the marked rows, not the `38` unreachable-byte rows, not the
  Mizmor pair, not the other tenant. Named so that "while I was in there" has no room to grow.

## 5 · If X2 stops the wave

Return the manifest and the row that failed, and **stop**. Do not delete "the other 256 while we sort that one
out": the classification is the argument, and one exception means the argument has not been made. **This desk
would rather spend a wave than a chart.**

## 6 · Irreversibility, stated plainly

**These deletions have no undo.** `undo_dedupe_group` reverses a mark; nothing reverses a delete, and the admin
surface has no guard that would stop a wrong one. **This desk recommended hiding these rows precisely because
hiding is the recoverable act** (`R-0903-live-cw-8`), and Daniel — told what the alternative was and what this
one costs — ruled delete. **That is his to rule and it is recorded as his** (`R-0904-live-cw-5` §0).

What follows from it is the shape of this order: **an enumeration before an act, a frozen list instead of a
query, a stop on the first row that does not fit, and a closing check that is arithmetic rather than
assurance.** Every one of those is here because the act cannot be taken back.

Claude records; Daniel decides.
