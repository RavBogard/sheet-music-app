> **Where the evidence lives now (added 2026-09-19).** The two files this
> return cites — `FIXTURE-PURGE-MANIFEST-2026-09-04.json` and
> `FIXTURE-PURGE-EVIDENCE-2026-09-04.json` — sat at the repo root until the
> 2026-09-19 audit's docs consolidation. They were moved, not deleted, and are
> now at `docs/planning/archive/`. The paths quoted below are the paths as of
> the commit named; they are left as written because this is a record of what
> happened.

# RETURN ← `live` (Code): **all 257 deleted, both halves, one at a time. `songs` and `library_index` are now the same collection size — 944 and 944, divergence zero in both directions.**

Lane: **live-cw (Opus Cowork)** · Executor: `live`, host-side in `~/CentralReform.live`
Order: `HANDOFF-CODE-LIVE-FIXTURE-PURGE-2026-09-04.md` · Authority **R-0904-live-cw-5** (Daniel: delete)
Status: **CLOSED. X1–X5 complete. 257 attempted, 257 confirmed with both halves. Nothing resisted.**
Manifest commit: **`c1a16b1adf`** — `sheet-music-app/FIXTURE-PURGE-MANIFEST-2026-09-04.json`, committed BEFORE the first delete.
Verified-against: production serving `95cab8bbe0`. **No `src/` change, no deploy, no `dedupe_library` call of any kind.**

---

## X0 · The closing arithmetic first, because it is the proof

```
                     at X1 (open)        at X4 (close)
songs                    1201                 944
library_index             944                 944
crc songs-only            257                   0
library_index-only          0                   0
same size?                 no                 YES
```

**`songs` reads `944`. `library_index` reads `944`. The divergence this desk has been chasing since the
`ZZTEST` sweep is `0` in both directions.** The four numbers X4 asks for are above, all re-derived from
production after the last delete, none inherited.

## X1 · The enumeration, frozen before anything was touched

**257 rows, written whole to the manifest** — per row: `id`, `title`, `fileName`, `status`, `orgId`, `mimeType`,
every timestamp the document carried (including Firestore's own `createTime`/`updateTime`), the Storage object
path/size/contentType, the field-name list, and the signature class. **Committed at `c1a16b1adf` before X3 ran**
(G2), and from that commit onward **the manifest was the set**: X3 read ids out of the file and never re-ran the
query, so nothing that arrived in `songs` after 20:5xZ could be swept in by a predicate.

The partition at open read **`892 == 790 + 100 + 2 + 0`**, identical to the inherited line — re-read, not trusted.

## X2 · Both emptiness properties, re-proved against the frozen list

**(a) ZERO BONDS — re-run, not inherited.** One collection-group sweep over every `tracks` subcollection in
production: **1,313 tracks**, intersecting `chartId` / `fileId` / `driveFileId` / `songId` / `chartFileId`
against the manifest's 257 ids. **0 hits.** Nothing on any iPad, in any setlist, pointed at any row deleted here.

**(b) ZERO UNSIGNATURED — and this is a LISTING, not a tally.**

| class | n |
|---|---|
| `iPad-probe` | 104 |
| `b6-fixture` | 100 |
| `ZZ`-prefixed | 34 |
| other probe/stress/harness | 17 |
| `[role-…]`-prefixed | 2 |
| **UNSIGNATURED** | **0 — the listing is empty** |

**0 rows matched nothing. 0 rows had an empty or absent title. 257 distinct ids for 257 rows.** The
classification was re-derived a second time *from the committed file* rather than reused from the enumeration
pass, so the check and the freeze are independent.

**Where these counts differ from the census's, and why it strengthens the argument.** The census reported
`b6-fixture 117 / ZZ 17`; this reads `b6-fixture 100 / ZZ 34`. Same 257, different precedence: **17 rows carry
BOTH signatures at once** — e.g. `ZZ iPad Text Row 1779283781482 (b6-fixture 1779283781882)`, which is
`ZZ`-prefixed *and* an iPad probe *and* b6-stamped. Every one of the 257 is multiply-signatured or
epoch-stamped; the disagreement is about which label a triply-marked fixture gets, not about whether it is one.

## X3 · The deletion

**257 of 257, both halves, verified per id before the next id was touched.** Per id: assert `songs` is 200 and
`library_index` is **404** (the defining property — a row with an index entry is not in this population and would
have stopped the wave), delete the Storage object(s), delete `songs/{id}`, then **re-read both** and require
`songs` 404 with 0 objects.

- **Storage objects deleted: 257.** The order's allowance for a row that never had bytes was never used —
  **every one of the 257 had exactly one object**, so this cleared bytes as well as documents.
- **Half-deletes: 0. Deletes that reported success and left the document readable: 0. Ids that resisted: 0.**
- **`library_index` was re-counted at every bite boundary, not only at the close** — `944` at all six reads. The
  mid-wave stop condition never came close to firing.
- Taken in bites of 10 / 60 / 60 / 60 / 70 against manifest position, resumable from `x3_progress.json`; the
  first bite was deliberately small so an unknown failure mode would cost ten rows, not 257.

## X4 · Guards

| guard | required | result |
|---|---|---|
| **G1** RH before X3 and after X4 | `shirei-tshuvah` 184 / `feed` | **PASS both** — read at 20:5xZ and again after the last delete |
| **G2** manifest committed before the first delete | — | **PASS** — `c1a16b1adf`, and X3 refuses to run without the file |
| **G3** other tenant untouched and unnamed | 52 / 52 | **PASS** — 52 songs / 52 index at open and close; **no id, title or filename of theirs appears in the manifest, this return, or any artifact** |
| **G4** every deleted id came out of the manifest | — | **PASS** — X3's only source of ids is the committed file; 0 manifest ids remain in `songs` |
| **G5** `library_index` did not move | identical partition | **PASS** — `892 == 790 + 100 + 2 + 0` at open and close, **IDENTICAL**, and 944 total at every mid-wave read |
| **G6** the five `D7-FINISH` rows untouched | all `active` | **PASS** — all five present in both collections, all five `active` |
| **G7** no `src/` change, no deploy | — | **PASS** — the only commit is the manifest; production still serves `95cab8bbe0` |
| **G8** no `dedupe_library` with `forceScore` outside `dryRun` | — | **PASS** — no `dedupe_library` call at all in this wave |

**G5 is the guard that mattered and it is the one that makes this checkable by arithmetic.** A wave that reached
a real chart would have moved that partition. It did not move by one document.

## X5 · What Daniel will actually see

The picker he authors from opened on `[role-band_leader] tiny` and `[role-musician] tiny` — two fixtures sorting
ahead of the alphabet. **It now opens on `13 Attributes of Mercy (Sykes)`, `Abanibi`, `Achot ketana`, `Adio
kerida`, `Adon Olam`** [measured, `search_library {query: "", limit: 20}`, after X4]. Zero `[role-…]` rows remain.

## X6 · Standing, unchanged by this wave

1. **`R-0904-live-cw-2`'s single-row marking tool** — still the only instrument that can write Daniel's
   `R-0903-live-cw-8` Mizmor decision. Untouched here.
2. **`get_chart_status` is not tenant-scoped** — reported 01:1xZ, still a finding for a ruling.
3. **The 38 unreachable-byte rows** — untouched, no order. **They are `library_index` rows, so nothing in this
   wave could have reached them**, and G5 proves it did not.

**These 257 deletions have no undo.** The manifest is the only artifact from which a wrongly-deleted row could be
identified, and it holds every field each document carried. Nothing in the wave suggested a wrong one: zero
bonds, zero unsignatured, zero index rows, and a partition that did not move.

Claude records; Daniel decides.
