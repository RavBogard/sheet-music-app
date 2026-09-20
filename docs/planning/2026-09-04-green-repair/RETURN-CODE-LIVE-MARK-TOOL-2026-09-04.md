# RETURN ← `live` (Code): **Daniel's decision is written. It survived the next sweep — measured, not believed.** And the fuzzy lane can no longer execute anything.

Lane: **live-cw (Opus Cowork)** · Executor: `live`, host-side in `~/CentralReform.live`
Order: `HANDOFF-CODE-LIVE-MARK-TOOL-AND-TENANT-WALL-2026-09-04.md` (amendment 1 read)
Status: **CLOSED. M0–M6 complete.** One deploy, three independently revertible commits, **one mark**.
Shipped: **`107b9618d9`**, promoted **2026-09-04T02:59Z**. Rollback target **`95cab8bbe0`**, read off `/api/version` before the push.

| commit | reverts | what |
|---|---|---|
| `caa221f10c` | M2b alone | `dedupe_library` refuses `forceScore` + `force` |
| `8310384ed2` | M1 alone | `mark_chart_status`, the single-row human mark |
| `107b9618d9` | M2 alone | the `get_chart_status` tenant wall |

---

## M0 · The manifest is off one disk

`c1a16b1adf` and `8133cd31f8` are on **`records/fixture-purge-2026-09-04`** at the remote — pushed as they
are, not squashed or rewritten. **Verified by reading the remote, not the local ref** (G8): `git ls-remote`
shows the branch at `8133cd31f8`, both blobs present in its tree, and **`master` still at `95cab8bbe0`** at that
moment. No build was promoted by it. The only reconstruction path for 257 permanently deleted rows is now
replicated.

## M4 · The mark, and the record it left

```
1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC   "Mizmor Shiru L'adonai .mp3"   active → duplicate
canonical: 1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_   "Mizmor Shiru Ladonai.mp3"
runId: human-mark-2026-09-04T03-00-29-972Z-1VuMq83_0W8y
```

The record as stored, in full:

```json
{ "runId": "human-mark-2026-09-04T03-00-29-972Z-1VuMq83_0W8y",
  "at": "2026-09-04T03:00:29.972Z",  "threshold": null,
  "decidedBy": "human",              "ruling": "R-0903-live-cw-8",
  "reason": "Daniel chose the clean-named recording: it matches the PDF chart of the same song, and a
             trailing space is the shape that forked rows here before.",
  "actorUid": "93Xn…", "orgId": "crc", "groupsFound": 0, "marked": 1,
  "rows": [{ "fileId": "1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC", "priorStatus": null,
             "canonicalFileId": "1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_", "groupedBy": "human-mark" }] }
```

**Two things in that record need saying out loud rather than being left for a reader to notice.**

**1 · The order's truncated canonical id does not expand the way it looks.** §2 names
`1d-aXA4WzVjKYv…`; I resolved that to a full id and **it 404'd in `library_index`**. The real row is
`1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_` — same prefix, different tail — found by enumerating the collection
rather than by guessing. Had I passed the guess as `canonicalFileId`, the mark would have recorded a
canonical that does not exist, and nothing in the tool would have caught it: `canonicalFileId` is context,
not a target. **A truncated id in an order is a prefix, not an address.**

**2 · `priorStatus` landed as `null`, and G3's letter asks for `"active"`.** The row **carries no `status`
field at all** — nor does the canonical, nor the PDF. `active` is what the system DERIVES from absence
(`R-0903-live-cw-7`), and the tool refuses to invent what it did not read, which is the whole of G4. So the
record says `null` and **means "this row had no status", not "this row's status was unknown to me"**.

**The purpose holds and I measured it rather than reasoning about it:** `undo_dedupe_group`'s dry plan for
this runId reads `{fromStatus: "duplicate", toStatus: "active", source: "run-record"}` — because undo maps a
recorded `null` to `active` by the same derivation. **Planned, not executed** (G3). This is the third time
this program has met a guard whose letter names a mechanism the deployed code implements differently; the
answer is the same as it was for G5 of `D7-FINISH` — **report both halves and let the desk mend the wording.**

## M5 · The stability, which was the actual requirement

`dedupe_library {forceScore: 0.85, dryRun: true}`, before and after the mark:

| | before M4 | after M4 |
|---|---|---|
| `groupsFound` | 14 | **13** |
| `wouldMark` | 17 | **16** |
| groups naming either Mizmor mp3 **or the PDF** | 1 | **0** |
| `formatClassRefusals` | 14 | 14 |

**Zero. The sweep no longer proposes to move either row**, so the wave does not stop and the mark does not
come off. **And the mechanism the order flagged as believed-not-measured is now measured:** the byte-identity
lane still reports the pair, and its `kept` is
`1d-aXA4WzVjKYvCxAaVyezGgzRKlXs9y_` — **the row Daniel chose**, held there by `active` outranking `duplicate`
in `canonicalStatusRank`, **by rule rather than by date**. The earliest-upload default that kept the wrong row
is now unreachable for this pair, because the pair is no longer a tie.

## M2b · The refusal, proven by calling it (G9)

```
dedupe_library {forceScore: 0.85, force: true, dryRun: false}
  → fuzzy_execution_refused
    "dedupe_library refuses `forceScore` together with `force`: the fuzzy lane may plan,
     never commit (R-0904-live-cw-7)."
  partition before {"active":789,"duplicate":101,"archived":2}
  partition after  {"active":789,"duplicate":101,"archived":2}   → NOTHING WRITTEN
```

And the diagnostic that found the problem is intact: `{forceScore: 0.85, dryRun: true}` still returns the
full plan — 13 groups, 16 marks, every group present.

**One cosmetic defect I am reporting rather than fixing, because this order permitted one deploy.**
`fuzzy_execution_refused` is not in `errors.ts`'s status map, so the envelope carries **`code: 500`**. A
deliberate refusal that presents as a server fault is a legibility defect in a wave whose entire subject is
legibility. It belongs in the next `src/` order, mapped to a 4xx. Nothing about the refusal's behaviour is
affected.

## M2 · The tenant wall — and the reason it is not a `chart_not_found`

Scoped as `delete_chart` scopes: another org's row is answered as an absence, decided before anything
downstream uses the row, with the enrichment projection suppressed so no cross-tenant catalog content comes
back.

**But it deliberately does NOT return `chart_not_found`, and that inversion is the finding.** This tool has
no `chart_not_found` path at all — an unknown fileId gets `{ok: true, health: {status: "missing"}}` or
`bytes_without_index_row`. Inventing an error class for the cross-tenant case would have **announced** that
case rather than hidden it: probe a random id, get `ok`; probe another org's id, get an error — a perfect
existence oracle, built in the name of closing one. **The indistinguishable answer is E4's own shape**: from
the caller's tenant there genuinely is no row it can use. Asserted in test as byte-identical to a row-less
fileId once the echoed id is masked, every occurrence and not just the first (G5).

**The residual, stated rather than implied:** a caller who already holds a fileId can still learn whether
some bytes are reachable for it. That oracle is keyed on a bare id and answers identically for ids in no
catalog at all, so **it is not a tenant leak** — and closing it would retire E4's `bytes_without_index_row`
report, which exists to find exactly that shape in our own catalog. **That is a separate question and it did
not ride this deploy** (§4).

## M6 · Guards

| guard | required | result |
|---|---|---|
| **G1** RH before M4 and after M5 | 184 / `feed` | **PASS both** |
| **G2** exactly one row changes, the named one | delta form | **PASS** — 1 row differs: `1VuMq83…` `active → duplicate`. **0 rows appeared** in the later read |
| **G3** reversible the moment it exists | record + clean restore plan | **PASS** — plan restores to `active` from `run-record`; **planned, not executed** |
| **G4** `priorStatus` read, not passed | no caller path at all | **PASS** — no parameter exists; a smuggled one is ignored, asserted in test |
| **G5** wall indistinguishable from absence | — | **PASS** — byte-identical, asserted |
| **G6** the PDF untouched | `active` before and after | **PASS** — `1czN_ywRWm2bnj…` unchanged (no `status` field, before and after) and **absent from every plan this wave produced** |
| **G7** the fixture purge not started here | — | **PASS** — that order was CLOSED before this one opened; no `songs`-only row touched |
| **G8** M0 done first, remote has the bytes | read the remote | **PASS** — branch at `8133cd31f8`, both blobs, `master` unmoved, no promotion |
| **G9** refusal proven by calling it | refuses, writes nothing | **PASS** — partition identical across the probe |

**Tests: 1,147 emulator tests pass across 83 files. `tsc --noEmit` clean. Build green before the push.**

**One test broke and it was mine to fix, not the code's.** `W2 — every group reports which pass grouped it`
ran a REAL `forceScore` run to read its per-row labels — exactly what M2b now forbids. Rewritten: the
per-group labelling is read off the **plan**, where a fuzzy group can still legitimately appear, and the
per-row record assertion now covers the exact lane only. **That is not a weakened test, it is the ruling:
no row is ever hidden by a similarity score again, so no fuzzy row can ever reach a run record.** My first
rewrite then failed on my own bad assertion — the fixture is seeded with no `status` field, so absent is not
`"active"` — and the fix was to assert what I actually cared about: the fuzzy pair is **not marked**.

## What is now outstanding

1. **`fuzzy_execution_refused` → a 4xx in `errors.ts`.** Cosmetic, real, next order.
2. **G3's wording** — `priorStatus: "active"` versus the `null` a status-less row truthfully yields.
3. **The byte-reachability oracle** in `get_chart_status`, unchanged and unwidened.
4. **The 38 unreachable-byte rows** — untouched, no order.

`R-0903-live-cw-8` has been carried out. It waited from 21:4xZ on 09-03 to 03:00:29.972Z on 09-04, and what
finally wrote it says, in its own record, that a person decided it.

Claude records; Daniel decides.
