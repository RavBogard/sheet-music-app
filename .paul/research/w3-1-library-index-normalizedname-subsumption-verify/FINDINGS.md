# `w3-1-library-index-normalizedname-subsumption-verify` — FINDINGS

**Lane:** `w3-1-library-index-normalizedname-subsumption-verify`
**Tier:** 0 (research; FINDINGS-only, NO writes against `library_index`)
**Priority:** P1 (closes QUEUE.md last STILL-OPEN P1 row at L118–119)
**Dispatch:** `inbox/coder-2.md msg-w3-1-library-index-normalizedname-subsumption-verify-001` 2026-05-26T~17:50Z
**Probe wall-clock:** 2026-05-26T17:31:24Z – 17:34:42Z (~3min, two scripts + one ad-hoc histogram script)
**Lane base SHA:** `29c80956d1` (per dispatch §Setup)

---

## TL;DR — Verdict: **SUBSUMED**

`10f7f8183a` (W-02 ABSENT backfill, 350/625 rows, 2026-05-25T16:39Z) + `6325cc7870`
(`recomputeIndexNameFields.normalizedName` α pin + γ ext-strip drift restamp,
241/625 rows, 2026-05-25T23:07Z) together **fully close** the W3-1 backfill scope.

Re-running both canonical re-probe scripts in dry-run mode against current
production (2026-05-26T17:31Z, ~19h after the `6325cc7870` REDRY-001) reports
**zero residual gap on both axes**:

| Axis | Probe script | DRY-RUN result | Verdict |
|---|---|---|---|
| **W-02 ABSENT** (any of `nameLower`/`normalizedName`/`stem`/`titleSpecificity` missing) | `scripts/backfill-library-normalizedname.mjs` | `wouldUpdate: 0` / `mismatched: 0` / `missingFieldHisto: {all: 0}` | ✅ CLOSED |
| **γ ext-strip drift** (stored `normalizedName` disagrees with post-α canonical) | `scripts/restamp-normalizedname-drift.mjs` | `toRestamp: 0` / `driftFraction: 0` / `mismatchedFieldHisto: {normalizedName: 0}` | ✅ CLOSED |

**POPPED-mark recommended** for QUEUE.md L118–119
(`W3-1 library-index-normalizedname-backfill`) with receipt citing
`10f7f8183a` + `6325cc7870` + this FINDINGS.

---

## §1 Subsumption-question framing

The W3-1 QUEUE row (L118) describes a Tier-0 one-shot ops lane (~60 LOC) to
backfill `library_index.normalizedName` to close ingest-mutator-matrix
FINDING-4. FINDING-4 found two populations:

- **IMP rows** (Drive-Importer pipeline, label per `.paul/research/...`)
  — blind to BOTH exact AND fuzzy dedup
- **SLI rows** (Slingshot pipeline) — blind to fuzzy only

The STILL-OPEN comment at L119 conservatively flagged the row as "likely
subsumed by W4-1 `normalizedname-backfill-apply` POPPED at L60 + git
commits `10f7f8183a` + `6325cc7870`. Exact lane name absent from git log
+ claims → kept STILL OPEN per scope §Out-of-scope (\"NO speculative
POPPED-marks\"). Supervisor to confirm semantic equivalence and POPPED-mark
if appropriate."

This FINDINGS confirms semantic equivalence is **complete**.

---

## §2 Methodology

### §2.1 Re-probe via canonical scripts (exhaustive)

The two production scripts that landed the original backfills are themselves
self-describing dry-run probes — running them again with `--apply` absent
inspects every row and reports `alreadyStamped` / `toRestamp` / `mismatched`
counts. This is the cleanest possible verification methodology because the
probe predicate is byte-for-byte identical to the predicate used by the
original APPLY runs that wrote the data.

Both scripts:

- Enumerate `library_index` via `db.collection("library_index").get()` (single
  shot; no client-side filtering — the orphan/nameless filters are applied
  per-row after fetch).
- Build a stem-index in memory keyed by post-α `bareStem(name)` to compute
  `titleSpecificity` siblings.
- Per row: recompute the 4 W-02 derivative fields via the post-α canonical
  algorithm; compare to stored values; classify as `already-stamped` /
  `toRestamp` / `absent` / `skipped`.
- Emit per-row JSON to stdout + per-row trace to stderr.

Per `[[feedback_exhaustive_probe_before_population_claim]]` — this is a
decision-driving claim about a whole population, so the probe MUST be
exhaustive. Both probes scan **100% of the active library_index population**
(625/625 rows; coverage well above the dispatch's ≥95% gate).

### §2.2 Ad-hoc source/status histogram probe

A small one-shot `scripts/w3-1-source-histogram-probe.mjs` (~60 LOC, NEW in
this lane) re-enumerates `library_index` and reports the source-axis +
status-axis distribution to confirm BOTH FINDING-4 populations
(google_drive vs upload) are represented in the validated population. No
writes; same firebase-admin SDK auth path as the canonical scripts.

---

## §3 Population stratification

**Total `library_index` docs:** 625 (from `firestore.collection.get().size`).

### §3.1 Status histogram

| `status` value | Count | % |
|---|---:|---:|
| `active` | 345 | 55.2% |
| _(missing field)_ | 258 | 41.3% |
| `archived` | 20 | 3.2% |
| `duplicate` | 2 | 0.3% |
| `orphaned` | 0 | 0% |
| **Total** | **625** | **100%** |

The probe scripts' built-in orphan-exclusion filter is a no-op here — the
`orphaned` count is 0, consistent with `[[project_orphan_baseline]]`
(2026-05-20 reclassification of 271 prior-orphaned rows to `active` via
B-006 salvage).

The `<missing-status>` slice (258 rows) is pre-status-field legacy data; the
probe scripts treat any non-`orphaned` value (including missing) as a
candidate row. **All 258 were classified `already-stamped` by both probes.**

### §3.2 Source histogram (closes FINDING-4 IMP/SLI question)

| `source` value | Count | FINDING-4 mapping | Probe alignment |
|---|---:|---|---|
| `google_drive` | 283 | **IMP** (Drive-Importer pipeline) | ✅ 283/283 already-stamped on both axes |
| `salvage` | 271 | (post-FINDING-4 B-006 recovery population) | ✅ 271/271 already-stamped on both axes |
| `upload` | 71 | **SLI** (Slingshot/PCU storage-canonical pipeline) | ✅ 71/71 already-stamped on both axes |
| **Total** | **625** | | **625/625 ✅** |

**The FINDING-4 dichotomy is fully covered.** The 283 google_drive rows and
the 71 upload rows are the actual production populations the labels referred
to; both are zero-drift.

The original FINDING-4 mentioned `source: "IMP"` and `source: "SLI"` as
literal field values, but a direct MCP query for those values returned
empty — they were research-paper pseudonyms, not field values. The actual
field values are `google_drive` / `salvage` / `upload`.

### §3.3 Field-presence histogram

| Field | Present count | Absent count |
|---|---:|---:|
| `name` | 625 | 0 |
| `normalizedName` | **625** | **0** |

Zero absent `normalizedName` field across the entire collection. The
nameless-row skip in the probe scripts is a no-op here (0 skipped per both
scripts' stderr summary).

### §3.4 docId-shape histogram (independent corroboration)

| docId shape | Count | Implied pipeline |
|---|---:|---|
| bare UUID4 (`000cc80a-...-c3`) | 271 | salvage (B-006) |
| Drive file ID (`1-7s6O...09`) | 269 | google_drive |
| `upload-{uuid}` prefix | 71 | upload (PCU) |
| Other (Drive-shape but ≠regex) | 14 | google_drive |
| **Total** | **625** | |

This shape histogram independently corroborates the source histogram
(271 + 269+14 + 71 = 625, matching salvage/google_drive/upload).

---

## §4 Per-axis re-probe results

### §4.1 γ ext-strip drift axis (`scripts/restamp-normalizedname-drift.mjs --dry-run`)

Probe wall-clock: 2026-05-26T17:31:24Z

```
mode:                 dry-run
scanned:              625
candidates:           625
alreadyStamped:       625
toRestamp:            0
skippedIncomplete:    0
skippedOrphaned:      0
skippedNoName:        0
driftFraction:        0
extensionHisto:       {}
mismatchedFieldHisto: {"normalizedName":0}
```

**Identical to the original `REDRY-001` summary** in
`.paul/ops/normalizedname-drift-backfill/REDRY-001.log`
(2026-05-25T23:07:52Z). Zero drift on the ext-strip axis.

Per-row JSON dump: `.paul/research/w3-1-library-index-normalizedname-subsumption-verify/DRY-RUN-restamp-001.json`
(625 records; every record `{docId, action: "already-stamped"}`).

### §4.2 W-02 ABSENT axis (`scripts/backfill-library-normalizedname.mjs --dry-run`)

Probe wall-clock: 2026-05-26T17:31:26Z (2 s after §4.1)

```
mode:              dry-run
scanned:           625
candidates:        625
alreadyStamped:    625
wouldUpdate:       0
mismatched:        0
skippedOrphaned:   0
skippedNoName:     0
staleFraction:     0
missingFieldHisto: {"nameLower":0,"normalizedName":0,"stem":0,"titleSpecificity":0}
```

Zero rows missing any of the four W-02 derivative fields. Zero rows with
present-but-different W-02 fields (the `mismatched` count is the
`10f7f8183a`-era counter that previously stood at 272 — now 0; the gap was
closed by the γ pin in `6325cc7870`).

Per-row JSON dump: `.paul/research/w3-1-library-index-normalizedname-subsumption-verify/DRY-RUN-w02-001.json`
(625 records; every record `{docId, action: "already-stamped"}`).

### §4.3 Cross-probe coverage validation

Both probes hit the same 625-row population:

| Metric | Value |
|---|---:|
| Rows in §4.1 only | 0 |
| Rows in §4.2 only | 0 |
| Rows in both (intersection) | 625 |

Independent corroboration: the two scripts share no enumeration code (the
`restamp` script's `classify()` only inspects `normalizedName`, the `backfill`
script's classifier inspects all four W-02 fields). Identical row sets means
the orphan/nameless filter ran consistently across both scripts on the
current state.

---

## §5 Math reconciliation against the two ship commits

| Stage | Commit | What happened | Counts |
|---|---|---|---:|
| Pre-W-02-backfill | `<pre-10f7f8183a>` | Some rows had absent W-02 derivative fields | absent ≈ 350 |
| Phase 1 W-02 stamp | `10f7f8183a` 2026-05-25T16:39Z | ABSENT-only stamp pass; 350 stamped; 272 mismatched preserved | absent → 0 / mismatched = 272 |
| Phase 2 γ ext-strip restamp | `6325cc7870` 2026-05-25T23:07Z | Restamped 241 rows where stored normalizedName was the ext-INCLUDED algorithmic-wrong shape | mismatched 272 → 0 (241 restamped + 31 already-matched-or-out-of-pattern) |
| **Subsumption verify @ 2026-05-26T17:31Z** | (this lane) | Both axes report zero residual | absent = 0 / mismatched = 0 |

The 272→241 delta (which initially looked like a 31-row gap that might
remain residual) is reconciled by the prior γ probe's own math at
`.paul/ops/normalizedname-drift-backfill/RUN-SUMMARY.md §"Math reconciliation
against predecessor"`: 271 rows already had the historical-good (ext-stripped)
shape pre-α and became `alreadyStamped` automatically when α landed. The
241 restamped rows + 271 pre-aligned rows + 113 no-extension/no-drift rows
= 625 ✓.

The 272 "mismatched" count from `10f7f8183a`'s DRY-RUN was computed against
the **pre-α** helper (which would have flagged ext-stripped historical-good
shapes as "wrong"). After α landed and re-pinned the canonical algorithm,
those 271 pre-α-mismatched rows became canonically-correct without
intervention. The remaining 241 (and 31 edge cases that no-op'd through
either ext-strip or no-extension) were the actual gap, and `6325cc7870`
closed it.

---

## §6 Recommendation

1. **POPPED-mark QUEUE.md L118–119** with the receipt:
   ```
   <!-- W3-1 library-index-normalizedname-backfill POPPED 2026-05-26 — SUBSUMED by `10f7f8183a` (W-02 ABSENT backfill 350 rows) + `6325cc7870` (γ ext-strip pin + 241 historical restamps). Subsumption verified by coder-2 `w3-1-library-index-normalizedname-subsumption-verify` lane @ <SHIP-SHA>: both canonical re-probe scripts report `toRestamp: 0` / `wouldUpdate: 0` / `driftFraction: 0` / `mismatched: 0` across all 625 docs (100% coverage, 0 orphans). FINDINGS at `.paul/research/w3-1-library-index-normalizedname-subsumption-verify/FINDINGS.md`. -->
   ```

2. **No ops lane needed.** The previously-queued one-shot script
   (`mirror coder-2 8ddcca1c5 pattern, ~60 LOC, Tier-0 ops, Daniel-single-owner`)
   is not actionable — there is no population to operate on. The W3-1
   Tier-0 ops scope dissolves.

3. **No follow-up monitoring needed.** The `recomputeIndexNameFields` helper
   pin at `src/lib/library/recompute-index-name-fields.ts` plus the PCU
   inline parity at `src/lib/library-upload.ts:432` plus the
   `scripts/lib/index-name-fields-compute.mjs` `.mjs` mirror together
   guarantee that every new write path (PCU/scrape/setlist-import/drive-sync)
   lands on the post-α canonical shape. The W-02 derivative fields are
   covered by the recomputeIndexNameFields helper contract and the parity
   test at `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`.

---

## §7 Hard-boundary compliance

This lane:

- ⛔ Made **ZERO write tool calls** against `library_index` (research only;
  both probe scripts were `--apply`-absent dry-runs; the source-histogram
  probe is a read-only `.get()`).
- ⛔ Made **ZERO edits** to `src/`, `bridge/`, `firestore.rules`,
  `vercel.json`, `env.mjs`.
- ⛔ Used **ZERO MCP write tools** (only `firestore_query_collection` for
  read-only orphan sanity + source-field probes).
- ⛔ **Did NOT touch** SmartTransposer surfaces (per `[[project_smart_transposer_is_key_transcriber]]`).
- ⛔ **Did NOT touch** monitor/bridge surfaces (per coder-1 + coder-3 + coder-6 active concurrency).
- ⛔ **Did NOT touch** cowork-prompts/v10.1-research/SUPERVISOR.md (per coder-7 + coder-6 + supervisor active concurrency).

The lane's only filesystem changes are:
1. NEW `.paul/research/w3-1-library-index-normalizedname-subsumption-verify/`
   directory containing this FINDINGS.md + 4 dump artifacts.
2. NEW `scripts/w3-1-source-histogram-probe.mjs` (~60 LOC; read-only).
3. NO test/src/build artifacts touched.

---

## §8 Per-worktree git identity

Set by `bash scripts/setup-coord-worktree.sh 2 feat/w3-1-library-index-normalizedname-subsumption-verify ../sheet-music-app-w3-1-subsumption-verify 29c80956d1`:
- `git config --worktree user.email coder-2@coord.local`
- `git config --worktree user.name coder-2`
- `.coord/.worktree-coder` marker reads `coder-2`
- Script verified: `coder-2 <coder-2@coord.local>`

Pre-commit identity guard active via `scripts/git-hooks/pre-commit` on the
shared `.git/config core.hooksPath`. Per `[[feedback_per_worktree_git_identity]]`
(RESOLVED structurally via coder-6 `3023b2423`).

---

## §9 Artifacts (committed in this lane)

```
.paul/research/w3-1-library-index-normalizedname-subsumption-verify/
├── FINDINGS.md                       (this file)
├── DRY-RUN-restamp-001.json          (~64 KB; 625 already-stamped records)
├── DRY-RUN-restamp-001.log           (per-row stderr trace + summary)
├── DRY-RUN-w02-001.json              (~64 KB; 625 already-stamped records)
├── DRY-RUN-w02-001.log               (per-row stderr trace + summary)
└── source-histogram-001.json         (~480 B; status + source + presence histograms)

scripts/
└── w3-1-source-histogram-probe.mjs   (~60 LOC; one-shot read-only enumeration)
```

---

## §10 Open follow-ups

**None.** The W3-1 question is hermetically closed by this verification. No
downstream lanes are unblocked or blocked by this verdict beyond the
QUEUE.md POPPED-mark.

The cited subsumption-source commits remain in production:
- `src/lib/library/recompute-index-name-fields.ts` — canonical α-pinned helper
- `src/lib/library-upload.ts` — PCU inline parity
- `scripts/lib/index-name-fields-compute.mjs` — `.mjs` mirror w/ parity test
- `src/lib/library/__tests__/index-name-fields-compute-parity.test.ts` — 38-fixture byte-for-byte parity guard

---

## §11 Sources of truth

- `.coord/QUEUE.md` L118–119 W3-1 row + STILL-OPEN comment
- `.coord/inbox/coder-2.md` `msg-w3-1-library-index-normalizedname-subsumption-verify-001` 2026-05-26T~17:50Z
- `git show 10f7f8183a` — W-02 ABSENT backfill apply
- `git show 6325cc7870` — γ ext-strip pin + restamp apply
- `.paul/ops/normalizedname-drift-backfill/RUN-SUMMARY.md` — γ apply audit trail
- `.paul/ops/normalizedname-drift-backfill/REDRY-001.log` — ship-time zero-drift verification (2026-05-25T23:07Z)
- `.paul/ops/backfill-normalizedname/RUN-SUMMARY.md` — W4-1 W-02 backfill audit trail
- `src/lib/library/recompute-index-name-fields.ts` — current canonical α helper
- This FINDINGS' §4 + §3 — current state @ 2026-05-26T17:31–17:34Z

---

_FINDINGS authored by coder-2 (`coder-2@coord.local`) 2026-05-26T~18:30Z._
