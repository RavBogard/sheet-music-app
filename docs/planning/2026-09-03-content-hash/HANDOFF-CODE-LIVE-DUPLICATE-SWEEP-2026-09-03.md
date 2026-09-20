# ORDER → `live` (Code): audit every `duplicate`-marked row for the cross-format failure. READ-ONLY.

Lane: **live-cw (Opus Cowork)** — the decision desk · **Executor: `live` (Code)**, host-side in `~/CentralReform.live`
Authority: **R-0903-live-cw-1 §3** (this order is the gap that ruling names) · R-0902-live-cw-1 §3 · R-0901-vision-8 §3 ·
COORDINATION rules 4, 5, 8 addendum, 11 · R-0831-guards-2
Status: **DISPATCHABLE, and it goes before this desk's `moments.json` order** — it is the one with a congregational clock.
Daniel approved the sweep at the keyboard; **he DECLINED a satellite freeze**, so the only standing gate is the Rosh
Hashanah guard (`list_books` → `shirei-tshuvah` 184 / `feed`) on any deploy [inherited: vision's 01:3xZ board row and its
01:3xZ edit to `HANDOFF-COWORK-LIVE-DESK-2026-09-03.md`, which records his approval].
Verified-against: `9933d2abef` [inherited: the 16:2xZ board row, which is the last satellite HEAD any lane reported] —
**re-confirm host-side before W1 and say so in your row.** Git readouts through the Cowork mount are untrusted in this
tree (rule 8 addendum), so this desk did not read HEAD itself; it is yours to establish, exactly as you did at 15:3xZ.
Tier: CLOSED — this order states measured population counts and a changed-row list.
NEXT: W1 recount and reconcile the population → W2 classify every pair → W3 write the return → **STOP.** Nothing in this
order writes, marks, un-marks, restores or deploys; W3 ends it and Daniel decides per pair.

---

## 1 · Why this exists, in three sentences

At 16:2xZ you found that a group Daniel had authorized was not a duplicate: a 763-byte `text/plain` row and a
44,377-byte `application/pdf` row (David's, `human_curated`), where the sweep kept the text row on the earlier
`uploadedAt` and marked the PDF — which removed a real chart from browse, search and Perform until it was restored.
You fixed the cause by putting `chartFormatClass` into the grouping key, and you named the two failures yourself: the
proposal showed names and dates rather than the fields that decide the question, and the picker demoted only
Google-Apps types so `text/plain` fell through to age.
**The fix stops the NEXT sweep from doing it; it does not go back and look at what earlier sweeps already marked.**
That is this order: one read-only pass over every row currently marked `duplicate`, looking for the same shape.

## 2 · The population, measured by this desk — and the number in the handoff is not the live one

```json
list_library({ limit: 1 })
list_library({ limit: 1, includeNonChartHealthy: true })
```

**Observed on the live surface, run at 2026-09-03 01:3xZ from the connected `claude.ai CRC Music` client (which
authenticates as `musician` — see §6), against the satellite at `9933d2abef`:** visible catalog **687** rows;
`coverage.filteredOut.byStatus` → **`duplicate` 96**, `archived` 2; `eligible` **785**; `byOther.non_chart` **106**;
`coverage.total` **891**. With `includeNonChartHealthy: true` the same call returns **785** rows and an empty
`byStatus`, which is the identity in G1 below.

```console
python3 -c "import json,collections; d=json.load(open('L1-W2-DEDUPE-UNDO-2026-09-01.json')); print(len(d), collections.Counter(x['priorStatus'] for x in d))"
```

**Observed, run at 2026-09-03 01:3xZ on this mount at `9933d2abef`: `85 Counter({'active': 67, 'archived': 18})`.**
So the **85** the handoff and the 12:0xZ row carry is the 09-01 sweep's own undo file, not the live population — and
**18 of those 85 rows were ALREADY `archived` when they were marked**, so re-marking them hid nothing that was visible.
**The rows where a chart could have disappeared from the band's view are the 67 that were `active`.**

Three figures now exist for one thing and this desk is not reconciling them by arithmetic, which is the failure this
program has paid for four times: **96** live (above), **85** in the 09-01 undo file, **101** reported by
`dedupe_library({dryRun:true})` at 15:5xZ [inherited: the 15:5xZ board row], against a 09-01 plan whose own coverage
records **15** rows already marked `duplicate` before that sweep ran [measured: `L1-W2-DEDUPE-PLAN-2026-09-01.json`
`coverage.filteredOut.byStatus`, this mount, 01:3xZ]. **W1 recounts and reports the difference; it does not assume it.**

## 3 · The artifact that could not have caught it — the reason W2 is shaped the way it is

```console
python3 -c "import json; g=json.load(open('L1-W2-DEDUPE-PLAN-2026-09-01.json'))['groups']; print(len(g), sorted({k for x in g for r in [x['kept']]+x['duplicates'] for k in r}))"
```

**Observed, run at 2026-09-03 01:3xZ on this mount at `9933d2abef`: `84 ['fileId', 'name', 'uploadedAt']`.**
Every one of the 84 groups records its kept row and its duplicates with **`fileId`, `name`, `uploadedAt` and nothing
else.** `mimeType` and `fileSize` — the two fields that decide whether a pair is a duplicate at all — **are absent
from the artifact**, in all 84 groups. Your failure (a) was not only what you showed Daniel in the chat window; it is
the shape of the plan file itself, so no review of that file by anyone could have found the cross-format pair.
**Therefore W2's output carries both fields for both rows of every pair, and G3 refuses a pair that does not.**

## 4 · The waves

### W1 · Recount and reconcile the population (read-only)

- [ ] Re-confirm the satellite HEAD host-side and record it in your row.
- [ ] `list_library({ limit: 1 })` and `list_library({ limit: 1, includeNonChartHealthy: true })`; record
      `coverage.filteredOut.byStatus.duplicate`, `eligible`, `scanned` and the visible `total`.
- [ ] Cross-check with `dedupe_library({ dryRun: true })` over the bearer path (§6) and record its `duplicate rows`
      figure beside the `list_library` one. **If the two disagree, that disagreement is a finding for the return, not
      a number to pick between.**
- [ ] Enumerate the `duplicate`-marked rows by paging `list_library({ includeNonChartHealthy: true })` and filtering
      `status === 'duplicate'`. **Page to `total`; do not sample.** The limit clamps at 200.
- [ ] Reconcile against the 09-01 undo file's 85 rows and report, by fileId, which marked rows the undo file does NOT
      cover — those were marked by an earlier or later run and have no recorded canonical partner on disk.

### W2 · Pair and classify every marked row (read-only)

- [ ] For each marked row, name its KEPT row: from `L1-W2-DEDUPE-UNDO-2026-09-01.json`'s `canonicalFileId` where the
      row is covered, and otherwise from the live catalog by normalized name, marked as `pairing: inferred` so the
      return never presents an inference as a record.
- [ ] For BOTH rows of every pair, report: `fileId` · `name` · `mimeType` · `fileSize` · `uploadedAt` · `status` ·
      `collection` · `enrichmentStatus` (so `human_curated` is visible, as it was on David's PDF).
- [ ] Classify each pair: **CROSS-FORMAT** (the two rows' `chartFormatClass` differ) or **SAME-FORMAT**.
- [ ] Within CROSS-FORMAT, put **a hidden `application/pdf` behind a non-PDF kept row** at the top of the list. That is
      the exact shape of the 16:2xZ incident and the only one where a real chart is known to have gone missing.
- [ ] Order the whole report so the **67 rows whose `priorStatus` was `active`** come before the 18 that were already
      `archived`.

### W3 · The return (read-only)

- [ ] Write `RETURN-CODE-LIVE-DUPLICATE-SWEEP-2026-09-03.md` beside this order.
- [ ] One line per CROSS-FORMAT pair that Daniel can answer yes/no to, with both rows' mime and size on that line.
- [ ] State the population arithmetic from W1 as found, including any rows that did not reconcile.
- [ ] **Say in the return that there is no un-mark tool** (R-0903-live-cw-1 §3(b)): a restore is a Firestore edit and
      needs Daniel, exactly as the 16:00Z repair did. Do not perform one under this order.
- [ ] Close your row with `FOR DANIEL (decide-by …)` carrying the count of pairs awaiting his word, and
      `FOR COWORK (live-cw)` for anything that wants a ruling.

## 5 · Guards that can fail, and the one whose fail branch is already available

**G1 · Population identity, not an absolute count** (field note 12 — this stays true as the library grows):
`eligible == visibleTotal + byStatus.duplicate + byStatus.archived`, from one `list_library` response.
**Observed by this desk at 01:3xZ: 785 == 687 + 96 + 2.** FAIL → the hidden-set no longer partitions the catalog and
W1's enumeration cannot be trusted; stop and return.

**G2 · Pairing completeness.** Every row enumerated in W1 appears in exactly one W2 pair. FAIL on any remainder in
either direction — a silent drop here is how a hidden chart stays hidden. A row with no findable partner is REPORTED
as unpaired, never omitted.

**G3 · The deciding fields are present.** Every pair row in the W3 return carries a non-null `mimeType` AND
`fileSize`. FAIL → the pair is refused rather than rendered.
**Demonstrate G3's fail branch before dispatching the return, per R-0831-guards-2, and the input is already on disk:**
feed G3 one pair built from `L1-W2-DEDUPE-PLAN-2026-09-01.json`'s own fields (§3: `fileId`, `name`, `uploadedAt`) and
it must refuse — **the guard fails on the very artifact whose shape caused the incident.** A guard whose fail branch has
never run is a premise wearing a guard's costume.

**G4 · The standing Rosh Hashanah guard**, before and after the pass: `list_books` → `shirei-tshuvah` **184 / `feed`**.
**Observed GREEN by this desk at 01:3xZ**, along with maariv 69 and shacharit 144. This order writes nothing, so a
change here means something else moved and the sweep is not the story.

## 6 · Stop conditions, and the identity you need

- **STOP on any same-format pair that looks wrong.** A pair whose two rows share a format class is NOT this order's
  question — it is an ordinary dedupe judgement, and it goes in the return as a note for a later sitting.
- **STOP before any write.** No `dedupe_library` without `dryRun: true`, no status flip, no Firestore edit, no deploy.
- **STOP and return if the reconciliation in W1 cannot account for a marked row** — report it; do not resolve it by
  inference. Both this desk and this lane have generalized from one volume this week and both were wrong
  (R-0902-live-cw-3 §4).
- **The connected MCP client authenticates as `musician`, not admin** (R-0903-live-cw-1 §5): admin-only tools refuse it
  with `forbidden_role`. This desk drove every `list_library` and `list_books` call above from the connected client, so
  **W1's enumeration does not need the bearer**; `dedupe_library({dryRun: true})` does. Use the bearer path for that one
  call and say which identity ran which step.

## 7 · What this order deliberately does not do

It does not restore anything, does not touch the grouping key you fixed at `9933d2abef`, does not re-run a sweep, and
does not reach into `src/`. It does not touch the two Rosh Hashanah setlists. It spends no ruling id — if the pass turns
up a class of pair that needs a rule, it returns the question to this desk (rule 1).

**FOR DANIEL, from this desk rather than from this order:** both Rosh Hashanah setlists carry **0 bonded charts across
83 and 84 rows** and have since Aug 26 [measured: `verify_setlist_charts` on both setlist ids via the connected MCP,
this desk, 2026-09-03 01:3xZ — `bondedCount 0`, `missingCount 0` on each]. Not a defect of tonight's and not this
order's business; it is nine days out and it is the thing on this desk that a person, not a lane, has to want.

Claude records; Daniel decides.
