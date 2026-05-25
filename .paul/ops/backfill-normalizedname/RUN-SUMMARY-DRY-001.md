# RUN-SUMMARY — DRY-RUN-001 (`backfill-library-normalizedname.mjs`)

- **Run:** 2026-05-25T16:25:09Z (DRY-RUN, no writes)
- **Executor:** coder-5 (single-owner per `[[feedback_single_owner_destructive_runs]]`)
- **Branch:** `feat/backfill-library-normalizedname` (cut from origin/master `d65dd7d47`)
- **Worktree:** `sheet-music-app-normalizedname-backfill/`
- **Auth:** `firebase-adminsdk-fbsvc@crcmusiccharts` SA via .env.local
- **Log:** `.paul/ops/backfill-normalizedname/DRY-RUN-001.log`

## Top-line counts

| metric | value | notes |
|---|---|---|
| scanned | **625** | total `library_index` rows live in prod |
| skippedOrphaned | **0** | `[[project_orphan_baseline]]` said 297; live state shows zero `status: "orphaned"` rows — either swept since 2026-05-20, OR `status` field uses a different value than `"orphaned"` |
| skippedNoName | 0 | every row has a usable `name` |
| candidates | 625 | active + named rows considered |
| alreadyStamped | **3** | only 3/625 rows have all four W-02 fields populated AND matching the deterministic recompute |
| wouldUpdate | **350** | in-scope STAMP candidates: ≥1 W-02 field absent AND zero mismatched |
| mismatched | **272** | ★ out-of-scope FINDING: at least one PRESENT W-02 field disagrees with the deterministic recompute — script skips these (no overwrite) |
| writeErrors | 0 | DRY-RUN |
| staleFraction | **0.56** | over the 5% HEADS-UP threshold (dispatch §Phase 1 + coder-2 precedent at `8ddcca1c5`) |

## missingFieldHisto (rows with field absent)

| field | rows |
|---|---|
| `nameLower` | **1** | (auditor expected IMP population blind to exact dedup; live ≈ 1 row — the IMP population is essentially nil) |
| `normalizedName` | 284 | classic SLI "blind to fuzzy" population |
| `stem` | 350 | larger — includes both SLI rows AND IMP-via-PCU-old-write-shape rows |
| `titleSpecificity` | 350 | mirrors `stem` 1:1 |

## ★ FINDING — 272 `mismatched` rows (OUT OF DISPATCH SCOPE)

The dispatch scoped this lane to "stamp missing fields"; my classifier
distinguishes **absent** from **present-but-different**, and the
present-but-different population is unexpectedly large.

Sample (10 of 272; all `.pdf`-suffixed names with a stem written WITHOUT
the `.pdf` token):

```
000cc80a... "Yih'Yeh Shalom (Recht) - Yih'Yeh Tov (Broza).pdf"
  current.normalizedName=yihyehshalomrechtyihyehtovbroza
  expected.normalizedName=yihyehshalomrechtyihyehtovbrozapdf

012dd661... "T'Filat Haderech (Friedman).pdf"
  current.stem=t'filat haderech
  expected.stem=t'filat haderech pdf

07478587... "Hodu (Silver).pdf"
  current.stem=hodu
  expected.stem=hodu pdf

077a95a9... "Hal'Luyah (Oshrat).pdf"
  current.titleSpecificity=0.9
  expected.titleSpecificity=0.5

0afb3e5a... "Ein Keiloheinu (Freudenthal).pdf"
  current.titleSpecificity=1
  expected.titleSpecificity=0.6
```

### Root-cause hypothesis

The live rows were stamped by an older write path that ran `bareStem` on
the **extension-stripped** filename (Drive-sync does this at
`src/lib/drive-sync/poller.ts:207` via `name.replace(/\.[^/.]+$/, "")`),
producing stems like `"hodu"` for an original `"Hodu (Silver).pdf"`.

Then EITHER:

(a) the `name` field was later rewritten to include the `.pdf` extension
(rename path pre-`e100771ce` that didn't recompute stem); OR

(b) the rows came from the legacy `processChartUpload` path with
`input.title === "Hodu (Silver).pdf"` (`src/lib/library-upload.ts:400`
keeps the extension when `input.title` is provided) but a pre-`4a9e3d896`
`bareStem` variant stripped extensions.

Either way: the LIVE stems are stale-by-spec. New PCU writes computing
`bareStem("Hodu (Silver).pdf") === "hodu pdf"` will NOT find a sibling at
`stem === "hodu"`, so dedup is blind across the version boundary —
operationally equivalent to FINDING-4 dedup blindness but driven by
*drift*, not *absence*.

`titleSpecificity` mismatches (e.g. `0.9` → `0.5`, `1` → `0.6`) further
suggest a `siblingsInCatalog` recount drift: PCU's W-02 sibling-cascade
at `library-upload.ts:546-552` only rewrites siblings present at the
time of *the current upload*; rows in a different stem-bucket
(`hodu` vs `hodu pdf`) never enter the cascade.

This is **out of dispatch scope** ("Stamp `nameLower + normalizedName +
stem + titleSpecificity` if missing"). My classifier correctly skips
these (logs `MISMATCH`, no overwrite). They are surfaced here for
supervisor decision.

## In-scope (350 STAMP candidates)

Clean: rows missing 1-4 W-02 fields, zero mismatched. Safe to stamp the
missing fields per dispatch §Phase 0. Spot-check sample:

```
1-7s6O5YGk5noWiVhtktHwpr7SHOq8_09 "B'sefer chayim & Hashiveinu.pdf"
  siblings=1 missing=[normalizedName, stem, titleSpecificity]
  → patch=normalizedName="bseferchayimhashiveinupdf", stem="b'sefer chayim hashiveinupdf", ts=0.8

12JfLCHytM5q59btBQ05sz-V_SurQmUoT "Adon Olam.mp3"
  siblings=1 missing=[normalizedName, stem, titleSpecificity]
  → patch=normalizedName="adonolammp3", stem="adon olammp3", ts=0.7

12if9gHg88ZqNMZjmLG1UH57GSriTHzqF ".DS_Store" (stray MacOS file)
  siblings=1 missing=[normalizedName, stem, titleSpecificity]
  → patch=normalizedName="dsstore", stem="ds store", ts=0.7

upload-fb3dde53-... "Avinu Shebashamayim"
  siblings=1 missing=[normalizedName, stem, titleSpecificity]
  → patch=normalizedName="avinushebashamayim", stem="avinu shebashamayim", ts=0.7
```

## Decision points for supervisor

**D1 — Apply the in-scope 350 stamps?**
Recommend YES per dispatch scope. The stamps are deterministic, write
ONLY absent fields (no clobber), and close the auditor's flagged
FINDING-4 population. staleFraction trips HEADS-UP per protocol but
that's a heads-up, not a refuse-gate.

**D2 — Handle the 272 mismatched rows now or as a follow-up lane?**
Recommend FOLLOW-UP. The mismatches reveal a *drift* class (stems vs
extension) the original FINDING-4 didn't characterize. A separate lane
should:
1. Confirm root cause (audit `processChartUpload` vs drive-sync write
   history; bisect the bareStem algorithm).
2. Decide policy: re-stamp stale stems to the current algorithm (closes
   dedup blindness; mass-write of 272 rows) OR pin the algorithm to a
   "strip trailing `\.[a-z0-9]{1,8}$`" pre-step in `bareStem` (no rewrites
   needed; matches the legacy stem-without-extension shape).
3. Run a fresh dry-run after the policy decision.

**D3 — Orphan count discrepancy (297 → 0).**
Worth a 1-line supervisor confirm: did the orphan hard-delete sweep
land between 2026-05-20 (`[[project_orphan_baseline]]`) and now? OR did
the `status` field rename / move to a different value? Probably already
known; not a backfill blocker either way.

## Sanity bookkeeping

- candidates (625) + skippedOrphaned (0) + skippedNoName (0) = 625 = scanned ✓
- wouldUpdate (350) + alreadyStamped (3) + mismatched (272) = 625 = candidates ✓
- writeErrors = 0 (DRY-RUN; no writes attempted) ✓

## Posture

- ⛔ NOT proceeding to `--apply` until supervisor decides D1 + D2.
- ✅ Parity test (`src/lib/library/__tests__/index-name-fields-compute-parity.test.ts`)
  GREEN on all 27 cases — mirror compute is byte-for-byte identical to
  canonical TS helper.
- ✅ Single-owner discipline: I'm holding the named-executor seat;
  nobody else should run `--apply` against this script in this window.
