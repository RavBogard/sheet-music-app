# RUNBOOK — `restamp-pdf-stem-drift.mjs`

Tier-0 ops re-stamp for the `pdf-stem-drift-bareStem-fix-and-backfill`
lane. γ-half of Daniel's β+γ ratification on
`.paul/research/pdf-stem-drift-backfill/FINDINGS.md` (own authoring).
Supervisor dispatch `msg-pdf-stem-drift-bareStem-fix-and-backfill-001`
2026-05-25T19:30Z.

The β-half (algorithm change) lands in the SAME commit / lane:

- `src/lib/mcp/title-specificity.ts` — adds `STRIPPABLE_EXTENSION_RE`
  + leading extension-strip step in `bareStem`.
- `scripts/lib/index-name-fields-compute.mjs` — mirror of the algorithm
  change (parity-test enforced).

After β lands, the algorithm output diverges from historical stamps for
any row whose `name` ends in a covered extension
(`pdf|musicxml|xml|mxl|jpg|png|webp|mp3|m4a|wav`, case-insensitive).
This script re-stamps the affected rows so storage matches the new
output, closing the duplicate-minting risk that was the original
motivation in `.paul/research/pdf-stem-drift-backfill/FINDINGS.md` §Risk.

## Path A scope-restriction (Daniel ruling 2026-05-25T21:00Z)

DRY-RUN-001 surfaced that 233 of the projected 484 restamp candidates were
`normalizedName`-only drift NOT caused by β: historical write paths stripped
the extension before computing `normalizedName`, but the canonical
`recomputeIndexNameFields` preserves it. Restamping those rows would
REGRESS the dedup-blindness substrate this lane was meant to harden.

Per `msg-pdf-stem-drift-path-ruling` 2026-05-25T21:00Z, this lane is
restricted to: **`nameLower` + `stem` + `titleSpecificity`** comparison /
restamp. `normalizedName` is excluded — left at its (historically-good)
stored value, untouched. The helper-side fix is queued as
`recomputeIndexNameFields-normalizedName-pin` (separate Tier-1 lane).

Implementation: `W02_FIELDS = ["nameLower", "stem", "titleSpecificity"]`
(`scripts/restamp-pdf-stem-drift.mjs` ~L131).

## Scope

For each `library_index/{docId}` row:

1. Filter: `status !== "orphaned"` AND `name` is a non-empty string.
2. Compute siblings: `siblingsInCatalog = count of active rows sharing
   the NEW (β) `bareStem(name)`. The row itself IS in that count
   (matches PCU at `library-upload.ts:472-487`).
3. Compute fresh `{nameLower, normalizedName, stem, titleSpecificity}`
   via the same mirror module the normalizedname-backfill used.
4. Per-field, classify against current:
   - **absent** → SKIP (`skipped-incomplete`; normalizedname-backfill's
     territory — out-of-scope for restamp).
   - **all-present + all-equal** → `already-stamped` (no-op).
   - **all-present + any differs** → `to-restamp` (DRY-RUN) /
     `restamped` (APPLY); overwrites ONLY the differing fields.
5. Records each restamp with its extension classification + per-field
   diff (was→now) for audit trail.

## What this script does NOT do

- Touch `recompute-index-name-fields.ts` (canonical helper; only the
  `bareStem` it calls changes — that's the β half).
- Touch rows missing W-02 fields entirely (out-of-scope; if any
  surface, that's a new normalizedname-backfill follow-up signal —
  `10f7f8183` swept the historical population to 0 missing-field rows;
  re-surfacing means a new ingest channel slipped through, surface to
  supervisor).
- Touch `bondCorrectionHistory`, `enrichmentStatus`, `collection`, or
  any field outside the four W-02 derivatives. Same out-of-scope wall
  as normalizedname-backfill.
- Touch the chart-heal `cleanTitle` pre-strip at
  `src/lib/chart-heal.ts:287` — its extension list is broader
  (`.mscz|.mscx|.gif|.txt` extras) and runs as belt-and-suspenders;
  redundancy with β is acceptable, deletion is out-of-scope.

## Auth + env

Same as `backfill-library-normalizedname.mjs`. `.env.local` provides:

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=crcmusiccharts`
- `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@crcmusiccharts.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY=<the SA private key>`

SA needs `datastore.user` (`library_index` read + update).

## Single-owner rule

Per `[[feedback_single_owner_destructive_runs]]` — HEADS-UP supervisor
before `--apply`. Single named executor (coder-5 for this lane). DO NOT
run `--apply` autonomously.

## Cold-read invocation (3 phases)

```bash
# Phase 1: DRY-RUN — produces the population estimate + extension histo
node scripts/restamp-pdf-stem-drift.mjs > .paul/ops/pdf-stem-drift-restamp/DRY-RUN-001.log 2>&1

# HEADS-UP to supervisor with summary block. Supervisor relays GO.

# Phase 2: APPLY (single-owner; GO-gated)
node scripts/restamp-pdf-stem-drift.mjs --apply > .paul/ops/pdf-stem-drift-restamp/APPLY-001.log 2>&1

# Phase 3: RE-DRY for idempotency
node scripts/restamp-pdf-stem-drift.mjs > .paul/ops/pdf-stem-drift-restamp/REDRY-001.log 2>&1
```

## Expected output shape

```jsonc
// stdout (JSON; useful for spot-check)
{
  "summary": {
    "mode": "dry-run",
    "scanned": 568,
    "candidates": 354,
    "alreadyStamped": ??,
    "toRestamp": ??,   // expected: ≥272 (the original mismatched set
                       // from 10f7f8183's DRY-RUN) + a chunk of the
                       // 350 newly-stamped rows whose names carry an
                       // extension. Real count surfaces here.
    "skippedIncomplete": 0,  // expected 0 post-10f7f8183 sweep
    "extensionHisto": { ".pdf": ??, ".musicxml": ??, ".mp3": ??, ... },
    "mismatchedFieldHisto": { "stem": ??, "normalizedName": ??, ... },
    "driftFraction": 0.??
  },
  "records": [ ... ]
}
```

```text
# stderr (human trace)
# restamp-pdf-stem-drift.mjs — mode=DRY-RUN
# project=crcmusiccharts
# started=2026-05-25T??:??Z

Phase 1: enumerated ??? library_index rows
Phase 1: built β-stem index — ??? unique stems, ?? orphaned excluded, ?? nameless excluded

RESTAMP   upload-... name="Hodu (Silver).pdf" ext=.pdf siblings=2 diff=[{"field":"stem","was":"hodu pdf","now":"hodu"},...]
...

=== Summary ===
  mode: dry-run
  scanned: ???
  ...
  toRestamp: ???
  ...
```

## Stop conditions (refuse to proceed)

- `writeErrors > 0` post-APPLY → re-run DRY to triangulate; do NOT
  retry blindly (single-owner rule).
- `toRestamp` ratio drastically larger than projected (>50% of
  candidates) → HEADS-UP supervisor before APPLY; β regex may have
  unintended overreach.
- REDRY shows `toRestamp > 0` on the β axis (after a clean APPLY) →
  signals a write race or partial-failure; pause + diagnose.

## Sibling-of artifacts

- `scripts/backfill-library-normalizedname.mjs` — same shape, opposite
  semantics (stamps absent fields; SKIPS mismatched). Read in parallel
  for context.
- `.paul/ops/backfill-normalizedname/RUN-SUMMARY.md` — `10f7f8183`
  precedent for the per-phase log layout this lane mirrors.
- `.paul/research/pdf-stem-drift-backfill/FINDINGS.md` — own authoring,
  carries the α/β/γ analysis Daniel ratified.

## Idempotency contract

After APPLY, REDRY must show:

- `toRestamp = 0` (no rows still drift on the β axis).
- `alreadyStamped` ≈ `candidates - skippedIncomplete` (all live rows
  agree with β output).
- `skippedIncomplete` = 0 in the normal case (`10f7f8183` left no
  missing-field rows; non-zero here is a real signal).

The script does not delete records, does not write outside the four
W-02 fields, and does not clobber fields that already match. Re-running
APPLY a second time is safe (degenerate-update on the same set; idempotent
on the Firestore side).
