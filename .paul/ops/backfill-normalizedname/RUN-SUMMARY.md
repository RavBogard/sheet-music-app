# RUN-SUMMARY — `normalizedname-backfill-apply` lane (FINDING-4 backfill)

- **Executor:** coder-5 (single-owner per `[[feedback_single_owner_destructive_runs]]`; Daniel-named at dispatch 2026-05-24T22:50Z; Daniel "GO!" on apply 2026-05-25T16:37Z).
- **Branch:** `feat/backfill-library-normalizedname` (cut from `d65dd7d47`).
- **Project:** `crcmusiccharts` (prod Firestore).
- **Script:** `scripts/backfill-library-normalizedname.mjs` (parity-tested mirror at `scripts/lib/index-name-fields-compute.mjs`).

## Three-run timeline

| run | wall time | mode | scanned | alreadyStamped | wouldUpdate | updated | mismatched | writeErrors | log |
|---|---|---|---|---|---|---|---|---|---|
| DRY-RUN-001 | 2026-05-25T16:25:09Z | dry-run | 625 | 3 | **350** | 0 | 272 | 0 | `DRY-RUN-001.log` |
| APPLY-001   | 2026-05-25T16:39:12Z | apply   | 625 | 3 | n/a | **350** | 272 | **0** | `APPLY-001.log` |
| REDRY-001   | 2026-05-25T16:39:19Z | dry-run | 625 | **353** | **0** | 0 | 272 | 0 | `REDRY-001.log` |

**Idempotency confirmed:** REDRY's `wouldUpdate=0`. The 350 newly-stamped
rows merged into `alreadyStamped` (3 → 353). The 272 `mismatched` rows
stayed `mismatched` (script correctly leaves disagreeing-but-present
fields untouched).

## What landed

For each of the 350 in-scope rows: `library_index/{docId}.update({…missing
W-02 fields})`. The update writes ONLY the absent keys per the
classify→patch logic in `backfill-library-normalizedname.mjs`:

- 1 row had `nameLower` stamped (IMP population — essentially nil)
- 284 rows had `normalizedName` stamped
- 350 rows had `stem` + `titleSpecificity` stamped

No row had any pre-existing W-02 field overwritten — the classifier
routes "present-but-different" rows to the `mismatched` bucket (skip,
no write).

## What did NOT land (D2 follow-up)

272 rows surface a separate, narrower bug class (`.pdf`-extension stem
drift) that requires a policy decision before the backfill knows what
to write. Full handoff to the future `pdf-stem-drift-backfill` lane at
`.paul/research/pdf-stem-drift-backfill/FINDINGS.md`. Daniel ratified
2026-05-25 that this is a separate lane (not in-scope here).

## Gates met

- ✅ DRY-RUN log captures honest staleFraction (0.56) + sample rows.
- ✅ APPLY log shows N=350 updated / 0 write errors (matches DRY-RUN's
  projected count exactly — no concurrent live-writer drift).
- ✅ RE-DRY log shows 0 stale (idempotency verified).
- ✅ Sample of 5 backfilled rows shows consistent `nameLower →
  normalizedName → stem → titleSpecificity` derivations:
  - `B'sefer chayim & Hashiveinu.pdf` siblings=1 →
    `{normalizedName:"bseferchayimhashiveinupdf", stem:"b'sefer chayim
    hashiveinupdf", titleSpecificity:0.8}`
  - `Adon Olam.mp3` siblings=1 →
    `{normalizedName:"adonolammp3", stem:"adon olammp3",
    titleSpecificity:0.7}`
  - `Avinu Shebashamayim` siblings=1 →
    `{normalizedName:"avinushebashamayim", stem:"avinu shebashamayim",
    titleSpecificity:0.7}`
  - `Mi chamocha shur` siblings=1 →
    `{normalizedName:"michamochashur", stem:"mi chamocha shur",
    titleSpecificity:0.8}`
  - `Veshameru - Full Score` siblings=2 →
    `{normalizedName:"veshamerufullscore", stem:"veshameru",
    titleSpecificity:0.6}` (-0.3 generic-stem penalty visible)
- ✅ Audit-trail commit + RUN-SUMMARY pushed to master.

## Posture notes

- **Parity test green** (27 fixtures × byte-for-byte = canonical TS
  helper) prior to apply; ensures script's mirror compute matches PCU's.
- **No orphaned rows** in the live catalog (0/625) at apply time — the
  297-orphan baseline `[[project_orphan_baseline]]` is stale; D3
  delegated to supervisor for a 1-min Firestore probe + memory update.
- **No `mismatched` row was modified** by this lane. Future
  `pdf-stem-drift-backfill` handles those.
