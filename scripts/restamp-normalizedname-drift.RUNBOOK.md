# `scripts/restamp-normalizedname-drift.mjs` — RUNBOOK

**Lane:** `recompute-helper-normalizedname-pin` (coder-5, 2026-05-25).
**Pairs with α code change in:**
  - `src/lib/library/recompute-index-name-fields.ts` (canonical helper)
  - `scripts/lib/index-name-fields-compute.mjs` (.mjs mirror)
  - `src/lib/library-upload.ts` (PCU inline compute)
  - `src/lib/mcp/title-specificity.ts` (`STRIPPABLE_EXTENSION_RE` export)
**Single-owner discipline binding** per
[`[[feedback_single_owner_destructive_runs]]`](MEMORY).

## What this script does

Re-stamps `library_index` rows whose stored `normalizedName` field
disagrees with the post-α algorithm output. Pre-α the helper computed:
```js
const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
```
Post-α it computes:
```js
const normalizedName = nameLower
    .replace(STRIPPABLE_EXTENSION_RE, "")
    .replace(/[^a-z0-9]/g, "")
```
where `STRIPPABLE_EXTENSION_RE = /\.(pdf|musicxml|xml|mxl|jpg|png|webp|mp3|m4a|wav)$/i`.

Net effect for an ext-bearing title like `"Hodu (Silver).pdf"`:
  - Pre-α: stored `"hodusilverpdf"` (algorithmic-wrong shape, written
    by PCU/scrape paths after the historical-good shape was lost).
  - Post-α: helper computes `"hodusilver"` → script restamps this row
    so stored matches the canonical algorithm.

The 271 rows whose stored `normalizedName` is ALREADY ext-stripped
(`"hodusilver"`, the historical-good shape Path A preserved during
pdf-stem-drift) are now `alreadyStamped` post-α. They do NOT need
restamping; α aligned the algorithm with the historical-correct shape.

## Lane phase ordering

| Phase | Step | Gate |
|-------|------|------|
| DRY-RUN-001 | first dry run; capture honest count + sample diffs | HEADS-UP supervisor with `summary` → auditor re-VERIFY ACCEPT |
| APPLY-001 | single-owner `--apply` invocation (supervisor-GO after auditor ACCEPT) | `writeErrors === 0` |
| REDRY-001 | dry run on post-APPLY state | `toRestamp === 0` (idempotency) |
| SPOTCHECK-001 | spot-check 5 random restamped rows in Firestore for shape consistency | each row's stored `normalizedName === bareStem-style ext-stripped algorithmic form` |
| PHASE-3-REDRY | re-run pdf-stem-drift's `scripts/restamp-pdf-stem-drift.mjs` (DRY-RUN) | confirm 0 cross-lane re-drift introduced |
| COMMIT | single audit-trail commit (α code + γ ops + this RUNBOOK + run summaries) | tsc 0 + next build 0 + full vitest unregressed |

## Usage

```bash
# DRY-RUN (default — no writes)
node scripts/restamp-normalizedname-drift.mjs \
  > .paul/ops/normalizedname-drift-backfill/DRY-RUN-001.json \
  2> .paul/ops/normalizedname-drift-backfill/DRY-RUN-001.log

# APPLY (real writes — ONLY after auditor ACCEPT + supervisor GO)
node scripts/restamp-normalizedname-drift.mjs --apply \
  > .paul/ops/normalizedname-drift-backfill/APPLY-001.json \
  2> .paul/ops/normalizedname-drift-backfill/APPLY-001.log

# RE-DRY (idempotency check after APPLY)
node scripts/restamp-normalizedname-drift.mjs \
  > .paul/ops/normalizedname-drift-backfill/REDRY-001.json \
  2> .paul/ops/normalizedname-drift-backfill/REDRY-001.log
```

## Output schema

JSON to stdout:
```ts
{
  summary: {
    mode: "dry-run" | "apply",
    startedAt: string,        // ISO
    projectId: string,        // "crcmusiccharts"
    scanned: number,          // total library_index rows
    candidates: number,       // active + named rows
    alreadyStamped: number,   // normalizedName already matches post-α
    toRestamp: number,        // dry-run only — how many would write
    restamped: number,        // apply only — how many wrote successfully
    skippedIncomplete: number,// normalizedName absent (out-of-scope)
    skippedOrphaned: number,  // status: "orphaned"
    skippedNoName: number,    // missing/empty `name` field
    writeErrors: number,      // apply only — non-zero exits with code 1
    driftFraction: number,    // candidates → toRestamp ratio (0..1, .0001 precision)
    extensionHisto: {[ext: string]: number},  // ".pdf": N — audit-only
    mismatchedFieldHisto: { normalizedName: number }
  },
  records: Array<{
    docId: string,
    name?: string,
    action: "already-stamped" | "would-restamp" | "restamped" | "restamp-failed" | "skipped-incomplete",
    extension?: string,
    siblingsInCatalog?: number,
    diff?: Array<{field: "normalizedName", was: string, now: string}>,
    patch?: {normalizedName: string},
    error?: string,
    missing?: string[],
  }>
}
```

## Acceptance criteria

- **DRY-RUN-001:** `writeErrors === 0` (none possible — read-only).
  Sample records should ALL show `field: "normalizedName"` only — no
  other field should appear in any `diff[]` entry.
- **APPLY-001:** `restamped === toRestamp(DRY-RUN-001)` AND
  `writeErrors === 0`. Any mismatch is a HEADS-UP-worthy anomaly.
- **REDRY-001:** `toRestamp === 0` AND `alreadyStamped === candidates`
  AND `driftFraction === 0`. Confirms idempotency.
- **SPOTCHECK-001:** for 5 random `docId`s from the APPLY-001 patch
  set, fetch the row in Firestore and confirm:
    - `data.normalizedName` matches `bareStem-equivalent` ext-stripped
      shape (i.e., `name.toLowerCase().replace(STRIPPABLE_EXTENSION_RE, "").replace(/[^a-z0-9]/g, "")`).
    - `data.stem` is UNCHANGED from the pdf-stem-drift APPLY at
      `e01dc2b1a` (this script does NOT touch `stem`).
    - `data.nameLower` is UNCHANGED.
    - `data.titleSpecificity` is UNCHANGED.

## Failure modes + recovery

- **`!! Cannot read .env.local`:** script needs `.env.local` w/ Firebase
  admin creds. Copy from `sheet-music-app-mcp/.env.local` (it carries
  the working `firebase-adminsdk-fbsvc@crcmusiccharts` SA).
- **`FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY required`:** same as
  above — env vars missing.
- **Per-row UPDATE failure** (during APPLY): logged to stderr +
  recorded in `records[]` as `restamp-failed`; script continues.
  Exit code 1 if `writeErrors > 0`. Re-run after diagnosing — script
  is idempotent so already-restamped rows are no-ops on retry.

## Cross-lane invariants (Phase 3)

After APPLY-001, run pdf-stem-drift's REDRY:
```bash
node scripts/restamp-pdf-stem-drift.mjs \
  > .paul/ops/normalizedname-drift-backfill/PHASE-3-pdf-stem-drift-REDRY.json \
  2> .paul/ops/normalizedname-drift-backfill/PHASE-3-pdf-stem-drift-REDRY.log
```
Acceptance: `toRestamp === 0` (pdf-stem-drift's surface stays stable
post our normalizedName-axis restamp). If non-zero, HEADS-UP — we
introduced cross-lane drift somehow.

## Why this is a separate lane (not bundled into pdf-stem-drift)

Daniel ruling `msg-pdf-stem-drift-path-ruling` 2026-05-25T21:00Z (Path
A): the pdf-stem-drift dispatch hard-bounded
`src/lib/library/recompute-index-name-fields.ts`. Keeping that
algorithm change in its own audit-trail lane separates the
"test/algorithm change" risk from the "ops backfill" risk. Two clean
stories beats one big mixed-concern lane. The follow-up lane
(this one) was QUEUED at ship time and dispatched 23:30Z.
