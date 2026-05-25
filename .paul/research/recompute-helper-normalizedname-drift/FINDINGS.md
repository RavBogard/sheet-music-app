# `recomputeIndexNameFields` — `normalizedName` historical drift

**Author:** coder-5 (surfaced during pdf-stem-drift lane DRY-RUN-001 +
DRY-RUN-002 forensic decomposition; ratified by supervisor `msg-pdf-stem-
drift-path-ruling` 2026-05-25T21:00Z).

**Status:** OPEN — handoff to follow-up lane
`recomputeIndexNameFields-normalizedName-pin` (Tier-1; queued in
`.coord/QUEUE.md` post pdf-stem-drift ship per supervisor commitment in
the path-ruling msg).

## TL;DR

`recomputeIndexNameFields` (`src/lib/library/recompute-index-name-fields.ts`)
computes `normalizedName = nameLower.replace(/[^a-z0-9]/g, "")`. Historical
write paths stripped the trailing file extension BEFORE that computation —
so a row for `"Hodu (Silver).pdf"` ended up stored with
`normalizedName: "hodusilver"`. The current canonical helper would compute
`"hodusilverpdf"` for the same input. **The helper has drifted away from
the historical-correct behavior** on the `normalizedName` axis (parallel
to how `bareStem` drifted on the `stem` axis — which the pdf-stem-drift
lane closed via β).

DRY-RUN-001 against prod (`crcmusiccharts`, 625 active `library_index`
rows) found 233 rows where this drift is the SOLE divergence, plus
38 more where it co-occurs with `titleSpecificity` drift. Total observed
population with `normalizedName` divergence: **271 rows**, almost all
ending in `.pdf` (the historical-good extension-stripped normalizedName).

## Why it matters

`normalizedName` is the **substring-search key** for L-003 library search
(`src/lib/mcp/tools/library.ts`'s search-side normalizer folds queries
through the same character set). Restoring extension parity on it would:

1. Keep `library_index.normalizedName` aligned with how users actually
   query (`"hodu"` not `"hodupdf"`).
2. Close the duplicate-minting risk on the substring-search axis (mirror
   of what β closed on the equality-lookup axis via `stem`).
3. Stop ongoing drift: today every fresh write through
   `recomputeIndexNameFields` (PCU, scrape, drive-sync rename/replace,
   etc.) stamps the extension-included form, slowly widening the
   misalignment as new rows land.

## Population evidence (from pdf-stem-drift DRY-RUN-001/002)

DRY-RUN-001 (with `normalizedName` IN the comparison set):
- 271 rows flagged for normalizedName drift (`mismatchedFieldHisto`).
- 233 rows with `normalizedName`-only drift (no `stem`/`titleSpecificity`
  divergence) — exactly the rows that would REGRESS if naïvely restamped.
- 38 rows with `normalizedName` + `titleSpecificity` (no `stem`)
  divergence — would also REGRESS normalizedName if naïvely restamped.

DRY-RUN-002 (with Path A `normalizedName` EXCLUDED): the 233 rows shift
from `would-restamp` to `already-stamped`; the 38 combo rows shift to
restamp-on-`titleSpecificity` only, leaving their historical-good
`normalizedName` intact.

Sample mismatches (DRY-RUN-001 records):

```
"Hodu (Silver).pdf"                              stored: hodusilver                            computed: hodusilverpdf
"T'Filat Haderech (Friedman).pdf"                stored: tfilathaderechfriedman                computed: tfilathaderechfriedmanpdf
"V'Nomar L'Fanav (Chassidic Folk).pdf"           stored: vnomarlfanavchassidicfolk             computed: vnomarlfanavchassidicfolkpdf
"David Melech Yisraeil (Frankel) - Dodi Li (Sher).pdf"
                                                 stored: davidmelechyisraeilfrankeldodilisher  computed: davidmelechyisraeilfrankeldodilisherpdf
"Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf"
                                                 stored: yihyehshalomrechtyihyehtovbroza       computed: yihyehshalomrechtyihyehtovbrozapdf
```

In every case the stored value is the extension-stripped form — what
users would type — and the computed value is the extension-included
form.

## Suggested fix (for the follow-up lane PROMPT)

**α — minimal change inside the canonical helper:**

```ts
// src/lib/library/recompute-index-name-fields.ts
import { STRIPPABLE_EXTENSION_RE, bareStem } from "@/lib/mcp/title-specificity"
//                       ↑ would need to be exported (currently file-private to
//                       title-specificity.ts after pdf-stem-drift β).

export function recomputeIndexNameFields(title, siblingsInCatalog) {
    const nameLower = title.toLowerCase()
    const normalizedName = nameLower
        .replace(STRIPPABLE_EXTENSION_RE, "")        // ← new line
        .replace(/[^a-z0-9]/g, "")
    const stem = bareStem(title)
    return { nameLower, normalizedName, stem, titleSpecificity: ... }
}
```

Plus mirror in `scripts/lib/index-name-fields-compute.mjs`. Plus extend the
existing parity test (`index-name-fields-compute-parity.test.ts`) with
extension-bearing fixtures (already present from pdf-stem-drift β — those
fixtures will now exercise the normalizedName axis too).

Then a `restamp-normalizedName-historical-drift.mjs` (mirror of
pdf-stem-drift's restamp script; restricted to `normalizedName` axis):

- Scan `library_index`, compute fresh `normalizedName` via the post-α
  helper.
- Per-row: if stored differs from computed → restamp ONLY that field.
- Expected population: ~271 rows (the union of the 233 + 38 + the few
  surfaced by combo-rows post-restamp).
- DRY-RUN → APPLY (single-owner) → RE-DRY.

**β — exporting `STRIPPABLE_EXTENSION_RE`:**

The pdf-stem-drift lane currently keeps `STRIPPABLE_EXTENSION_RE` file-
private to `title-specificity.ts`. The follow-up lane should either
export it (cleanest) or duplicate the regex with a parity comment + test
(weaker). Exporting is the recommended path.

**γ — don't forget the .mjs mirror:**

`scripts/lib/index-name-fields-compute.mjs` carries its own
`STRIPPABLE_EXTENSION_RE` (mirrored from title-specificity.ts). The
follow-up lane's helper change must update both the TS canonical AND the
JS mirror in the same commit, with the parity test as the safety net.

## Out of scope for the FOLLOW-UP lane

- The pdf-stem-drift lane's β + γ — those land first; this follow-up
  rebases on top of that ship.
- Any other field on `library_index` — `stem`, `titleSpecificity`,
  `nameLower`, `bondCorrectionHistory`, etc. all stay untouched.
- Drive-sync / library-upload / scrape write-path call sites — they all
  go through `recomputeIndexNameFields` so they get the α fix for free.
- Search-side normalizer in `src/lib/mcp/tools/library.ts` — currently
  matches the SAME shape as `recomputeIndexNameFields`'s normalizedName
  (`.toLowerCase().replace(/[^a-z0-9]/g, "")`); α would shift the
  storage shape but search would still match historical-stripped values
  for both new writes and re-stamped historical rows. Double-check this
  at scoping time — if search-side needs the same extension-strip, that's
  a tiny additional 1-line.

## Why not bundle into pdf-stem-drift

Supervisor msg-pdf-stem-drift-path-ruling §"Why A over C":
> C is cleaner end-state but the dispatch hard-bounded
> `recompute-index-name-fields.ts` for a reason — keeping the canonical
> helper change in its own audit-trail lane separates the
> "test/algorithm change" risk from the "ops backfill" risk. Two clean
> stories beats one big mixed-concern lane.

Plus the test surface is non-trivial: every test that imports
`bareStem`/`recomputeIndexNameFields` and asserts byte-for-byte
normalizedName values needs to be inspected for extension-strip
expectations. The pdf-stem-drift lane's test set didn't hit this; a
dedicated lane keeps that audit clean.

## References

- `.paul/research/pdf-stem-drift-backfill/FINDINGS.md` — own authoring,
  α/β/γ analysis Daniel ratified.
- `scripts/restamp-pdf-stem-drift.mjs` + `RUNBOOK.md` — sibling-of-shape
  for the follow-up lane's ops script.
- `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts` —
  the parity test the follow-up lane extends.
- `msg-pdf-stem-drift-path-ruling` 2026-05-25T21:00Z — supervisor ruling
  that produced this FINDINGS doc.
