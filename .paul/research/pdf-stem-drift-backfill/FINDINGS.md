# FINDINGS — `pdf-stem-drift-backfill` (follow-up lane to `normalizedname-backfill-apply`)

**Surfaced by:** coder-5 during DRY-RUN-001 of `normalizedname-backfill-apply` (2026-05-25T16:25Z).
**Ratified by Daniel** 2026-05-25 as a queued follow-up lane (D2: "queue pdf-stem-drift-backfill; don't fix inside this lane").
**Status:** SURFACED, NOT YET DISPATCHED.

## Population

**272 of 625** `library_index` rows ship with W-02 derivative fields
(`stem`, `normalizedName`, `titleSpecificity`) that **disagree** with the
deterministic recompute from their own `name`. Skipped (no overwrite) by
the upstream `normalizedname-backfill-apply` lane's classifier.

Source-of-truth artifacts on `feat/backfill-library-normalizedname`:
- `.paul/ops/backfill-normalizedname/DRY-RUN-001.log` — full per-row
  `MISMATCH ...` trace (272 lines starting `^MISMATCH`).
- `.paul/ops/backfill-normalizedname/REDRY-001.log` — confirms still 272
  after the apply (the 350 STAMPs were a disjoint set).

## Pattern

Every sampled mismatched row's `name` ends in a file extension (mostly
`.pdf`; some `.mp3`, `.xml`). The live `stem` was computed against the
**extension-stripped** filename; the canonical recompute today
(`src/lib/mcp/title-specificity.ts` `bareStem` → `normalizeStem`) keeps
the extension because it's not stripped before normalize.

Representative examples (from DRY-RUN-001):

| docId | name | live stem | recompute stem | live tS | recompute tS |
|---|---|---|---|---|---|
| `000cc80a-...` | `Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf` | (normalizedName mismatch only) | n/a | — | — |
| `012dd661-...` | `T'Filat Haderech (Friedman).pdf` | `t'filat haderech` | `t'filat haderech pdf` | — | — |
| `07478587-...` | `Hodu (Silver).pdf` | `hodu` | `hodu pdf` | — | — |
| `077a95a9-...` | `Hal'Luyah (Oshrat).pdf` | `hal'luyah` | `hal'luyah pdf` | **0.9** | 0.5 |
| `0afb3e5a-...` | `Ein Keiloheinu (Freudenthal).pdf` | `ein keiloheinu` | `ein keiloheinu pdf` | **1** | 0.6 |
| `139f1251-...` | `Shir Hama-Alot (Taubman).pdf` | `shir hama alot` | `shir hama alot pdf` | **1** | 0.6 |

The `titleSpecificity` mismatches are downstream of the stem mismatch —
the live row's stem put it in a different sibling-bucket
(e.g. `"hodu"` bucket has N rows; `"hodu pdf"` bucket has M rows) so
the W-02 score was computed against a different `siblingsInCatalog`
count. The numerical drift is bounded but real (typical: `0.6` ↔ `1.0`).

## Root-cause hypothesis

Two plausible histories:

(a) **Older `bareStem` stripped the trailing extension.** Pre-`4a9e3d896`
    (the F-7 helper ship) `bareStem` may have run a trailing-
    `\.[a-z0-9]{1,8}$` strip before `normalizeStem`. The 272 rows were
    stamped under that algorithm; subsequent normalize-spec hardening
    dropped the strip step. (Note: `src/lib/mcp/tools/chart-bond-audit.ts:62`
    still has a local `stripExtension` helper — evidence the pattern was
    once canonical.)

(b) **The `name` field was rewritten with the extension after stamping.**
    A rename path pre-`e100771ce` (drive-sync rename @ coder-2) wrote
    `name = driveName` (which includes `.pdf`) but did NOT recompute the
    W-02 derivatives. Pre-rename the row had `name = driveName.replace(/\.[^/.]+$/, "")`
    (Drive-sync's title strip at `src/lib/drive-sync/poller.ts:207`) → stem
    matched. Post-rename `name` carries `.pdf`; stem still reflects the
    pre-rename name.

Bisecting (a) vs (b) requires git-log forensics on:
- `src/lib/mcp/title-specificity.ts` history of `bareStem`/`normalizeStem`.
- `src/lib/drive-sync/poller.ts` rename branch history vs the rows'
  earliest `uploadedAt`.
- Sample-row spot-check via Firestore: does the row have an
  `originalName` that lacks `.pdf`? Most do — auto-stripped by Drive-sync.

Either way the symptom is the same: live `stem` disagrees with current
`bareStem(name)`, so PCU's `where("stem", "==", bareStem(newTitle))`
sibling query misses these rows → operationally equivalent FINDING-4
dedup blindness.

## Policy choice (the future lane's first ratify call)

**Option α — Re-stamp the 272 rows to the current algorithm.**
Mass-write `{stem, normalizedName, titleSpecificity}` recomputed from
the live `name`. Same shape as `normalizedname-backfill-apply` but
with `overwrite: true` instead of stamp-only-missing. Sibling-recount
cascade required (272 rows' stem-bucket migrations may shift other
rows' `titleSpecificity` — needs PCU-style cascade in the backfill).

Pros: forward-compatible; future PCU writes dedup correctly.
Cons: writes 272 rows; needs careful cascade modeling; loses the historical
`titleSpecificity` value (probably fine — it was wrong anyway).

**Option β — Add an extension-strip pre-step to `bareStem` so legacy
stems stay forward-compatible.**
Edit `src/lib/mcp/title-specificity.ts` `bareStem` to call
`name.replace(/\.[a-z0-9]{1,8}$/i, "")` before paren/composer strip.
New PCU writes for `"Hodu (Silver).pdf"` compute stem `"hodu"` (matches
the 272 legacy rows). The existing F-7 helper inherits the change for
free. Parity tests for the `normalizedname-backfill-apply` lane MUST be
updated; the W-02 audit population stays as-is.

Pros: zero data writes; pins the algorithm; the 272 rows + future
`.pdf`-named uploads converge on a single stem-bucket.
Cons: stem now drops a semantically-meaningful token (file extension is
sometimes the only differentiator between same-name PDF/MP3/XML
arrangements). Need to verify no current dedup relies on the extension.

**Option γ — Hybrid: pin the algorithm AND re-stamp the 350 new STAMPs
this lane already wrote.** If we ship Option β, the 350 rows just
stamped by `normalizedname-backfill-apply` need a re-run with the new
algorithm — they were stamped WITH the extension (e.g. `"adon olammp3"`
vs the algorithm-pinned `"adon olam"`). Probably the cleanest end-state.

**Recommended (for the future lane's PROMPT):** ratify Option β + γ
after a short forensic bisect (a) vs (b). The 0-write end-state is
cheaper to maintain and the extension-as-differentiator is a corner case
better handled by `originalName` + `mimeType` (which the rows already
carry).

## Out-of-scope for the upstream lane

The upstream `normalizedname-backfill-apply` lane is closed once it
applies the 350 in-scope STAMPs. This FINDINGS note is the handoff to
the future `pdf-stem-drift-backfill` lane Daniel asked for. No code
change in the upstream lane addresses these 272 rows; they wait for the
follow-up lane's policy ratify.

## Suggested PROMPT scaffold (for the future lane)

```
Lane: pdf-stem-drift-backfill
Tier: 0 (research-first; ops once policy chosen)
Owner: TBD (probably coder-5 again for continuity, or supervisor pick)

Phase 0 — Forensic bisect:
  - git log on bareStem/normalizeStem to confirm (a) vs (b)
  - Sample 5 mismatched rows; query their `originalName` + `uploadedAt`
    to characterize the write epoch
  - Output: ROOT-CAUSE-FINDINGS.md

Phase 1 — Policy ratify (Daniel-gated):
  - Option α (re-stamp 272), β (pin algorithm), or γ (both)

Phase 2 — Implementation per policy.
  - α: backfill-pdf-stem-drift.mjs (mirror normalizedname-backfill-apply
       shape; overwrite mode; cascade sibling recount)
  - β: edit src/lib/mcp/title-specificity.ts; update parity test
       fixtures; ship a code lane not an ops lane
  - γ: ship β + a one-shot re-stamp of the 350 normalizedname-backfill
       rows AND the 272 mismatched rows

Phase 3 — Verify: DRY-RUN of normalizedname-backfill-apply against
prod → `wouldUpdate: 0` AND `mismatched: 0` (algorithm convergence).
```

## See also

- `.paul/ops/backfill-normalizedname/RUN-SUMMARY-DRY-001.md` §"★ FINDING — 272 mismatched rows"
- `.paul/ops/backfill-normalizedname/DRY-RUN-001.log` (full evidence)
- `src/lib/mcp/title-specificity.ts` (canonical bareStem/normalizeStem)
- `src/lib/mcp/tools/chart-bond-audit.ts:62-63` (`stripExtension` helper —
  hint that extension-strip was once canonical)
- `src/lib/drive-sync/poller.ts:207` (active extension strip in
  drive-sync title computation)
- `src/lib/library/recompute-index-name-fields.ts` (F-7 shared helper @
  `4a9e3d896`)
- `[[feedback_single_owner_destructive_runs]]`
