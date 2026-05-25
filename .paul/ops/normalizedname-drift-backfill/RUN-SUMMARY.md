# `recompute-helper-normalizedname-pin` — γ ops RUN-SUMMARY

**Lane:** `recompute-helper-normalizedname-pin` (coder-5).
**Sister lane (predecessor):** `pdf-stem-drift-bareStem-fix-and-backfill` @ `e01dc2b1a`.
**Lane base SHA:** `4cc575444` (coder-2 bundle-diet Tier-0 docs close-out).
**Worktree:** `sheet-music-app-recompute-normalizedname-pin/`.
**Dispatch:** `inbox/coder-5.md` `msg-recompute-helper-normalizedname-pin-001` 2026-05-25T23:30Z.
**Auditor ACCEPT:** `inbox/coder-5.md` `msg-from-auditor-reverify-normalizedname-pin-dryrun-001` 2026-05-26T01:30Z.
**Single-owner:** coder-5 (binding per `[[feedback_single_owner_destructive_runs]]`).

## TL;DR

**241 `library_index` rows had their stored `normalizedName` re-stamped from the ext-INCLUDED algorithmic-wrong shape (e.g. `"hodusilverpdf"`) to the post-α historical-correct ext-stripped shape (e.g. `"hodusilver"`).** Zero write errors. REDRY idempotent. Cross-lane invariant against pdf-stem-drift's `e01dc2b1a` restamp surface preserved. 5/5 SPOTCHECK PASS.

## Phase ladder

| Phase | Wall-clock | Outcome |
|---|---|---|
| DRY-RUN-001 (read-only) | ~5s | 625 scanned / 625 candidates / 384 alreadyStamped / **241 toRestamp** / 0 writeErrors / extensionHisto `.pdf:174 .mp3:60 .wav:4 .png:2 .m4a:1` / mismatchedFieldHisto `{normalizedName:241}` |
| HEADS-UP → auditor re-VERIFY | ~1h cycle | ACCEPT 2026-05-26T01:30Z (Path A guard + math reconciliation + sample shape all confirmed) |
| APPLY-001 (single-owner) | ~5s | **restamped 241 / writeErrors 0** — exact match with DRY-RUN-001 projection |
| REDRY-001 (idempotency) | ~5s | `alreadyStamped: 625 / toRestamp: 0 / driftFraction: 0` ✓ idempotent |
| SPOTCHECK-001 (5 deterministic samples) | ~5s | **5/5 PASS** — `normalizedName` matches post-α canonical; `nameLower`/`stem`/`titleSpecificity` unchanged from pdf-stem-drift APPLY |
| PHASE-3 cross-lane REDRY (pdf-stem-drift surface) | ~5s | `alreadyStamped: 625 / toRestamp: 0` ✓ no cross-lane drift introduced |

## File outputs in `.paul/ops/normalizedname-drift-backfill/`

| File | Bytes | Purpose |
|---|---|---|
| `DRY-RUN-001.json` | ~110 KB | full 625-row JSON dump (summary + per-row records w/ would-restamp diffs) |
| `DRY-RUN-001.log` | ~50 KB | human-readable per-row trace (stderr capture) |
| `APPLY-001.json` | ~115 KB | full 241-row JSON dump w/ patch + write-side metadata |
| `APPLY-001.log` | ~50 KB | per-row APPLY trace (stderr) |
| `REDRY-001.json` | ~75 KB | post-APPLY 625-row dump (all `already-stamped`) |
| `REDRY-001.log` | ~150 B | per-row trace (only summary survives — every row is already-stamped, no RESTAMP lines) |
| `SPOTCHECK-001.json` | ~5 KB | 5 sampled docs w/ full assertions matrix |
| `SPOTCHECK-001.log` | ~750 B | PASS/FAIL trace for each of 5 samples |
| `PHASE-3-pdf-stem-drift-REDRY.json` | ~75 KB | pdf-stem-drift restamper dry-run output post-APPLY |
| `PHASE-3-pdf-stem-drift-REDRY.log` | ~150 B | summary-only |
| `RUN-SUMMARY.md` | this file | audit-trail entry point |

## Path A guard verification (math-impossible to write other fields)

- `scripts/restamp-normalizedname-drift.mjs` `W02_FIELDS = ["normalizedName"]` (sole comparison axis).
- `classify()` iterates `for (const f of W02_FIELDS)` — `absent`/`mismatched` are subsets.
- Patch builder iterates `for (const f of mismatched)` where `mismatched ⊆ W02_FIELDS` — only one possible field key.
- `mismatchedFieldHisto` initializer is `{ normalizedName: 0 }` — no stray buckets.
- Grep on all 3 log files (DRY-RUN-001 / APPLY-001 / REDRY-001) for `"field":"nameLower"` / `"field":"stem"` / `"field":"titleSpecificity"` returns zero hits.

## Cross-lane invariant (Phase 3 verification)

Predecessor pdf-stem-drift restamp script run in dry-run mode against the post-APPLY-001 state:
```
scanned: 625 / candidates: 625 / alreadyStamped: 625 / toRestamp: 0 / driftFraction: 0
mismatchedFieldHisto: {nameLower:0, stem:0, titleSpecificity:0}
```
No row drifted on `nameLower`/`stem`/`titleSpecificity` as a side-effect of my normalizedName restamp. The `e01dc2b1a` ship's 251-row patch surface stays algorithmically pinned.

## Math reconciliation against predecessor

- pdf-stem-drift `e01dc2b1a` APPLY restamped 251 rows touching `nameLower`/`stem`/`titleSpecificity` ONLY (Path A excluded normalizedName).
- Pre-α normalizedName-axis drift in DRY-RUN-001 of pdf-stem-drift: 271 rows (233 normName-only + 38 combo). These rows' stored `normalizedName` was the historical-good EXT-STRIPPED shape (`"hodusilver"`).
- Post-α, the canonical algorithm now produces the EXT-STRIPPED shape. → those 271 rows became `alreadyStamped` in THIS lane (matched the new canonical without intervention).
- This lane's 241 candidates = inverse population (rows whose stored `normalizedName` is the EXT-INCLUDED algorithmic-wrong shape, mostly post-Path-A PCU/scrape writes accumulated over time). 241 restamped + 384 alreadyStamped (= 271 historical-good rows + 113 no-extension or no-drift rows) = 625 total ✓.

## SPOTCHECK-001 detail (5 deterministic samples, every floor(241/5)th index)

| docId | name | normalizedName before | normalizedName after | siblings | All assertions |
|---|---|---|---|---|---|
| `1-7s6O5YGk5noWiVhtktHwpr7SHOq8_09` | `B'sefer chayim & Hashiveinu.pdf` | `bseferchayimhashiveinupdf` | `bseferchayimhashiveinu` | 1 | PASS |
| `1Bquaq3tlSoRAovWcCkynShUuepgEgYZ_` | `Hineni Rosenblatt.pdf` | `hinenirosenblattpdf` | `hinenirosenblatt` | 2 | PASS |
| `1O1pvTb9_U_1Dh9TCookPxS7AlwfMA_Nh` | `Fish Jam .mp3` | `fishjammp3` | `fishjam` | 1 | PASS |
| `1_E1AIJH9j0I-jkESHlhKFN8ZGazdusFd` | `El Dyo alto.pdf` | `eldyoaltopdf` | `eldyoalto` | 1 | PASS |
| `1yLSZnOX9RKJKliQpNvJ78yWhzJ51jLNW` | `Kedusha Am.pdf` | `kedushaampdf` | `kedushaam` | 1 | PASS |

Each row verifies all 5 assertions:
1. `normalizedName` matches post-α canonical algorithm output.
2. `normalizedName` equals the APPLY-001 patch value (byte-for-byte).
3. `nameLower` UNCHANGED (still `name.toLowerCase()` — PCU contract preserved).
4. `stem` matches canonical (UNCHANGED from pdf-stem-drift APPLY).
5. `titleSpecificity` matches canonical (UNCHANGED from pdf-stem-drift APPLY).

## Operational artifacts (single audit-trail commit)

- src: `src/lib/library/recompute-index-name-fields.ts` (α algorithm change)
- src: `src/lib/mcp/title-specificity.ts` (β export `STRIPPABLE_EXTENSION_RE`)
- src: `src/lib/library-upload.ts` (PCU inline α-parity)
- mirror: `scripts/lib/index-name-fields-compute.mjs` (γ .mjs body update)
- tests: `src/lib/library/__tests__/recompute-index-name-fields.test.ts` (9 new ext-strip cases + 2 historical-shape pins + 9 PCU-parity fixtures + updated local pcuInline)
- ops: `scripts/restamp-normalizedname-drift.mjs` + `.RUNBOOK.md` + `scripts/spotcheck-normalizedname-drift.mjs`
- audit: `.paul/ops/normalizedname-drift-backfill/*.json` + `*.log` + this `RUN-SUMMARY.md`
